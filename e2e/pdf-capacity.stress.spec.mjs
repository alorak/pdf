import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createPdfFixture } from "../tests/helpers/pdf-fixtures.mjs";

const allowed = [100, 1000, 5000];
const pagesToTest = (process.env.P2_STRESS_PAGES || "100,1000,5000")
  .split(",").map(s => Number(s.trim()));
for (const value of pagesToTest) {
  if (!allowed.includes(value)) throw new Error("P2_STRESS_PAGES must be drawn from 100,1000,5000");
}

async function counters(page, cdp) {
  const metrics = await cdp.send("Performance.getMetrics");
  const numbers = Object.fromEntries(metrics.metrics.map(metric => [metric.name, metric.value]));
  const dom = await cdp.send("Memory.getDOMCounters");
  const canvas = await page.evaluate(() => ({
    pages: document.querySelectorAll(".page-shell").length,
    pageCanvases: document.querySelectorAll(".page-surface canvas").length,
    thumbCanvases: document.querySelectorAll(".thumb-preview canvas").length,
    totalCanvases: document.querySelectorAll("canvas").length,
  }));
  return {
    heapBytes: numbers.JSHeapUsedSize ?? null,
    documentCount: dom.documents,
    domNodes: dom.nodes,
    ...canvas,
  };
}

async function navigate(page, target) {
  const started = performance.now();
  await page.locator("#pageInput").fill(String(target));
  await page.locator("#pageInput").press("Enter");
  await expect(page.locator("#pageInput")).toHaveValue(String(target));
  await expect.poll(() => page.locator('.page-shell[data-index="'+String(target-1)+'"] .page-surface canvas').count(), {
    timeout: 18000, message: 'Deep target page must render a canvas',
  }).toBeGreaterThan(0);
  await page.waitForTimeout(550);
  return Math.round(performance.now() - started);
}

for (const count of pagesToTest) {
  test(`P2 baseline — ${count} real PDF pages and repeated deep navigation`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('P2_PAGE_CONSOLE ' + msg.type() + ': ' + msg.text()); });
    const file = createPdfFixture(count, { prefix: "P2 STRESS" });
    await page.goto("");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const started = performance.now();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: `p2-stress-${count}.pdf`,
      mimeType: "application/pdf",
      buffer: file,
    });
    await expect(page.locator("#replaceDialog")).toBeVisible();
    await page.locator("#confirmReplace").click();
    await expect(page.locator("#pageTotal")).toHaveText(String(count), { timeout: 120_000 });
    const initialMs = Math.round(performance.now() - started);
    console.log('P2_RENDER_DIAG', await page.evaluate(() => {
      const viewer = document.querySelector('#viewer');
      const first = document.querySelector('.page-shell');
      const rect = element => element?.getBoundingClientRect().toJSON() || null;
      const surface = document.querySelector('.page-surface');
      return { viewer: rect(viewer), firstPage: rect(first),
        canvasCount: document.querySelectorAll('canvas').length,
        surfaceCount: document.querySelectorAll('.page-surface').length,
        firstSurfaceRect: rect(surface), firstSurfaceChildren: surface?.childElementCount,
        display: viewer && getComputedStyle(viewer).display };
    }));
    await expect.poll(() => page.locator('.page-surface canvas').count(), {
      timeout: 12000, message: 'A PDF page must render to a real canvas',
    }).toBeGreaterThan(0);
    const initial = await counters(page, cdp);

    const times = [];
    for (const target of [Math.ceil(count / 2), count, Math.max(1, count - 30), 1]) {
      const durationMs = await navigate(page, target);
      times.push({ page: target, durationMs, ...(await counters(page, cdp)) });
    }
    const end = await counters(page, cdp);
    const report = {
      suite: "p2-stage2",
      pages: count,
      fixtureBytes: file.byteLength,
      environment: {
        browser: testInfo.project.name || "chromium",
        node: process.version,
        ci: Boolean(process.env.CI),
      },
      initialDisplayMs: initialMs,
      initial,
      navigation: times,
      end,
      browserErrors: errors,
      capturedAt: new Date().toISOString(),
    };
    await mkdir("test-results/stress", { recursive: true });
    await writeFile(`test-results/stress/pages-${count}.json`, JSON.stringify(report, null, 2));
    await testInfo.attach("baseline.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
    console.log("P2_BASELINE " + JSON.stringify({
      pages: count, firstDisplayMs: initialMs, maxHeapBytes: Math.max(
        initial.heapBytes || 0, ...times.map(x => x.heapBytes || 0)),
      domNodes: end.domNodes, pageCanvas: end.pageCanvases, thumbCanvas: end.thumbCanvases,
    }));

    // Structural correctness gates. Timings/memory are baselined, not invented SLAs.
    expect(initial.pages).toBe(count);
    expect(end.pages).toBe(count);
    expect(errors).toEqual([]);
    expect(end.pageCanvases).toBeLessThanOrEqual(16);
    expect(end.thumbCanvases).toBeLessThanOrEqual(100);
    expect(times.every(x => x.durationMs >= 0)).toBe(true);
  });
}
