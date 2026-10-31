/**
 * IndexedDB records are keyed by workspace ID rather than by file name.
 * A stale or mismatched record cannot be restored by the PDF reader.
 */
export function classifyLibraryPdfs(records, workspaceItems) {
  const byId = new Map(workspaceItems.map((item) => [item.id, item]));
  return records.map((record) => {
    const workspace = byId.get(record.workspaceId) || null;
    return {
      ...record,
      workspace,
      orphan: !workspace || !workspace.fileName || workspace.fileName !== record.name,
    };
  });
}

/** Approximate localStorage payload (UTF-16 key/value characters), not disk allocation. */
export function measureLocalStorage(storage) {
  try {
    let bytes = 0;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === null) continue;
      const value = storage.getItem(key);
      bytes += 2 * (key.length + (value?.length ?? 0));
    }
    return { bytes, keys: storage.length };
  } catch {
    return null;
  }
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const sizes = ["KB", "MB", "GB", "TB"];
  let size = value;
  let index = -1;
  do { size /= 1024; index++; } while (size >= 1024 && index < sizes.length - 1);
  return `${size.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${sizes[index]}`;
}
