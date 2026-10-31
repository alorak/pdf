import test from "node:test";
import assert from "node:assert/strict";
import { classifyLibraryPdfs, measureLocalStorage, formatBytes, libraryWorkspaceSlots, libraryBookmarkSummary, paginateLibraryBookmarkPages } from "../src/library-utils.js";
import { MAX_WORKSPACES } from "../src/workspace-store.js";

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

test("Library always displays twenty slots including uncreated and empty workspaces", () => {
  const state = {
    items: [
      { id: 1, fileName: "sample.pdf" },
      { id: 3, fileName: "" },
    ],
    nextId: 4,
  };
  const slots = libraryWorkspaceSlots(state);
  assert.equal(slots.length, MAX_WORKSPACES);
  assert.deepEqual(slots.map((slot) => slot.id), [1, 3, ...Array.from({ length: 18 }, (_, index) => index + 4)]);
  assert.equal(slots[0].workspace.fileName, "sample.pdf");
  assert.equal(slots[1].workspace.fileName, "");
  assert.ok(slots.slice(2).every((slot) => slot.workspace === null));
  assert.equal(state.items.length, 2, "the Library must not create workspace records on view");
});

test("Library shows exactly twenty occupied slots when the maximum is reached", () => {
  const state = {
    items: Array.from({ length: MAX_WORKSPACES }, (_, index) => ({ id: index + 1, fileName: "" })),
    nextId: 21,
  };
  const slots = libraryWorkspaceSlots(state);
  assert.equal(slots.length, MAX_WORKSPACES);
  assert.equal(slots.filter((slot) => !slot.workspace).length, 0);
});

test("Library preserves workspace IDs and order across the two groups of ten", () => {
  const state = {
    items: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, fileName: index % 2 ? "" : `file-${index + 1}.pdf` })),
    nextId: 13,
  };
  const slots = libraryWorkspaceSlots(state);
  assert.deepEqual(slots.slice(0, 10).map((slot) => slot.id), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(slots.slice(10).map((slot) => slot.id), [11,12,13,14,15,16,17,18,19,20]);
  assert.ok(slots.slice(12).every((slot) => slot.workspace === null));
});

test("Library bookmark badge counts page and text bookmarks for the current PDF", () => {
  const workspace = {
    fileName: "active.pdf",
    notes: [
      { id: "p3", kind: "page", page: 3, fileName: "active.pdf" },
      { id: "t3", kind: "text", page: 3, fileName: "active.pdf", text: "Important observation" },
      { id: "t3b", kind: "text", page: 3, fileName: "active.pdf", text: "Another note" },
      { id: "p8", kind: "page", page: 8, fileName: "active.pdf" },
      { id: "old", kind: "page", page: 11, fileName: "old.pdf" },
      { id: "invalid", kind: "text", page: null, fileName: "active.pdf", text: "Not navigable" },
    ],
    bookmarkOrder: [8, 3],
  };
  const summary = libraryBookmarkSummary(workspace);
  assert.equal(summary.count, 4);
  assert.deepEqual(summary.pages.map((entry) => entry.page), [8, 3]);
  assert.equal(summary.pages[1].pageBookmarks, 1);
  assert.equal(summary.pages[1].textNotes, 2);
  assert.equal(summary.pages[1].preview, "Important observation");
  assert.equal(workspace.notes.length, 6, "source bookmarks must not be modified");
});

test("Library bookmark modal lists five distinct pages at a time", () => {
  const workspace = {
    fileName: "guide.pdf",
    bookmarkOrder: [],
    notes: Array.from({ length: 12 }, (_, index) => ({
      id: `p-${index + 1}`, kind: "page", page: index + 1, fileName: "guide.pdf",
    })),
  };
  const pages = libraryBookmarkSummary(workspace).pages;
  const first = paginateLibraryBookmarkPages(pages, 0);
  const second = paginateLibraryBookmarkPages(pages, 1);
  const third = paginateLibraryBookmarkPages(pages, 2);
  assert.equal(first.totalPages, 3);
  assert.deepEqual(first.items.map((entry) => entry.page), [1, 2, 3, 4, 5]);
  assert.deepEqual(second.items.map((entry) => entry.page), [6, 7, 8, 9, 10]);
  assert.deepEqual(third.items.map((entry) => entry.page), [11, 12]);
  assert.equal(paginateLibraryBookmarkPages(pages, 99).pageIndex, 2);
  assert.equal(paginateLibraryBookmarkPages(pages, -1).pageIndex, 0);
});

test("Library bookmark modal handles empty and mismatched PDFs", () => {
  assert.deepEqual(libraryBookmarkSummary({ fileName: "", notes: [] }), { count: 0, pages: [] });
  assert.deepEqual(libraryBookmarkSummary(null), { count: 0, pages: [] });
  const workspace = {
    fileName: "current.pdf", notes: [{ kind: "page", page: 2, fileName: "replaced.pdf" }],
  };
  assert.equal(libraryBookmarkSummary(workspace).count, 0);
  const empty = paginateLibraryBookmarkPages([], 0);
  assert.equal(empty.totalPages, 1);
  assert.deepEqual(empty.items, []);
});
