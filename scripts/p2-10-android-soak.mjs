#!/usr/bin/env node
/**
 * Run locally on the computer connected to an authorized PHYSICAL Android.
 * Real scanned PDF stays on the user's computer and must be opened on-device.
 * Never logs file paths, browser URLs, serials, content or raw dumpsys.
 */
import { execFileSync } from "node:child_process";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { inspectLocalScan } from "./p2-10-scan-preflight.mjs";
import { join } from "node:path";
import {
  parseChromeMeminfo, parseLinuxMeminfo, parseMemoryPsi,
} from "../src/p2-9-android-metrics.js";
import { summarizeAndroidSoak, validateSoakPlan } from "../src/p2-10-android-soak.js";

const HELP = "Usage: node scripts/p2-10-android-soak.mjs --file /local/scanned.pdf --pages 250 --minutes 30 [--interval 10] [--label scan-50] [--mode cdp|manual] [--device-file /sdcard/Download/p2-10-scan-50.pdf]";
function options(argv) {
  const o = {};
  for(let i=0;i<argv.length;i+=2) {
    if(!argv[i].startsWith("--") || !argv[i+1])throw new Error(HELP);
    const k=argv[i].slice(2);
    if(!["file","pages","minutes","interval","label","mode","device-file"].includes(k) || k in o)
      throw new Error(HELP);
    o[k]=argv[i+1];
  }
  if(!o.file || !o.pages || !o.minutes)throw new Error(HELP);
  const cfg = {file:o.file, pages:Number(o.pages), minutes:Number(o.minutes),
    intervalSeconds:Number(o.interval ?? 10), label:o.label ?? "real-scan",
    mode:o.mode ?? "cdp",deviceFile:o["device-file"]??null};
  if(!/^[a-z0-9-]{2,40}$/.test(cfg.label))throw new Error("Use a non-sensitive short label");
  if(!["cdp","manual"].includes(cfg.mode))throw new Error("Mode must be cdp or manual");
  if(cfg.deviceFile && !/^\/(sdcard\/Download|storage\/emulated\/0\/Download)\/[a-zA-Z0-9_.-]+\.pdf$/.test(cfg.deviceFile))
    throw new Error("Device PDF path must be a safe filename under Android Download");
  return cfg;
}
function adb(...args) {
  const serial=process.env.P2_ANDROID_SERIAL;
  if(serial && !/^[a-zA-Z0-9_.:-]{1,128}$/.test(serial))
    throw new Error("Invalid ADB serial");
  return execFileSync("adb",[...(serial?["-s",serial]:[]),...args],{
    encoding:"utf8",timeout:25_000,maxBuffer:4*1024*1024,
    stdio:["ignore","pipe","pipe"]}).trim();
}
const maybeAdb=(...args)=>{try{return adb(...args);}catch{return null;}};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function physicalDevice() {
  if(adb("get-state")!=="device")throw new Error("ADB device not authorized");
  const model=adb("shell","getprop","ro.product.model").slice(0,95);
  const android=adb("shell","getprop","ro.build.version.release").slice(0,24);
  const qemu=[adb("shell","getprop","ro.kernel.qemu"),
    adb("shell","getprop","ro.boot.qemu")].some(v=>v==="1");
  const fingerprint=(adb("shell","getprop","ro.build.fingerprint")||"").toLowerCase();
  if(qemu || /generic_x86|sdk_gphone|emulator|goldfish|ranchu/.test(fingerprint))
    throw new Error("Physical Android required; emulator results are not field evidence");
  if(!model||!android)throw new Error("Missing device model/Android version");
  return {physical:true,model,android,chromePackage:"com.android.chrome"};
}
function verifyOnDeviceSha256(path, expected) {
  if(!path)return false;
  // Exact-source evidence requires the user to copy the known local file and
  // choose that copy through the Android file picker before starting the run.
  const response=adb("shell","sha256sum",path);
  const found=/^([a-f0-9]{64})\s/.exec(response);
  if(!found || found[1]!==expected)
    throw new Error("Device PDF SHA-256 does not match the original local PDF");
  return true;
}
function memorySample(device,elapsedSeconds,browser){
  const sys=maybeAdb("shell","cat","/proc/meminfo");
  const mem=maybeAdb("shell","dumpsys","meminfo",device.chromePackage);
  const psi=maybeAdb("shell","cat","/proc/pressure/memory");
  const pids=maybeAdb("shell","pidof",device.chromePackage);
  const mainPid=Number(/^\d+/.exec(pids||"")?.[0])||null;
  return {kind:"physical-android-soak-sample",
    elapsedSeconds:Number(elapsedSeconds.toFixed(2)),
    system:sys?parseLinuxMeminfo(sys):null,
    chrome:mem?{...parseChromeMeminfo(mem),mainPid}:null,
    psi:parseMemoryPsi(psi),browser};
}
async function attachChrome(pagesExpected) {
  try {
    adb("forward","tcp:9222","localabstract:chrome_devtools_remote");
    const {chromium}=await import("@playwright/test");
    const browser=await chromium.connectOverCDP("http://127.0.0.1:9222",{timeout:15_000});
    let match=null;
    for(const context of browser.contexts()) {
      for(const candidate of context.pages()){
        const pageCount=await candidate.locator("#pageTotal").textContent({timeout:2500}).catch(()=>null);
        if(pageCount && Number(pageCount.trim())===pagesExpected){
          match=candidate;break;
        }
      }
      if(match)break;
    }
    if(!match)throw new Error("Open the intended PDF in alorak/pdf Chrome tab before the run");
    const id=await match.evaluate(()=>{
      const token="soak-"+Math.random().toString(36).slice(2);
      window.__p210SessionId=token;
      return token;
    });
    return {browser,page:match,id};
  }catch(error){
    throw new Error("Android Chrome CDP attach failed: "+error.message.slice(0,130)+
      ". Enable USB debugging, open Chrome and the test PDF, then retry.");
  }
}
async function browserSnapshot(session,expectedPages) {
  if(!session)return null;
  try {
    const state=await session.page.evaluate(() => ({
      alive:Boolean(document.querySelector("#pageTotal")),
      pages:Number(document.querySelector("#pageTotal")?.textContent),
      page:Number(document.querySelector("#pageInput")?.value),
      token:window.__p210SessionId??null,
      canvasCount:document.querySelectorAll(".page-surface canvas").length,
    }));
    return {currentPage:Number.isFinite(state.page)?state.page:null,
      canvasCount:state.canvasCount,
      unexpectedReload:state.token!==session.id,
      pageError:!state.alive||state.pages!==expectedPages};
  }catch{return {unexpectedReload:false,pageError:true,unreachable:true};}
}
async function navigate(session,target) {
  const started=Date.now();
  try {
    const page=session.page;
    await page.locator("#pageInput").fill(String(target),{timeout:9000});
    await page.locator("#pageInput").press("Enter",{timeout:9000});
    await page.waitForFunction(index=>{
      const input=document.querySelector("#pageInput");
      const canvas=document.querySelector(
        '.page-shell[data-index="'+(index-1)+'"] .page-surface canvas');
      return input?.value===String(index) &&
        Boolean(canvas?.width>8&&canvas?.height>8);
    },target,{timeout:15000});
    return {target,ok:true,durationMs:Date.now()-started};
  }catch(error){
    // Never include target URL, file name, or browser exception text.
    return {target,ok:false,durationMs:Date.now()-started,reason:"navigation-or-canvas-timeout"};
  }
}
async function recoveryCheck(session,expectedPages){
  if(!session)return {restored:false,details:"Manual mode cannot validate browser recovery"};
  const page=session.page;
  try {
    const workspaceIdentity = async () => page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("pdf-viewer-workspaces-v1")||"{}").activeId??null;
      }catch{return null;}
    });
    const priorWorkspace = await workspaceIdentity();
    const prior=Number(await page.locator("#pageInput").inputValue());
    if(!Number.isInteger(prior)||prior<1)return {restored:false,details:"Invalid prior page"};
    await delay(1300); // Viewer persists its last page after a 700ms debounce.
    if(!process.stdin.isTTY)
      return {restored:false,details:"Foreground return needs interactive confirmation"};
    // Do not force-stop Chrome: that would artificially simulate process death.
    adb("shell","input","keyevent","KEYCODE_HOME");
    await delay(15000);
    const {createInterface}=await import("node:readline/promises");
    const reader=createInterface({input:process.stdin,output:process.stdout});
    try {
      await reader.question("Chrome arka plana alindi. Telefonda Chrome'u tekrar acip AYNI PDF sekmesine donun; sonra Enter: ");
    }finally{reader.close();}
    const resumed=await browserSnapshot(session,expectedPages);
    const inForeground=resumed&&!resumed.pageError&&resumed.currentPage===prior;
    // Explicit tab reload tests IndexedDB workspace/PDF recovery separately.
    await page.reload({waitUntil:"domcontentloaded",timeout:25000});
    await page.waitForFunction(n=>
      Number(document.querySelector("#pageTotal")?.textContent)===n,
      expectedPages,{timeout:45000});
    const after=Number(await page.locator("#pageInput").inputValue());
    const canvas=await page.locator(".page-surface canvas").count();
    const workspaceRestored = priorWorkspace!==null &&
      (await workspaceIdentity())===priorWorkspace;
    const reloadRestored=after===prior&&canvas>0&&workspaceRestored;
    return {restored:Boolean(inForeground&&reloadRestored),
      backgroundResumed:Boolean(inForeground),
      backgroundTriggeredDocumentReload:Boolean(resumed?.unexpectedReload),
      explicitPageReloadRecovered:reloadRestored,
      workspaceRestored,
      details:"HOME/background + manual Chrome foreground; separate explicit tab reload. No force-stop or LMK simulation."};
  }catch {
    return {restored:false,details:"Chrome background/foreground or explicit reload failed"};
  }
}
async function main(){
  const cfg=options(process.argv.slice(2));
  const fileInfo=await stat(cfg.file);
  if(!fileInfo.isFile())throw Error("PDF must be a regular local file");
  validateSoakPlan({minutes:cfg.minutes,intervalSeconds:cfg.intervalSeconds,
    pages:cfg.pages,sizeBytes:fileInfo.size});
  const fd=await open(cfg.file,"r");
  let header;
  try{header=Buffer.alloc(8);await fd.read(header,0,8,0);}finally{await fd.close();}
  if(!header.subarray(0,5).equals(Buffer.from("%PDF-")))throw Error("Not a PDF file");
  const source=await inspectLocalScan(cfg.file,cfg.pages);
  const sha=source.sha256;
  const device=physicalDevice();
  const sameBytesOnDeviceVerified=verifyOnDeviceSha256(cfg.deviceFile,sha);
  // User must open this SAME PDF in Chrome manually. CDP never uploads any file.
  const session=cfg.mode==="cdp"?await attachChrome(cfg.pages):null;
  const plan={minutes:cfg.minutes,intervalSeconds:cfg.intervalSeconds,
    pages:cfg.pages,sizeBytes:fileInfo.size};
  const samples=[],navigations=[];
  const start=Date.now(), count=Math.floor(cfg.minutes*60/cfg.intervalSeconds)+1;
  const pageTargets=[1,Math.ceil(cfg.pages/2),cfg.pages,
    Math.min(cfg.pages,Math.max(2,Math.ceil(cfg.pages*.27))),
    Math.min(cfg.pages,Math.max(2,Math.ceil(cfg.pages*.73)))];
  console.log("P2_10_STARTED "+JSON.stringify({
    label:cfg.label,deviceModel:device.model,android:device.android,
    pdfSha256:sha,pdfSizeBytes:fileInfo.size,mode:cfg.mode,
    minutes:cfg.minutes,intervalSeconds:cfg.intervalSeconds,
    sourceImagePages:source.sampled,deviceFileShaVerified:sameBytesOnDeviceVerified,
    note:"No file copied and no URLs or device serial saved"}));
  for(let i=0;i<count;i++){
    const elapsed=(Date.now()-start)/1000;
    const browser=await browserSnapshot(session,cfg.pages);
    samples.push(memorySample(device,elapsed,browser));
    if(session&&i%3===0) {
      const target=pageTargets[Math.floor(i/3)%pageTargets.length];
      navigations.push(await navigate(session,target));
    }
    if(i%30===0)console.log("P2_10_SAMPLE "+JSON.stringify({
      elapsedSeconds:Number(elapsed.toFixed(1)),samples:samples.length,
      chromePssMiB:samples.at(-1).chrome?.pssMiB??null,
      navigations:navigations.length}));
    const sleep=start+(i+1)*cfg.intervalSeconds*1000-Date.now();
    if(i<count-1&&sleep>0)await delay(sleep);
  }
  const recovery=await recoveryCheck(session,cfg.pages);
  if(session) {
    await session.browser.close().catch(()=>{});
    maybeAdb("forward","--remove","tcp:9222");
  }
  const summary=summarizeAndroidSoak({plan,samples,navigations,recovery,device});
  const result={schema:1,kind:"physical-android-soak-report",label:cfg.label,
    fieldEvidenceComplete:summary.evidenceComplete&&sameBytesOnDeviceVerified,
    performanceThresholdJudgement:"not set; memory/latency relative to device baseline",
    source:{...source,scannerValidated:true,
      sameBytesOnDeviceVerified},
    plan,device,measurements:samples,navigations,recovery,summary,
    rawDumpSaved:false,documentBytesSaved:false,deviceSerialSaved:false,urlSaved:false};
  await mkdir("test-results/manual",{recursive:true});
  const out=join("test-results/manual","p2-10-android-"+cfg.label+".json");
  await writeFile(out,JSON.stringify(result,null,2),{flag:"w"});
  console.log("P2_10_REPORT "+JSON.stringify({
    label:cfg.label,analysis:summary,privacy:"No PDF bytes, URLs, serial or raw dumpsys"}));
  if(!summary.evidenceComplete || !sameBytesOnDeviceVerified) {
    console.error("INCONCLUSIVE: incomplete measurements, source hash mismatch/unverified, navigation failures, or recovery mismatch.");
    process.exitCode=2;
  }
}
main().catch(error=>{
  maybeAdb("forward","--remove","tcp:9222");
  console.error("P2.10 physical soak NOT executed/complete: "+
    String(error?.message||error).slice(0,240));
  process.exitCode=1;
});
