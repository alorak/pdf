import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  p29IccV4, p29Jpx16Rgb, p29ReferenceRgb, p29RgbPixels, p29Manifest,
  buildP29Pdf, P29_ASSET_SHA, RGB8_SWATCHES, V4_LCMS_REFERENCE,
  externalCmykPixels,
} from "../scripts/p2-9-fixtures.mjs";
import { compareReferencePixels } from "../scripts/p2-8-pixel-diff.mjs";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
test("P2.9 ICC v4.3 fixture is truly ICC version 4, RGB, non-sRGB transfer",()=>{
  const p=p29IccV4();
  assert.equal(sha(p),P29_ASSET_SHA.icc);
  assert.equal(p.readUInt32BE(0),600);
  assert.equal(p[8],4);
  assert.equal(p.toString("ascii",12,16),"mntr");
  assert.equal(p.toString("ascii",16,20),"RGB ");
  assert.equal(p.toString("ascii",36,40),"acsp");
  const src=p29RgbPixels("icc-v4-rgb");
  const ref=p29ReferenceRgb("icc-v4-rgb");
  assert.equal(src.length,64*64*3);
  assert.equal(ref.length,64*64*3);
  const delta=Array.from(src).reduce((s,x,i)=>s+Math.abs(x-ref[i]),0)/(64*64*3);
  assert.ok(delta>25,"Must detect a mistaken DeviceRGB/sRGB fallback");
  assert.deepEqual(RGB8_SWATCHES[0],[64,64,64]);
  assert.deepEqual(V4_LCMS_REFERENCE[0],[137,137,137]);
});
test("P2.9 JPEG2000 really has three unsigned 16-bit components and original hash",()=>{
  const stream=p29Jpx16Rgb();
  assert.equal(sha(stream),P29_ASSET_SHA.jp2);
  const siz=stream.indexOf(Buffer.from([0xff,0x51]));
  assert.ok(siz>0);
  assert.equal(stream.readUInt16BE(siz+38),3);
  for(let c=0;c<3;c++)assert.equal(stream[siz+40+c*3],15);
  const reference=p29ReferenceRgb("jpx-rgb16");
  assert.deepEqual([...reference.subarray(0,3)],[255,0,0]);
  assert.deepEqual([...reference.subarray((63*64+63)*3)], [255,255,255]);
});
test("P2.9 independent reference pixel comparator checks all pixels",()=>{
  for(const kind of ["icc-v4-rgb","jpx-rgb16"]){
    const rgb=p29ReferenceRgb(kind);
    const rgba=Buffer.alloc(64*64*4);
    for(let i=0;i<64*64;i++){
      rgba.set(rgb.subarray(i*3,i*3+3),i*4);
      rgba[i*4+3]=255;
    }
    const pass=compareReferencePixels(rgba,rgb,64,64,{channelThreshold:0});
    assert.equal(pass.comparedPixels,4096);
    assert.equal(pass.mae,0);
    assert.equal(pass.differingPixels,0);
    rgba[0]^=128;
    const fail=compareReferencePixels(rgba,rgb,64,64,{channelThreshold:8});
    assert.equal(fail.differingPixels,1);
  }
});
test("P2.9 original color-profile PDFs have image paint operators and one page",async()=>{
  for(const kind of ["icc-v4-rgb","jpx-rgb16"]){
    const a=buildP29Pdf({kind});
    assert.deepEqual(a,buildP29Pdf({kind}));
    assert.equal(sha(a),p29Manifest(kind).pdfSha256);
    if(kind==="icc-v4-rgb")assert.ok(a.includes(Buffer.from("/ICCBased 6 0 R")));
    if(kind==="jpx-rgb16")assert.ok(a.includes(Buffer.from("/BitsPerComponent 16")));
    const load=getDocument({data:new Uint8Array(a),isEvalSupported:false,useWasm:false});
    try {
      const doc=await load.promise;
      assert.equal(doc.numPages,1);
      const page=await doc.getPage(1);
      const op=await page.getOperatorList();
      assert.ok(op.fnArray.includes(OPS.paintImageXObject));
    } finally {await load.destroy();}
  }
});
test("P2.9 external CMYK profile validation rejects untrusted RGB and nonsensical bytes",()=>{
  assert.equal(externalCmykPixels().length,64*64*4);
  assert.throws(()=>buildP29Pdf({kind:"external-cmyk",profile:p29IccV4()}));
  assert.throws(()=>buildP29Pdf({kind:"external-cmyk",profile:Buffer.alloc(4096)}));
  assert.throws(()=>buildP29Pdf({kind:"not-a-codec"}));
});
