import test from "node:test";
import assert from "node:assert/strict";
import {
  ANDROID_STAGES,parseChromeMeminfo,parseLinuxMeminfo,parseMemoryPsi,summarizeAndroidSession,
} from "../src/p2-9-android-metrics.js";

test("P2.9 Linux memory parser reports MiB and does not preserve raw dumpsys",()=>{
  const r=parseLinuxMeminfo("MemTotal: 4096000 kB\nMemAvailable: 1048576 kB\nCached: 512000 kB\nSwapFree: 0 kB\n");
  assert.equal(r.totalMiB,4000);
  assert.equal(r.availableMiB,1024);
  assert.equal(r.swapFreeMiB,0);
  assert.equal(Object.keys(r).length,4);
});
test("P2.9 Chrome meminfo handles TOTAL and TOTAL PSS variants",()=>{
  const a=parseChromeMeminfo("TOTAL PSS: 174,080\nTOTAL RSS: 262,144\n");
  assert.equal(a.pssMiB,170);
  assert.equal(a.rssMiB,256);
  const b=parseChromeMeminfo("   TOTAL   183,296  20,480  15,000  \n");
  assert.equal(b.pssMiB,179);
  assert.equal(b.privateDirtyMiB,20);
  const c=parseChromeMeminfo("No process found for: com.android.chrome");
  assert.equal(c.processPresent,false);
  assert.equal(c.pssMiB,null);
});
test("P2.9 PSI is optional, not wrongly measured as zero",()=>{
  const a=parseMemoryPsi("some avg10=1.20 avg60=0.30 avg300=0.05 total=9000\nfull avg10=0.01 avg60=0.00 avg300=0.00 total=100\n");
  assert.equal(a.some.avg10,1.2);
  assert.equal(a.full.cumulativeStallUs,100);
  assert.equal(parseMemoryPsi("permission denied"),null);
});
test("P2.9 Android session refuses emulators and incomplete field evidence",()=>{
  const records=ANDROID_STAGES.map((stage,i)=>({
    schema:2,kind:"physical-android-mem",stage,deviceModel:"physical-test-device",
    androidRelease:"15",isEmulator:false,chrome:{pssMiB:160+i*20},
    system:{availableMiB:1200-i*100},observation:{tabReloaded:i===4,responsive:true},
  }));
  const good=summarizeAndroidSession(records);
  assert.equal(good.physicalDevice,true);
  assert.equal(good.peakPssMiB,240);
  assert.equal(good.canClaimMeasuredChromePss,true);
  assert.equal(good.observations.at(-1).userObservedTabReloaded,true);
  assert.throws(()=>summarizeAndroidSession(records.slice(1)));
  assert.throws(()=>summarizeAndroidSession([...records.slice(0,4),records[0]]));
  assert.throws(()=>summarizeAndroidSession(records.map((r,i)=>({...r,isEmulator:i===2}))));
  const missing=records.map((r,i)=>({...r,chrome:{pssMiB:i===1?null:160+i*20}}));
  assert.equal(summarizeAndroidSession(missing).canClaimMeasuredChromePss,false);
});
