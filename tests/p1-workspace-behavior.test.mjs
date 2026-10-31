import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, addWorkspace, activeWorkspace, switchWorkspace,
  setWorkspaceFile, addLinkedWorkspacePages, savePageBookmark,
  reorderBookmarkedPage, orderedBookmarkedPageNumbers,
  setWorkspaceLastPage, removeLinkedWorkspacePage,
  removeWorkspaceLinkedPage, readWorkspaces,
} from "../src/workspace-store.js";
import { workspaceDocumentName } from "../src/linked-document.js";
import { libraryBookmarkSummary } from "../src/library-utils.js";
import { dependentPageLinks, groupDependentLinks, stalePageLinks } from "../src/workspace-dependencies.js";

function fixture() {
  let state = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  state = addWorkspace(state);
  state = addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "source.pdf",
    sourceSize: 100, sourceLastModified: 123, pages: [4, 6, 8],
  });
  return state;
}

test("Library bookmark target uses virtual document identity and page sorting works", () => {
  let state = fixture();
  const doc = workspaceDocumentName(activeWorkspace(state));
  assert.equal(doc, "@workspace-linked-pages");
  state = savePageBookmark(state, { id: "a", fileName: doc, page: 1, savedAt: 100 });
  state = savePageBookmark(state, { id: "b", fileName: doc, page: 2, savedAt: 101 });
  state = savePageBookmark(state, { id: "c", fileName: doc, page: 3, savedAt: 102 });
  assert.equal(libraryBookmarkSummary(activeWorkspace(state)).count, 3);
  state = reorderBookmarkedPage(state, doc, 3, 3, 1);
  assert.deepEqual(orderedBookmarkedPageNumbers(activeWorkspace(state), doc, 3), [3, 1, 2]);
});

test("last read page survives serialization, workspace switching and same-PDF reopening", () => {
  let state = fixture();
  state = setWorkspaceLastPage(state, 3);
  assert.equal(activeWorkspace(state).lastPage, 3);
  state = switchWorkspace(state, 1);
  state = setWorkspaceLastPage(state, 12);
  state = switchWorkspace(state, 2);
  assert.equal(activeWorkspace(state).lastPage, 3);
  const loaded = readWorkspaces(JSON.stringify(state));
  assert.equal(loaded.items[0].lastPage, 12);
  assert.equal(loaded.items[1].lastPage, 3);
  assert.equal(setWorkspaceLastPage(loaded, 0), loaded);
});

test("changing PDF resets last page; unlinking a page shifts following reading position", () => {
  let state = fixture();
  state = setWorkspaceLastPage(state, 3);
  const removed = activeWorkspace(state).linkedPages[0].id;
  state = removeLinkedWorkspacePage(state, removed);
  assert.equal(activeWorkspace(state).lastPage, 2);
  state = switchWorkspace(state, 1);
  state = setWorkspaceLastPage(state, 25);
  state = setWorkspaceFile(state, "different.pdf");
  assert.equal(activeWorkspace(state).lastPage, 1);
});

test("dependent source warnings enumerate only actual linked pages and groups", () => {
  const state = fixture();
  const links = dependentPageLinks(state, 1);
  assert.deepEqual(links.map(link => link.page), [4, 6, 8]);
  assert.deepEqual(groupDependentLinks(links), [{ workspaceId: 2, pages: [4, 6, 8] }]);
  assert.deepEqual(dependentPageLinks(state, 2), []);
});

test("broken links are reported without modifying surviving bookmarks or sources", () => {
  const state = fixture();
  const valid = [{ workspaceId: 1, name: "source.pdf", size: 100, lastModified: 123 }];
  assert.deepEqual(stalePageLinks(state, valid), []);
  const broken = stalePageLinks(state, [{ ...valid[0], size: 101 }]);
  assert.equal(broken.length, 3);
  assert.equal(broken[0].targetWorkspaceId, 2);
  assert.equal(stalePageLinks(state, []).length, 3);
  assert.equal(activeWorkspace(state).linkedPages.length, 3);
});

test("repair manager removes the link in another workspace but preserves active reader", () => {
  let state = fixture();
  state = switchWorkspace(state, 2);
  const doc = workspaceDocumentName(activeWorkspace(state));
  state = savePageBookmark(state, { id: "third", fileName: doc, page: 3, savedAt: 9 });
  const first = activeWorkspace(state).linkedPages[0].id;
  state = switchWorkspace(state, 1);
  state = removeWorkspaceLinkedPage(state, 2, first);
  assert.equal(state.activeId, 1);
  assert.deepEqual(state.items.find(x => x.id === 2).linkedPages.map(ref => ref.page), [6, 8]);
  assert.equal(state.items.find(x => x.id === 2).notes[0].page, 2);
  assert.equal(state.items[0].fileName, "source.pdf");
});
