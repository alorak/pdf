import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ADVANCED_CASES, ADVANCED_SIZE, advancedSource, embeddedIcc,
  advancedPdf, advancedManifest, referenceRgb,
} from "../scripts/p2-8-advanced-fixtures.mjs";
import { compareReferencePixels } from "../scripts/p2-8-pixel-diff.mjs";

test("P2.8 16-bit JPEG2000 stream has raw SOC/SIZ and unsigned 16-bit component", () => {
  const data = advancedSource("jpx16");
  assert.equal(data.readUInt16BE(0), 0xff4f); // JPEG2000 SOC
  assert.equal(data.readUInt16BE(2), 0xff51); // SIZ
  assert.equal(data.readUInt16BE(40), 1, "Single grayscale J2K component");
  assert.equal((data[42] & 0x7f) + 1, 16, "True 16-bit J2K sample precision");
  assert.equal(data[42] & 0x80, 0, "Unsigned pixels");
  const expected = referenceRgb("jpx16");
  assert.equal(expected.length, ADVANCED_SIZE * ADVANCED_SIZE * 3);
  assert.equal(expected[0], 0);
  assert.notEqual(expected[3], 0);
  assert.deepEqual(advancedPdf("jpx16"), advancedPdf("jpx16"));
  assert.equal(advancedManifest("jpx16").filter, "/JPXDecode");
  assert.equal(advancedManifest("jpx16").imageBits, 16);
});

test("P2.8 original four-channel ICC is CMYK output class and visually different from DeviceCMYK fallback", () => {
  const icc = embeddedIcc();
  assert.equal(icc.readUInt32BE(0), icc.length, "Correct ICC profile length");
  assert.equal(icc.toString("ascii", 12, 16), "prtr", "ICC output profile");
  assert.equal(icc.toString("ascii", 16, 20), "CMYK");
  assert.equal(icc.toString("ascii", 20, 24), "XYZ ");
  assert.equal(icc.toString("ascii", 36, 40), "acsp");
  assert.ok(icc.includes(Buffer.from("A2B0","ascii")), "Real profile CLUT tag");
  const pixels = inflateSync(advancedSource("iccCmyk"));
  assert.equal(pixels.length, ADVANCED_SIZE * ADVANCED_SIZE * 4);
  const golden = referenceRgb("iccCmyk");
  assert.equal(golden.length, ADVANCED_SIZE * ADVANCED_SIZE * 3);
  let diff = 0;
  for (let at = 0; at < pixels.length; at += 4) {
    const c=pixels[at],m=pixels[at+1],y=pixels[at+2],k=pixels[at+3];
    const naive=[Math.round((255-c)*(255-k)/255),
      Math.round((255-m)*(255-k)/255),Math.round((255-y)*(255-k)/255)];
    for(let ch=0;ch<3;ch++) diff += Math.abs(golden[at/4*3+ch]-naive[ch]);
  }
  const naiveMae = diff / golden.length;
  assert.ok(naiveMae > 45, "Fallback DeviceCMYK must not pass the ICC oracle: "+naiveMae);
  const pdf = advancedPdf("iccCmyk");
  assert.ok(pdf.includes(Buffer.from("/ICCBased 8 0 R")));
  assert.ok(pdf.includes(Buffer.from("/N 4 /Alternate /DeviceCMYK")));
  assert.ok(pdf.includes(Buffer.from("/Filter /FlateDecode")));
  assert.equal(advancedManifest("iccCmyk").profileSha256, ADVANCED_CASES.iccCmyk.profileSha256);
});

for(const codec of ["jpx16","iccCmyk"]) {
  test("P2.8 PDF.js parses every image-bearing page: " + codec, async () => {
    const task=getDocument({data:new Uint8Array(advancedPdf(codec)),
      isEvalSupported:false, useWasm:false});
    try {
      const doc=await task.promise;
      assert.equal(doc.numPages,3);
      for(const number of [1,2,3]) {
        const page=await doc.getPage(number);
        const op=await page.getOperatorList();
        assert.ok(op.fnArray.some(x=>x===OPS.paintImageXObject
          ||x===OPS.paintImageXObjectRepeat),"Real image paint operator");
        assert.equal((await page.getTextContent()).items.length,0);
      }
    } finally {await task.destroy();}
  });
}

test("P2.8 independent pixel comparator flags single-pixel regressions", () => {
  const ref=new Uint8Array([11,22,33, 55,66,77]);
  const exact=new Uint8Array([11,22,33,255, 55,66,77,255]);
  const same=compareReferencePixels(exact,ref,2,1,{channelThreshold:0});
  assert.equal(same.mae,0);
  assert.equal(same.rmse,0);
  assert.equal(same.differingPixels,0);
  const changed=Uint8Array.from(exact);
  changed[4] = 200;
  const diff=compareReferencePixels(changed,ref,2,1,{channelThreshold:2});
  assert.equal(diff.differingPixels,1);
  assert.equal(diff.worst[0].x,1);
  assert.equal(diff.worst[0].y,0);
  assert.equal(diff.maxChannelError,145);
  assert.throws(()=>compareReferencePixels(changed,ref,3,1));
  assert.throws(()=>compareReferencePixels(changed,ref,2,1,{channelThreshold:-1}));
  assert.throws(()=>advancedPdf("unsupported"),RangeError);
});
