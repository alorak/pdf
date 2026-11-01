import { test, expect } from "@playwright/test";
import { readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { parsePortablePixmap, compareBinaryPageReference, compareEveryBinaryPixel }
  from "../scripts/p2-8-jbig2-parity.mjs";

const env=process.env.P2_8_JBIG2_FILES;
if(!env)throw new Error("P2_8_JBIG2_FILES must be an explicit pinned 3rd-party corpus manifest");
const input=JSON.parse(env);
if(!Array.isArray(input)||input.length<1||input.length>12)throw Error("Invalid JBIG2 corpus length");
const sourceRoot=await realpath("/tmp/p28-jbig2");
const cases=await Promise.all(input.map(async item=>{
  if(!/^[a-z0-9-]{3,55}$/.test(item.id || "")||
     !/^[a-f0-9]{64}$/.test(item.sha256 || "")||
     !/^[a-f0-9]{40}$/.test(item.gitBlob || "")||
     typeof item.pdfPath!=="string"||typeof item.ppmPath!=="string")
    throw Error("Invalid JBIG2 corpus case");
  const pdfPath=await realpath(resolve(item.pdfPath));
  const ppmPath=await realpath(resolve(item.ppmPath));
  if(!pdfPath.startsWith(sourceRoot+sep)||!ppmPath.startsWith(sourceRoot+sep))
    throw Error("Source path outside authorized temporary corpus");
  return {...item,pdfPath,ppmPath};
}));

async function getCanvas(page, expectedWidth, expectedHeight){
  return page.evaluate(({expectedWidth,expectedHeight})=>{
    const node=document.querySelector('.page-shell[data-index="0"] .page-surface canvas');
    if(!node||!node.width||!node.height||node.width*node.height>4_000_000 ||
       Math.abs(node.width-expectedWidth)>2 || Math.abs(node.height-expectedHeight)>2)return null;
    const context=node.getContext("2d",{willReadFrequently:true});
    if(!context)return null;
    const raw=context.getImageData(0,0,node.width,node.height).data;
    let ink=0;
    for(let i=0;i<raw.length;i+=4)
      if((raw[i]+raw[i+1]+raw[i+2])/3<128)ink++;
    if(ink<4)return null;
    return {width:node.width,height:node.height,rgba:[...raw],ink};
  },{expectedWidth,expectedHeight});
}

for(const item of cases){
  test("P2.8 independently rendered JBIG2 Poppler pixel parity: "+item.id,
  async ({page})=>{
    const bytes=await readFile(item.pdfPath);
    const sha256=createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe(item.sha256);
    expect(bytes.includes(Buffer.from("/JBIG2Decode","ascii"))).toBe(true);
    const reference=parsePortablePixmap(await readFile(item.ppmPath));
    const errors=[];
    const decoders=[];
    page.on("pageerror",e=>errors.push(e.message.slice(0,180)));
    page.on("console",m=>{
      if(m.type()==="error"||/Unable to decode|PDF page render failed/i.test(m.text()))
        errors.push(m.text().slice(0,180));
    });
    page.on("response",r=>{
      if(r.url().includes("/pdfjs-")){
        decoders.push({asset:r.url().split("/").at(-1),http:r.status()});
        if(r.status()>=400)errors.push("Decoder returned "+r.status());
      }
    });
    await page.goto("");
    const pick=page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    await(await pick).setFiles(item.pdfPath);
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText("1",{timeout:90_000});
    // Poppler at 72 DPI maps PDF points to pixels at exactly 100% zoom/DPR=1.
    await page.locator("#zoomInput").fill("100");
    await page.locator("#zoomInput").press("Enter");
    await expect.poll(async()=>Boolean(await getCanvas(page,reference.width,reference.height)),{
      timeout:25_000,message:"100%-zoom image must match Poppler 72-dpi geometry"
    }).toBe(true);
    const actual=await getCanvas(page,reference.width,reference.height);
    const stats=compareBinaryPageReference(actual.rgba,actual.width,actual.height,
      reference.rgb,reference.width,reference.height,32);
    const full=compareEveryBinaryPixel(actual.rgba,actual.width,actual.height,
      reference.rgb,reference.width,reference.height);
    const report={schema:1,kind:"Poppler-vs-PDFjs-JBIG2",id:item.id,
      sha256,gitBlob:item.gitBlob,
      independentReference:reference.sha256,stats,full,decoders,errors,
      note:"ALL reference pixels compared 1:1 at 72 dpi, with supplementary 32x32 grid; Poppler renderer independent of PDF.js"};
    await mkdir("test-results/stress",{recursive:true});
    await writeFile("test-results/stress/p2-8-"+item.id+".json",JSON.stringify(report,null,2));
    console.log("P2_8_JBIG2_PARITY_METRICS "+JSON.stringify(report));
    expect(errors).toEqual([]);
    expect(Math.abs(actual.width-reference.width), "Browser and Poppler width parity")
      .toBeLessThanOrEqual(2);
    expect(Math.abs(actual.height-reference.height), "Browser and Poppler height parity")
      .toBeLessThanOrEqual(2);
    expect(stats.referenceInkPixels,"Reference image must contain meaningful foreground").toBeGreaterThan(3);
    expect(stats.actualInkPixels,"Browser image must contain meaningful foreground").toBeGreaterThan(3);
    expect(stats.mae,"Mean luminance error from independent Poppler reference").toBeLessThanOrEqual(30);
    expect(full.comparedPixels,"Full raster must have substantial resolution").toBeGreaterThan(100000);
    expect(full.alphaErrors).toBe(0);
    expect(full.mae).toBeLessThanOrEqual(30);
    expect(full.f1).toBeGreaterThanOrEqual(0.65);
    expect(stats.f1,"Black/white foreground agreement").toBeGreaterThanOrEqual(0.65);
    console.log("P2_8_JBIG2_PARITY_PASSED "+JSON.stringify({
      id:item.id,sha256,reference:reference.sha256,mae:stats.mae,f1:stats.f1,
      fullPixelCount:full.comparedPixels,fullMae:full.mae,fullF1:full.f1,
      ink:stats.referenceInkPixels,shape:stats.geometry,
    }));
  });
}
