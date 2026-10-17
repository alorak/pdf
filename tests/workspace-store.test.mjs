import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, readWorkspaces, activeWorkspace, addWorkspace,
  switchWorkspace, saveSelectedText, clearActiveWorkspace,
  removeSelectedText, MAX_WORKSPACES, MAX_TEXT_LENGTH,
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
