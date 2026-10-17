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
