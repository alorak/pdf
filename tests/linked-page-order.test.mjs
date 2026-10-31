import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, addWorkspace, setWorkspaceFile, addLinkedWorkspacePages,
  activeWorkspace, savePageBookmark, saveSelectedText, reorderLinkedWorkspacePage,
  readWorkspaces, setWorkspaceLastPage,
} from "../src/workspace-store.js";

function fixture() {
  let state = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  state = addWorkspace(state);
  state = addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "source.pdf", sourceSize: 100,
    sourceLastModified: 42, pages: [5, 10, 15, 20],
  });
  return state;
}

test("reordering linked pages remaps text highlights, bookmarks and reading position", () => {
  let state = fixture();
  state = savePageBookmark(state, { id: "bm", fileName: "@workspace-linked-pages", page: 1, savedAt: 1 });
  state = saveSelectedText(state, { id: "highlight", text: "Equation", rects: [[.2,.1,.4,.15]],
    page: 3, fileName: "@workspace-linked-pages", savedAt: 2 });
  state = setWorkspaceLastPage(state, 4);
  const before = state;
  const moved = reorderLinkedWorkspacePage(state, 1, 3, true);
  assert.deepEqual(activeWorkspace(moved).linkedPages.map(ref => ref.page), [10,15,5,20]);
  assert.equal(activeWorkspace(moved).notes.find(n=>n.id==="bm").page, 3);
  assert.equal(activeWorkspace(moved).notes.find(n=>n.id==="highlight").page, 2);
  assert.equal(activeWorkspace(moved).lastPage, 4);
  assert.deepEqual(activeWorkspace(before).linkedPages.map(ref=>ref.page), [5,10,15,20]);
  assert.deepEqual(readWorkspaces(JSON.stringify(moved)).items[1].linkedPages.map(r=>r.page), [10,15,5,20]);
});

test("moving currently-read page changes lastPage to the new virtual page", () => {
  let ws = setWorkspaceLastPage(fixture(), 2);
  ws = reorderLinkedWorkspacePage(ws, 2, 4, true);
  assert.equal(activeWorkspace(ws).lastPage, 4);
  assert.deepEqual(activeWorkspace(ws).linkedPages.map(r=>r.page), [5,15,20,10]);
});

test("invalid reorder attempts or PDF-first workspaces cannot mutate data", () => {
  const ws = fixture();
  assert.equal(reorderLinkedWorkspacePage(ws,1,1),ws);
  assert.equal(reorderLinkedWorkspacePage(ws,0,2),ws);
  assert.equal(reorderLinkedWorkspacePage(ws,4,7),ws);
  const source = { ...ws,activeId:1 };
  assert.equal(reorderLinkedWorkspacePage(source,1,2),source);
});

test("bookmarkOrder is remapped with page content", () => {
  let ws = fixture();
  ws = { ...ws,items:ws.items.map(item => item.id===2?{...item, bookmarkOrder:[1,3,4]}:item) };
  ws = reorderLinkedWorkspacePage(ws,4,1,false);
  assert.deepEqual(activeWorkspace(ws).linkedPages.map(r=>r.page), [20,5,10,15]);
  assert.deepEqual(activeWorkspace(ws).bookmarkOrder,[2,4,1]);
});
