export const WORKSPACE_STORAGE_KEY = "pdf-viewer-workspaces-v1";
export const MAX_WORKSPACES = 10;
export const MAX_SAVED_TEXTS = 100;
export const MAX_TEXT_LENGTH = 10000;
export const MAX_HIGHLIGHT_RECTS = 240;
export const DEFAULT_WORKSPACE_VIEW = Object.freeze({
  fit: "page",
  orientation: "vertical",
  thumbPosition: "left",
  thumbsVisible: true,
});

function normalizeWorkspaceView(value) {
  return {
    fit: ["width", "height", "page"].includes(value?.fit) ? value.fit : DEFAULT_WORKSPACE_VIEW.fit,
    orientation: ["vertical", "horizontal"].includes(value?.orientation) ? value.orientation : DEFAULT_WORKSPACE_VIEW.orientation,
    thumbPosition: ["left", "bottom"].includes(value?.thumbPosition) ? value.thumbPosition : DEFAULT_WORKSPACE_VIEW.thumbPosition,
    thumbsVisible: typeof value?.thumbsVisible === "boolean" ? value.thumbsVisible : DEFAULT_WORKSPACE_VIEW.thumbsVisible,
  };
}

function cleanHighlightRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects.slice(0, MAX_HIGHLIGHT_RECTS)
    .filter((rect) => Array.isArray(rect) && rect.length === 4
      && rect.every((value) => typeof value === "number" && Number.isFinite(value))
      && rect[0] >= 0 && rect[1] >= 0 && rect[2] > 0 && rect[3] > 0
      && rect[0] + rect[2] <= 1.001 && rect[1] + rect[3] <= 1.001)
    .map((rect) => rect.map((value) => Math.round(value * 100000) / 100000));
}

export function initialWorkspaces() {
  return {
    activeId: 1,
    nextId: 2,
    items: [{ id: 1, name: "Workspace 1", fileName: "", notes: [], bookmarkOrder: [], view: { ...DEFAULT_WORKSPACE_VIEW } }],
  };
}

export function readWorkspaces(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || !Array.isArray(parsed.items)) return initialWorkspaces();
    const seen = new Set();
    const items = [];
    for (const item of parsed.items.slice(0, MAX_WORKSPACES)) {
      if (!Number.isSafeInteger(item?.id) || item.id < 1 || seen.has(item.id)) continue;
      seen.add(item.id);
      const notes = Array.isArray(item.notes) ? item.notes.slice(-MAX_SAVED_TEXTS)
        .filter((note) => note && (note.kind === "page"
          ? Number.isSafeInteger(note.page) && note.page > 0
          : typeof note.text === "string" && note.text.trim()))
        .map((note, index) => ({
          id: typeof note.id === "string" ? note.id : `legacy-${item.id}-${index}`,
          kind: note.kind === "page" ? "page" : "text",
          text: note.kind === "page" ? "" : note.text.slice(0, MAX_TEXT_LENGTH),
          page: Number.isSafeInteger(note.page) && note.page > 0 ? note.page : null,
          fileName: typeof note.fileName === "string" ? note.fileName.slice(0, 255) : "",
          savedAt: Number.isFinite(note.savedAt) ? note.savedAt : 0,
          rects: note.kind === "page" ? [] : cleanHighlightRects(note.rects),
        })) : [];
      items.push({
        id: item.id,
        name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 60) : `Workspace ${item.id}`,
        fileName: typeof item.fileName === "string" ? item.fileName.slice(0, 255) : "",
        notes,
        view: normalizeWorkspaceView(item.view),
        bookmarkOrder: Array.isArray(item.bookmarkOrder)
          ? [...new Set(item.bookmarkOrder.filter((page) => Number.isSafeInteger(page) && page > 0))].slice(0, MAX_SAVED_TEXTS)
          : [],
      });
    }
    if (!items.length) return initialWorkspaces();
    const maxId = Math.max(...items.map((item) => item.id));
    return {
      activeId: items.some((item) => item.id === parsed.activeId) ? parsed.activeId : items[0].id,
      nextId: Math.max(maxId + 1, Number.isSafeInteger(parsed.nextId) ? parsed.nextId : 1),
      items,
    };
  } catch {
    return initialWorkspaces();
  }
}

export function activeWorkspace(state) {
  return state.items.find((item) => item.id === state.activeId);
}

export function addWorkspace(state) {
  if (state.items.length >= MAX_WORKSPACES) return state;
  const id = state.nextId;
  return {
    ...state,
    activeId: id,
    nextId: id + 1,
    items: [...state.items, { id, name: `Workspace ${id}`, fileName: "", notes: [], bookmarkOrder: [], view: { ...DEFAULT_WORKSPACE_VIEW } }],
  };
}

export function switchWorkspace(state, id) {
  return state.items.some((item) => item.id === id) ? { ...state, activeId: id } : state;
}

function replaceActive(state, transform) {
  return {
    ...state,
    items: state.items.map((item) => item.id === state.activeId ? transform(item) : item),
  };
}

export function setWorkspaceView(state, view) {
  return replaceActive(state, (item) => ({ ...item, view: normalizeWorkspaceView(view) }));
}

export function setWorkspaceFile(state, fileName) {
  return replaceActive(state, (item) => {
    const nextFile = String(fileName).slice(0, 255);
    return { ...item, fileName: nextFile, bookmarkOrder: nextFile === item.fileName ? item.bookmarkOrder : [] };
  });
}

export function clearActiveWorkspace(state) {
  return replaceActive(state, (item) => ({ ...item, notes: [], fileName: "", bookmarkOrder: [] }));
}

export function removeWorkspace(state, id) {
  if (!state.items.some((item) => item.id === id)) return state;
  if (state.items.length === 1) {
    return { ...state, items: [{ ...state.items[0], fileName: "", notes: [], bookmarkOrder: [], view: { ...DEFAULT_WORKSPACE_VIEW } }] };
  }
  const items = state.items.filter((item) => item.id !== id);
  return {
    ...state,
    items,
    activeId: state.activeId === id ? items[0].id : state.activeId,
  };
}

export function saveSelectedText(state, selection) {
  const text = String(selection.text || "").trim().slice(0, MAX_TEXT_LENGTH);
  if (!text || activeWorkspace(state).notes.length >= MAX_SAVED_TEXTS) return state;
  const note = {
    id: selection.id,
    kind: "text",
    text,
    page: Number.isSafeInteger(selection.page) && selection.page > 0 ? selection.page : null,
    fileName: String(selection.fileName || "").slice(0, 255),
    savedAt: selection.savedAt,
    rects: cleanHighlightRects(selection.rects),
  };
  return replaceActive(state, (item) => ({ ...item, notes: [...item.notes, note] }));
}

export function savePageBookmark(state, { id, page, fileName, savedAt }) {
  const file = String(fileName || "").slice(0, 255);
  const workspace = activeWorkspace(state);
  if (!file || !Number.isSafeInteger(page) || page < 1 || workspace.notes.length >= MAX_SAVED_TEXTS) return state;
  if (workspace.notes.some((note) => note.kind === "page" && note.fileName === file && note.page === page)) return state;
  const note = { id, kind: "page", text: "", page, fileName: file, savedAt, rects: [] };
  return replaceActive(state, (item) => ({ ...item, notes: [...item.notes, note] }));
}

export function bookmarkedPageNumbers(workspace, fileName, pageCount) {
  if (!workspace || !fileName || !Number.isSafeInteger(pageCount) || pageCount < 1) return [];
  return [...new Set((workspace.notes || [])
    .filter((note) => note.fileName === fileName && Number.isSafeInteger(note.page) && note.page >= 1 && note.page <= pageCount)
    .map((note) => note.page))].sort((a, b) => a - b);
}

export function orderedBookmarkedPageNumbers(workspace, fileName, pageCount) {
  const pages = bookmarkedPageNumbers(workspace, fileName, pageCount);
  const available = new Set(pages);
  const previous = (workspace?.bookmarkOrder || []).filter((page) => available.has(page));
  return [...previous, ...pages.filter((page) => !previous.includes(page))];
}

export function reorderBookmarkedPage(state, fileName, pageCount, sourcePage, targetPage, after = false) {
  const workspace = activeWorkspace(state);
  if (!workspace || workspace.fileName !== fileName) return state;
  const current = orderedBookmarkedPageNumbers(workspace, fileName, pageCount);
  if (sourcePage === targetPage || !current.includes(sourcePage) || !current.includes(targetPage)) return state;
  const next = current.filter((page) => page !== sourcePage);
  next.splice(next.indexOf(targetPage) + (after ? 1 : 0), 0, sourcePage);
  if (next.every((page, index) => page === current[index])) return state;
  return replaceActive(state, (item) => ({ ...item, bookmarkOrder: next }));
}

export function moveBookmarkedPage(state, fileName, pageCount, page, direction) {
  const order = orderedBookmarkedPageNumbers(activeWorkspace(state), fileName, pageCount);
  const index = order.indexOf(page);
  const target = order[index + direction];
  if (index < 0 || target === undefined) return state;
  return reorderBookmarkedPage(state, fileName, pageCount, page, target, direction > 0);
}

export function removePageBookmarks(state, fileName, page) {
  const workspace = activeWorkspace(state);
  if (!workspace?.notes.some((note) => note.fileName === fileName && note.page === page)) return state;
  return replaceActive(state, (item) => ({
    ...item,
    notes: item.notes.filter((note) => !(note.fileName === fileName && note.page === page)),
    bookmarkOrder: (item.bookmarkOrder || []).filter((value) => value !== page),
  }));
}

export function removeSelectedText(state, noteId) {
  return replaceActive(state, (item) => {
    const notes = item.notes.filter((note) => note.id !== noteId);
    const remainingPages = new Set(notes.filter((note) => note.fileName === item.fileName).map((note) => note.page));
    return { ...item, notes, bookmarkOrder: (item.bookmarkOrder || []).filter((page) => remainingPages.has(page)) };
  });
}
