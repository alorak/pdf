import { activeWorkspace, clearActiveWorkspace, setWorkspaceFile } from "./workspace-store.js";

/**
 * Compare real PDF bytes, not just the file name, lastModified or file size.
 * Read in small slices to avoid allocating two complete PDF copies in memory.
 */
export async function samePdfContent(a, b, blockSize = 1024 * 1024) {
  if (!a || !b || a.size !== b.size) return false;
  if (a === b) return true;
  if (!Number.isSafeInteger(blockSize) || blockSize < 1) throw new Error("Invalid comparison block size");
  for (let offset = 0; offset < a.size; offset += blockSize) {
    const end = Math.min(offset + blockSize, a.size);
    const [left, right] = await Promise.all([
      a.slice(offset, end).arrayBuffer(), b.slice(offset, end).arrayBuffer(),
    ]);
    const aa = new Uint8Array(left);
    const bb = new Uint8Array(right);
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  }
  return true;
}

/** Create an immutable prospective state; do not clear bookmarks until commit. */
export function replacementWorkspaceState(current, workspaceId, nextName) {
  if (current?.activeId !== workspaceId || !activeWorkspace(current)) {
    throw new Error("Workspace değişti; PDF değiştirme işlemi iptal edildi.");
  }
  const active = activeWorkspace(current);
  if (active.mode === "pages") throw new Error("Sayfa workspace'ine PDF yüklenemez.");
  return setWorkspaceFile(clearActiveWorkspace(current), nextName);
}

/**
 * LocalStorage is not transactional with IndexedDB. These callbacks are invoked
 * INSIDE the PDF put request's success event (before its transaction commits).
 * Throwing from writeMetadata aborts the IndexedDB transaction so the old PDF
 * remains intact; a later transaction abort attempts metadata compensation.
 */
export function makePdfMetadataCommit(storage, storageKey, previousState, nextState, isCurrent = () => true) {
  const previous = storage.getItem(storageKey);
  const expected = JSON.stringify(previousState);
  const next = JSON.stringify(nextState);
  let written = false;
  return {
    commit() {
      if (!isCurrent()) throw new Error("PDF değiştirme işlemi iptal edildi.");
      const current = storage.getItem(storageKey);
      // Avoid clobbering changes from another tab or a newer workspace update.
      if (current !== previous && current !== expected) {
        throw new Error("Workspace verisi başka bir sekmede değişti. PDF değiştirilmedi.");
      }
      storage.setItem(storageKey, next);
      written = true;
    },
    rollback() {
      if (!written) return;
      // Roll back only our own write; never overwrite a newer update.
      if (storage.getItem(storageKey) !== next) {
        throw new Error("Workspace verisi eşzamanlı değişti; metadata otomatik geri alınamadı.");
      }
      if (previous === null) storage.removeItem(storageKey);
      else storage.setItem(storageKey, previous);
      written = false;
    },
  };
}
