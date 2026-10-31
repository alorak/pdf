import { test, expect } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generatePdfFixture } from "../scripts/pdf-fixtures.mjs";

const pageCounts = process.env.P2_STRESS_PROFILE === "smoke" ? [100]
  : process.env.P2_STRESS_PROFILE === "quick" ? [100, 1000] : [100, 1000, 5000];
const round = value => Number(value.toFixed(1));
const metrics = async page => page.evaluate(() => ({
  jsHeapMb: typeof performance.memory?.usedJSHeapSize === "number"
    ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1)) : null,
  pageShells: document.querySelectorAll(".page-shell").length,
  pageCanvases: document.querySelectorAll(".page-surface canvas").length,
  thumbnailCanvases: document.querySelectorAll(".thumb-preview canvas").length,
}));
test.describe.configure({ mode: "serial" });

for (const pages of pageCounts) {
  test(`PDF viewer load, navigation and search baseline: ${pages} pages`, async ({ page, browser }) => {
    const fixture = generatePdfFixture(pages);
    const sha256 = createHash("sha256").update(fixture).digest("hex");
    const browserVersion = browser.version();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("");
    await expect(page.locator("#emptyOpenButton")).toBeVisible();
    const chooserEvent = page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const chooser = await chooserEvent;
    const loadStart = performance.now();
    await chooser.setFiles({
      name: `stress-${pages}.pdf`, mimeType: "application/pdf", buffer: fixture,
    });
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText(String(pages), { timeout: 180_000 });
    const browserConsoleErrors = [];
    page.on("console", message => { if (message.type() === "error") browserConsoleErrors.push(message.text()); });
    await page.waitForTimeout(1300);
    const renderDiagnostic = await page.evaluate(() => {
      const reader = document.querySelector("#viewer");
      const shell = document.querySelector(".page-shell");
      const surface = document.querySelector(".page-surface");
      const thumb = document.querySelector(".thumb-preview");
      const rect = node => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: r.top, width: r.width, height: r.height };
      };
      return {
        reader: rect(reader), shell: rect(shell), surface: rect(surface), thumb: rect(thumb),
        pageShells: document.querySelectorAll(".page-shell").length,
        canvases: document.querySelectorAll("canvas").length,
        pageCanvases: document.querySelectorAll(".page-surface canvas").length,
        thumbCanvases: document.querySelectorAll(".thumb-preview canvas").length,
        viewerScrollHeight: reader?.scrollHeight,
        viewerClientHeight: reader?.clientHeight,
        body: document.body.className,
      };
    });
    console.log("P2_RENDER_DIAGNOSTIC " + JSON.stringify({ pages, renderDiagnostic, browserConsoleErrors }));
    // Page totals alone can succeed before canvas drawing. A visual baseline
    // must wait for an actual rendered PDF page.
    await expect(page.locator(".page-surface canvas").first()).toBeVisible({ timeout: 45_000 });
    const firstPageMs = round(performance.now() - loadStart);
    const afterLoad = await metrics(page);
    assertSamples(afterLoad, pages);

    // Random-access to the last page is more revealing than only the first page.
    const jumpStart = performance.now();
    await page.locator("#pageInput").fill(String(pages));
    await page.locator("#pageInput").press("Enter");
    await expect(page.locator("#pageInput")).toHaveValue(String(pages));
    await page.waitForTimeout(650);
    const lastPageJumpMs = round(performance.now() - jumpStart);
    const afterJump = await metrics(page);

    const searchStart = performance.now();
    await page.locator("#searchToggle").click();
    await page.locator("#searchQuery").fill(`PAGE ${String(pages).padStart(5, "0")}`);
    await expect(page.locator("#searchResults .search-result")).toHaveCount(1, { timeout: 250_000 });
    await expect(page.locator("#searchResults .search-result")).toContainText("Sayfa " + pages);
    const searchMs = round(performance.now() - searchStart);
    const afterSearch = await metrics(page);
    await page.locator("#searchClose").click();
    expect(errors, "uncaught page errors").toEqual([]);
    expect(afterJump.pageCanvases).toBeLessThanOrEqual(30);
    expect(afterSearch.pageCanvases).toBeLessThanOrEqual(30);
    expect(afterSearch.thumbnailCanvases).toBeLessThanOrEqual(110);

    const data = {
      schema: 1, kind: "chromium-browser", measuredAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || "local", runner: process.env.RUNNER_NAME || "local",
      node: process.version, browserVersion, pages, bytes: fixture.length,
      sha256, firstPageMs, lastPageJumpMs, searchMs,
      afterLoad, afterJump, afterSearch,
    };
    await mkdir("test-results/stress", { recursive: true });
    await appendFile("test-results/stress/baseline.jsonl", JSON.stringify(data) + "\n");
    console.log("P2_BROWSER_BASELINE " + JSON.stringify(data));
  });
}

function assertSamples(metrics, pages) {
  expect(metrics.pageShells).toBe(pages);
  expect(metrics.pageCanvases).toBeLessThanOrEqual(30);
  expect(metrics.thumbnailCanvases).toBeLessThanOrEqual(110);
}
