import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { advancedPdf, advancedManifest, referenceRgb } from "../scripts/p2-8-advanced-fixtures.mjs";
import { compareReferencePixels } from "../scripts/p2-8-pixel-diff.mjs";

const KINDS = ["jpx16","iccCmyk"];

// Native 64x64 source image sampled at source pixel centers, not interpolated
// thumbnails or 4 handpicked palette colors. PDF zoom=100% and Chromium DPR=1 yields exact 64x64 source pixels.
async function canvasPixels(page, pageNo) {
  return page.evaluate(target => {
    const shell = [...document.querySelectorAll(".page-shell")]
      .find(n => n.dataset.index === String(target - 1));
    const canvas = shell?.querySelector(".page-surface canvas");
    if (!canvas || canvas.width !== 64 || canvas.height !== 64) return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const rgba = context.getImageData(0,0,64,64).data;
    let different = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] < 245 || rgba[i+1] < 245 || rgba[i+2] < 245) different++;
    }
    if (different < 64) return null;
    return {width:canvas.width,height:canvas.height,rgba:[...rgba],
      drawnPixels:different};
  },pageNo);
}

for(const kind of KINDS) {
  test("P2.8 4096-pixel independent oracle production Chromium: " + kind,
    async ({ page }) => {
    const pdf=advancedPdf(kind);
    const manifest=advancedManifest(kind);
    const golden=referenceRgb(kind);
    const errors=[];
    const decoderResponses=[];
    page.on("pageerror",err=>errors.push("JS "+err.message));
    page.on("console",msg=>{
      if(msg.type()==="error" ||
        /Unable to decode|PDF page render failed|PDF thumbnail render failed/.test(msg.text()))
        errors.push("Console "+msg.text().slice(0,180));
    });
    page.on("response",response=>{
      if(response.url().includes("/pdfjs-")) {
        decoderResponses.push({asset:response.url().split("/").at(-1),status:response.status()});
        if(response.status()>=400) errors.push("Decoder "+response.status());
      }
    });
    await page.goto("");
    const chooserPromise=page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const chooser=await chooserPromise;
    await chooser.setFiles({name:kind+".pdf",mimeType:"application/pdf",buffer:pdf});
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText("3",{timeout:60_000});
    // Ensure first paint has settled before a user zoom forces cancellation/repaint.
    const initialPaint = await expect.poll(async()=>page.evaluate(()=>{
      const c=document.querySelector('.page-shell[data-index="0"] .page-surface canvas');
      return c ? [c.width,c.height] : null;
    }),{timeout:60_000,message:"First full-zoom image paint must finish before zoom"}).not.toBeNull();
    await page.locator("#zoomInput").fill("100");
    await page.locator("#zoomInput").press("Enter");
    const reports=[];
    const tolerance = kind === "jpx16"
      ? {mae:4, max:18, differingPct:40, perChannel:5}
      : {mae:22, max:85, differingPct:90, perChannel:24};
    for(const pageNo of [1,2,3]) {
      await page.locator("#pageInput").fill(String(pageNo));
      await page.locator("#pageInput").press("Enter");
      await expect(page.locator("#pageInput")).toHaveValue(String(pageNo));
      const preview=await page.evaluate(target=>{
        const elements=[...document.querySelectorAll(".page-shell")];
        return {requested:target, shellCount:elements.length,
          shells:elements.map(n=>({index:n.dataset.index,
            canvases:[...n.querySelectorAll("canvas")].map(c=>[c.width,c.height]),
            height:n.getBoundingClientRect().height})),
          zoom:document.querySelector("#zoomInput")?.value,
          viewer:[document.querySelector("#viewer")?.clientWidth,
            document.querySelector("#viewer")?.clientHeight],
        };
      },pageNo);
      console.log("P2_8_RENDER_DIAGNOSTIC "+JSON.stringify({kind,errors,preview}));
      await expect.poll(async()=>{
        const result=await canvasPixels(page,pageNo);
        return Boolean(result);
      },{timeout:90_000,message:"64x64 true raster, page "+pageNo}).toBe(true);
      const pixels=await canvasPixels(page,pageNo);
      const difference=compareReferencePixels(
        pixels.rgba,golden,pixels.width,pixels.height,
        {channelThreshold:tolerance.perChannel});
      const report={pageNo,drawnPixels:pixels.drawnPixels,...difference};
      reports.push(report);
      // Keep diagnostic evidence even on acceptance failure.
      await mkdir("test-results/stress",{recursive:true});
      await writeFile("test-results/stress/p2-8-"+kind+".json",JSON.stringify({
        schema:1,kind,manifest,compareSpace:"sRGB 8-bit/channel; independent Pillow/OpenJPEG or LittleCMS2 oracle",
        sourcePixelsCompared:64*64,pages:reports,tolerance,errors,decoderResponses,
        allPagesCompared:reports.length===3,
      },null,2));
      expect(report.alphaErrors,"Canvas must be fully opaque").toBe(0);
      expect(report.mae,"Mean absolute RGB channel error").toBeLessThanOrEqual(tolerance.mae);
      expect(report.maxChannelError,"Worst RGB channel deviation").toBeLessThanOrEqual(tolerance.max);
      expect(report.differingPixelPercent,"Pixels beyond per-channel tolerance")
        .toBeLessThanOrEqual(tolerance.differingPct);
    }
    expect(errors).toEqual([]);
    console.log("P2_8_FULL_PIXEL_ORACLE_PASSED "+JSON.stringify({
      kind,sha256:manifest.pdfSha256,sourcePixelsCompared:4096,
      pages:reports.map(x=>({number:x.pageNo,mae:x.mae,rmse:x.rmse,
        max:x.maxChannelError,diffPct:x.differingPixelPercent})),
      errors:errors.length,decoderResponses,
    }));
  });
}
