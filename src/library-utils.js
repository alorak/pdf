import { MAX_WORKSPACES } from "./workspace-store.js";
import { workspaceDocumentName } from "./linked-document.js";

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

/** Always reserve a fixed number of UI slots without altering workspace storage. */
export function libraryWorkspaceSlots(state, max = MAX_WORKSPACES) {
  const existing = state.items.slice(0, max).map((workspace) => ({
    id: workspace.id,
    workspace,
  }));
  const missing = Math.max(0, max - existing.length);
  return [...existing, ...Array.from({ length: missing }, (_, index) => ({
    id: state.nextId + index,
    workspace: null,
  }))];
}

/**
 * Count saved bookmarks for the current PDF, grouped into distinct navigable
 * pages. Multiple text selections on the same page count separately but appear
 * as one destination in the five-pages-per-view dialog.
 */
export function libraryBookmarkSummary(workspace) {
  const documentName = workspaceDocumentName(workspace);
  if (!documentName) return { count: 0, pages: [] };
  const byPage = new Map();
  let count = 0;
  for (const note of workspace.notes || []) {
    if (note?.fileName !== documentName
      || !Number.isSafeInteger(note.page) || note.page < 1) continue;
    count++;
    if (!byPage.has(note.page)) {
      byPage.set(note.page, { page: note.page, pageBookmarks: 0, textNotes: 0, preview: "" });
    }
    const group = byPage.get(note.page);
    if (note.kind === "page") group.pageBookmarks++;
    else {
      group.textNotes++;
      if (!group.preview && typeof note.text === "string") group.preview = note.text.trim().slice(0, 140);
    }
  }
  const order = [...new Set((workspace.bookmarkOrder || []).filter(
    (page) => Number.isSafeInteger(page) && byPage.has(page)
  ))];
  const indexed = new Map(order.map((page, index) => [page, index]));
  const pages = [...byPage.values()].sort((a, b) => {
    const aIndex = indexed.get(a.page);
    const bIndex = indexed.get(b.page);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return a.page - b.page;
  });
  return { count, pages };
}

export function paginateLibraryBookmarkPages(pages, pageIndex, pageSize = 5) {
  const totalPages = Math.max(1, Math.ceil(pages.length / pageSize));
  const index = Math.max(0, Math.min(totalPages - 1, Math.trunc(pageIndex) || 0));
  return {
    pageIndex: index,
    totalPages,
    items: pages.slice(index * pageSize, (index + 1) * pageSize),
  };
}
