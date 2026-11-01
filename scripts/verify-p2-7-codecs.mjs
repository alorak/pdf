import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ids = ["jpx","cmyk",...(process.env.P2_7_EXPECT_JBIG2
  ? process.env.P2_7_EXPECT_JBIG2.split(",").filter(Boolean) : [])];
const results = [];
for (const id of ids) {
  if (!/^[a-z0-9-]{2,50}$/.test(id)) throw new Error("Invalid codec report ID");
  const r = JSON.parse(await readFile("test-results/stress/p2-7-" + id + ".json", "utf8"));
  assert.equal(r.schema, 1);
  assert.equal(r.pass, true);
  assert.equal(r.id, id);
  assert.match(r.sha256, /^[a-f0-9]{64}$/);
  assert.ok(r.bytes >= 256);
  assert.ok(r.pages >= 1);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.samples.map(s => s.page),
    [...new Set([1,Math.ceil(r.pages / 2),r.pages])]);
  for (const s of r.samples) {
    assert.ok(s.colors.length >= 2);
    if (id === "jpx") assert.deepEqual(s.colors, ["red","green","blue","white"]);
    if (id === "cmyk") assert.deepEqual(s.colors, ["cyan","magenta","yellow","black"]);
  }
  for (const asset of r.assets) {
    assert.equal(asset.ok, true);
    assert.equal(asset.status, 200);
    assert.match(asset.type || "", /wasm/);
  }
  results.push({ id, bytes:r.bytes, pages:r.pages,sha256:r.sha256,
    decoderRequests:r.decoderResponses.filter(x => /wasm$/.test(x.name)) });
}
console.log("P2_7_CODEC_ACCEPTANCE_PASSED " + JSON.stringify({
  schema:1, cases:results, allExpectedCasesComplete:true,
}));
