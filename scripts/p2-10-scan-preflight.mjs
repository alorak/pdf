import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Test-source preflight, not Android evidence. Examines only first/middle/last
 * pages and reports hashes/image operator counts, never file contents or names.
 */
export async function inspectLocalScan(filename, expectedPages) {
  const st=await stat(filename);
  if(!st.isFile() || st.size<25e6 || st.size>100e6)
    throw new RangeError("Expected a 25..100 MB regular PDF");
  const bytes=await readFile(filename);
  if(!bytes.subarray(0,5).equals(Buffer.from("%PDF-")))
    throw new Error("Input is not a PDF");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const task=getDocument({data:new Uint8Array(bytes),useWasm:false,
    isEvalSupported:false,stopAtErrors:true});
  try {
    const doc=await task.promise;
    if(doc.numPages!==expectedPages)throw new Error("Physical PDF page count mismatch");
    const pages=[...new Set([1,Math.ceil(doc.numPages/2),doc.numPages])];
    const sampled=[];
    for(const pageNo of pages) {
      const page=await doc.getPage(pageNo);
      const op=await page.getOperatorList();
      const imageOps=op.fnArray.filter(x=>x===OPS.paintImageXObject ||
        x===OPS.paintInlineImageXObject || x===OPS.paintImageXObjectRepeat ||
        x===OPS.paintInlineImageXObjectGroup).length;
      sampled.push({page:pageNo,imagePaintOperators:imageOps});
      page.cleanup();
    }
    if(sampled.filter(s=>s.imagePaintOperators>0).length<2)
      throw new Error("PDF does not have raster image XObjects on two sample pages");
    return {bytes:st.size,sha256,pages:doc.numPages,
      sampled,imagesVerified:true,
      note:"Sampled image-bearing pages; photographic origin, DPI and OCR not independently attested"};
  }finally{
    await task.destroy();
  }
}
