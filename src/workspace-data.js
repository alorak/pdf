import { WORKSPACE_STORAGE_KEY, readWorkspaces, initialWorkspaces } from "./workspace-store.js";
import { openDatabase } from "./pdf-storage.js";

const META = "workspace-metadata";
const PDFS = "pdfs";
const KEY = "workspaces";
export const BACKUP_MAGIC = "PDFWSBK1";
const MAX_MANIFEST = 1024 * 1024 * 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function transactionResult(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(stores, mode); } catch (error) { reject(error); return; }
    let result, failure;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || tx.error || new Error("Depolama işlemi iptal edildi"));
    tx.onerror = () => { failure ||= tx.error; };
    try {
      action(tx, (value) => { result = value; }, (error) => { failure = error; tx.abort(); });
    } catch (error) {
      failure = error;
      try { tx.abort(); } catch { reject(error); }
    }
  });
}

function assertRevision(value, expected) {
  const current = value?.revision ?? 0;
  if (expected !== current) {
    const error = new Error("Workspace başka bir sekmede değişti. Yeni kayıt için sayfayı yenile.");
    error.name = "WorkspaceConflictError";
    throw error;
  }
  return current;
}

export async function initializeWorkspaceData(legacyValue) {
  const db = await openDatabase();
  return transactionResult(db, META, "readwrite", (tx, done) => {
    const store = tx.objectStore(META);
    const request = store.get(KEY);
    request.onsuccess = () => {
      if (request.result) {
        done({ state: readWorkspaces(JSON.stringify(request.result.value)), revision: request.result.revision, migrated: false });
      } else {
        // The legacy key is not removed until the new record commits.
        // It remains a recovery fallback for browsers with IndexedDB disabled.
        const initial = readWorkspaces(legacyValue);
        store.put({ key: KEY, revision: 1, value: initial });
        done({ state: initial, revision: 1, migrated: true });
      }
    };
  });
}

export async function readWorkspaceData() {
  const db = await openDatabase();
  return transactionResult(db, META, "readonly", (tx, done) => {
    const r = tx.objectStore(META).get(KEY);
    r.onsuccess = () => done(r.result
      ? { state: readWorkspaces(JSON.stringify(r.result.value)), revision: r.result.revision }
      : { state: initialWorkspaces(), revision: 0 });
  });
}

export async function saveWorkspaceData(value, expectedRevision) {
  const db = await openDatabase();
  return transactionResult(db, META, "readwrite", (tx, done, abort) => {
    const store = tx.objectStore(META);
    const r = store.get(KEY);
    r.onsuccess = () => {
      try {
        const revision = assertRevision(r.result, expectedRevision) + 1;
        store.put({ key: KEY, revision, value: readWorkspaces(JSON.stringify(value)) });
        done(revision);
      } catch (error) { abort(error); }
    };
  });
}

export async function writeWorkspaceAndPdf(nextState, expectedRevision, { put = null, remove = null } = {}) {
  const db = await openDatabase();
  return transactionResult(db, [META, PDFS], "readwrite", (tx, done, abort) => {
    const store = tx.objectStore(META);
    const r = store.get(KEY);
    r.onsuccess = () => {
      try {
        const revision = assertRevision(r.result, expectedRevision) + 1;
        const pdfStore = tx.objectStore(PDFS);
        if (put) pdfStore.put({ workspaceId: put.id, name: put.file.name,
          type: put.file.type || "application/pdf",
          lastModified: put.file.lastModified || Date.now(), blob: put.file });
        if (remove !== null) pdfStore.delete(remove);
        store.put({ key: KEY, revision, value: readWorkspaces(JSON.stringify(nextState)) });
        done(revision);
      } catch (error) { abort(error); }
    };
  });
}

/** A consistent read-only snapshot of metadata and every PDF Blob record. */
export async function readWorkspaceBundle() {
  const db = await openDatabase();
  return transactionResult(db, [META, PDFS], "readonly", (tx, done) => {
    let metadata = null;
    let metadataReady = false;
    let cursorDone = false;
    const records = [];
    const finish = () => {
      if (metadataReady && cursorDone) {
        done({
          state: metadata
            ? readWorkspaces(JSON.stringify(metadata.value)) : initialWorkspaces(),
          revision: metadata?.revision ?? 0,
          records,
        });
      }
    };
    const m = tx.objectStore(META).get(KEY);
    m.onsuccess = () => { metadata = m.result; metadataReady = true; finish(); };
    const c = tx.objectStore(PDFS).openCursor();
    c.onsuccess = () => {
      const cursor = c.result;
      if (cursor) { records.push(cursor.value); cursor.continue(); }
      else { cursorDone = true; finish(); }
    };
  });
}

/** Collect all owned and orphaned PDF records without reading their byte arrays. */
export async function getAllStoredPdfs() {
  const db = await openDatabase();
  return transactionResult(db, PDFS, "readonly", (tx, done) => {
    const items = [];
    const r = tx.objectStore(PDFS).openCursor();
    r.onsuccess = () => {
      const cursor = r.result;
      if (cursor) { items.push(cursor.value); cursor.continue(); }
      else done(items);
    };
  });
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
  }
  return value >>> 0;
});
function crc32Update(crc, bytes) {
  let value = crc;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return value >>> 0;
}
async function checksumBlob(blob) {
  let crc = 0xFFFFFFFF;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    crc = crc32Update(crc, bytes);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function numberBytes(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

/**
 * Single versioned file, with a JSON manifest and uncompressed PDF blobs.
 * Format: UTF-8 "PDFWSBK1", 32-bit LE manifest length, manifest JSON, PDF blobs.
 * No base64 expansion, no external dependency. CRC32 detects corruption.
 */
export async function createWorkspaceBackup(state, pdfRecords) {
  const entries = [];
  const parts = [];
  let offset = 0;
  for (const record of pdfRecords) {
    if (!record?.blob || !Number.isSafeInteger(record.workspaceId)) continue;
    const size = record.blob.size;
    entries.push({ id: record.workspaceId, name: record.name, type: record.type || "application/pdf",
      lastModified: record.lastModified, size, offset, crc32: await checksumBlob(record.blob) });
    parts.push(record.blob);
    offset += size;
  }
  const manifest = { version: 1, createdAt: new Date().toISOString(),
    state: readWorkspaces(JSON.stringify(state)), pdfs: entries };
  const bytes = encoder.encode(JSON.stringify(manifest));
  if (bytes.length > MAX_MANIFEST) throw new Error("Yedek manifesti boyut sınırını aşıyor");
  return new Blob([encoder.encode(BACKUP_MAGIC), numberBytes(bytes.length), bytes, ...parts],
    { type: "application/octet-stream" });
}

export async function parseWorkspaceBackup(blob) {
  if (!blob || blob.size < 12) throw new Error("Yedek dosyası eksik");
  const first = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (decoder.decode(first.slice(0, 8)) !== BACKUP_MAGIC) throw new Error("Geçersiz yedek biçimi");
  const manifestLength = new DataView(first.buffer).getUint32(8, true);
  if (!manifestLength || manifestLength > MAX_MANIFEST || 12 + manifestLength > blob.size) {
    throw new Error("Yedek manifesti bozuk veya çok büyük");
  }
  let manifest;
  try { manifest = JSON.parse(decoder.decode(await blob.slice(12, 12 + manifestLength).arrayBuffer())); }
  catch { throw new Error("Yedek manifesti okunamıyor"); }
  if (manifest.version !== 1 || !Array.isArray(manifest.pdfs) || !manifest.state?.items) {
    throw new Error("Desteklenmeyen yedek sürümü");
  }
  const ids = new Set();
  const records = [];
  const start = 12 + manifestLength;
  let nextOffset = 0;
  for (const entry of manifest.pdfs) {
    if (!Number.isSafeInteger(entry.id) || entry.id < 1 || ids.has(entry.id) ||
      typeof entry.name !== "string" || entry.name.length > 255 ||
      !Number.isSafeInteger(entry.offset) || entry.offset !== nextOffset ||
      !Number.isSafeInteger(entry.size) || entry.size < 0 ||
      !Number.isInteger(entry.crc32) || entry.crc32 < 0 || entry.crc32 > 0xFFFFFFFF ||
      !Number.isFinite(entry.lastModified) || entry.lastModified < 0) {
      throw new Error("Yedek dosya listesi geçersiz");
    }
    ids.add(entry.id);
    const end = start + entry.offset + entry.size;
    if (end > blob.size) throw new Error("Yedekte PDF eksik");
    const data = blob.slice(start + entry.offset, end, entry.type || "application/pdf");
    if (await checksumBlob(data) !== entry.crc32) throw new Error("Yedek PDF bütünlük kontrolü başarısız: " + entry.name);
    records.push({ workspaceId: entry.id, name: entry.name, type: entry.type,
      lastModified: entry.lastModified, blob: data });
    nextOffset += entry.size;
  }
  if (start + nextOffset !== blob.size) throw new Error("Yedekte beklenmeyen ek veri var");
  const state = readWorkspaces(JSON.stringify(manifest.state));
  if (state.items.length !== manifest.state.items.length) throw new Error("Yedekte geçersiz workspace kayıtları var");
  return { state, records, createdAt: manifest.createdAt };
}

/** Replace all PDFs and workspace state in one IDB transaction; old data survives any failure. */
export async function restoreWorkspaceBackup(parsed, expectedRevision) {
  const db = await openDatabase();
  return transactionResult(db, [META, PDFS], "readwrite", (tx, done, abort) => {
    const meta = tx.objectStore(META);
    const r = meta.get(KEY);
    r.onsuccess = () => {
      try {
        const revision = assertRevision(r.result, expectedRevision) + 1;
        const pdfs = tx.objectStore(PDFS);
        pdfs.clear();
        for (const record of parsed.records) pdfs.put(record);
        meta.put({ key: KEY, revision, value: parsed.state });
        done(revision);
      } catch (error) { abort(error); }
    };
  });
}

/** Delete a genuinely orphaned PDF only after verifying metadata within the same transaction. */
export async function deleteOrphanPdfSafe(expected) {
  if (!Number.isSafeInteger(expected?.workspaceId) || expected.workspaceId < 1 ||
    typeof expected.name !== "string" || !Number.isFinite(expected.size)) {
    throw new Error("Geçersiz sahipsiz PDF kaydı");
  }
  const db = await openDatabase();
  return transactionResult(db, [META, PDFS], "readwrite", (tx, done, abort) => {
    const meta = tx.objectStore(META).get(KEY);
    meta.onsuccess = () => {
      const live = meta.result ? readWorkspaces(JSON.stringify(meta.result.value)) : initialWorkspaces();
      if (live.items.some(w => w.id === expected.workspaceId && w.fileName === expected.name)) {
        done(false);
        return;
      }
      const pdfStore = tx.objectStore(PDFS);
      const req = pdfStore.get(expected.workspaceId);
      req.onsuccess = () => {
        const current = req.result;
        if (!current || current.name !== expected.name ||
          current.blob?.size !== expected.size ||
          current.lastModified !== expected.lastModified) {
          done(false);
          return;
        }
        pdfStore.delete(expected.workspaceId);
        done(true);
      };
    };
  });
}

export async function inspectWorkspaceIntegrity(state, pdfRecords) {
  const byId = new Map(pdfRecords.map((r) => [r.workspaceId, r]));
  const present = new Set(state.items.map((x) => x.id));
  const missing = state.items.filter((w) => w.fileName &&
    (!byId.has(w.id) || byId.get(w.id).name !== w.fileName)).map(w => w.id);
  const orphan = pdfRecords.filter(r => !present.has(r.workspaceId) ||
    state.items.find(w => w.id === r.workspaceId)?.fileName !== r.name).map(r => r.workspaceId);
  const brokenLinks = state.items.flatMap(w => (w.linkedPages || [])
    .filter(link => {
      const r = byId.get(link.sourceWorkspaceId);
      return !r || r.name !== link.sourceFileName ||
        (r.blob?.size ?? r.size) !== link.sourceSize || r.lastModified !== link.sourceLastModified;
    }).map(link => ({ workspaceId: w.id, sourceWorkspaceId: link.sourceWorkspaceId, page: link.page })));
  return { missing, orphan, brokenLinks };
}
