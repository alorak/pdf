import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINKED_PAGES, initialWorkspaces, addWorkspace, switchWorkspace,
  setWorkspaceFile, clearActiveWorkspace, removeWorkspace,
  readWorkspaces, activeWorkspace, addLinkedWorkspacePages,
  removeLinkedWorkspacePage, parseLinkedPageSelection,
} from "../src/workspace-store.js";

function fixture() {
  let state = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  state = addWorkspace(state);
  state = setWorkspaceFile(state, "target.pdf");
  return state;
}

function addLinks(state, pages = [1, 3, 4]) {
  return addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "source.pdf",
    sourceSize: 1000, sourceLastModified: 123456789,
    pages,
  });
}

test("target workspace references source PDF pages without copying the original", () => {
  let state = fixture();
  state = addLinks(state);
  assert.deepEqual(activeWorkspace(state).linkedPages.map((ref) => ref.page), [1, 3, 4]);
  assert.deepEqual(state.items[0].linkedPages, []);
  assert.equal(activeWorkspace(state).fileName, "target.pdf");
  assert.ok(activeWorkspace(state).linkedPages.every((ref) =>
    ref.sourceWorkspaceId === 1 && ref.sourceFileName === "source.pdf"));
  assert.equal(readWorkspaces(JSON.stringify(state)).items[1].linkedPages.length, 3);
});

test("duplicates are ignored, same-size renamed sources retain distinct identities", () => {
  let state = addLinks(fixture(), [1, 2, 2]);
  assert.equal(activeWorkspace(state).linkedPages.length, 2);
  assert.equal(addLinks(state, [1, 2]), state);
  state = switchWorkspace(state, 1);
  state = setWorkspaceFile(state, "renamed.pdf");
  state = switchWorkspace(state, 2);
  state = addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "renamed.pdf",
    sourceSize: 1000, sourceLastModified: 123456789, pages: [1],
  });
  assert.equal(activeWorkspace(state).linkedPages.length, 3);
  assert.equal(new Set(activeWorkspace(state).linkedPages.map((ref) => ref.id)).size, 3);
});

test("invalid sources, self-links and malformed metadata are rejected", () => {
  const state = fixture();
  assert.equal(addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 2, sourceFileName: "target.pdf", sourceSize: 10, sourceLastModified: 4, pages: [1],
  }), state);
  assert.equal(addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 99, sourceFileName: "source.pdf", sourceSize: 10, sourceLastModified: 4, pages: [1],
  }), state);
  assert.equal(addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "wrong.pdf", sourceSize: 10, sourceLastModified: 4, pages: [1],
  }), state);
  const malicious = readWorkspaces(JSON.stringify({
    items: [
      { id: 1, fileName: "x.pdf", linkedPages: [
        { sourceWorkspaceId: 1, sourceFileName: "x.pdf", page: 2, sourceSize: 1, sourceLastModified: 3 },
        { sourceWorkspaceId: 2, sourceFileName: "y.pdf", page: -1, sourceSize: 1, sourceLastModified: 3 },
      ] },
    ],
    activeId: 1,
  }));
  assert.deepEqual(malicious.items[0].linkedPages, []);
});

test("removal only deletes the link, and source PDF and notes survive", () => {
  let state = addLinks(fixture());
  const other = state.items[0];
  const id = activeWorkspace(state).linkedPages[1].id;
  state = removeLinkedWorkspacePage(state, id);
  assert.deepEqual(activeWorkspace(state).linkedPages.map((ref) => ref.page), [1, 4]);
  assert.equal(state.items[0], other);
  assert.equal(state.items[0].fileName, "source.pdf");
  assert.equal(removeLinkedWorkspacePage(state, "unknown"), state);
});

test("replacing target PDF retains independent linked page collection", () => {
  let state = addLinks(fixture());
  state = clearActiveWorkspace(state);
  assert.equal(activeWorkspace(state).fileName, "");
  assert.equal(activeWorkspace(state).linkedPages.length, 3);
  state = removeWorkspace(state, 1);
  assert.equal(activeWorkspace(state).linkedPages.length, 3, "missing source references remain explicit until manually removed");
});

test("source ranges parse strictly and uniquely", () => {
  assert.deepEqual(parseLinkedPageSelection("1,3-5, 4, 8", 10), [1, 3, 4, 5, 8]);
  assert.throws(() => parseLinkedPageSelection("0,1", 10));
  assert.throws(() => parseLinkedPageSelection("12", 10));
  assert.throws(() => parseLinkedPageSelection("4-2", 10));
  assert.throws(() => parseLinkedPageSelection("1,abc", 10));
  assert.throws(() => parseLinkedPageSelection("1-999999999", 10));
  assert.throws(() => parseLinkedPageSelection("1", 0));
  assert.throws(() => parseLinkedPageSelection("1".repeat(301), 10));
});

test("linked pages have a firm 100-page per-workspace cap", () => {
  let state = fixture();
  state = addLinks(state, Array.from({ length: MAX_LINKED_PAGES }, (_, index) => index + 1));
  assert.equal(activeWorkspace(state).linkedPages.length, MAX_LINKED_PAGES);
  const capped = addLinks(state, [101]);
  assert.equal(capped, state);
  assert.throws(() => parseLinkedPageSelection("1-101", 150));
});
