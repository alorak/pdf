
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
    const renderErrors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", async m => {
      if (/PDF page render failed|PDF thumbnail render failed|Unable to decode image|failed to initialize/i.test(m.text())) {
        errors.push(m.text().slice(0, 240));
        for (const handle of m.args().slice(1)) {
          try {
            const info = await handle.evaluate(value => ({
              name: value?.name ?? null, message: value?.message ?? null,
              stack: typeof value?.stack === "string" ? value.stack.slice(0, 450) : null,
            }));
            if (info.message) renderErrors.push(info);
          } catch { /* Console argument was released. */ }
        }
      }
    });
    page.on("response", response => {
      if (response.url().includes("/pdfjs-") && response.status() >= 400) {
        errors.push("decoder request failed: HTTP " + response.status());
      }
    });
    await page.goto("");
    const chooserWait = page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const chooser = await chooserWait;
    await chooser.setFiles(path);
    await page.locator("#confirmReplace").click();
    try {
      await expect(page.locator("#pageTotal")).not.toHaveText("0", { timeout: 35_000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        pageTotal: document.querySelector("#pageTotal")?.textContent,
        fileLabel: document.querySelector("#fileLabel")?.textContent?.slice(0, 100),
        status: document.querySelector("#statusText")?.textContent?.slice(0, 160),
        viewerText: document.querySelector("#statusText")?.textContent?.slice(0, 160),
        toastText: document.querySelector("#toast")?.textContent?.slice(0, 160),
        toastHidden: document.querySelector("#toast")?.hidden,
        pageShells: document.querySelectorAll(".page-shell").length,
        pageCanvases: document.querySelectorAll(".page-surface canvas").length,
        emptyVisible: !document.querySelector("#empty")?.hidden,
        loading: document.querySelector("#app")?.className?.slice(0, 140),
      }));
      console.log("P2_6_OPEN_DIAGNOSTIC " + JSON.stringify({
        id: item.id, ...diagnostic, errors: errors.slice(0, 8),
        renderErrors: renderErrors.slice(0, 5),
      }));
      throw error;
    }
    const pages = Number(await page.locator("#pageTotal").textContent());
    expect(Number.isSafeInteger(pages) && pages >= 1).toBe(true);
    const metrics = [];
    for (const pageNo of [...new Set([1, Math.ceil(pages / 2), pages])]) {
      await page.locator("#pageInput").fill(String(pageNo));
      await page.locator("#pageInput").press("Enter");
      const selector = '.page-shell[data-index="' + (pageNo - 1) + '"] canvas';
      try {
        await expect.poll(() => page.locator(selector).evaluateAll((all, checkRaster) => all.some(c => {
          if (!c.width || !c.height) return false;
          const ctx = c.getContext("2d");
          if (!ctx) return false;
          if (!checkRaster) return true;
          for (const fraction of [0.15, 0.35, 0.55, 0.75]) {
            const color = ctx.getImageData(Math.floor(c.width * fraction),
              Math.floor(c.height * fraction), 1, 1).data;
            if (color[3] > 0) return true;
          }
          return false;
        }), item.minImagePages > 0), { timeout: 25_000 }).toBe(true);
      } catch (error) {
        const diag = await page.evaluate(({ targetPage, checkRaster }) => {
          const shells = [...document.querySelectorAll(".page-shell")];
          const shell = shells.find(x => x.dataset.index === String(targetPage - 1));
          const canvases = [...(shell?.querySelectorAll("canvas") || [])];
          return { pageNo: targetPage, checkRaster,
            pageTotal: document.querySelector("#pageTotal")?.textContent,
            pageInput: document.querySelector("#pageInput")?.value,
            shellCount: shells.length,
            shellNumbers: shells.slice(0, 8).map(x => x.dataset.index),
            selectedShellConnected: Boolean(shell?.isConnected),
            selectedShellHeight: shell?.getBoundingClientRect().height,
            pageSurfaceChildren: shell?.querySelector(".page-surface")?.children.length,
            canvasCount: canvases.length,
            canvasDims: canvases.map(c => [c.width, c.height]),
            selectedPageHidden: shell?.hidden,
            viewerDimensions: (() => { const v = document.querySelector("#viewer"); return [v?.clientWidth, v?.clientHeight, v?.scrollTop]; })(),
            pagesHidden: document.querySelector("#pages")?.hidden,
            toastVisible: !document.querySelector("#toast")?.hidden,
          };
        }, { targetPage: pageNo, checkRaster: item.minImagePages > 0 });
        console.log("P2_6_RENDER_DIAGNOSTIC " + JSON.stringify({ id: item.id, ...diag,
          consoleErrors: errors.slice(0, 6), renderErrors: renderErrors.slice(0, 6) }));
        throw error;
      }
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
