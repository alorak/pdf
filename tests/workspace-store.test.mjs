import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, readWorkspaces, activeWorkspace, addWorkspace,
  switchWorkspace, setWorkspaceFile, saveSelectedText, savePageBookmark,
  bookmarkedPageNumbers, orderedBookmarkedPageNumbers, reorderBookmarkedPage, moveBookmarkedPage,
  removePageBookmarks, clearActiveWorkspace, removeSelectedText,
  MAX_WORKSPACES, MAX_TEXT_LENGTH, MAX_HIGHLIGHT_RECTS,
} from "../src/workspace-store.js";

test("workspaces start with a persistent first workspace", () => {
  const state = initialWorkspaces();
  assert.equal(state.activeId, 1);
  assert.deepEqual(activeWorkspace(state).notes, []);
  assert.deepEqual(readWorkspaces(JSON.stringify(state)), state);
});

test("up to twenty workspaces may be created and selection survives switching", () => {
  let state = initialWorkspaces();
  for (let index = 1; index < MAX_WORKSPACES; index++) state = addWorkspace(state);
  assert.equal(state.items.length, MAX_WORKSPACES);
  assert.equal(addWorkspace(state), state);
  state = switchWorkspace(state, 1);
  state = saveSelectedText(state, { id: "first", text: "Merhaba PDF", page: 2, fileName: "example.pdf", savedAt: 10 });
  state = switchWorkspace(state, MAX_WORKSPACES);
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

test("bookmarks initially follow PDF page numbers, and manual order survives reload", () => {
  let state = setWorkspaceFile(initialWorkspaces(), "manual.pdf");
  for (const page of [8, 2, 5]) {
    state = savePageBookmark(state, { id: `page-${page}`, page, fileName: "manual.pdf", savedAt: page });
  }
  const order = () => orderedBookmarkedPageNumbers(activeWorkspace(state), "manual.pdf", 10);
  assert.deepEqual(order(), [2, 5, 8]);
  state = moveBookmarkedPage(state, "manual.pdf", 10, 5, -1);
  assert.deepEqual(order(), [5, 2, 8]);
  state = moveBookmarkedPage(state, "manual.pdf", 10, 5, -1);
  assert.deepEqual(order(), [5, 2, 8]); // left boundary: no movement
  state = reorderBookmarkedPage(state, "manual.pdf", 10, 8, 5, false);
  assert.deepEqual(order(), [8, 5, 2]);
  state = reorderBookmarkedPage(state, "manual.pdf", 10, 8, 2, true);
  assert.deepEqual(order(), [5, 2, 8]);
  state = readWorkspaces(JSON.stringify(state));
  assert.deepEqual(order(), [5, 2, 8]);
  state = savePageBookmark(state, { id: "new", page: 3, fileName: "manual.pdf" });
  assert.deepEqual(order(), [5, 2, 8, 3]); // new pages follow the saved manual order
});

test("removing a bookmarked page removes all its highlights, not other pages", () => {
  let state = setWorkspaceFile(initialWorkspaces(), "sample.pdf");
  state = savePageBookmark(state, { id: "page", page: 3, fileName: "sample.pdf" });
  state = saveSelectedText(state, { id: "highlight", text: "Selected", page: 3, fileName: "sample.pdf", rects: [[.1,.2,.3,.04]] });
  state = savePageBookmark(state, { id: "other", page: 5, fileName: "sample.pdf" });
  state = reorderBookmarkedPage(state, "sample.pdf", 10, 5, 3, false);
  state = removePageBookmarks(state, "sample.pdf", 3);
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(state), "sample.pdf", 10), [5]);
  assert.deepEqual(orderedBookmarkedPageNumbers(activeWorkspace(state), "sample.pdf", 10), [5]);
  assert.deepEqual(activeWorkspace(state).notes.map((note) => note.id), ["other"]);
  assert.equal(removePageBookmarks(state, "sample.pdf", 3), state);
});

test("manual bookmark order stays isolated per workspace and clears with PDF replacement", () => {
  let state = setWorkspaceFile(initialWorkspaces(), "one.pdf");
  for (const page of [2, 4]) state = savePageBookmark(state, { id: `one-${page}`, page, fileName: "one.pdf" });
  state = moveBookmarkedPage(state, "one.pdf", 8, 4, -1);
  state = addWorkspace(state);
  state = setWorkspaceFile(state, "two.pdf");
  for (const page of [1, 3]) state = savePageBookmark(state, { id: `two-${page}`, page, fileName: "two.pdf" });
  assert.deepEqual(orderedBookmarkedPageNumbers(activeWorkspace(state), "two.pdf", 8), [1, 3]);
  state = switchWorkspace(state, 1);
  assert.deepEqual(orderedBookmarkedPageNumbers(activeWorkspace(state), "one.pdf", 8), [4, 2]);
  state = clearActiveWorkspace(state);
  assert.deepEqual(activeWorkspace(state).bookmarkOrder, []);
  state = setWorkspaceFile(state, "replacement.pdf");
  assert.deepEqual(orderedBookmarkedPageNumbers(activeWorkspace(state), "replacement.pdf", 8), []);
});

test("previously saved ten workspaces can be expanded to twenty without data loss", () => {
  let state = initialWorkspaces();
  for (let id = 2; id <= 10; id++) state = addWorkspace(state);
  state = switchWorkspace(state, 10);
  state = setWorkspaceFile(state, "original-ten.pdf");
  const previouslySaved = readWorkspaces(JSON.stringify(state));
  for (let id = 11; id <= MAX_WORKSPACES; id++) state = addWorkspace(state);
  assert.equal(state.items.length, 20);
  assert.equal(state.activeId, 20);
  assert.equal(state.items.find((item) => item.id === 10).fileName, "original-ten.pdf");
  assert.equal(previouslySaved.items.length, 10);
  assert.equal(readWorkspaces(JSON.stringify(state)).items.length, MAX_WORKSPACES);
});

test("workspace restore preserves at most twenty entries", () => {
  const items = Array.from({ length: MAX_WORKSPACES + 3 }, (_, index) => ({
    id: index + 1, fileName: `pdf-${index + 1}.pdf`, notes: [],
  }));
  const restored = readWorkspaces(JSON.stringify({ items, activeId: 20, nextId: 24 }));
  assert.equal(restored.items.length, MAX_WORKSPACES);
  assert.equal(restored.activeId, 20);
  assert.equal(restored.items.at(-1).fileName, "pdf-20.pdf");
});
