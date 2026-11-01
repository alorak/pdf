import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImagePdf } from "../scripts/p2-5-image-fixtures.mjs";
import { inspectLocalScan } from "../scripts/p2-10-scan-preflight.mjs";

test("P2.10 rejects small documents before physical device collection",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"p210-preflight-"));
  try{
    const file=join(dir,"small.pdf");
    await writeFile(file,generateImagePdf({kind:"scan",pages:3,imageSize:128}));
    await assert.rejects(()=>inspectLocalScan(file,3),RangeError);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("P2.10 real raster XObjects detected on sampled pages of 25 MB proxy",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"p210-preflight-"));
  try{
    const file=join(dir,"synthetic-proxy.pdf");
    await writeFile(file,generateImagePdf({kind:"scan",pages:128,imageSize:256}));
    const result=await inspectLocalScan(file,128);
    assert.equal(result.pages,128);
    assert.ok(result.bytes>=25e6&&result.bytes<=100e6);
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(result.sampled.map(x=>x.page),[1,64,128]);
    assert.ok(result.sampled.every(x=>x.imagePaintOperators>0));
    assert.equal(result.imagesVerified,true);
    // This is an offline proxy, not an actual scanner/physical Android run.
    await assert.rejects(()=>inspectLocalScan(file,129),/page count mismatch/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
