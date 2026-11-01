import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const ids=["jbig2-symbol-refine","jbig2-stripe","jbig2-symbol-huffman","jbig2-halftone-10bpp"];
const reports=[];
for(const id of ids){
  const r=JSON.parse(await readFile("test-results/stress/p2-8-"+id+".json","utf8"));
  assert.equal(r.schema,1);assert.equal(r.kind,"Poppler-vs-PDFjs-JBIG2");
  assert.equal(r.id,id);
  assert.match(r.sha256,/^[0-9a-f]{64}$/);
  assert.match(r.gitBlob,/^[0-9a-f]{40}$/);
  assert.match(r.independentReference,/^[0-9a-f]{64}$/);
  assert.deepEqual(r.errors,[]);
  assert.equal(r.stats.grid,32);
  assert.equal(r.stats.comparedPixels,1024);
  assert.ok(r.stats.referenceInkPixels>3 && r.stats.actualInkPixels>3);
  assert.ok(r.stats.mae<=30,"Poppler parity MAE budget exceeded");
  assert.equal(r.full.comparedPixels, r.full.width*r.full.height);
  assert.equal(r.full.comparedPixels, 159600);
  assert.equal(r.full.alphaErrors,0);
  assert.equal(r.full.referenceSha256,r.independentReference);
  assert.ok(r.full.mae<=30,"Complete-pixel Poppler parity MAE budget exceeded");
  assert.ok(r.full.f1>=0.65,"Complete-pixel Poppler parity F1 budget exceeded");
  assert.ok(r.stats.f1>=0.65,"Poppler parity F1 budget exceeded");
  reports.push({id,sha256:r.sha256,reference:r.independentReference,
    mae:r.stats.mae,f1:r.stats.f1,fullPixels:r.full.comparedPixels,
    fullMae:r.full.mae,fullF1:r.full.f1});
}
console.log("P2_8_JBIG2_PARITY_ACCEPTANCE_PASSED "+JSON.stringify({cases:reports}));
