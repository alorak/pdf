import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generatePdfFixture } from "../scripts/pdf-fixtures.mjs";
import {
  initialWorkspaces, addWorkspace, setWorkspaceFile, addLinkedWorkspacePages,
  savePageBookmark, setWorkspaceLastPage, switchWorkspace, reorderLinkedWorkspacePage,
  readWorkspaces, MAX_WORKSPACES, MAX_LINKED_PAGES,
} from "../src/workspace-store.js";
import { createWorkspaceBackup, parseWorkspaceBackup, inspectWorkspaceIntegrity } from "../src/workspace-data.js";
import { exportLinkedPages } from "../src/pdf-export.js";

const clock = () => Number(performance.now().toFixed(1));
const rssMb = () => Number((process.memoryUsage().rss / 1048576).toFixed(1));
const report = (scenario, result) => console.log("P2_STRESS_MODEL " + JSON.stringify({
  scenario, ...result, rssMb: rssMb(), runtime: process.version,
}));
function makeFile(name, bytes, modified) {
  const file = new Blob([bytes], { type: "application/pdf" });
  Object.defineProperty(file, "name", { value: name });
  Object.defineProperty(file, "lastModified", { value: modified });
  return file;
}

test("20 workspaces × 100 referenced pages survive reorder, 1900 links and backup round-trip", { timeout: 90000 }, async () => {
  const started = clock();
  const source = makeFile("large-source.pdf", generatePdfFixture(1000), 101);
  let state = setWorkspaceFile(initialWorkspaces(), source.name);
  for (let i = 1; i < MAX_WORKSPACES; i++) {
    state = addWorkspace(state);
    state = addLinkedWorkspacePages(state, {
      sourceWorkspaceId: 1, sourceFileName: source.name,
      sourceSize: source.size, sourceLastModified: source.lastModified,
      pages: Array.from({ length: MAX_LINKED_PAGES }, (_, j) => i * 100 - 99 + j),
    });
    assert.equal(state.items[i].linkedPages.length, MAX_LINKED_PAGES);
    const docName = "@workspace-linked-pages";
    state = savePageBookmark(state, { id: "book-" + i, page: 1, fileName: docName, savedAt: i });
    state = setWorkspaceLastPage(state, MAX_LINKED_PAGES);
    state = reorderLinkedWorkspacePage(state, 1, MAX_LINKED_PAGES, true);
  }
  assert.equal(state.items.length, MAX_WORKSPACES);
  const serialized = readWorkspaces(JSON.stringify(state));
  assert.equal(serialized.items.slice(1).reduce((sum, item) => sum + item.linkedPages.length, 0), 1900);
  for (const w of serialized.items.slice(1)) {
    assert.equal(w.notes[0].page, 100, "reorder must remap bookmarks");
    assert.equal(w.lastPage, 99, "last read page follows its content");
  }
  const backupStart = clock();
  const backup = await createWorkspaceBackup(serialized, [{
    workspaceId: 1, name: source.name, lastModified: source.lastModified,
    type: source.type, blob: source,
  }]);
  const restored = await parseWorkspaceBackup(backup);
  assert.deepEqual(await inspectWorkspaceIntegrity(restored.state, restored.records),
    { missing: [], orphan: [], brokenLinks: [] });
  assert.deepEqual(restored.state.items, serialized.items);
  const exportedBytes = await exportLinkedPages({
    workspace: restored.state.items[19], workspaces: restored.state.items,
    loadFile: async id => id === 1 ? source : null,
  });
  const exported = await PDFDocument.load(exportedBytes);
  assert.equal(exported.getPageCount(), 100);
  report("20-workspaces-1900-linked-pages", {
    durationMs: clock() - started, backupAndRestoreMs: clock() - backupStart,
    sourceBytes: source.size, backupBytes: backup.size, exportedBytes: exportedBytes.length,
    linkedPages: 1900, workspaceCount: serialized.items.length,
  });
});

for (const pages of process.env.P2_STRESS_PROFILE === "quick" ? [100, 1000] : [100, 1000, 5000]) {
  test(`deterministic ${pages}-page PDF parses with real PDF.js and has stable SHA256`,
    { timeout: 120000 }, async () => {
      const started = clock();
      const a = generatePdfFixture(pages, { label: "P2 STRESS", seed: 17 });
      const b = generatePdfFixture(pages, { label: "P2 STRESS", seed: 17 });
      assert.equal(createHash("sha256").update(a).digest("hex"),
        createHash("sha256").update(b).digest("hex"));
      const task = getDocument({ data: new Uint8Array(a) });
      const doc = await task.promise;
      try {
        assert.equal(doc.numPages, pages);
        for (const sample of [1, Math.max(1, Math.floor(pages / 2)), pages]) {
          const page = await doc.getPage(sample);
          const content = await page.getTextContent();
          assert.match(content.items.map(i => i.str).join(" "), new RegExp("PAGE " + String(sample).padStart(5, "0")));
        }
      } finally {
        await task.destroy();
      }
      report("fixture-pdfjs", { pages, bytes: a.length, durationMs: clock() - started,
        sha256: createHash("sha256").update(a).digest("hex") });
    });
}
