import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateAdvancedCodecPdf, makeTestCmykIccProfile, advancedCodecManifest } from "../scripts/p2-8-advanced-fixtures.mjs";
import { referenceRGB, compareGoldenRgba, referenceInfo } from "../scripts/p2-8-golden.mjs";

for(const kind of ["jpx16","icc-cmyk"]){
  test("P2.8 original codec fixture determinism and real PDF color space: "+kind,async()=>{
    const first=generateAdvancedCodecPdf(kind);
    assert.deepEqual(first,generateAdvancedCodecPdf(kind));
    assert.equal(advancedCodecManifest(kind,first).sha256.length,64);
    assert.equal(first.toString("latin1",0,8),"%PDF-1.7");
    if(kind==="jpx16"){
      const x=first.indexOf(Buffer.from("/Filter /JPXDecode"));
      assert.ok(x>0);
      assert.ok(first.includes(Buffer.from("/BitsPerComponent 16")));
      const stream=first.indexOf(Buffer.from("stream\n"),x)+7;
      assert.equal(first.readUInt16BE(stream),0xff4f);
      assert.equal(first.readUInt16BE(stream+2),0xff51);
      assert.equal(first.readUInt8(stream+42),15); // SIZ: Ssiz=15 => precision=16, unsigned
    } else {
      assert.ok(first.includes(Buffer.from("/ColorSpace [/ICCBased 8 0 R]")));
      const icc=makeTestCmykIccProfile();
      assert.equal(icc.length,2064);
      assert.equal(icc.toString("ascii",16,20),"CMYK");
      assert.equal(icc.toString("ascii",20,24),"XYZ ");
      assert.equal(icc.toString("ascii",36,40),"acsp");
      assert.ok(first.includes(Buffer.from("/N 4 /Alternate /DeviceCMYK")));
    }
    const loading=getDocument({data:new Uint8Array(first),isEvalSupported:false,useWasm:false});
    try{
      const doc=await loading.promise;
      assert.equal(doc.numPages,3);
      for(const n of [1,2,3]){
        const page=await doc.getPage(n);
        const ops=await page.getOperatorList();
        assert.ok(ops.fnArray.includes(OPS.paintImageXObject));
      }
    } finally { await loading.destroy(); }
  });
}
test("P2.8 independent reference image is full-resolution, mutation-sensitive",()=>{
  for(const kind of ["jpx16","icc-cmyk"]){
    const rgb=referenceRGB(kind);
    const image=new Uint8Array(64*64*4);
    for(let i=0;i<64*64;i++) {
      image.set(rgb.subarray(i*3,i*3+3),i*4);
      image[i*4+3]=255;
    }
    assert.equal(referenceInfo(kind).bytes,64*64*3);
    const perfect=compareGoldenRgba(kind,image,64,64,{tolerance:0});
    assert.equal(perfect.pass,true);
    assert.equal(perfect.totalPixels,4096);
    image[0]^=128;
    const bad=compareGoldenRgba(kind,image,64,64,{tolerance:12});
    assert.equal(bad.pass,false);
    assert.equal(bad.mismatchedPixels,1);
    assert.throws(()=>compareGoldenRgba(kind,image,32,32));
  }
});
