import test from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createPdfFixture } from "./helpers/pdf-fixtures.mjs";

test("fixture pages are byte-valid PDFs with deterministic per-page text", async () => {
  for (const pages of [10, 100]) {
    const buffer = createPdfFixture(pages, {prefix:"REGRESSION"});
    const task = getDocument({data:new Uint8Array(buffer),isEvalSupported:false});
    const pdf = await task.promise;
    try {
      assert.equal(pdf.numPages,pages);
      for (const pageIndex of [1,Math.ceil(pages/2),pages]) {
        const page=await pdf.getPage(pageIndex);
        const text=await page.getTextContent();
        assert.match(text.items.map(item=>item.str).join(" "),new RegExp("REGRESSION PAGE "+String(pageIndex).padStart(5,"0")));
      }
    } finally { await task.destroy(); }
  }
});
test("fixture generator rejects unreasonable requests",()=>{
  assert.throws(()=>createPdfFixture(0),RangeError);
  assert.throws(()=>createPdfFixture(5001),RangeError);
  assert.throws(()=>createPdfFixture(10,{prefix:"(unsafe)"}),/ASCII/);
});
