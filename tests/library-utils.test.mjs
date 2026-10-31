import test from "node:test";
import assert from "node:assert/strict";
import { classifyLibraryPdfs, measureLocalStorage, formatBytes } from "../src/library-utils.js";

test("library matches PDF records by workspace ID and file name, never file name alone", () => {
  const records = [
    { workspaceId: 1, name: "same.pdf", size: 100 },
    { workspaceId: 2, name: "same.pdf", size: 200 },
    { workspaceId: 3, name: "old.pdf", size: 300 },
    { workspaceId: 99, name: "lost.pdf", size: 400 },
  ];
  const items = [
    { id: 1, fileName: "same.pdf" },
    { id: 2, fileName: "replaced.pdf" },
    { id: 3, fileName: "" },
  ];
  const classified = classifyLibraryPdfs(records, items);
  assert.deepEqual(classified.map((file) => file.orphan), [false, true, true, true]);
  assert.equal(classified[0].workspace.id, 1);
  assert.equal(classified[1].workspace.id, 2);
  assert.equal(classified[3].workspace, null);
  assert.equal(classified.reduce((total, item) => total + item.size, 0), 1000);
});

test("localStorage estimate includes every key and value in UTF-16 code units", () => {
  const data = new Map([["one", "abc"], ["π", "📄"]]);
  const storage = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
  };
  const result = measureLocalStorage(storage);
  assert.deepEqual(result, { keys: 2, bytes: 2 * (3 + 3 + 1 + 2) });
});

test("localStorage estimate handles disabled or inaccessible storage", () => {
  assert.equal(measureLocalStorage({ get length() { throw new Error("blocked"); } }), null);
});

test("readable byte format handles small and large files", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1048576), "1 MB");
  assert.equal(formatBytes(-1), "—");
});
