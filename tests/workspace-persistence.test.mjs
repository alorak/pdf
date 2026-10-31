import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, addWorkspace, switchWorkspace, activeWorkspace,
  saveSelectedText, setWorkspaceFile, clearActiveWorkspace, removeWorkspace, MAX_WORKSPACES,
} from "../src/workspace-store.js";

function withFileAndNote(state, fileName, noteId) {
  let next = setWorkspaceFile(state, fileName);
  next = saveSelectedText(next, { id: noteId, text: "Kalıcı not", page: 2, fileName });
  return next;
}

test("twenty workspaces keep independent PDF names and bookmarks", () => {
  let state = withFileAndNote(initialWorkspaces(), "first.pdf", "first");
  for (let id = 2; id <= MAX_WORKSPACES; id++) {
    state = addWorkspace(state);
    state = withFileAndNote(state, `file-${id}.pdf`, `note-${id}`);
  }
  assert.equal(state.items.length, MAX_WORKSPACES);
  assert.equal(addWorkspace(state), state);
  for (const item of state.items) {
    assert.equal(item.notes.length, 1);
    assert.equal(item.notes[0].fileName, item.fileName);
  }
  state = switchWorkspace(state, 1);
  assert.equal(activeWorkspace(state).fileName, "first.pdf");
  assert.equal(activeWorkspace(state).notes[0].id, "first");
});

test("replacing a PDF clears bookmarks only in the current workspace", () => {
  let state = withFileAndNote(initialWorkspaces(), "first.pdf", "first");
  state = addWorkspace(state);
  state = withFileAndNote(state, "second.pdf", "second");
  state = clearActiveWorkspace(state);
  state = setWorkspaceFile(state, "replacement.pdf");
  assert.equal(activeWorkspace(state).fileName, "replacement.pdf");
  assert.deepEqual(activeWorkspace(state).notes, []);
  assert.equal(state.items.find((item) => item.id === 1).notes[0].text, "Kalıcı not");
});

test("deleting a workspace removes its metadata and preserves others", () => {
  let state = withFileAndNote(initialWorkspaces(), "one.pdf", "one");
  state = addWorkspace(state);
  state = withFileAndNote(state, "two.pdf", "two");
  state = removeWorkspace(state, 2);
  assert.equal(state.items.length, 1);
  assert.equal(state.activeId, 1);
  assert.equal(state.items[0].notes[0].id, "one");
  state = removeWorkspace(state, 1);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].fileName, "");
  assert.deepEqual(state.items[0].notes, []);
});
