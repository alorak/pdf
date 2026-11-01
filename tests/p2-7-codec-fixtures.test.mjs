import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateCodecPdf, codecManifest, CODEC_CASES } from "../scripts/p2-7-codec-fixtures.mjs";

function imageStream(pdf, filter) {
  const at = pdf.indexOf(Buffer.from("/Filter " + filter, "ascii"));
  assert.ok(at > 0, "Expected real image XObject filter " + filter);
  const mark = Buffer.from("stream\n", "ascii");
  const start = pdf.indexOf(mark, at) + mark.length;
  assert.ok(start >= mark.length);
  const end = pdf.indexOf(Buffer.from("\nendstream", "ascii"), start);
  assert.ok(end > start);
  return pdf.subarray(start, end);
}

test("P2.7 codec PDFs are deterministic and have distinct real compressed image streams", () => {
  const jpx = generateCodecPdf("jpx");
  const cmyk = generateCodecPdf("cmyk");
  assert.deepEqual(jpx, generateCodecPdf("jpx"));
  assert.deepEqual(cmyk, generateCodecPdf("cmyk"));
  assert.notDeepEqual(jpx, cmyk);
  assert.equal(codecManifest("jpx", jpx).sha256.length, 64);
  assert.equal(codecManifest("cmyk", cmyk).colorSpace, "/DeviceCMYK");
  assert.equal(CODEC_CASES.jpx.imageFilter, "/JPXDecode");
  const j2k = imageStream(jpx, "/JPXDecode");
  assert.equal(j2k.readUInt16BE(0), 0xff4f, "Must contain JPEG2000 SOC marker");
  assert.equal(j2k.readUInt16BE(2), 0xff51, "Must contain JPEG2000 SIZ marker");
  const rawCmyk = inflateSync(imageStream(cmyk, "/FlateDecode"));
  assert.equal(rawCmyk.length, 64 * 64 * 4);
  assert.deepEqual([...rawCmyk.subarray(0, 4)], [255,0,0,0]);
  assert.deepEqual([...rawCmyk.subarray((63 * 64 + 63) * 4, (63 * 64 + 63) * 4 + 4)], [0,0,0,255]);
  assert.throws(() => generateCodecPdf("jpeg"), RangeError);
});

for (const codec of ["jpx", "cmyk"]) {
  test("P2.7 PDF.js parses three genuinely image-bearing pages: " + codec, async () => {
    const pdf = generateCodecPdf(codec);
    const task = getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useWasm: false });
    try {
      const doc = await task.promise;
      assert.equal(doc.numPages, 3);
      for (const pageNo of [1,2,3]) {
        const page = await doc.getPage(pageNo);
        const ops = await page.getOperatorList();
        assert.ok(ops.fnArray.some(op => op === OPS.paintImageXObject ||
          op === OPS.paintImageXObjectRepeat || op === OPS.paintInlineImageXObject),
        "Expected PDF.js to register actual image painting instructions");
        assert.equal((await page.getTextContent()).items.length, 0);
      }
    } finally { await task.destroy(); }
  });
}
