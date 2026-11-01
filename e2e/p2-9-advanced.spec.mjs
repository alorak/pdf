import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { buildP29Pdf, p29ReferenceRgb, p29Manifest } from "../scripts/p2-9-fixtures.mjs";
import { compareReferencePixels } from "../scripts/p2-8-pixel-diff.mjs";

// 64 PDF points -> exactly 64 canvas pixels at 100% zoom and DPR=1.
test.use({ deviceScaleFactor: 1 });

async function readNativeCanvas(page) {
  return page.evaluate(()=>{
    const c=document.querySelector('.page-shell[data-index="0"] .page-surface canvas');
    if(!c || c.width!==64 || c.height!==64) return null;
    const ctx=c.getContext("2d",{willReadFrequently:true});
    if(!ctx)return null;
    return Array.from(ctx.getImageData(0,0,64,64).data);
  });
}

for(const kind of ["jpx-rgb16","icc-v4-rgb"]) {
  test("P2.9 original " + kind + " independent 4096-pixel sRGB oracle",async({page})=>{
    const bytes=buildP29Pdf({kind});
    const manifest=p29Manifest(kind);
    const gold=p29ReferenceRgb(kind);
    const errors=[], decoderResources=[];
    page.on("pageerror",e=>errors.push("exception: "+e.message.slice(0,200)));
    page.on("console",m=>{
      if(m.type()==="error" ||
         /Unable to decode|PDF page render failed|PDF thumbnail render failed/i.test(m.text()))
        errors.push("console: "+m.text().slice(0,200));
    });
    page.on("response",r=>{
      if(r.url().includes("/pdfjs-")){
        decoderResources.push({asset:r.url().split("/").at(-1),status:r.status()});
        if(r.status()>=400)errors.push("decoder HTTP "+r.status());
      }
    });
    await page.goto("");
    const chooserPromise=page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    await(await chooserPromise).setFiles({name:kind+".pdf",mimeType:"application/pdf",buffer:bytes});
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText("1",{timeout:60_000});
    // Avoid cancelling initial PDF.js rendering while switching the zoom.
    await expect.poll(async()=>page.evaluate(()=>
      Boolean(document.querySelector('.page-shell[data-index="0"] .page-surface canvas'))
    ),{timeout:60_000}).toBe(true);
    await page.locator("#zoomInput").fill("100");
    await page.locator("#zoomInput").press("Enter");
    await expect(page.locator("#zoomInput")).toHaveValue("100");
    const budget=kind==="jpx-rgb16"?
      {mae:1,max:4,diffPct:0,threshold:4}:
      {mae:8,max:28,diffPct:18,threshold:12};
    let result=null;
    await expect.poll(async()=>{
      const actual=await readNativeCanvas(page);
      if(!actual)return false;
      result=compareReferencePixels(actual,gold,64,64,
        {channelThreshold:budget.threshold});
      return result.mae<=budget.mae && result.maxChannelError<=budget.max &&
        result.differingPixelPercent<=budget.diffPct && result.alphaErrors===0;
    },{timeout:50_000,message:"Full 4096-pixel ICC-v4/JPX16 reference diff on real canvas"})
      .toBe(true);
    expect(errors).toEqual([]);
    const decoder=kind==="jpx-rgb16"?"openjpeg.wasm":"qcms_bg.wasm";
    expect(decoderResources.some(x=>x.asset===decoder && x.status===200),
      "decoder must actually be requested and return HTTP 200").toBe(true);
    const report={schema:1,kind,manifest,referenceSha256:manifest.referenceSha256,
      compareSpace:"sRGB8; independent original source/LittleCMS2 reference",
      pixelsCompared:4096,metrics:result,decoderResources,errors,pass:true};
    await mkdir("test-results/stress",{recursive:true});
    await writeFile("test-results/stress/p2-9-"+kind+".json",JSON.stringify(report,null,2));
    console.log("P2_9_ADVANCED_CODEC_PASSED "+JSON.stringify({kind,
      pdfSha256:manifest.pdfSha256,referenceSha256:manifest.referenceSha256,
      mae:result.mae,maxChannelError:result.maxChannelError,
      differentPixels:result.differingPixels,pass:true}));
  });
}
