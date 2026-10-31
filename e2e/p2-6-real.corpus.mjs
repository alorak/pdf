
import { test, expect } from "@playwright/test";
import { readFile, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import { validateCorpusManifest, corpusFilePath } from "../src/p2-6-corpus-policy.js";

const manifestPath = process.env.P2_REAL_CORPUS_MANIFEST;
if (!manifestPath) throw new Error("P2_REAL_CORPUS_MANIFEST is required for real corpus Chromium tests.");
const root = await realpath(dirname(resolve(manifestPath)));
const cases = validateCorpusManifest(JSON.parse(await readFile(resolve(manifestPath), "utf8")));

for (const item of cases) {
  test("P2.6 real authorized PDF Chromium render " + item.id, async ({ page }) => {
    const path = await realpath(corpusFilePath(root, item.file));
    if (!path.startsWith(root + sep)) throw new Error("Unauthorized symlink");
    const bytes = await readFile(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => {
      if (m.type() === "error" && /PDF page render failed|PDF thumbnail render failed/.test(m.text())) {
        errors.push(m.text());
      }
    });
    await page.goto("");
    const chooserWait = page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const chooser = await chooserWait;
    await chooser.setFiles(path);
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).not.toHaveText("0", { timeout: 180_000 });
    const pages = Number(await page.locator("#pageTotal").textContent());
    expect(Number.isSafeInteger(pages) && pages >= 1).toBe(true);
    const metrics = [];
    for (const pageNo of [...new Set([1, Math.ceil(pages / 2), pages])]) {
      await page.locator("#pageInput").fill(String(pageNo));
      await page.locator("#pageInput").press("Enter");
      const selector = '.page-shell[data-index="' + (pageNo - 1) + '"] canvas';
      await expect.poll(() => page.locator(selector).evaluateAll(all => all.some(c => c.width > 0 &&
        c.height > 0 && c.getContext("2d").getImageData(0, 0, 1, 1).data[3] !== 0)),
        { timeout: 180_000 }).toBe(true);
      const sample = await page.evaluate(() => ({
        domNodes: document.querySelectorAll("*").length,
        pageCanvases: document.querySelectorAll(".page-surface canvas").length,
        thumbCanvases: document.querySelectorAll(".thumb-preview canvas").length,
        heapMiB: typeof performance.memory?.usedJSHeapSize === "number"
          ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null,
      }));
      expect(sample.pageCanvases).toBeLessThanOrEqual(16);
      expect(sample.thumbCanvases).toBeLessThanOrEqual(100);
      metrics.push({ pageNo, ...sample });
    }
    expect(errors).toEqual([]);
    // Never archive original bytes, filenames, images, or page text.
    console.log("P2_6_REAL_BROWSER_CASE_PASSED " + JSON.stringify({
      id: item.id, sha256: item.sha256, pages, metrics, errorCount: errors.length,
    }));
  });
}
