import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generateAdvancedCodecPdf, makeTestCmykIccProfile, advancedCodecManifest } from "../scripts/p2-8-advanced-fixtures.mjs";
import { compareGoldenRgba, referenceInfo } from "../scripts/p2-8-golden.mjs";

test.use({ deviceScaleFactor: 1 });

for(const kind of ["jpx16","icc-cmyk"]) {
  test("P2.8 production pixel-for-pixel golden diff: "+kind,async ({page})=>{
    const data=generateAdvancedCodecPdf(kind);
    const report=advancedCodecManifest(kind,data);
    const warnings=[],resources=[];
    page.on("pageerror",error=>warnings.push("page: "+error.message));
    page.on("console",message=>{
      if(message.type()==="error"||
          /Unable to decode image|PDF page render failed|PDF thumbnail render failed|Failed to fetch|ICC profile.*invalid/i.test(message.text()))
        warnings.push("console: "+message.text().slice(0,200));
    });
    page.on("response",response=>{
      if(response.url().includes("/pdfjs-")){
        resources.push({name:response.url().split("/").at(-1),status:response.status()});
        if(response.status()>=400)warnings.push("HTTP decoder error "+response.status());
      }
    });
    expect(report.bytes).toBeGreaterThan(300);
    if(kind==="jpx16"){
      expect(data.includes(Buffer.from("/BitsPerComponent 16 /ColorSpace /DeviceGray /Filter /JPXDecode"))).toBe(true);
    }else{
      expect(data.includes(Buffer.from("/ColorSpace [/ICCBased 8 0 R]"))).toBe(true);
      expect(makeTestCmykIccProfile().toString("ascii",16,20)).toBe("CMYK");
    }
    await page.goto("");
    const chooser=page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const file=await chooser;
    await file.setFiles({name:kind+".pdf",mimeType:"application/pdf",buffer:data});
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText("3",{timeout:60_000});
    await page.locator("#zoomInput").fill("100");
    await page.locator("#zoomInput").press("Enter");
    const pages=[];
    for(const pageNo of [1,2,3]){
      await page.locator("#pageInput").fill(String(pageNo));
      await page.locator("#pageInput").press("Enter");
      const selector='.page-shell[data-index="'+(pageNo-1)+'"] .page-surface canvas';
      let comparison;
      await expect.poll(async ()=>{
        comparison=await page.locator(selector).evaluateAll((all,args)=>{
          const canvas=all.find(c=>c.width===64&&c.height===64);
          if(!canvas)return null;
          const ctx=canvas.getContext("2d",{willReadFrequently:true});
          if(!ctx)return null;
          return Array.from(ctx.getImageData(0,0,64,64).data);
        },{pageNo});
        if(!comparison)return false;
        const diff=compareGoldenRgba(kind,comparison,64,64);
        return diff.pass;
      },{timeout:90_000,message:"Native-sized complete pixel diff failed on page "+pageNo})
        .toBe(true);
      const metrics=compareGoldenRgba(kind,comparison,64,64);
      expect(metrics.totalPixels).toBe(4096);
      expect(metrics.alphaFailures).toBe(0);
      expect(metrics.mismatchedPixels).toBe(0);
      pages.push({pageNo,...metrics});
    }
    expect(warnings).toEqual([]);
    if(kind==="jpx16")expect(resources.some(x=>x.name==="openjpeg.wasm"&&x.status===200)).toBe(true);
    if(kind==="icc-cmyk")expect(resources.some(x=>x.name==="qcms_bg.wasm"&&x.status===200)).toBe(true);
    await mkdir("test-results/stress",{recursive:true});
    const result={schema:1,format:kind,pdfSha256:report.sha256,pdfBytes:data.length,
      reference:referenceInfo(kind),pages,warnings,resources,pass:true,
      note:"4096 full native-size image pixels compared per page, RGB channel tolerance <=12; alpha exact"};
    await writeFile("test-results/stress/p2-8-"+kind+".json",JSON.stringify(result,null,2));
    console.log("P2_8_REFERENCE_PASSED "+JSON.stringify({
      kind,sha256:report.sha256,referenceSha256:result.reference.sha256,
      pages:pages.length,pixelsCompared:pages.length*4096,
      maxChannelError:Math.max(...pages.map(x=>x.maxChannelError)),warnings:warnings.length}));
  });
}
