import test from "node:test";
import assert from "node:assert/strict";
import { thumbnailWindow, thumbnailScrollOffset } from "../src/thumbnail-window.js";

test("vertical 5000 thumbnail list keeps exactly the same scroll extent with bounded DOM", () => {
  const size = 185, gap = 15, count = 5000;
  for (const scroll of [0, 400, 300000, 999800]) {
    const window = thumbnailWindow(count, scroll, 800, size, gap);
    assert.ok(window.end - window.start > 0 && window.end - window.start <= 80);
    const sum = window.before + (window.start ? gap : 0) +
      (window.end - window.start) * size + (window.end - window.start - 1) * gap +
      (window.end < count ? gap + window.after : 0);
    assert.equal(sum, window.total);
  }
  assert.equal(thumbnailScrollOffset(4999, size, gap), 999800);
});

test("horizontal layout preserves width and order at middle and end", () => {
  const size = 92, gap = 15, count = 1000;
  const middle = thumbnailWindow(count, 53700, 1000, size, gap);
  assert.ok(middle.start <= 500 && middle.end > 500);
  assert.ok(middle.end - middle.start <= 80);
  const last = thumbnailWindow(count, 106500, 1000, size, gap);
  assert.equal(last.end, count);
  assert.deepEqual(thumbnailWindow(0, 0, 100, 92, 15),
    { start: 0, end: 0, before: 0, after: 0, total: 0 });
});

test("validation refuses invalid geometry", () => {
  assert.throws(() => thumbnailWindow(5, 0, 100, 0, 15), RangeError);
  assert.throws(() => thumbnailWindow(-1, 0, 100, 92, 15), RangeError);
});
