import { test, expect } from "@playwright/test";
import { generatePdfFixture } from "../scripts/pdf-fixtures.mjs";

const pages = (process.env.P2_STRESS_PAGES || "").includes("5000") ? 5000 : 1000;
test(`P2.4-C thumbnail window: ${pages} pages, vertical/bottom strips, deep click, bookmarks`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("");
  const choosing = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: "thumbnail-window.pdf", mimeType: "application/pdf",
    buffer: generatePdfFixture(pages),
  });
  await page.locator("#confirmReplace").click();
  await expect(page.locator("#pageTotal")).toHaveText(String(pages), { timeout: 120000 });
  await expect.poll(() => page.locator(".page-surface canvas").count(), { timeout: 30000 }).toBeGreaterThan(0);
  await expect(page.locator("#thumbList")).toHaveClass(/virtual-thumbnails/);
  expect(await page.locator(".thumb-entry").count()).toBeLessThanOrEqual(80);

  // DOM must not contain 1000/5000 thumbnail items even when scrolling to the end.
  await page.locator("#thumbList").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const last = page.locator(`.thumb-item[data-index="${pages - 1}"]`);
  await expect(last).toBeVisible({ timeout: 15000 });
  await last.click();
  await expect(page.locator("#pageInput")).toHaveValue(String(pages));
  await expect.poll(() => page.locator(`.page-shell[data-index="${pages - 1}"] canvas`).count(),
    { timeout: 30000 }).toBeGreaterThan(0);
  expect(await page.locator(".thumb-entry").count()).toBeLessThanOrEqual(80);

  // Sidebar below: horizontally windowed thumbnails preserve left-to-right offsets.
  await page.locator("#thumbsToggle").click();
  await page.locator('[data-thumbs="bottom"]').click();
  await expect(page.locator("#thumbList")).toHaveClass(/virtual-bottom/);
  await page.locator("#thumbList").evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(last).toBeVisible({ timeout: 15000 });
  expect(await page.locator(".thumb-entry").count()).toBeLessThanOrEqual(80);
  await page.locator("#thumbList").evaluate(el => { el.scrollLeft = 0; });
  await expect(page.locator('.thumb-item[data-index="0"]')).toBeVisible();
  await page.locator('.thumb-item[data-index="0"]').click();
  await expect(page.locator("#pageInput")).toHaveValue("1");

  // Horizontal main page flow must also window the 1000/5000 logical pages.
  await page.locator("#directionButton").click();
  await page.locator('[data-orientation="horizontal"]').click();
  await expect(page.locator("#pages")).toHaveClass(/virtual-pages/);
  expect(await page.locator(".page-shell").count()).toBeLessThanOrEqual(80);
  const horizontalScroll = await page.locator("#viewer").evaluate(el => ({
    width: el.scrollWidth, viewport: el.clientWidth,
  }));
  expect(horizontalScroll.width).toBeGreaterThan(horizontalScroll.viewport * 5);
  await page.locator("#pageInput").fill(String(pages));
  await page.locator("#pageInput").press("Enter");
  await expect.poll(() => page.locator(`.page-shell[data-index="${pages - 1}"] canvas`).count(),
    { timeout: 30000 }).toBeGreaterThan(0);
  expect(await page.locator(".page-shell").count()).toBeLessThanOrEqual(80);
  await page.locator("#directionButton").click();
  await page.locator('[data-orientation="vertical"]').click();
  await expect(page.locator("#pages")).toHaveClass(/virtual-pages/);

  // Bookmark-only mode must stay usable and show an empty state with no bookmarks.
  await page.locator("#thumbBookmarks").click();
  await expect(page.locator("#thumbList")).not.toHaveClass(/virtual-thumbnails/);
  await expect(page.locator("#thumbEmpty")).toBeVisible();
  await page.locator("#thumbPages").click();
  await expect(page.locator("#thumbList")).toHaveClass(/virtual-thumbnails/);
  expect(errors).toEqual([]);
});
