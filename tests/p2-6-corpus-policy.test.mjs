
import test from "node:test";
import assert from "node:assert/strict";
import { validateCorpusManifest, corpusFilePath } from "../src/p2-6-corpus-policy.js";

const sample = () => ({version:1,cases:[{id:"scan_cc0",file:"fixtures/scan.pdf",
  sha256:"a".repeat(64),rightsConfirmed:true,rightsBasis:"CC0 public-domain release",
  text:"none",minImagePages:1}]});

test("P2.6 local real-PDF manifest enforces provenance, hashes and bounded cases",()=>{
  assert.equal(validateCorpusManifest(sample()).length,1);
  for(const mutate of [
    item=>{item.rightsConfirmed=false;},
    item=>{item.sha256="";},
    item=>{item.id="../escape";},
    item=>{item.file="../other.pdf";},
    item=>{item.file="/tmp/secret.pdf";},
    item=>{item.text="some";},
    item=>{item.minImagePages=999;},
  ]) {
    const bad=sample();mutate(bad.cases[0]);
    assert.throws(()=>validateCorpusManifest(bad));
  }
  const duplicate=sample();duplicate.cases.push({...duplicate.cases[0]});
  assert.throws(()=>validateCorpusManifest(duplicate));
  assert.throws(()=>validateCorpusManifest({version:1,cases:[]}));
});

test("P2.6 corpus path never leaves the declared root",()=>{
  assert.equal(corpusFilePath("/tmp/corpus","scans/one.pdf"),"/tmp/corpus/scans/one.pdf");
  assert.throws(()=>corpusFilePath("/tmp/corpus","../one.pdf"));
  assert.throws(()=>corpusFilePath("/tmp/corpus","/private/one.pdf"));
  assert.throws(()=>corpusFilePath("/tmp/corpus","other.txt"));
});
