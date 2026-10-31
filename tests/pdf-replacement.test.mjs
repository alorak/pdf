import test from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkspaces, addWorkspace, switchWorkspace, activeWorkspace,
  setWorkspaceFile, savePageBookmark, saveSelectedText,
} from "../src/workspace-store.js";
import { samePdfContent, replacementWorkspaceState, makePdfMetadataCommit } from "../src/pdf-replacement.js";
import { replaceWorkspacePdfInDatabase } from "../src/pdf-storage.js";

function mockPdf(name, content, lastModified = 123) {
  const blob = new Blob([content], { type: "application/pdf" });
  blob.name = name;
  blob.lastModified = lastModified;
  return blob;
}

function workspaceFixture() {
  let state = setWorkspaceFile(initialWorkspaces(), "original.pdf");
  state = savePageBookmark(state, { id: "bookmark-3", page: 3, fileName: "original.pdf", savedAt: 1 });
  state = saveSelectedText(state, {
    id: "highlight", fileName: "original.pdf", page: 2, text: "Important", savedAt: 2, rects: [],
  });
  state = addWorkspace(state);
  state = setWorkspaceFile(state, "other.pdf");
  state = savePageBookmark(state, { id: "other-bookmark", page: 4, fileName: "other.pdf", savedAt: 3 });
  return switchWorkspace(state, 1);
}

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem(key) { return items.get(key) ?? null; },
    setItem(key, value) { items.set(key, String(value)); },
    removeItem(key) { items.delete(key); },
  };
}

/** Mimic the key IDB transaction guarantee: abort retains the old record. */
function mockDatabase(previousFile, { lateAbort = false } = {}) {
  let stored = { workspaceId: 1, name: previousFile.name, blob: previousFile };
  let aborted = false;
  return {
    get record() { return stored; },
    get aborted() { return aborted; },
    transaction() {
      let tx;
      tx = {
        error: null,
        objectStore() {
          return {
            put(next) {
              const request = { result: 1, error: null };
              queueMicrotask(() => {
                request.onsuccess?.();
                if (aborted) return;
                if (lateAbort) {
                  aborted = true;
                  tx.onabort?.();
                } else {
                  stored = next;
                  tx.oncomplete?.();
                }
              });
              return request;
            },
          };
        },
        abort() {
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
      };
      return tx;
    },
  };
}

test("identical PDFs keep bookmarks even when file name or timestamp differ", async () => {
  const a = mockPdf("original.pdf", "%PDF-one", 101);
  const b = mockPdf("renamed.pdf", "%PDF-one", 202);
  const c = mockPdf("original.pdf", "%PDF-two", 101);
  assert.equal(await samePdfContent(a, b, 2), true);
  assert.equal(await samePdfContent(a, c, 2), false);
  assert.equal(await samePdfContent(a, mockPdf("original.pdf", "longer file")), false);
  assert.equal(await samePdfContent(null, b), false);
  await assert.rejects(samePdfContent(a, b, 0), /block size/);
});

test("planned replacement removes bookmarks only in the target workspace", () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  assert.equal(activeWorkspace(before).fileName, "original.pdf");
  assert.equal(activeWorkspace(before).notes.length, 2);
  assert.equal(activeWorkspace(after).fileName, "updated.pdf");
  assert.deepEqual(activeWorkspace(after).notes, []);
  assert.equal(after.items.find(item => item.id === 2).notes[0].id, "other-bookmark");
  assert.equal(before.items.find(item => item.id === 2), after.items.find(item => item.id === 2));
});

test("metadata quota error aborts PDF put, retaining original bytes and bookmarks", async () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  const oldFile = mockPdf("original.pdf", "%PDF-old");
  const db = mockDatabase(oldFile);
  const storage = memoryStorage({ workspaces: JSON.stringify(before) });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const meta = makePdfMetadataCommit(storage, "workspaces", before, after);
  await assert.rejects(replaceWorkspacePdfInDatabase(db, 1, mockPdf("updated.pdf", "%PDF-new"), meta), /QuotaExceededError/);
  assert.equal(db.aborted, true);
  assert.equal(db.record.blob, oldFile);
  assert.equal(JSON.parse(storage.getItem("workspaces")).items[0].notes.length, 2);
});

test("successful replacement switches PDF and clears only selected workspace bookmarks", async () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  const newFile = mockPdf("updated.pdf", "%PDF-new");
  const storage = memoryStorage({ workspaces: JSON.stringify(before) });
  const db = mockDatabase(mockPdf("original.pdf", "%PDF-old"));
  const meta = makePdfMetadataCommit(storage, "workspaces", before, after);
  await replaceWorkspacePdfInDatabase(db, 1, newFile, meta);
  assert.equal(db.record.blob, newFile);
  const saved = JSON.parse(storage.getItem("workspaces"));
  assert.equal(saved.items[0].fileName, "updated.pdf");
  assert.deepEqual(saved.items[0].notes, []);
  assert.equal(saved.items[1].notes[0].id, "other-bookmark");
});

test("late IDB abort compensates localStorage, retaining both old file and bookmarks", async () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  const oldFile = mockPdf("original.pdf", "%PDF-old");
  const storage = memoryStorage({ workspaces: JSON.stringify(before) });
  const db = mockDatabase(oldFile, { lateAbort: true });
  await assert.rejects(replaceWorkspacePdfInDatabase(db, 1, mockPdf("updated.pdf", "%PDF-new"),
    makePdfMetadataCommit(storage, "workspaces", before, after)));
  assert.equal(db.record.blob, oldFile);
  assert.deepEqual(JSON.parse(storage.getItem("workspaces")), before);
});

test("concurrent metadata edits do not silently overwrite bookmarks from another tab", async () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  const storage = memoryStorage({ workspaces: JSON.stringify(before) });
  const meta = makePdfMetadataCommit(storage, "workspaces", before, after);
  storage.setItem("workspaces", '{"newer":"tab"}');
  const db = mockDatabase(mockPdf("original.pdf", "%PDF-old"));
  await assert.rejects(replaceWorkspacePdfInDatabase(db, 1, mockPdf("updated.pdf", "%PDF-new"), meta), /başka bir sekmede/);
  assert.equal(db.record.name, "original.pdf");
  assert.equal(storage.getItem("workspaces"), '{"newer":"tab"}');
});

test("metadata compensation never overwrites newer changes on a late abort", async () => {
  const before = workspaceFixture();
  const after = replacementWorkspaceState(before, 1, "updated.pdf");
  const storage = memoryStorage({ workspaces: JSON.stringify(before) });
  const oldFile = mockPdf("original.pdf", "%PDF-old");
  const db = mockDatabase(oldFile, { lateAbort: true });
  const metadata = makePdfMetadataCommit(storage, "workspaces", before, after);
  const oldCommit = metadata.commit;
  metadata.commit = () => {
    oldCommit();
    storage.setItem("workspaces", '{"newer":"tab"}');
  };
  await assert.rejects(replaceWorkspacePdfInDatabase(db, 1, mockPdf("updated.pdf", "%PDF-new"), metadata), AggregateError);
  assert.equal(db.record.blob, oldFile);
  assert.equal(storage.getItem("workspaces"), '{"newer":"tab"}');
});
