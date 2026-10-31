import test from "node:test";
import assert from "node:assert/strict";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateImagePdf, imageFixtureManifest } from "../scripts/p2-5-image-fixtures.mjs";

test("P2.5 image-based PDF is deterministic, binary-safe and genuinely image-heavy", async () => {
  for (const kind of ["scan", "mixed"]) {
    const settings = { kind, pages: 4, imageSize: 256 };
    const a = generateImagePdf(settings);
    const b = generateImagePdf(settings);
    assert.deepEqual(a, b, "fixture hash and xref offsets must be reproducible");
    assert.ok(a.length > 4 * 256 * 256 * 0.5, "fixture must contain per-page raster bytes");
    const manifest = imageFixtureManifest(a, settings);
    assert.equal(manifest.sha256.length, 64);
    assert.equal(manifest.bytes, a.length);
    assert.equal(manifest.kind, kind);

    const task = getDocument({ data: new Uint8Array(a), isEvalSupported: false });
    try {
      const pdf = await task.promise;
      assert.equal(pdf.numPages, settings.pages);
      for (const index of [1, 2, 4]) {
        const page = await pdf.getPage(index);
        const text = (await page.getTextContent()).items.map(x => x.str).join(" ");
        if (kind === "scan") assert.equal(text, "", "scans must have no hidden OCR text");
        else assert.match(text, new RegExp(`P25 MIXED PAGE ${String(index).padStart(5, "0")}`));
        const ops = await page.getOperatorList();
        assert.ok(ops.fnArray.some(op => op === OPS.paintImageXObject || op === OPS.paintImageXObjectRepeat),
          "each page needs a real image XObject painting operation");
      }
    } finally { await task.destroy(); }
  }
});

test("P2.5 fixture parameters reject unbounded sizes and malformed input", () => {
  for (const settings of [{ pages: 0 }, { pages: 257 }, { pages: -5 },
    { imageSize: 4096 }, { imageSize: 257 }, { kind: "external" }, { seed: -1 }]) {
    assert.throws(() => generateImagePdf(settings), RangeError);
  }
});
