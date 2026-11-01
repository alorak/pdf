import test from "node:test";
import assert from "node:assert/strict";
import {
  quantile, validateSoakPlan, summarizeAndroidSoak,
} from "../src/p2-10-android-soak.js";

test("P2.10 p95 is interpolated and does not invent measurements",()=>{
  assert.equal(quantile([9,1,5,3,7],.5),5);
  assert.equal(quantile([1,3,5,7,9],.95),8.6);
  assert.equal(quantile([], .95),null);
  assert.equal(quantile([null,Infinity,4],.95),4);
  assert.throws(()=>quantile([1,2],1.1),RangeError);
});

test("P2.10 rejects unrepresentative durations, invalid scan sizes and metadata",()=>{
  assert.throws(()=>validateSoakPlan({minutes:5,intervalSeconds:10,pages:50,sizeBytes:50e6}));
  assert.throws(()=>validateSoakPlan({minutes:30,intervalSeconds:2,pages:50,sizeBytes:50e6}));
  assert.throws(()=>validateSoakPlan({minutes:30,intervalSeconds:10,pages:2,sizeBytes:50e6}));
  assert.throws(()=>validateSoakPlan({minutes:30,intervalSeconds:10,pages:50,sizeBytes:5e6}));
  assert.deepEqual(validateSoakPlan({minutes:30,intervalSeconds:10,pages:50,sizeBytes:50e6}),
    {minutes:30,intervalSeconds:10,pages:50,sizeBytes:50e6});
});
const PLAN={minutes:30,intervalSeconds:10,pages:250,sizeBytes:55e6};
const DEVICE={physical:true,model:"SIMULATED-TEST-ONLY",android:"15",chromePackage:"com.android.chrome"};
function mockSamples(){
  return Array.from({length:181},(_,i)=>({
    kind:"physical-android-soak-sample",elapsedSeconds:i*10,
    chrome:{pssMiB:200+i*.25,mainPid:i<120?12345:23456},system:{availableMiB:2800-i*2},
    psi:{some:{avg10:1+i/30}},
    browser:{unexpectedReload:false,pageError:false},
  }));
}
function mockNavigations(){
  return Array.from({length:12},(_,i)=>({target:[1,125,250][i%3],ok:true,durationMs:200+i*10}));
}
test("P2.10 long-run analyzer computes PSS peak, p95, navigation p95 and recovery",()=>{
  const r=summarizeAndroidSoak({plan:PLAN,samples:mockSamples(),
    navigations:mockNavigations(),recovery:{restored:true,details:"mock"},
    device:DEVICE});
  assert.equal(r.evidenceComplete,true); // This is SYNTHETIC analyzer unit data, not a field run.
  assert.equal(r.memory.chromePssMiB.maximum,245);
  assert.equal(r.memory.lastMinusFirstMiB,45);
  assert.equal(r.memory.pssCoverageFraction,1);
  assert.equal(r.memory.validPssSamples,181);
  assert.equal(r.memory.psiSomeAvg10.maximum,7);
  assert.equal(r.browser.successfulNavigations,12);
  assert.equal(r.browser.unexpectedDocumentReloads,0);
  assert.equal(r.browser.chromeMainPidChangesObserved,1);
  assert.equal(r.browser.expectedReopenRecovered,true);
  assert.equal(r.potentialMemoryGrowthNotProof,false);
  assert.equal(r.lmkOrOomConfirmed,null);
});
test("P2.10 incomplete PSS, page crashes and nonphysical devices never pass",()=>{
  assert.throws(()=>summarizeAndroidSoak({
    plan:PLAN,samples:mockSamples(),navigations:[],recovery:null,
    device:{...DEVICE,physical:false}}));
  const samples=mockSamples();
  for(let i=0;i<80;i++)samples[i].chrome.pssMiB=null;
  samples[90].browser.unexpectedReload=true;
  const result=summarizeAndroidSoak({plan:PLAN,samples,
    navigations:[{target:100,ok:false,durationMs:15000}],
    recovery:{restored:false},device:DEVICE});
  assert.equal(result.evidenceComplete,false);
  assert.equal(result.browser.navigationFailures,1);
  assert.equal(result.browser.unexpectedDocumentReloads,1);
  assert.ok(result.memory.pssCoverageFraction<.9);
});
test("P2.10 no success claim from manual sampling without page navigation",()=>{
  const result=summarizeAndroidSoak({plan:PLAN,samples:mockSamples(),
    navigations:[],recovery:null,device:DEVICE});
  assert.equal(result.evidenceComplete,false);
  assert.equal(result.browser.successfulNavigations,0);
  assert.equal(result.browser.expectedReopenRecovered,false);
});
