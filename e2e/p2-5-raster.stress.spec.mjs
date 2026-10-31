import { test, expect } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { generateImagePdf, imageFixtureManifest } from "../scripts/p2-5-image-fixtures.mjs";

const profile = process.env.P2_IMAGE_PROFILE || "smoke";
if (!["smoke", "quick", "full"].includes(profile)) throw new Error("Invalid P2_IMAGE_PROFILE");
const settings = {
  scan: profile === "full" ? { pages: 128, imageSize: 512 }
    : profile === "quick" ? { pages: 24, imageSize: 256 } : { pages: 5, imageSize: 128 },
  mixed: profile === "full" ? { pages: 96, imageSize: 512 }
    : profile === "quick" ? { pages: 24, imageSize: 256 } : { pages: 6, imageSize: 128 },
  mobile: profile === "full" ? { pages: 32, imageSize: 512 }
    : profile === "quick" ? { pages: 12, imageSize: 256 } : { pages: 4, imageSize: 128 },
};
const fixtureName = (kind, mobile) => `p2-5-${kind}-${mobile ? "mobile" : "desktop"}-${profile}`;
const round = value => Math.round(value * 10) / 10;

async function sample(page, cdp) {
  const perf = await cdp.send("Performance.getMetrics");
  const values = Object.fromEntries(perf.metrics.map(x => [x.name, x.value]));
  const dom = await cdp.send("Memory.getDOMCounters");
  const view = await page.evaluate(() => ({
    pageShells: document.querySelectorAll(".page-shell").length,
    thumbnailEntries: document.querySelectorAll(".thumb-entry").length,
    pageCanvases: document.querySelectorAll(".page-surface canvas").length,
    thumbnailCanvases: document.querySelectorAll(".thumb-preview canvas").length,
    clientWidth: document.querySelector("#viewer").clientWidth,
  }));
  return {
    jsHeapMiB: values.JSHeapUsedSize == null ? null : round(values.JSHeapUsedSize / 1048576),
    domNodes: dom.nodes, documents: dom.documents, ...view,
  };
}
async function painted(page, index) {
  const selector = `.page-shell[data-index="${index}"] .page-surface canvas`;
  await expect.poll(async () => page.locator(selector).evaluateAll(canvases => canvases.some(c => {
    if (!c.width || !c.height) return false;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const color = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return color[3] > 0 && (color[0] < 230 || color[1] < 230 || color[2] < 230);
  })), { timeout: 90_000, message: `Page ${index + 1} must have non-white raster pixels, not just an empty canvas` })
    .toBe(true);
}
async function openFixture(page, fixture, filename) {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  const choose = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  const picker = await choose;
  const time = performance.now();
  await picker.setFiles({ name: filename + ".pdf", mimeType: "application/pdf", buffer: fixture });
  await expect(page.locator("#confirmReplace")).toBeVisible();
  await page.locator("#confirmReplace").click();
  return time;
}
async function runRasterScenario(page, browser, kind, options, { mobile = false } = {}) {
  const filename = fixtureName(kind, mobile);
  const fixture = generateImagePdf({ kind, ...options });
  const manifest = imageFixtureManifest(fixture, { kind, ...options, profile, mobile });
  const errors = [];
  const rasterErrors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => {
    if (msg.type() === "error" && /PDF page render failed|PDF thumbnail render failed/.test(msg.text())) {
      rasterErrors.push(msg.text());
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const initial = await openFixture(page, fixture, filename);
  await expect(page.locator("#pageTotal")).toHaveText(String(options.pages), { timeout: 180_000 });
  await painted(page, 0);
  const loadMs = round(performance.now() - initial);
  const snapshots = [{ page: 1, ...(await sample(page, cdp)) }];
  for (const target of [Math.ceil(options.pages / 2), options.pages, 1]) {
    await page.locator("#pageInput").fill(String(target));
    await page.locator("#pageInput").press("Enter");
    await expect(page.locator("#pageInput")).toHaveValue(String(target));
    await painted(page, target - 1);
    snapshots.push({ page: target, ...(await sample(page, cdp)) });
  }
  await page.locator("#searchToggle").click();
  if (kind === "mixed") {
    await page.locator("#searchQuery").fill(
      `P25 MIXED PAGE ${String(options.pages).padStart(5, "0")}`);
    await expect(page.locator("#searchResults .search-result")).toHaveCount(1, { timeout: 180_000 });
    await page.locator("#searchResults .search-result").click();
    await expect(page.locator("#pageInput")).toHaveValue(String(options.pages));
  } else {
    await page.locator("#searchQuery").fill("P25 NO OCR");
    await expect(page.locator("#searchStatus")).toContainText("Eşleşme bulunamadı.", { timeout: 180_000 });
    await expect(page.locator("#searchResults .search-result")).toHaveCount(0);
  }
  await page.locator("#searchClose").click();
  const end = await sample(page, cdp);
  expect(errors, "uncaught JS errors").toEqual([]);
  expect(rasterErrors, "pdf.js paint errors").toEqual([]);
  for (const snap of [...snapshots, end]) {
    expect(snap.pageCanvases).toBeLessThanOrEqual(16);
    expect(snap.thumbnailCanvases).toBeLessThanOrEqual(100);
    if (snap.jsHeapMiB !== null) expect(Number.isFinite(snap.jsHeapMiB)).toBe(true);
  }
  expect(manifest.bytes).toBeGreaterThan(options.pages * options.imageSize * options.imageSize);
  if (profile === "full" && !mobile) {
    expect(manifest.sizeMiB).toBeGreaterThan(kind === "scan" ? 90 : 65);
  }
  const report = {
    schema: 1, scenario: filename, capturedAt: new Date().toISOString(),
    runner: process.env.RUNNER_NAME || "local", commit: process.env.GITHUB_SHA || "local",
    browser: browser.version(), node: process.version, manifest, loadMs,
    snapshots, afterSearch: end, errors, rasterErrors,
    memoryTest: "observational only; mobile viewport does not impose an OS RAM limit",
  };
  await mkdir("test-results/stress", { recursive: true });
  await writeFile(`test-results/stress/${filename}.json`, JSON.stringify(report, null, 2));
  console.log("P2_5_RASTER_BASELINE " + JSON.stringify({
    scenario: filename, bytes: manifest.bytes, sha256: manifest.sha256,
    pages: options.pages, loadMs, domNodes: end.domNodes, heapMiB: end.jsHeapMiB,
    canvasCount: end.pageCanvases, mobile,
  }));
}

for (const kind of ["scan", "mixed"]) {
  test(`P2.5 raster ${kind} desktop: ${profile}`, async ({ page, browser }) => {
    await runRasterScenario(page, browser, kind, settings[kind]);
  });
}

test.describe("P2.5 mobile viewport + touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test(`P2.5 image-heavy mobile: ${profile}`, async ({ page, browser }) => {
    await runRasterScenario(page, browser, "scan", settings.mobile, { mobile: true });
  });
});
