import test from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { openLinkedDocument } from "../src/linked-document.js";

test("real PDF.js can parse and render text from a missing-source placeholder", async () => {
  const documentPdf = await openLinkedDocument({
    references: [{ sourceWorkspaceId: 9, sourceFileName: "gone.pdf",
      sourceSize: 100, sourceLastModified: 5, page: 12 }],
    workspaces: [],
    loadFile: async () => null,
    pdfjs,
  });
  try {
    assert.equal(documentPdf.numPages, 1);
    assert.deepEqual(documentPdf.missing.map(item => item.virtualPage), [1]);
    const page = await documentPdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    assert.ok(viewport.width > 500);
    assert.ok(viewport.height > 800);
    const text = await page.getTextContent();
    assert.match(text.items.map(item => item.str).join(" "), /SOURCE PDF UNAVAILABLE/);
  } finally {
    await documentPdf.destroy();
  }
});
