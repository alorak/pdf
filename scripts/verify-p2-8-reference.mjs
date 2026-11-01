import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { advancedManifest, referenceRgb } from "./p2-8-advanced-fixtures.mjs";
const results=[];
for (const kind of ["jpx16","iccCmyk"]) {
  const r=JSON.parse(await readFile("test-results/stress/p2-8-"+kind+".json","utf8"));
  assert.equal(r.schema,1);
  assert.equal(r.kind,kind);
  const fixture=advancedManifest(kind);
  assert.deepEqual(r.manifest,fixture);
  assert.equal(r.sourcePixelsCompared,4096);
  assert.equal(r.allPagesCompared,true);
  assert.equal(r.pages.length,3);
  assert.deepEqual(r.pages.map(x=>x.pageNo),[1,2,3]);
  assert.deepEqual(r.errors,[]);
  for (const page of r.pages) {
    assert.equal(page.width,64);assert.equal(page.height,64);
    assert.equal(page.comparedPixels,4096);
    assert.equal(page.referenceSha256,
      createHash("sha256").update(referenceRgb(kind)).digest("hex"));
    assert.equal(page.alphaErrors,0);
    assert.ok(page.mae<=r.tolerance.mae && page.maxChannelError<=r.tolerance.max &&
      page.differingPixelPercent<=r.tolerance.differingPct,"Exceeded pixel difference budget");
  }
  results.push({kind,reference:fixture.referenceSha256,pages:r.pages.map(p=>({
    page:p.pageNo,mae:p.mae,rmse:p.rmse,max:p.maxChannelError,
    differingPixelPercent:p.differingPixelPercent,
  }))});
}
console.log("P2_8_REFERENCE_ACCEPTANCE_PASSED "+JSON.stringify({cases:results}));
