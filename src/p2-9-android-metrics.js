/** Pure parsers for privacy-preserving, physical Android/Chrome memory snapshots. */
const number = v => {
  if(typeof v!=="string")return null;
  const n=Number(v.replaceAll(",",""));
  return Number.isFinite(n) && n>=0 ? n : null;
};
const toMiB=v=>v===null?null:Number((v/1024).toFixed(2));
export function parseLinuxMeminfo(source){
  if(typeof source!=="string")throw new TypeError("Expected /proc/meminfo");
  const key=name=>number(new RegExp("^"+name+":\\s+([\\d,]+)\\s+kB","m").exec(source)?.[1]);
  const total=key("MemTotal"),available=key("MemAvailable");
  return {totalMiB:toMiB(total),availableMiB:toMiB(available),
    cachedMiB:toMiB(key("Cached")),swapFreeMiB:toMiB(key("SwapFree"))};
}
export function parseChromeMeminfo(source){
  if(typeof source!=="string")throw new TypeError("Expected dumpsys meminfo");
  const noProcess=/No process found|Unknown package|Unable to find process/i.test(source);
  const pss=number(
    /TOTAL\s+PSS:\s*([\d,]+)/i.exec(source)?.[1] ??
    /^\s*TOTAL\s+([\d,]+)\s+[\d,]+/m.exec(source)?.[1]);
  const rss=number(/TOTAL\s+RSS:\s*([\d,]+)/i.exec(source)?.[1]);
  const privateDirty=number(
    /^\s*TOTAL\s+[\d,]+\s+([\d,]+)/m.exec(source)?.[1]);
  return {processPresent:!noProcess && pss!==null,
    pssMiB:toMiB(pss),rssMiB:toMiB(rss),
    privateDirtyMiB:toMiB(privateDirty)};
}
export function parseMemoryPsi(source) {
  if(typeof source!=="string")return null;
  const parseLine=type=>{
    const line=new RegExp("^"+type+"\\s+avg10=([0-9.]+)\\s+avg60=([0-9.]+)\\s+avg300=([0-9.]+)\\s+total=(\\d+)","m").exec(source);
    if(!line)return null;
    return {avg10:Number(line[1]),avg60:Number(line[2]),
      avg300:Number(line[3]),cumulativeStallUs:Number(line[4])};
  };
  const some=parseLine("some"),full=parseLine("full");
  return some||full?{some,full}:null;
}
export const ANDROID_STAGES=Object.freeze(["baseline","large-open","navigate","workspace","reopen"]);
export function summarizeAndroidSession(records){
  if(!Array.isArray(records)||records.length!==ANDROID_STAGES.length)
    throw new Error("Need all five physical Android snapshots");
  const byStage=new Map(records.map(x=>[x.stage,x]));
  if(byStage.size!==ANDROID_STAGES.length ||
      ANDROID_STAGES.some(k=>!byStage.has(k)))
    throw new Error("Missing or duplicated Android stage");
  if(records.some(x=>x.schema!==2 || x.kind!=="physical-android-mem" ||
      x.isEmulator!==false || !x.deviceModel || !x.androidRelease))
    throw new Error("Not a verified physical Android session");
  const model=records[0].deviceModel, release=records[0].androidRelease;
  if(records.some(x=>x.deviceModel!==model||x.androidRelease!==release))
    throw new Error("Multiple device models in one session");
  const valid=records.filter(x=>x.chrome?.pssMiB!==null&&x.chrome?.pssMiB!==undefined);
  const pss=valid.map(x=>x.chrome.pssMiB);
  return {schema:1,model,androidRelease:release,stages:ANDROID_STAGES,
    physicalDevice:true,validPssSamples:valid.length,
    baselinePssMiB:byStage.get("baseline").chrome?.pssMiB??null,
    peakPssMiB:pss.length?Math.max(...pss):null,
    afterReopenPssMiB:byStage.get("reopen").chrome?.pssMiB??null,
    minAvailableMiB:Math.min(...records.map(x=>x.system?.availableMiB??Infinity)),
    observations:records.map(x=>({stage:x.stage,
      userObservedTabReload:x.observation?.tabReloaded??null,
      userObservedResponsive:x.observation?.responsive??null})),
    canClaimMeasuredChromePss:valid.length===5,
    note:"No automatic Android OOM or LMK proof; user-observed reload distinct from ADB metrics"};
}
