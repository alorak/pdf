export const WORKSPACE_STORAGE_KEY = "pdf-viewer-workspaces-v1";
export const MAX_WORKSPACES = 10;
export const MAX_SAVED_TEXTS = 100;
export const MAX_TEXT_LENGTH = 10000;

export function initialWorkspaces() {
  return {
    activeId: 1,
    nextId: 2,
    items: [{ id: 1, name: "Workspace 1", fileName: "", notes: [] }],
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
        .filter((note) => note && typeof note.text === "string" && note.text.trim())
        .map((note, index) => ({
          id: typeof note.id === "string" ? note.id : `legacy-${item.id}-${index}`,
          text: note.text.slice(0, MAX_TEXT_LENGTH),
          page: Number.isSafeInteger(note.page) && note.page > 0 ? note.page : null,
          fileName: typeof note.fileName === "string" ? note.fileName.slice(0, 255) : "",
          savedAt: Number.isFinite(note.savedAt) ? note.savedAt : 0,
        })) : [];
      items.push({
        id: item.id,
        name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 60) : `Workspace ${item.id}`,
        fileName: typeof item.fileName === "string" ? item.fileName.slice(0, 255) : "",
        notes,
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
    items: [...state.items, { id, name: `Workspace ${id}`, fileName: "", notes: [] }],
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

export function setWorkspaceFile(state, fileName) {
  return replaceActive(state, (item) => ({ ...item, fileName: String(fileName).slice(0, 255) }));
}

export function clearActiveWorkspace(state) {
  return replaceActive(state, (item) => ({ ...item, notes: [], fileName: "" }));
}

export function saveSelectedText(state, selection) {
  const text = String(selection.text || "").trim().slice(0, MAX_TEXT_LENGTH);
  if (!text || activeWorkspace(state).notes.length >= MAX_SAVED_TEXTS) return state;
  const note = {
    id: selection.id,
    text,
    page: Number.isSafeInteger(selection.page) && selection.page > 0 ? selection.page : null,
    fileName: String(selection.fileName || "").slice(0, 255),
    savedAt: selection.savedAt,
  };
  return replaceActive(state, (item) => ({ ...item, notes: [...item.notes, note] }));
}

export function bookmarkedPageNumbers(workspace, fileName, pageCount) {
  if (!workspace || !fileName || !Number.isSafeInteger(pageCount) || pageCount < 1) return [];
  return [...new Set((workspace.notes || [])
    .filter((note) => note.fileName === fileName && Number.isSafeInteger(note.page) && note.page >= 1 && note.page <= pageCount)
    .map((note) => note.page))].sort((a, b) => a - b);
}

export function removeSelectedText(state, noteId) {
  return replaceActive(state, (item) => ({
    ...item,
    notes: item.notes.filter((note) => note.id !== noteId),
  }));
}
