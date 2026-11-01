import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { p29Manifest } from "./p2-9-fixtures.mjs";

for(const kind of ["jpx-rgb16","icc-v4-rgb"]){
  const report=JSON.parse(await readFile("test-results/stress/p2-9-"+kind+".json","utf8"));
  const expected=p29Manifest(kind);
  assert.equal(report.schema,1);
  assert.equal(report.kind,kind);
  assert.equal(report.pass,true);
  assert.deepEqual(report.manifest,expected);
  assert.equal(report.referenceSha256,expected.referenceSha256);
  assert.deepEqual(report.errors,[]);
  const m=report.metrics;
  assert.equal(report.pixelsCompared,4096);
  assert.equal(m.comparedPixels,4096);
  assert.equal(m.alphaErrors,0);
  assert.equal(m.referenceSha256,expected.referenceSha256);
  const b=kind==="jpx-rgb16"?{mae:1,max:4,pct:0,wasm:"openjpeg.wasm"}:
    {mae:8,max:28,pct:18,wasm:"qcms_bg.wasm"};
  assert.ok(m.mae<=b.mae && m.maxChannelError<=b.max &&
    m.differingPixelPercent<=b.pct);
  assert.ok(report.decoderResources.some(x=>x.asset===b.wasm && x.status===200));
  console.log("P2_9_CODEC_ACCEPTANCE_PASSED "+JSON.stringify({kind,
    pdfSha256:expected.pdfSha256,referenceSha256:expected.referenceSha256,
    comparedPixels:4096,mae:m.mae,maxChannelError:m.maxChannelError,
    differentPixels:m.differingPixels}));
}
