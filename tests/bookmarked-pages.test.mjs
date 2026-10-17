import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, saveSelectedText, removeSelectedText, activeWorkspace, bookmarkedPageNumbers,
} from "../src/workspace-store.js";

test("bookmarks show one thumbnail per page in ascending order", () => {
  let workspaces = initialWorkspaces();
  workspaces = saveSelectedText(workspaces, { id: "one", text: "İlk kayıt", page: 7, fileName: "study.pdf" });
  workspaces = saveSelectedText(workspaces, { id: "two", text: "İkinci kayıt", page: 2, fileName: "study.pdf" });
  workspaces = saveSelectedText(workspaces, { id: "three", text: "Aynı sayfadaki kayıt", page: 7, fileName: "study.pdf" });
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(workspaces), "study.pdf", 50), [2, 7]);
});

test("bookmarks are isolated by PDF and reject unknown or out-of-range pages", () => {
  const workspace = {
    notes: [
      { text: "Bir", page: 1, fileName: "first.pdf" },
      { text: "Başka dosya", page: 3, fileName: "second.pdf" },
      { text: "İşaretlenmeyen", page: null, fileName: "first.pdf" },
      { text: "Sınır dışı", page: 60, fileName: "first.pdf" },
    ],
  };
  assert.deepEqual(bookmarkedPageNumbers(workspace, "first.pdf", 10), [1]);
  assert.deepEqual(bookmarkedPageNumbers(workspace, "second.pdf", 10), [3]);
  assert.deepEqual(bookmarkedPageNumbers(workspace, "", 10), []);
  assert.deepEqual(bookmarkedPageNumbers(workspace, "first.pdf", 0), []);
});

test("deleting the last saved selection for a page removes its bookmark", () => {
  let workspaces = initialWorkspaces();
  workspaces = saveSelectedText(workspaces, { id: "only", text: "Tek kayıt", page: 4, fileName: "study.pdf" });
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(workspaces), "study.pdf", 10), [4]);
  workspaces = removeSelectedText(workspaces, "only");
  assert.deepEqual(bookmarkedPageNumbers(activeWorkspace(workspaces), "study.pdf", 10), []);
});
