import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generatePdfFixture } from "../scripts/pdf-fixtures.mjs";
import {
  initialWorkspaces, addWorkspace, switchWorkspace, setWorkspaceFile,
  addLinkedWorkspacePages, reorderLinkedWorkspacePage, savePageBookmark,
  saveSelectedText, setWorkspaceLastPage, removeWorkspace, readWorkspaces,
  MAX_WORKSPACES, MAX_LINKED_PAGES,
} from "../src/workspace-store.js";
import { samePdfContent, replacementWorkspaceState } from "../src/pdf-replacement.js";
import { workspaceDocumentName } from "../src/linked-document.js";
import { createWorkspaceBackup, parseWorkspaceBackup, inspectWorkspaceIntegrity } from "../src/workspace-data.js";
import { exportLinkedPages } from "../src/pdf-export.js";
import { stalePageLinks, dependentPageLinks } from "../src/workspace-dependencies.js";

function fileOf(name, bytes, modified) {
  const file = new Blob([bytes], { type: "application/pdf" });
  Object.defineProperties(file, {
    name: { value: name }, lastModified: { value: modified },
  });
  return file;
}

function scenario() {
  const a = fileOf("source-a.pdf", generatePdfFixture(8, { label: "SOURCE A" }), 101);
  const b = fileOf("source-b.pdf", generatePdfFixture(6, { label: "SOURCE B" }), 202);
  let ws = setWorkspaceFile(initialWorkspaces(), a.name);
  ws = addWorkspace(ws);
  ws = setWorkspaceFile(ws, b.name);
  ws = addWorkspace(ws);
  ws = addLinkedWorkspacePages(ws, {
    sourceWorkspaceId: 1, sourceFileName: a.name, sourceSize: a.size,
    sourceLastModified: a.lastModified, pages: [1, 3],
  });
  ws = addLinkedWorkspacePages(ws, {
    sourceWorkspaceId: 2, sourceFileName: b.name, sourceSize: b.size,
    sourceLastModified: b.lastModified, pages: [2],
  });
  return { a, b, ws };
}

test("regression: linked page reorder keeps bookmarks, highlights, last page through backup/restore and PDF export", async () => {
  let { a, b, ws } = scenario();
  assert.deepEqual(ws.items[2].linkedPages.map(ref => [ref.sourceWorkspaceId, ref.page]),
    [[1, 1], [1, 3], [2, 2]]);
  ws = savePageBookmark(ws, { id: "saved-page", page: 1,
    fileName: workspaceDocumentName(ws.items[2]), savedAt: 5 });
  ws = saveSelectedText(ws, { id: "highlight", text: "Source text", page: 2,
    fileName: workspaceDocumentName(ws.items[2]), savedAt: 6, rects: [[0.1, 0.1, 0.2, 0.2]] });
  ws = setWorkspaceLastPage(ws, 2);
  ws = reorderLinkedWorkspacePage(ws, 1, 3, true);
  assert.deepEqual(ws.items[2].linkedPages.map(ref => [ref.sourceWorkspaceId, ref.page]),
    [[1, 3], [2, 2], [1, 1]]);
  assert.equal(ws.items[2].notes.find(note => note.id === "saved-page").page, 3);
  assert.equal(ws.items[2].notes.find(note => note.id === "highlight").page, 1);
  assert.equal(ws.items[2].lastPage, 1);

  const records = [{ workspaceId: 1, name: a.name, blob: a, type: a.type, lastModified: a.lastModified },
    { workspaceId: 2, name: b.name, blob: b, type: b.type, lastModified: b.lastModified }];
  const backup = await createWorkspaceBackup(ws, records);
  const restored = await parseWorkspaceBackup(backup);
  assert.deepEqual(restored.state.items[2].linkedPages, ws.items[2].linkedPages);
  assert.deepEqual(restored.state.items[2].notes, ws.items[2].notes);
  assert.deepEqual(await inspectWorkspaceIntegrity(restored.state, restored.records),
    { missing: [], orphan: [], brokenLinks: [] });

  const readSource = async id => id === 1 ? a : b;
  const bytes = await exportLinkedPages({
    workspace: restored.state.items[2], workspaces: restored.state.items,
    loadFile: readSource,
  });
  const exported = await PDFDocument.load(bytes);
  assert.equal(exported.getPageCount(), 3);
  const task = getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  try {
    const words = [];
    for (let page = 1; page <= doc.numPages; page++) {
      words.push((await (await doc.getPage(page)).getTextContent()).items.map(item => item.str).join(" "));
    }
    assert.match(words[0], /PAGE 00003 SOURCE A/);
    assert.match(words[1], /PAGE 00002 SOURCE B/);
    assert.match(words[2], /PAGE 00001 SOURCE A/);
  } finally {
    await task.destroy();
  }
});

test("regression: replacing the source invalidates dependent links without silently deleting bookmarks", async () => {
  const { a, b, ws } = scenario();
  const bookmarks = savePageBookmark(ws, { id: "dependent", page: 3,
    fileName: workspaceDocumentName(ws.items[2]), savedAt: 20 });
  assert.equal(dependentPageLinks(bookmarks, 1).length, 2);
  const changing = switchWorkspace(bookmarks, 1);
  const replacement = replacementWorkspaceState(changing, 1, "replacement.pdf");
  assert.equal(replacement.items[0].fileName, "replacement.pdf");
  assert.equal(replacement.items[2].linkedPages.length, 3);
  assert.equal(replacement.items[2].notes[0].id, "dependent");
  const records = [{ workspaceId: 1, name: "replacement.pdf", size: a.size, lastModified: a.lastModified },
    { workspaceId: 2, name: b.name, size: b.size, lastModified: b.lastModified }];
  assert.equal(stalePageLinks(replacement, records).length, 2);
  await assert.rejects(exportLinkedPages({
    workspace: replacement.items[2], workspaces: replacement.items,
    loadFile: async id => id === 1 ? a : b,
  }), /değişmiş|silinmiş/);
  const deleted = removeWorkspace(changing, 1);
  assert.equal(deleted.items.find(w => w.id === 3).linkedPages.length, 3);
  assert.equal(deleted.items.find(w => w.id === 3).notes[0].id, "dependent");
});

test("regression: identical PDF bytes preserve identity despite different filenames/timestamps", async () => {
  const bytes = generatePdfFixture(10, { label: "IDENTITY" });
  const a = fileOf("original.pdf", bytes, 10);
  const b = fileOf("copy.pdf", bytes, 20);
  const modified = Buffer.from(bytes);
  modified[modified.length - 3] ^= 1;
  assert.equal(await samePdfContent(a, b, 257), true);
  assert.equal(await samePdfContent(a, fileOf("original.pdf", modified, 10), 257), false);
});

test("regression: workspace and link capacity remain strict after serialization", () => {
  const { a } = scenario();
  let ws = setWorkspaceFile(initialWorkspaces(), a.name);
  for (let i = 1; i < MAX_WORKSPACES; i++) {
    ws = addWorkspace(ws);
    if (i === 1) ws = addLinkedWorkspacePages(ws, {
      sourceWorkspaceId: 1, sourceFileName: a.name,
      sourceSize: a.size, sourceLastModified: a.lastModified,
      pages: Array.from({ length: MAX_LINKED_PAGES }, (_, page) => page + 1),
    });
  }
  assert.equal(ws.items.length, MAX_WORKSPACES);
  assert.equal(addWorkspace(ws), ws, "21st workspace must be rejected");
  assert.equal(ws.items[1].linkedPages.length, MAX_LINKED_PAGES);
  ws = switchWorkspace(ws, ws.items[1].id);
  assert.equal(addLinkedWorkspacePages(ws, {
    sourceWorkspaceId: 1, sourceFileName: a.name,
    sourceSize: a.size, sourceLastModified: a.lastModified, pages: [101],
  }), ws, "101st linked page must be rejected");
  const restored = readWorkspaces(JSON.stringify(ws));
  assert.equal(restored.items.length, MAX_WORKSPACES);
  assert.equal(restored.items[1].linkedPages.length, MAX_LINKED_PAGES);
});
