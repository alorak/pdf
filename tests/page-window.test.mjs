import test from "node:test";
import assert from "node:assert/strict";
import { pageOffsets, pageIndexAtOffset, pageWindow, pageSpacerHeights } from "../src/page-window.js";

test("virtual page offsets preserve the full scroll height with gaps and mixed dimensions", () => {
  const offsets = pageOffsets([100, 150, 80, 120, 90], 2, 40);
  assert.deepEqual(offsets, [0, 242, 584, 786, 1068, 1250]);
  assert.equal(pageIndexAtOffset(offsets, 0), 0);
  assert.equal(pageIndexAtOffset(offsets, 300), 1);
  assert.equal(pageIndexAtOffset(offsets, 1209), 4);
  assert.equal(pageIndexAtOffset(offsets, 2000), 4);
  const { before, after } = pageSpacerHeights(offsets, 1, 3, 40);
  assert.equal(before, 202);
  assert.equal(after, 464);
  // Top spacer + gap + rendered shells + gap + bottom spacer = full document height.
  assert.equal(before + 40 + (342-40) + 40 + (202-40) + 40 + after, offsets[5]);
});

test("virtual page window only includes the scroll area and overscan", () => {
  const offsets = pageOffsets(Array(5000).fill(842), 1, 40);
  const top = pageWindow(offsets, 0, 900, 1300);
  assert.equal(top.start, 0);
  assert.ok(top.end < 8);
  const middle = pageWindow(offsets, offsets[2400], 900, 1300);
  assert.ok(middle.start < 2400);
  assert.ok(middle.end > 2400);
  assert.ok(middle.end - middle.start < 20);
  const last = pageWindow(offsets, offsets[4999], 900, 1300);
  assert.equal(last.end, 5000);
  assert.ok(last.start > 4990);
  const empty = pageWindow([0], 0, 900);
  assert.deepEqual(empty, { start: 0, end: 0, before: 0, after: 0 });
});

test("zero-gap full-height mode and tiny pages cannot miss the visible viewport", () => {
  const noGap = pageOffsets([50, 50, 50], 1, 0);
  assert.deepEqual(noGap, [0, 52, 104, 156]);
  assert.deepEqual(pageSpacerHeights(noGap, 1, 2, 0), { before: 52, after: 52 });
  const small = pageOffsets(Array(1000).fill(5), 0.2, 0);
  const window = pageWindow(small, 300, 900, 100, 80);
  assert.ok(window.end - window.start >= 300, "all visible pages must be kept if viewport exceeds window target");
});
