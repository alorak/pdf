
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

async function attemptOversizedWrite(page, kind) {
  return page.evaluate(async operation => {
    const { readWorkspaceData, writeWorkspaceAndPdf, restoreWorkspaceBackup } =
      await import("/pdf/src/workspace-data.js");
    const { setWorkspaceFile } = await import("/pdf/src/workspace-store.js");
    const current = await readWorkspaceData();
    const next = setWorkspaceFile(current.state, "oversized.pdf");
    const content = new Uint8Array(4 * 1024 * 1024);
    let x = 0x12345678;
    for (let i = 0; i < content.length; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; content[i] = x & 255;
    }
    const file = new File([content], "oversized.pdf", { type: "application/pdf", lastModified: 222 });
    try {
      if (operation === "write") {
        await writeWorkspaceAndPdf(next, current.revision, { put: { id: 1, file } });
      } else {
        await restoreWorkspaceBackup({
          state: next, records: [{ workspaceId: 1, name: file.name, type: file.type,
            lastModified: file.lastModified, blob: file }],
        }, current.revision);
      }
      return { rejected: false, name: null, message: "write unexpectedly succeeded" };
    } catch (error) {
      return { rejected: true, name: error.name, message: error.message.slice(0, 160) };
    }
  }, kind);
}

for (const operation of ["write", "restore"]) {
  test("P2.6 CDP real quota abort preserves PDF, bookmark and revision: " + operation, async ({ page }) => {
    await seed(page);
    const before = await readSnapshot(page);
    const quota = await quotaSession(page);
    let failure, afterFailure;
    try {
      failure = await attemptOversizedWrite(page, operation);
      expect(failure.rejected, "overquota IDB transaction must fail closed").toBe(true);
      afterFailure = await readSnapshot(page);
      expect(afterFailure).toEqual(before);
      await page.reload();
      await expect(page.locator("#pageTotal")).toHaveText("7", { timeout: 30_000 });
      expect(await readSnapshot(page)).toEqual(before);
    } finally {
      await quota.cdp.send("Storage.overrideQuotaForOrigin", { origin });
      await quota.cdp.detach();
    }
    if (operation === "write") {
      await page.evaluate(async bytes => {
        const { readWorkspaceData, writeWorkspaceAndPdf } = await import("/pdf/src/workspace-data.js");
        const { setWorkspaceFile } = await import("/pdf/src/workspace-store.js");
        const current = await readWorkspaceData();
        const next = setWorkspaceFile(current.state, "recovered.pdf");
        const file = new File([new Uint8Array(bytes)], "recovered.pdf",
          { type: "application/pdf", lastModified: 333 });
        await writeWorkspaceAndPdf(next, current.revision, { put: { id: 1, file } });
      }, [...replacement]);
      await page.reload();
      await expect(page.locator("#pageTotal")).toHaveText("9", { timeout: 30_000 });
      const recovered = await readSnapshot(page);
      expect(recovered.fileName).toBe("recovered.pdf");
      expect(recovered.sha256).toBe(createHash("sha256").update(replacement).digest("hex"));
      expect(recovered.revision).toBe(before.revision + 1);
    }
    await mkdir("test-results/stress", { recursive: true });
    const report = { schema: 1, kind: "real-chromium-quota", operation,
      before, afterFailure, failure,
      quotaBeforeBytes: quota.initial.quota, overrideBytes: quota.active.quota,
      pass: true, note: "CDP quota override, not physical disk exhaustion" };
    await writeFile("test-results/stress/p2-6-quota-" + operation + ".json",
      JSON.stringify(report, null, 2));
    console.log("P2_6_QUOTA_PASSED " + JSON.stringify({
      operation, failureName: failure.name, overrideBytes: quota.active.quota,
      revision: before.revision, persistedOriginalSha256: before.sha256,
    }));
  });
}
