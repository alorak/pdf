import test from "node:test";
import assert from "node:assert/strict";
import {
  clampScale, clampPage, fitScale, chooseDeviceScale, readableSize,
} from "../src/viewer-math.js";

test("zoom has finite limits", () => {
  assert.equal(clampScale(0), 0.2);
  assert.equal(clampScale(99), 6);
  assert.equal(clampScale("1.25"), 1.25);
  assert.equal(clampScale(NaN), 1);
});

test("width, height and full-page fit use available space", () => {
  const area = { width: 1000, height: 800 };
  const page = { width: 600, height: 1000 };
  assert.ok(Math.abs(fitScale("width", area, page) - 928 / 600) < 0.00001);
  assert.ok(Math.abs(fitScale("height", area, page) - 728 / 1000) < 0.00001);
  assert.ok(Math.abs(fitScale("page", area, page) - 728 / 1000) < 0.00001);
});

test("fit and page navigation never generate invalid positions", () => {
  assert.equal(fitScale("page", { width: 0, height: 0 }, { width: 0, height: 0 }), 1);
  assert.equal(clampPage(-8, 40), 1);
  assert.equal(clampPage(100, 40), 40);
  assert.equal(clampPage("7", 40), 7);
  assert.equal(clampPage("invalid", 40), 1);
});

test("render resolution is capped for very large pages", () => {
  assert.equal(chooseDeviceScale(1000, 1000, 3), 2);
  const scale = chooseDeviceScale(8000, 8000, 2);
  assert.ok(8000 * 8000 * scale ** 2 <= 12_000_001);
  assert.equal(chooseDeviceScale(100, 100, 1), 1);
  assert.ok(chooseDeviceScale(80000, 300, 2) * 80000 <= 16384);
});

test("file sizes are human-readable", () => {
  assert.equal(readableSize(500), "500 B");
  assert.equal(readableSize(1048576), "1.0 MB");
});
