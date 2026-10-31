import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspaces, savePageBookmark, setWorkspaceFile } from "../src/workspace-store.js";
import {
  initializeWorkspaceData, readWorkspaceData, saveWorkspaceData,
  writeWorkspaceAndPdf, getAllStoredPdfs, readWorkspaceBundle, restoreWorkspaceBackup,
} from "../src/workspace-data.js";

/** Small IDB transaction simulator that commits all staged stores together. */
class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
    this.failPut = false;
  }
  createObjectStore(name, { keyPath }) {
    this.stores.set(name, { keyPath, data: new Map() });
  }
  close() {}
  transaction(names, mode) {
    const namesList = Array.isArray(names) ? names : [names];
    const changes = new Map(namesList.map(name =>
      [name, new Map(this.stores.get(name).data)]));
    let pending = 0, aborted = false, completed = false;
    const database = this;
    const tx = {
      error: null, oncomplete: null, onabort: null, onerror: null,
      abort() {
        if (aborted || completed) return;
        aborted = true;
        queueMicrotask(() => tx.onabort?.());
      },
      objectStore(name) {
        const staged = changes.get(name);
        if (!staged) throw new Error("Store missing in transaction");
        const { keyPath } = database.stores.get(name);
        function requestFor(action) {
          pending++;
          const request = { result: undefined, error: null, onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (aborted) return;
            try {
              request.result = action();
              request.onsuccess?.();
            } catch (error) {
              request.error = error;
              tx.error = error;
              request.onerror?.();
              tx.abort();
            }
            pending--;
            if (pending === 0) queueMicrotask(() => {
              if (aborted || completed || pending) return;
              completed = true;
              for (const [storeName, map] of changes) database.stores.get(storeName).data = map;
              tx.oncomplete?.();
            });
          });
          return request;
        }
        return {
          get(id) { return requestFor(() => staged.get(id)); },
          put(value) { return requestFor(() => {
            if (database.failPut) throw new Error("QuotaExceededError");
            staged.set(value[keyPath], value);
            return value[keyPath];
          }); },
          delete(id) { return requestFor(() => { staged.delete(id); }); },
          clear() { return requestFor(() => { staged.clear(); }); },
          openCursor() {
            const keys = [...staged.keys()];
            const request = { result: null, onsuccess: null, onerror: null };
            let index = 0;
            const dispatch = () => {
              pending++;
              queueMicrotask(() => {
                if (aborted) return;
                const key = keys[index];
                request.result = key === undefined ? null : {
                  value: staged.get(key), continue() { index++; dispatch(); },
                };
                request.onsuccess?.();
                pending--;
                if (pending === 0) queueMicrotask(() => {
                  if (aborted || completed || pending) return;
                  completed = true;
                  for (const [storeName, map] of changes) database.stores.get(storeName).data = map;
                  tx.oncomplete?.();
                });
              });
            };
            dispatch();
            return request;
          },
        };
      },
    };
    return tx;
  }
}
const db = new FakeDatabase();
globalThis.indexedDB = {
  open(_name, version) {
    const request = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      if (version !== 2) throw new Error("Expected IDB v2");
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};

test("legacy migration commits workspace bookmarks without replacing PDF store", async () => {
  let state = setWorkspaceFile(initialWorkspaces(), "legacy.pdf");
  state = savePageBookmark(state, { id: "bm", page: 7, fileName: "legacy.pdf", savedAt: 100 });
  const migrated = await initializeWorkspaceData(JSON.stringify(state));
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.revision, 1);
  assert.equal(migrated.state.items[0].notes[0].page, 7);
  assert.ok(db.stores.has("workspace-metadata"));
  assert.ok(db.stores.has("pdfs"));
  const again = await initializeWorkspaceData("{}");
  assert.equal(again.migrated, false);
  assert.equal(again.state.items[0].notes[0].page, 7);
});

test("revision conflicts reject stale-tab metadata writes", async () => {
  const previous = await readWorkspaceData();
  const newer = { ...previous.state, nextId: previous.state.nextId + 1 };
  const revision = await saveWorkspaceData(newer, previous.revision);
  assert.equal(revision, 2);
  await assert.rejects(saveWorkspaceData(previous.state, previous.revision), /başka bir sekmede/);
  assert.equal((await readWorkspaceData()).state.nextId, newer.nextId);
});

test("PDF and bookmarks replace atomically, with rollback on quota failure", async () => {
  const before = await readWorkspaceData();
  const file = new Blob(["%PDF-new"]);
  file.name = "new.pdf";
  file.lastModified = 123;
  const next = setWorkspaceFile(before.state, "new.pdf");
  db.failPut = true;
  await assert.rejects(writeWorkspaceAndPdf(next, before.revision, { put: { id: 1, file } }), /QuotaExceededError/);
  db.failPut = false;
  const afterFailure = await readWorkspaceData();
  assert.equal(afterFailure.revision, before.revision);
  assert.equal(afterFailure.state.items[0].fileName, "legacy.pdf");
  const revision = await writeWorkspaceAndPdf(next, before.revision, { put: { id: 1, file } });
  assert.equal(revision, before.revision + 1);
  assert.equal((await getAllStoredPdfs())[0].name, "new.pdf");
  assert.equal((await readWorkspaceData()).state.items[0].fileName, "new.pdf");
});

test("full backup restore replaces PDFs and metadata in one transaction", async () => {
  const before = await readWorkspaceData();
  const other = new Blob(["%PDF-restored"]);
  const parsed = {
    state: before.state,
    records: [{ workspaceId: 5, name: "restored.pdf", lastModified: 5, type: "application/pdf", blob: other }],
  };
  const rev = await restoreWorkspaceBackup(parsed, before.revision);
  assert.equal(rev, before.revision + 1);
  assert.deepEqual((await getAllStoredPdfs()).map(x => x.workspaceId), [5]);
  const latest = await readWorkspaceData();
  assert.equal(latest.revision, rev);
});

test("consistent snapshot returns metadata and PDF records from one readonly transaction", async () => {
  const bundle = await readWorkspaceBundle();
  const latest = await readWorkspaceData();
  assert.equal(bundle.revision, latest.revision);
  assert.deepEqual(bundle.state, latest.state);
  assert.deepEqual(bundle.records.map(record => record.workspaceId), [5]);
});
