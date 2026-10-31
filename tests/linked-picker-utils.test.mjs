import test from "node:test";
import assert from "node:assert/strict";
import { linkedPickerWindow, isOutsideDialogRect } from "../src/linked-picker-utils.js";

test("a long PDF shows exactly twelve preview pages per group", () => {
  assert.deepEqual(linkedPickerWindow(35, 0), { index: 0, groups: 3, first: 1, last: 12 });
  assert.deepEqual(linkedPickerWindow(35, 1), { index: 1, groups: 3, first: 13, last: 24 });
  assert.deepEqual(linkedPickerWindow(35, 2), { index: 2, groups: 3, first: 25, last: 35 });
  assert.deepEqual(linkedPickerWindow(35, 50), { index: 2, groups: 3, first: 25, last: 35 });
  assert.deepEqual(linkedPickerWindow(35, -9), { index: 0, groups: 3, first: 1, last: 12 });
});

test("picker handles single-page PDFs, exact multiples, and empty state", () => {
  assert.deepEqual(linkedPickerWindow(1, 0), { index: 0, groups: 1, first: 1, last: 1 });
  assert.deepEqual(linkedPickerWindow(24, 1), { index: 1, groups: 2, first: 13, last: 24 });
  assert.deepEqual(linkedPickerWindow(0, 0), { index: 0, groups: 1, first: 0, last: 0 });
  assert.throws(() => linkedPickerWindow(-1, 0), /Invalid/);
  assert.throws(() => linkedPickerWindow(10, 0, 0), /Invalid/);
});

test("backdrop detection ignores clicks on modal padding or inside contents", () => {
  const rect = { left: 100, top: 80, right: 500, bottom: 450 };
  assert.equal(isOutsideDialogRect(110, 90, rect), false);
  assert.equal(isOutsideDialogRect(490, 440, rect), false);
  assert.equal(isOutsideDialogRect(99, 110, rect), true);
  assert.equal(isOutsideDialogRect(501, 110, rect), true);
  assert.equal(isOutsideDialogRect(150, 79, rect), true);
  assert.equal(isOutsideDialogRect(150, 451, rect), true);
});
