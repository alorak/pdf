import test from "node:test";
import assert from "node:assert/strict";
import { findTextMatches, searchableText, evictDistantPages, flattenOutline } from "../src/pdf-navigation.js";

test("PDF search finds text without runaway memory", () => {
  const content = searchableText({ items: [
    { str: "SURROGATE", hasEOL: false }, { str: "MODEL", hasEOL: true },
    { str: "and validation" },
  ] });
  assert.match(content, /SURROGATE MODEL/);
  assert.deepEqual(findTextMatches(content, "surrogate model", 8).map(item => item.page), [8]);
  assert.equal(findTextMatches("test TEST test", "test", 1, 2).length, 2);
  assert.deepEqual(findTextMatches("alpha", "", 1), []);
  assert.deepEqual(findTextMatches("alpha", "X".repeat(161), 1), []);
  assert.equal(findTextMatches("İstanbul", "istanbul", 1).length, 1);
});

test("rendered page and thumbnail eviction protects visible items", () => {
  const rendered = Array.from({ length: 60 }, (_, index) => index);
  const evicted = evictDistantPages(rendered, new Set([1, 2, 3]), 2, 12);
  assert.equal(evicted.length, 48);
  assert.equal(evicted.includes(2), false);
  assert.equal(evicted.includes(3), false);
  assert.equal(evicted.includes(59), true);
  assert.deepEqual(evictDistantPages([1, 2], new Set([2]), 2, 12), []);
});

test("PDF outline depth/length capped and nested section titles retained", () => {
  const outline = [{ title: "Chapter 1", dest: [{ num: 1 }, { name: "Fit" }], items: [
    { title: "Methods", dest: "methods", items: [{ title: "Data", dest: "data" }] },
  ] }, { title: "Appendix", url: "https://example.com" }];
  const flattened = flattenOutline(outline);
  assert.deepEqual(flattened.map(item => [item.title, item.depth]),
    [["Chapter 1", 0], ["Methods", 1], ["Data", 2], ["Appendix", 0]]);
  assert.equal(flattenOutline(outline, 2).length, 2);
  assert.equal(flattenOutline(outline, 10, 0).length, 2);
});
