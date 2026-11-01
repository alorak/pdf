import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for(const id of ["fogra51","swop2006"]){
  const report=JSON.parse(await readFile("test-results/stress/p2-9-print-"+id+".json","utf8"));
  assert.equal(report.schema,1);
  assert.equal(report.id,id);
  assert.equal(report.pass,true);
  assert.equal(report.rawProfileOrPageDataStored,false);
  assert.equal(report.pixelsCompared,4096);
  assert.match(report.profileSha256,/^[0-9a-f]{64}$/);
  assert.match(report.pdfSha256,/^[0-9a-f]{64}$/);
  assert.match(report.referenceSha256,/^[0-9a-f]{64}$/);
  assert.ok([2,4].includes(report.iccMajor));
  assert.equal(report.stats.comparedPixels,4096);
  assert.equal(report.stats.alphaErrors,0);
  assert.equal(report.stats.referenceSha256,report.referenceSha256);
  assert.ok(report.stats.mae<=15);
  assert.ok(report.stats.maxChannelError<=50);
  assert.ok(report.stats.differingPixelPercent<=30);
  assert.ok(report.resources.some(r=>r.asset==="qcms_bg.wasm"&&r.status===200));
  assert.deepEqual(report.errors,[]);
  console.log("P2_9_PRINT_ACCEPTANCE_PASSED "+JSON.stringify({
    id,profileSha256:report.profileSha256,
    referenceSha256:report.referenceSha256,
    pixels:4096,mae:report.stats.mae,max:report.stats.maxChannelError}));
}
