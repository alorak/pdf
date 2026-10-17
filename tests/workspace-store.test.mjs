import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, readWorkspaces, activeWorkspace, addWorkspace,
  switchWorkspace, setWorkspaceFile, saveSelectedText, savePageBookmark,
  bookmarkedPageNumbers, clearActiveWorkspace, removeSelectedText,
  MAX_WORKSPACES, MAX_TEXT_LENGTH, MAX_HIGHLIGHT_RECTS,
} from "../src/workspace-store.js";

test("workspaces start with a persistent first workspace", () => {
  const state = initialWorkspaces();
  assert.equal(state.activeId, 1);
  assert.deepEqual(activeWorkspace(state).notes, []);
  assert.deepEqual(readWorkspaces(JSON.stringify(state)), state);
});

test("only ten workspaces may be created and selection survives switching", () => {
  let state = initialWorkspaces();
  for (let index = 1; index < MAX_WORKSPACES; index++) state = addWorkspace(state);
  assert.equal(state.items.length, 10);
  assert.equal(addWorkspace(state), state);
  state = switchWorkspace(state, 1);
  state = saveSelectedText(state, { id: "first", text: "Merhaba PDF", page: 2, fileName: "example.pdf", savedAt: 10 });
  state = switchWorkspace(state, 10);
  assert.equal(activeWorkspace(state).notes.length, 0);
  state = switchWorkspace(state, 1);
  assert.equal(activeWorkspace(state).notes[0].text, "Merhaba PDF");
  assert.equal(readWorkspaces(JSON.stringify(state)).items[0].notes.length, 1);
});

test("clearing an active workspace leaves other workspaces and their texts intact", () => {
  let state = saveSelectedText(initialWorkspaces(), { id: "first", text: "Önemli satır", savedAt: 1 });
  state = addWorkspace(state);
  state = saveSelectedText(state, { id: "second", text: "İkinci not", savedAt: 2 });
  state = clearActiveWorkspace(state);
  assert.equal(activeWorkspace(state).notes.length, 0);
  state = switchWorkspace(state, 1);
  assert.equal(activeWorkspace(state).notes[0].text, "Önemli satır");
  state = removeSelectedText(state, "first");
  assert.equal(activeWorkspace(state).notes.length, 0);
});

test("invalid stored data is safely normalized and long selections are bounded", () => {
  assert.equal(readWorkspaces("{oops").activeId, 1);
  assert.equal(readWorkspaces(JSON.stringify({ items: [{ id: 1, notes: "bad" }], activeId: 999 })).activeId, 1);
  const state = saveSelectedText(initialWorkspaces(), { id: "long", text: "x".repeat(MAX_TEXT_LENGTH + 200), savedAt: 1 });
  assert.equal(activeWorkspace(state).notes[0].text.length, MAX_TEXT_LENGTH);
  assert.equal(switchWorkspace(state, 999), state);
});

test("page bookmarks and text bookmarks coexist and count distinct bookmarked pages", () => {
  let state = setWorkspaceFile(initialWorkspaces(), "example.pdf");
  state = saveSelectedText(state, {
    id: "text", text: "Önemli satır", page: 2, fileName: "example.pdf", savedAt: 1,
    rects: [[0.1, 0.2, 0.3, 0.04]],
  });
  state = savePageBookmark(state, { id: "page", page: 2, fileName: "example.pdf", savedAt: 2 });
  state = savePageBookmark(state, { id: "page4", page: 4, fileName: "example.pdf", savedAt: 3 });
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "example.pdf", 8), [2, 4]);
  assert.equal(savePageBookmark(state, { id: "duplicate", page: 2, fileName: "example.pdf" }), state);
  const restored = readWorkspaces(JSON.stringify(state));
  assert.equal(restored.items[0].notes.length, 3);
  assert.deepEqual(restored.items[0].notes[0].rects, [[0.1, 0.2, 0.3, 0.04]]);
  assert.equal(restored.items[0].notes[1].kind, "page");
  assert.equal(restored.items[0].notes[1].text, "");
  state = removeSelectedText(restored, "page");
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "example.pdf", 8), [2, 4]);
  state = removeSelectedText(state, "text");
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "example.pdf", 8), [4]);
});

test("saved highlight rectangles are sanitized and limited, legacy text bookmarks survive", () => {
  const valid = Array.from({ length: MAX_HIGHLIGHT_RECTS + 25 }, () => [0.125, 0.22, 0.5, 0.035]);
  let state = saveSelectedText(initialWorkspaces(), {
    id: "highlight", text: "Seçim", page: 1, fileName: "file.pdf", savedAt: 1,
    rects: [...valid, [-1, 0, 0.5, 0.1]],
  });
  assert.equal(activeWorkspace(state).notes[0].rects.length, MAX_HIGHLIGHT_RECTS);
  state = readWorkspaces(JSON.stringify(state));
  assert.equal(activeWorkspace(state).notes[0].rects.length, MAX_HIGHLIGHT_RECTS);
  const legacy = readWorkspaces(JSON.stringify({
    activeId: 1, nextId: 2,
    items: [{ id: 1, fileName: "file.pdf", notes: [{ id: "old", text: "Önceden seçilmiş", page: 1, fileName: "file.pdf" }] }],
  }));
  assert.equal(activeWorkspace(legacy).notes[0].kind, "text");
  assert.deepEqual(activeWorkspace(legacy).notes[0].rects, []);
  assert.equal(savePageBookmark(state, { id: "invalid", page: 0, fileName: "file.pdf" }), state);
});

test("page bookmarks stay in their workspace and are cleared with its PDF", () => {
  let state = setWorkspaceFile(initialWorkspaces(), "one.pdf");
  state = savePageBookmark(state, { id: "one", page: 3, fileName: "one.pdf", savedAt: 1 });
  state = addWorkspace(state);
  state = setWorkspaceFile(state, "two.pdf");
  state = savePageBookmark(state, { id: "two", page: 5, fileName: "two.pdf", savedAt: 2 });
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "two.pdf", 10), [5]);
  state = clearActiveWorkspace(state);
  assert.deepEqual(activeWorkspace(state).notes, []);
  state = switchWorkspace(state, 1);
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "one.pdf", 10), [3]);
});
