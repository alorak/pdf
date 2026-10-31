import test from "node:test";
import assert from "node:assert/strict";
import { ensurePdfJsMapCompatibility } from "../src/pdfjs-compat.js";

test("PDF.js Map upsert compatibility keeps existing entries and handles computed values", () => {
  const example = new Map([["existing", undefined]]);
  let calls = 0;
  assert.equal(example.getOrInsert("existing", 7), undefined);
  assert.equal(example.getOrInsertComputed("existing", () => { calls++; return 7; }), undefined);
  assert.equal(calls, 0);
  assert.equal(example.getOrInsert("fallback", 17), 17);
  assert.equal(example.getOrInsertComputed("computed", key => {
    calls++;
    assert.equal(key, "computed");
    return { page: 4 };
  }).page, 4);
  assert.equal(example.getOrInsertComputed("computed", () => { calls++; }), example.get("computed"));
  assert.equal(calls, 1);
});

test("compatibility does not override native methods and validates callbacks", () => {
  const existing = function nativeLike() {};
  const prototype = { getOrInsertComputed: existing };
  ensurePdfJsMapCompatibility(prototype);
  assert.equal(prototype.getOrInsertComputed, existing);
  const map = new Map();
  assert.throws(() => map.getOrInsertComputed("bad", null), TypeError);
  assert.equal(map.has("bad"), false);
  assert.throws(() => map.getOrInsertComputed("boom", () => { throw new Error("boom"); }), /boom/);
  assert.equal(map.has("boom"), false);
});
