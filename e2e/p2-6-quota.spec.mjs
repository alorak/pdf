
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createPdfFixture } from "../tests/helpers/pdf-fixtures.mjs";

const origin = "http://127.0.0.1:5173";
const original = createPdfFixture(7, { prefix: "P26 ORIGINAL" });
const replacement = createPdfFixture(9, { prefix: "P26 REPLACED" });
const originalSha256 = createHash("sha256").update(original).digest("hex");

async function readSnapshot(page) {
  return page.evaluate(async () => {
    const { readWorkspaceBundle } = await import("/pdf/src/workspace-data.js");
    const data = await readWorkspaceBundle();
    const record = data.records.find(r => r.workspaceId === 1);
    const bytes = record ? new Uint8Array(await record.blob.arrayBuffer()) : null;
    const sha = bytes ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(v => v.toString(16).padStart(2, "0")).join("") : null;
    const workspace = data.state.items.find(x => x.id === 1);
    return { revision: data.revision, sha256: sha, fileName: workspace.fileName,
      recordName: record?.name ?? null, pagesBookmarked: workspace.notes
        .filter(note => note.kind === "page").map(note => note.page) };
  });
}
async function seed(page) {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await page.evaluate(async bytes => {
    const { readWorkspaceData, writeWorkspaceAndPdf } = await import("/pdf/src/workspace-data.js");
    const { setWorkspaceFile, savePageBookmark } = await import("/pdf/src/workspace-store.js");
    const data = await readWorkspaceData();
    const next = savePageBookmark(setWorkspaceFile(data.state, "original.pdf"),
      { id: "p26-bookmark", kind: "page", page: 3, fileName: "original.pdf", savedAt: 111 });
    const file = new File([new Uint8Array(bytes)], "original.pdf",
      { type: "application/pdf", lastModified: 111 });
    await writeWorkspaceAndPdf(next, data.revision, { put: { id: 1, file } });
  }, [...original]);
  await page.reload();
  await expect(page.locator("#pageTotal")).toHaveText("7", { timeout: 30_000 });
  expect((await readSnapshot(page)).sha256).toBe(originalSha256);
}

async function quotaSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const initial = await cdp.send("Storage.getUsageAndQuota", { origin });
  const max = Math.max(256 * 1024, Math.ceil(initial.usage + 64 * 1024));
  await cdp.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: max });
  const active = await cdp.send("Storage.getUsageAndQuota", { origin });
  expect(active.overrideActive).toBe(true);
  return { cdp, initial, active };
}


async function probeActualQuota(page) {
  const quota = await quotaSession(page);
  let result;
  try {
    result = await page.evaluate(async () => {
      const { openDatabase } = await import("/pdf/src/pdf-storage.js");
      const db = await openDatabase();
      const bytes = new Uint8Array(12 * 1024 * 1024);
      let x = 0x12345678;
      for (let i = 0; i < bytes.length; i++) {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5; bytes[i] = x & 255;
      }
      const txResult = await new Promise(resolve => {
        const tx = db.transaction("pdfs", "readwrite");
        tx.objectStore("pdfs").put({ workspaceId: 999, name: "quota-probe.pdf",
          blob: new Blob([bytes], { type: "application/pdf" }), lastModified: 222 });
        tx.oncomplete = () => resolve({ enforced: false, outcome: "write-committed" });
        tx.onabort = () => resolve({ enforced: true, outcome: "native-IDB-abort",
          errorName: tx.error?.name ?? "AbortError" });
        tx.onerror = event => event.preventDefault();
      });
      // Probes must never leave orphaned PDF records.
      if (!txResult.enforced) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("pdfs", "readwrite");
          tx.objectStore("pdfs").delete(999);
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
      }
      return txResult;
    });
    return { ...result, overrideBytes: quota.active.quota,
      overrideActive: quota.active.overrideActive };
  } finally {
    await quota.cdp.send("Storage.overrideQuotaForOrigin", { origin });
    await quota.cdp.detach();
  }
}

async function attemptNativeTransactionAbort(page, kind) {
  return page.evaluate(async operation => {
    const { readWorkspaceData, writeWorkspaceAndPdf, restoreWorkspaceBackup } =
      await import("/pdf/src/workspace-data.js");
    const { setWorkspaceFile } = await import("/pdf/src/workspace-store.js");
    const current = await readWorkspaceData();
    const next = setWorkspaceFile(current.state, "oversized.pdf");
    const content = new Uint8Array(128 * 1024);
    const file = new File([content], "oversized.pdf",
      { type: "application/pdf", lastModified: 222 });
    const nativePut = IDBObjectStore.prototype.put;
    let abortTriggered = false;
    // Force a genuine browser IDBTransaction.abort() after a PDF Blob put is
    // queued, while the metadata and PDF write are in the SAME transaction.
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (!abortTriggered && this.name === "pdfs" && args[0]?.name === "oversized.pdf") {
        abortTriggered = true;
        const tx = this.transaction;
        queueMicrotask(() => { try { tx.abort(); } catch { /* already finished */ } });
      }
      return request;
    };
    try {
      if (operation === "write") {
        await writeWorkspaceAndPdf(next, current.revision, { put: { id: 1, file } });
      } else {
        await restoreWorkspaceBackup({
          state: next, records: [{ workspaceId: 1, name: file.name, type: file.type,
            lastModified: file.lastModified, blob: file }],
        }, current.revision);
      }
      return { rejected: false, abortTriggered, name: null };
    } catch (error) {
      return { rejected: true, abortTriggered, name: error.name };
    } finally {
      IDBObjectStore.prototype.put = nativePut;
    }
  }, kind);
}


for (const operation of ["write", "restore"]) {
  test("P2.6 native transaction abort and quota probe preserve PDF: " + operation, async ({ page }) => {
    await seed(page);
    const before = await readSnapshot(page);
    const quotaProbe = await probeActualQuota(page);
    expect(quotaProbe.overrideActive).toBe(true);
    const failure = await attemptNativeTransactionAbort(page, operation);
    expect(failure.abortTriggered, "a PDF put must trigger native IDBTransaction.abort()").toBe(true);
    expect(failure.rejected, "native transaction abort must fail closed").toBe(true);
    const afterFailure = await readSnapshot(page);
    expect(afterFailure).toEqual(before);
    await page.reload();
    await expect(page.locator("#pageTotal")).toHaveText("7", { timeout: 30_000 });
    expect(await readSnapshot(page)).toEqual(before);
    await page.evaluate(async ({ bytes, operation }) => {
      const { readWorkspaceData, writeWorkspaceAndPdf, restoreWorkspaceBackup } =
        await import("/pdf/src/workspace-data.js");
      const { setWorkspaceFile } = await import("/pdf/src/workspace-store.js");
      const current = await readWorkspaceData();
      const next = setWorkspaceFile(current.state, "recovered.pdf");
      const file = new File([new Uint8Array(bytes)], "recovered.pdf",
        { type: "application/pdf", lastModified: 333 });
      if (operation === "write") {
        await writeWorkspaceAndPdf(next, current.revision, { put: { id: 1, file } });
      } else {
        await restoreWorkspaceBackup({ state: next, records: [{ workspaceId: 1,
          name: file.name, type: file.type, lastModified: file.lastModified, blob: file }] },
          current.revision);
      }
    }, { bytes: [...replacement], operation });
    await page.reload();
    await expect(page.locator("#pageTotal")).toHaveText("9", { timeout: 30_000 });
    const recovered = await readSnapshot(page);
    expect(recovered.fileName).toBe("recovered.pdf");
    expect(recovered.sha256).toBe(createHash("sha256").update(replacement).digest("hex"));
    expect(recovered.revision).toBe(before.revision + 1);
    await mkdir("test-results/stress", { recursive: true });
    const report = { schema: 2, kind: "chromium-quota-probe-and-native-abort",
      operation, before, afterFailure, recovered, failure, quotaProbe, pass: true,
      note: "Quota probe may not be enforced by Chromium. Native transaction abort is deterministic." };
    await writeFile("test-results/stress/p2-6-quota-" + operation + ".json",
      JSON.stringify(report, null, 2));
    console.log("P2_6_NATIVE_ABORT_PASSED " + JSON.stringify({
      operation, failureName: failure.name, quotaEnforced: quotaProbe.enforced,
      originalSha256: before.sha256, finalRevision: recovered.revision,
    }));
  });
}
