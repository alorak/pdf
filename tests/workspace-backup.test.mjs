import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspaces, addWorkspace, switchWorkspace, setWorkspaceFile, savePageBookmark, addLinkedWorkspacePages } from "../src/workspace-store.js";
import {
  createWorkspaceBackup, parseWorkspaceBackup, inspectWorkspaceIntegrity, BACKUP_MAGIC,
} from "../src/workspace-data.js";

function record(workspaceId, name, bytes, lastModified = 101) {
  return { workspaceId, name, lastModified, type: "application/pdf",
    blob: new Blob([bytes], { type: "application/pdf" }) };
}
function fixture() {
  let state = setWorkspaceFile(initialWorkspaces(), "lecture.pdf");
  state = savePageBookmark(state, { id: "page4", page: 4, fileName: "lecture.pdf", savedAt: 10 });
  state = addWorkspace(state);
  state = addLinkedWorkspacePages(state, {
    sourceWorkspaceId: 1, sourceFileName: "lecture.pdf", sourceSize: 6,
    sourceLastModified: 101, pages: [1, 3],
  });
  return state;
}

test("complete backup restores all PDFs, bookmarks and linked pages", async () => {
  const state = fixture();
  const records = [record(1, "lecture.pdf", "%PDF-1"), record(99, "orphan.pdf", "%PDF-2")];
  const file = await createWorkspaceBackup(state, records);
  const result = await parseWorkspaceBackup(file);
  assert.equal(result.state.items.length, 2);
  assert.equal(result.state.items[0].notes[0].page, 4);
  assert.deepEqual(result.state.items[1].linkedPages.map(p => p.page), [1, 3]);
  assert.deepEqual(result.records.map(p => p.workspaceId), [1, 99]);
  assert.deepEqual(
    [...new Uint8Array(await result.records[0].blob.arrayBuffer())],
    [...new TextEncoder().encode("%PDF-1")],
  );
});

test("backup detects corruption, truncation and unknown version", async () => {
  const good = await createWorkspaceBackup(fixture(), [record(1, "lecture.pdf", "%PDF-1")]);
  const bytes = new Uint8Array(await good.arrayBuffer());
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  await assert.rejects(parseWorkspaceBackup(new Blob([changed])), /bütünlük/);
  await assert.rejects(parseWorkspaceBackup(good.slice(0, good.size - 1)), /eksik/);
  const altered = bytes.slice();
  altered[0] ^= 0x7F;
  await assert.rejects(parseWorkspaceBackup(new Blob([altered])), /Geçersiz yedek/);
  assert.equal(BACKUP_MAGIC.length, 8);
});

test("integrity scanner reports missing PDFs, orphans and broken cross-workspace pages without deleting anything", async () => {
  const state = fixture();
  const original = [record(1, "lecture.pdf", "%PDF-1")];
  const good = await inspectWorkspaceIntegrity(state, original);
  assert.deepEqual(good.missing, []);
  assert.deepEqual(good.orphan, []);
  assert.deepEqual(good.brokenLinks, []);
  const damaged = await inspectWorkspaceIntegrity(state, [record(50, "orphan.pdf", "%PDF")]);
  assert.deepEqual(damaged.missing, [1]);
  assert.deepEqual(damaged.orphan, [50]);
  assert.equal(damaged.brokenLinks.length, 2);
  assert.equal(state.items[0].notes.length, 1);
});
