#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANDROID_STAGES, parseChromeMeminfo, parseLinuxMeminfo,
  parseMemoryPsi, summarizeAndroidSession,
} from "../src/p2-9-android-metrics.js";

const stage=process.argv[2];
const out="test-results/manual";
const serial=process.env.P2_ANDROID_SERIAL;
const pkg=process.env.P2_ANDROID_PACKAGE||"com.android.chrome";
if(stage!=="report"&&!ANDROID_STAGES.includes(stage)){
  console.error("Usage: node scripts/p2-9-android-session.mjs baseline|large-open|navigate|workspace|reopen|report");
  process.exit(2);
}
if(!/^[a-z][a-z0-9_.]{4,90}$/.test(pkg))throw Error("Invalid Android package");
if(serial && !/^[a-zA-Z0-9_.:-]{1,128}$/.test(serial))
  throw Error("Invalid local ADB serial (never stored or printed)");
function adb(...args){
  return execFileSync("adb",[...(serial?["-s",serial]:[]),...args],{
    encoding:"utf8",timeout:25_000,maxBuffer:4*1024*1024,
    stdio:["ignore","pipe","pipe"]}).trim();
}
function optionalAdb(...args){try{return adb(...args);}catch{return null;}}
function observed(name){
  const value=process.env[name];
  if(value===undefined||value==="")return null;
  if(!["true","false"].includes(value))throw Error(name+" must be true or false");
  return value==="true";
}
try{
  await mkdir(out,{recursive:true});
  if(stage==="report"){
    const records=await Promise.all(ANDROID_STAGES.map(async s=>JSON.parse(
      await readFile(join(out,"p2-9-android-"+s+".json"),"utf8"))));
    const summary=summarizeAndroidSession(records);
    await writeFile(join(out,"p2-9-android-summary.json"),JSON.stringify(summary,null,2));
    console.log("P2_9_ANDROID_FIELD_SUMMARY "+JSON.stringify(summary));
  }else{
    const model=adb("shell","getprop","ro.product.model").slice(0,95);
    const android=adb("shell","getprop","ro.build.version.release").slice(0,24);
    const sdk=Number(adb("shell","getprop","ro.build.version.sdk"))||null;
    const emulatorFlags=[
      adb("shell","getprop","ro.kernel.qemu"),
      adb("shell","getprop","ro.boot.qemu")];
    const emulator=emulatorFlags.some(x=>x==="1");
    if(emulator)throw Error("Physical Android required. Emulator runs are not accepted as field data.");
    if(!model||!android)throw Error("Missing physical device properties");
    const system=parseLinuxMeminfo(adb("shell","cat","/proc/meminfo"));
    const chrome=parseChromeMeminfo(adb("shell","dumpsys","meminfo",pkg));
    const psi=parseMemoryPsi(optionalAdb("shell","cat","/proc/pressure/memory"));
    const report={schema:2,kind:"physical-android-mem",stage,
      recordedAt:new Date().toISOString(),deviceModel:model,
      androidRelease:android,androidSdk:sdk,isEmulator:false,
      chromePackage:pkg,system,chrome,psi,
      observation:{tabReloaded:observed("P2_ANDROID_TAB_RELOADED"),
        responsive:observed("P2_ANDROID_UI_RESPONSIVE")},
      rawDumpsysSaved:false,deviceSerialSaved:false,urlSaved:false,pdfContentSaved:false};
    await writeFile(join(out,"p2-9-android-"+stage+".json"),
      JSON.stringify(report,null,2));
    console.log("P2_9_ANDROID_FIELD_SNAPSHOT "+JSON.stringify(report));
  }
}catch(error){
  console.error("P2.9 Android measurement not completed:",error.message.slice(0,150));
  process.exitCode=1;
}
