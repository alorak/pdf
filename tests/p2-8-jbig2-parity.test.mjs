import test from "node:test";
import assert from "node:assert/strict";
import { parsePortablePixmap,compareBinaryPageReference,compareEveryBinaryPixel }
  from "../scripts/p2-8-jbig2-parity.mjs";

test("P2.8 strict P6 and P5 reference decoder validates sizes and contents",()=>{
  const p6=Buffer.concat([Buffer.from("P6\n2 1\n255\n"),Buffer.from([0,0,0,255,255,255])]);
  const img=parsePortablePixmap(p6);
  assert.equal(img.width,2);assert.equal(img.height,1);
  assert.deepEqual([...img.rgb],[0,0,0,255,255,255]);
  const p5=Buffer.concat([Buffer.from("P5\n# comment\n2 1\n255\n"),Buffer.from([0,200])]);
  assert.deepEqual([...parsePortablePixmap(p5).rgb],[0,0,0,200,200,200]);
  assert.throws(()=>parsePortablePixmap(Buffer.from("P6\n2 1\n255\n0")));
  assert.throws(()=>parsePortablePixmap(Buffer.from("P7\n2 1\n255\n0")));
  assert.throws(()=>parsePortablePixmap(Buffer.from("P6\n20000000 1\n255\n")));
});
test("P2.8 binary parity counts true/false positives at independent pixels",()=>{
  const actual=Uint8Array.from([0,0,0,255,255,255,255,255]);
  const reference=Uint8Array.from([0,0,0,255,255,255]);
  const result=compareBinaryPageReference(actual,2,1,reference,2,1,8);
  assert.equal(result.f1,1);assert.equal(result.mae,0);
  assert.ok(result.referenceInkPixels>0);
  const flipped=Uint8Array.from([255,255,255,255,255,255,255,255]);
  const broken=compareBinaryPageReference(flipped,2,1,reference,2,1,8);
  assert.equal(broken.f1,0);
  assert.ok(broken.mae>50);
});

test("P2.8 exact geometry full binary parity inspects every pixel and alpha",()=>{
  const actual=Uint8Array.from([0,0,0,255,255,255,255,255]);
  const reference=Uint8Array.from([0,0,0,255,255,255]);
  const good=compareEveryBinaryPixel(actual,2,1,reference,2,1);
  assert.equal(good.comparedPixels,2);
  assert.equal(good.channelsCompared,6);
  assert.equal(good.f1,1);
  assert.equal(good.mae,0);
  const changed=Uint8Array.from([255,255,255,255,255,255,255,255]);
  const bad=compareEveryBinaryPixel(changed,2,1,reference,2,1);
  assert.equal(bad.f1,0);
  assert.ok(bad.mae>100);
  assert.throws(()=>compareEveryBinaryPixel(actual,2,1,reference,1,2));
  assert.throws(()=>compareEveryBinaryPixel(actual,2,1,reference,3,1));
});
