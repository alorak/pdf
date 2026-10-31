import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, addWorkspace, switchWorkspace, setWorkspaceFile,
  addLinkedWorkspacePages, removeLinkedWorkspacePage,
  readWorkspaces, activeWorkspace, savePageBookmark,
} from "../src/workspace-store.js";
import { openLinkedDocument, isLinkedOnlyWorkspace, workspaceDocumentName, LINKED_DOCUMENT_NAME } from "../src/linked-document.js";

function makeState() {
  let ws = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  ws = addWorkspace(ws);
  return ws;
}
const reference = { sourceWorkspaceId: 1, sourceFileName: "source.pdf", sourceSize: 12, sourceLastModified: 77 };

test("first added page locks empty workspace to page-only mode across reload", () => {
  let ws = makeState();
  assert.equal(activeWorkspace(ws).mode, "empty");
  ws = addLinkedWorkspacePages(ws, { ...reference, pages: [2, 4] });
  assert.equal(activeWorkspace(ws).mode, "pages");
  assert.equal(isLinkedOnlyWorkspace(activeWorkspace(ws)), true);
  assert.equal(setWorkspaceFile(ws, "new.pdf"), ws);
  const restored = readWorkspaces(JSON.stringify(ws));
  assert.equal(restored.items[1].mode, "pages");
  assert.equal(workspaceDocumentName(activeWorkspace(restored)), LINKED_DOCUMENT_NAME);
  const id = activeWorkspace(ws).linkedPages[0].id;
  ws = removeLinkedWorkspacePage(ws, id);
  ws = removeLinkedWorkspacePage(ws, activeWorkspace(ws).linkedPages[0].id);
  assert.equal(activeWorkspace(ws).linkedPages.length, 0);
  assert.equal(activeWorkspace(ws).mode, "pages");
  assert.equal(isLinkedOnlyWorkspace(activeWorkspace(ws)), true);
  assert.equal(setWorkspaceFile(ws, "new.pdf"), ws);
});

test("PDF-first workspace refuses page-only conversion", () => {
  let ws = makeState();
  ws = setWorkspaceFile(ws, "target.pdf");
  assert.equal(activeWorkspace(ws).mode, "pdf");
  assert.equal(addLinkedWorkspacePages(ws, { ...reference, pages: [1] }), ws);
});

test("removing linked pages shifts bookmarks to matching surviving virtual page", () => {
  let ws = makeState();
  ws = addLinkedWorkspacePages(ws, { ...reference, pages: [1, 2, 3] });
  ws = savePageBookmark(ws, { id: "note", page: 3, fileName: LINKED_DOCUMENT_NAME, savedAt: 1000 });
  const id = activeWorkspace(ws).linkedPages[0].id;
  ws = removeLinkedWorkspacePage(ws, id);
  assert.equal(activeWorkspace(ws).notes[0].page, 2);
  assert.deepEqual(activeWorkspace(ws).linkedPages.map(ref => ref.page), [2, 3]);
});

test("virtual PDF opens source pages in saved order, and cleans up once", async () => {
  const destroyed = [];
  const file = { name: "source.pdf", size: 12, lastModified: 77,
    async arrayBuffer() { return Uint8Array.from([37, 80, 68, 70]).buffer; } };
  let started = 0;
  const doc = await openLinkedDocument({
    references: [{ ...reference, page: 4 }, { ...reference, page: 2 }],
    workspaces: [{ id: 1, fileName: "source.pdf" }, { id: 2, fileName: "" }],
    loadFile: async (id) => { assert.equal(id, 1); return file; },
    pdfjs: { getDocument() {
      started++;
      return { promise: Promise.resolve({ numPages: 5, async getPage(page) { return { sourcePage: page }; } }),
        async destroy() { destroyed.push(started); } };
    } },
  });
  assert.equal(doc.numPages, 2);
  assert.deepEqual(await doc.getPage(1), { sourcePage: 4 });
  assert.deepEqual(await doc.getPage(2), { sourcePage: 2 });
  assert.equal(started, 1, "same source PDF opens once");
  await doc.destroy();
  await doc.destroy();
  assert.equal(destroyed.length, 1);
  await assert.rejects(doc.getPage(1));
});

test("missing or replaced source never redirects to an unrelated PDF", async () => {
  const options = {
    references: [{ ...reference, page: 1 }],
    workspaces: [{ id: 1, fileName: "source.pdf" }],
    loadFile: async () => ({ name: "replaced.pdf", size: 12, lastModified: 77 }),
    pdfjs: { getDocument() { throw new Error("should not load"); } },
  };
  await assert.rejects(openLinkedDocument(options), /değişmiş|bulunamadı/);
});
