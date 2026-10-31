import test from "node:test";
import assert from "node:assert/strict";
import { installMapUpsertPolyfills } from "../src/pdfjs-compat.js";

test("legacy Map receives methods without altering present keys or recomputing values", () => {
  class OldMap extends Map {}
  Object.defineProperties(OldMap.prototype, {
    getOrInsert: { configurable:true, value:undefined },
    getOrInsertComputed: { configurable:true, value:undefined },
  });
  installMapUpsertPolyfills({ mapPrototype:OldMap.prototype, weakMapPrototype:OldMap.prototype });
  const map=new OldMap([["cached",undefined]]);
  let calls=0;
  assert.equal(map.getOrInsertComputed("cached",()=>{calls++; return 10}),undefined);
  assert.equal(calls,0);
  assert.equal(map.getOrInsert("cached",99),undefined);
  assert.equal(map.getOrInsertComputed("new",key=>{calls++;return key.toUpperCase()}),"NEW");
  assert.equal(map.get("new"),"NEW");
  assert.equal(calls,1);
  assert.equal(Object.keys(OldMap.prototype).includes("getOrInsertComputed"),false);
});
test("missing methods on a legacy WeakMap preserve keys and lazy factory calls", () => {
  class OldWeakMap extends WeakMap {}
  Object.defineProperties(OldWeakMap.prototype, {
    getOrInsert: { configurable:true,value:undefined },
    getOrInsertComputed: { configurable:true,value:undefined },
  });
  installMapUpsertPolyfills({mapPrototype:OldWeakMap.prototype,weakMapPrototype:OldWeakMap.prototype});
  const weak=new OldWeakMap();
  const key={};
  const value={pass:true};
  assert.equal(weak.getOrInsertComputed(key,()=>value),value);
  assert.equal(weak.getOrInsertComputed(key,()=>{throw Error("unexpected")}),value);
});
test("upsert polyfills are idempotent and never override native implementations",()=>{
  const proto={
    getOrInsert(){ return "native"; },
    getOrInsertComputed(){ return "native computed"; },
  };
  const existing=proto.getOrInsertComputed;
  installMapUpsertPolyfills({mapPrototype:proto,weakMapPrototype:proto});
  assert.equal(proto.getOrInsertComputed,existing);
});
