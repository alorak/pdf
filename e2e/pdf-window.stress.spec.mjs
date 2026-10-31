import { test, expect } from "@playwright/test";
import { generatePdfFixture } from "../scripts/pdf-fixtures.mjs";

const count = (process.env.P2_STRESS_PAGES || "").split(",").includes("5000") ? 5000 : 1000;

test(`P2.4 windowed reader: ${count} pages navigate correctly without 1000+ page DOM nodes`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("");
  const choose = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  const chooser = await choose;
  await chooser.setFiles({
    name: "p2-4-windowed.pdf", mimeType: "application/pdf", buffer: generatePdfFixture(count),
  });
  await page.locator("#confirmReplace").click();
  await expect(page.locator("#pageTotal")).toHaveText(String(count), { timeout: 120000 });
  await expect(page.locator("#pages")).toHaveClass(/virtual-pages/);
  console.log("P2_WINDOW_DIAG", await page.evaluate(() => ({
    shellCount: document.querySelectorAll(".page-shell").length,
    canvasCount: document.querySelectorAll(".page-surface canvas").length,
    children: [...document.querySelector("#pages").children].map(node => ({
      tag: node.tagName, className: node.className, hidden: node.hidden,
      height: node.getBoundingClientRect().height,
    })).slice(0, 12),
    scrollHeight: document.querySelector("#viewer").scrollHeight,
    clientHeight: document.querySelector("#viewer").clientHeight,
  })));
  await expect.poll(() => page.locator(".page-surface canvas").count(), { timeout: 25000 }).toBeGreaterThan(0);
  expect(await page.locator(".page-shell").count()).toBeLessThanOrEqual(80);
  const oldScrollHeight = await page.locator("#viewer").evaluate(el => el.scrollHeight);
  expect(oldScrollHeight).toBeGreaterThan(count * 200);

  for (const target of [Math.ceil(count / 2), count, 1]) {
    await page.locator("#pageInput").fill(String(target));
    await page.locator("#pageInput").press("Enter");
    await expect(page.locator("#pageInput")).toHaveValue(String(target));
    await expect.poll(() => page.locator(`.page-shell[data-index="${target - 1}"] .page-surface canvas`).count(), {
      timeout: 30000,
    }).toBeGreaterThan(0);
    expect(await page.locator(".page-shell").count()).toBeLessThanOrEqual(80);
  }
  // Search is still logical-page based, independent of the currently mounted DOM.
  await page.locator("#searchToggle").click();
  await page.locator("#searchQuery").fill(`PAGE ${String(count).padStart(5, "0")}`);
  await expect(page.locator("#searchResults .search-result")).toHaveCount(1, { timeout: 90000 });
  await page.locator("#searchResults .search-result").click();
  await expect(page.locator("#pageInput")).toHaveValue(String(count));
  await page.locator("#searchQuery").fill("PAGE 00001");
  await expect(page.locator("#searchResults .search-result")).toContainText("Sayfa 1");
  await page.locator("#searchClose").click();

  // Bookmark-only mode preserves its previous view and has a safe empty state.
  await page.locator("#thumbBookmarks").click();
  await expect(page.locator("#pages")).not.toHaveClass(/virtual-pages/);
  await page.locator("#thumbPages").click();
  await expect(page.locator("#pages")).toHaveClass(/virtual-pages/);
  expect(await page.locator(".page-shell").count()).toBeLessThanOrEqual(80);
  expect(errors).toEqual([]);
});
