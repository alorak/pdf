import { test,expect } from "@playwright/test";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve,sep } from "node:path";
import { compareReferencePixels } from "../scripts/p2-8-pixel-diff.mjs";

const source=process.env.P2_9_PRINT_FILES;
if(!source)throw Error("P2_9_PRINT_FILES must contain explicitly approved pinned ICC fixtures");
const items=JSON.parse(source);
if(!Array.isArray(items)||items.length!==2||
   items.map(i=>i.id).sort().join(",")!=="fogra51,swop2006")
  throw Error("Expected both official print profiles");
const ROOT="/tmp/p29-print";
const sha=b=>createHash("sha256").update(b).digest("hex");
for(const i of items){
  if(!/^[a-f0-9]{64}$/.test(i.sha256||"") ||
     !/^[a-f0-9]{64}$/.test(i.referenceSha256||"") ||
     !/^[a-f0-9]{64}$/.test(i.profileSha256||""))
    throw Error("Unpinned profile/reference");
}
test.use({deviceScaleFactor:1});

for(const item of items){
  test("P2.9 genuine licensed ICC CMYK full pixel LittleCMS parity: "+item.id,async({page})=>{
    const pdfPath=await realpath(resolve(item.pdfPath));
    const refPath=await realpath(resolve(item.referencePath));
    if(!pdfPath.startsWith(ROOT+sep) || !refPath.startsWith(ROOT+sep))
      throw Error("Unauthorized profile test path");
    const pdf=await readFile(pdfPath),reference=await readFile(refPath);
    expect(sha(pdf)).toBe(item.sha256);
    expect(reference.length).toBe(64*64*3);
    expect(sha(reference)).toBe(item.referenceSha256);
    expect(pdf.includes(Buffer.from("/ColorSpace [/ICCBased 6 0 R]"))).toBe(true);
    expect(pdf.includes(Buffer.from("/N 4 /Alternate /DeviceCMYK"))).toBe(true);
    const errors=[], resources=[];
    page.on("pageerror",e=>errors.push(e.message.slice(0,180)));
    page.on("console",m=>{
      if(m.type()==="error" ||
        /Unable to decode|PDF page render failed|PDF thumbnail render failed/i.test(m.text()))
        errors.push(m.text().slice(0,180));
    });
    page.on("response",r=>{
      if(r.url().includes("/pdfjs-")) {
        resources.push({asset:r.url().split("/").at(-1),status:r.status()});
        if(r.status()>=400)errors.push("Decoder HTTP "+r.status());
      }
    });
    await page.goto("");
    const pick=page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    await(await pick).setFiles(pdfPath);
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText("1",{timeout:60_000});
    await expect.poll(async()=>page.evaluate(()=>
      Boolean(document.querySelector('.page-shell[data-index="0"] .page-surface canvas'))
    ),{timeout:60_000}).toBe(true);
    await page.locator("#zoomInput").fill("100");
    await page.locator("#zoomInput").press("Enter");
    let diff=null;
    try{
      await expect.poll(async()=>{
        const actual=await page.evaluate(()=>{
          const c=document.querySelector('.page-shell[data-index="0"] .page-surface canvas');
          if(!c||c.width!==64||c.height!==64)return null;
          const ctx=c.getContext("2d",{willReadFrequently:true});
          return ctx?[...ctx.getImageData(0,0,64,64).data]:null;
        });
        if(!actual)return false;
        diff=compareReferencePixels(actual,reference,64,64,{channelThreshold:20});
        return diff.mae<=15 && diff.maxChannelError<=50 &&
           diff.differingPixelPercent<=30 && diff.alphaErrors===0;
      },{timeout:45_000,message:"Real official "+item.id+" ICC profile differs from LittleCMS"})
        .toBe(true);
    }catch(error){
      console.log("P2_9_PRINT_DIAGNOSTIC "+JSON.stringify({id:item.id,
        stats:diff,errors:errors.slice(0,6),decoderResources:resources.slice(0,8)}));
      throw error;
    }
    expect(resources.some(r=>r.asset==="qcms_bg.wasm"&&r.status===200),
      "Actual qcms wasm conversion must be requested").toBe(true);
    expect(errors).toEqual([]);
    await mkdir("test-results/stress",{recursive:true});
    const report={schema:1,id:item.id,iccMajor:item.iccMajor,standard:item.standard,
      profileSha256:item.profileSha256,pdfSha256:item.sha256,
      referenceSha256:item.referenceSha256,pixelsCompared:4096,
      referenceRenderer:"Pillow ImageCms / LittleCMS2",
      stats:diff,resources,errors,rawProfileOrPageDataStored:false,pass:true};
    await writeFile("test-results/stress/p2-9-print-"+item.id+".json",
      JSON.stringify(report,null,2));
    console.log("P2_9_REAL_PRINT_PROFILE_PASSED "+JSON.stringify({
      id:item.id,profileSha256:item.profileSha256,
      pdfSha256:item.sha256,iccMajor:item.iccMajor,
      pixels:4096,mae:diff.mae,max:diff.maxChannelError,
      differentPixelPct:diff.differingPixelPercent}));
  });
}
