import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { referenceInfo } from "./p2-8-golden.mjs";

for(const kind of ["jpx16","icc-cmyk"]) {
  const r=JSON.parse(await readFile("test-results/stress/p2-8-"+kind+".json","utf8"));
  assert.equal(r.schema,1);
  assert.equal(r.pass,true);
  assert.equal(r.format,kind);
  assert.match(r.pdfSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(r.reference,referenceInfo(kind));
  assert.deepEqual(r.pages.map(p=>p.pageNo),[1,2,3]);
  assert.deepEqual(r.warnings,[]);
  for(const page of r.pages){
    assert.equal(page.totalPixels,4096);
    assert.equal(page.comparedRgbChannels,12288);
    assert.equal(page.mismatchedPixels,0);
    assert.equal(page.alphaFailures,0);
    assert.equal(page.referenceSha256,r.reference.sha256);
    assert.ok(page.maxChannelError<=12);
    assert.ok(page.meanAbsoluteChannelError>=0);
  }
  const asset=kind==="jpx16"?"openjpeg.wasm":"qcms_bg.wasm";
  assert.ok(r.resources.some(x=>x.name===asset&&x.status===200),
    "Real "+asset+" decoder must be requested and return 200");
  console.log("P2_8_GOLDEN_ACCEPTANCE_PASSED "+JSON.stringify({
    kind,pdfSha256:r.pdfSha256,referenceSha256:r.reference.sha256,
    pages:r.pages.length,comparedPixels:4096*r.pages.length,
    maxChannelError:Math.max(...r.pages.map(p=>p.maxChannelError))}));
}
