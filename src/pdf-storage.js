const DB_NAME = "pdf-viewer-workspace-files-v1";
const STORE_NAME = "pdfs";
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB kullanılamıyor"));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "workspaceId" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("PDF depolaması açılamadı"));
    request.onblocked = () => reject(new Error("PDF depolaması başka sekmede kilitlendi"));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function transaction(mode, requestFactory) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let result;
    let request;
    try {
      request = requestFactory(tx.objectStore(STORE_NAME));
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("PDF depolaması başarısız"));
    tx.onabort = () => reject(tx.error || new Error("PDF işlemi iptal edildi"));
  });
}

export async function saveWorkspacePdf(workspaceId, file) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1 || !file) throw new Error("Geçersiz workspace PDF");
  await transaction("readwrite", (store) => store.put({
    workspaceId,
    name: file.name,
    type: file.type || "application/pdf",
    lastModified: file.lastModified || Date.now(),
    blob: file,
  }));
}

export async function loadWorkspacePdf(workspaceId) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) return null;
  const record = await transaction("readonly", (store) => store.get(workspaceId));
  if (!record?.blob) return null;
  return new File([record.blob], record.name, {
    type: record.type || "application/pdf",
    lastModified: record.lastModified || Date.now(),
  });
}

export async function deleteWorkspacePdf(workspaceId) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) return;
  await transaction("readwrite", (store) => store.delete(workspaceId));
}

/** Enumerate stored PDF metadata; the Blob is not read into an ArrayBuffer. */
export async function listWorkspacePdfs() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const records = [];
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value;
      records.push({
        workspaceId: item.workspaceId,
        name: typeof item.name === "string" ? item.name : "",
        size: item.blob?.size ?? 0,
        lastModified: item.lastModified ?? 0,
      });
      cursor.continue();
    };
    tx.oncomplete = () => resolve(records);
    tx.onerror = () => reject(tx.error || new Error("PDF listesi okunamadı"));
    tx.onabort = () => reject(tx.error || new Error("PDF listesi iptal edildi"));
  });
}

/** Prevent deletion when the underlying PDF was changed after the confirmation dialog opened. */
export async function deleteWorkspacePdfIfMatches(workspaceId, expected) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId < 1 || !expected
    || typeof expected.name !== "string" || !Number.isFinite(expected.size)) {
    throw new Error("Geçersiz PDF kaydı");
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let removed = false;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(workspaceId);
    request.onsuccess = () => {
      const item = request.result;
      if (item && item.name === expected.name
        && (item.blob?.size ?? 0) === expected.size
        && (item.lastModified ?? 0) === expected.lastModified) {
        store.delete(workspaceId);
        removed = true;
      }
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error || new Error("PDF silinemedi"));
    tx.onabort = () => reject(tx.error || new Error("PDF silme işlemi iptal edildi"));
  });
}
