import { test, expect } from "@playwright/test";

function pdfFixture() {
  const pageText = [
    "INTRODUCTION OF MATERIALS",
    "SURROGATE MODEL VALIDATION",
    "RESULTS AND CONCLUSIONS",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R /PageMode /UseOutlines >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
    ...[6, 7, 8].map(n => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents ${n} 0 R >>`),
    ...pageText.map(text => {
      const stream = `BT /F1 18 Tf 64 730 Td (${text}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Outlines /First 11 0 R /Last 12 0 R /Count 2 >>",
    "<< /Title (Introduction) /Parent 10 0 R /Dest [3 0 R /Fit] /Next 12 0 R >>",
    "<< /Title (Results) /Parent 10 0 R /Dest [5 0 R /Fit] /Prev 11 0 R >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, "ascii");
}

async function openTestPdf(page) {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "academic-fixture.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await expect(page.locator("#replaceDialog")).toBeVisible();
  await page.locator("#confirmReplace").click();
  await expect(page.locator("#pageTotal")).toHaveText("3", { timeout: 20000 });
  await expect.poll(() => page.locator('.page-surface canvas').count(), {
    timeout: 15000, message: 'PDF must draw a real canvas, not only metadata',
  }).toBeGreaterThan(0);
  await expect(page.locator("#searchToggle")).toBeEnabled();
}

test("PDF text search finds a matching page and outline navigates to a PDF chapter", async ({ page }) => {
  await openTestPdf(page);
  await page.locator("#searchToggle").click();
  await page.locator("#searchQuery").fill("SURROGATE");
  await expect(page.locator("#searchResults .search-result")).toHaveCount(1);
  await expect(page.locator("#searchResults .search-result")).toContainText("Sayfa 2");
  await page.locator("#searchResults .search-result").click();
  await expect(page.locator("#pageInput")).toHaveValue("2");
  await page.locator("#searchClose").click();

  await page.locator("#thumbOutline").click();
  await expect(page.locator("#outlineList .outline-link")).toHaveCount(2);
  await page.locator("#outlineList .outline-link", { hasText: "Results" }).click();
  await expect(page.locator("#pageInput")).toHaveValue("3");
});

test("the last read PDF page is saved and restored on reload", async ({ page }) => {
  await openTestPdf(page);
  await page.locator("#pageInput").fill("3");
  await page.locator("#pageInput").press("Enter");
  await expect(page.locator("#pageInput")).toHaveValue("3");
  await page.waitForTimeout(950); // debounce persistence interval: 700ms
  await expect(page.locator("#pageInput")).toHaveValue("3");
  await page.reload();
  await expect(page.locator("#pageTotal")).toHaveText("3", { timeout: 20000 });
  await expect(page.locator("#pageInput")).toHaveValue("3");
});

test("search can be opened with Ctrl+F and closed with Escape", async ({ page }) => {
  await openTestPdf(page);
  await page.keyboard.press("Control+f");
  await expect(page.locator("#searchPanel")).toBeVisible();
  await page.locator("#searchQuery").press("Escape");
  await expect(page.locator("#searchPanel")).toBeHidden();
});

test("thumbnail view tabs use single-color icons, counters and accessible names in left/bottom layouts", async ({ page }) => {
  await openTestPdf(page);
  const tabs = [
    { id: "thumbPages", label: "Sayfalar", count: "thumbPagesCount" },
    { id: "thumbBookmarks", label: "Yer İmleri", count: "thumbBookmarksCount" },
    { id: "thumbOutline", label: "İçindekiler" },
  ];

  async function checkTabs() {
    for (const { id, label, count } of tabs) {
      const button = page.locator("#" + id);
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute("aria-label", label);
      await expect(button).toHaveAttribute("title", label);
      await expect(button.locator("svg.thumb-tab-icon")).toHaveCount(1);
      await expect(button.locator("svg.thumb-tab-icon")).toHaveAttribute("aria-hidden", "true");
      const appearance = await button.evaluate((element) => {
        const svg = element.querySelector("svg.thumb-tab-icon");
        return {
          stroke: getComputedStyle(svg).stroke,
          color: getComputedStyle(element).color,
          fill: getComputedStyle(svg).fill,
          width: svg.getBoundingClientRect().width,
          text: element.textContent.trim(),
        };
      });
      expect(appearance.stroke).toBe(appearance.color);
      expect(appearance.fill).toBe("none");
      expect(appearance.width).toBe(18);
      expect(appearance.text).not.toContain(label);
      if (count) {
        await expect(button).toHaveAttribute("aria-describedby", count);
        await expect(page.locator("#" + count)).toHaveText(/^\d+$/);
      }
    }

    await page.locator("#thumbBookmarks").click();
    await expect(page.locator("#thumbBookmarks")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#thumbBookmarksCount")).toHaveText("0");
    await expect(page.locator("#thumbEmpty")).toBeVisible();

    await page.locator("#thumbOutline").click();
    await expect(page.locator("#thumbOutline")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#outlineList .outline-link")).toHaveCount(2);
    await expect(page.locator("#thumbList")).toBeHidden();

    await page.locator("#thumbPages").click();
    await expect(page.locator("#thumbPages")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#thumbPagesCount")).toHaveText("3");
    await expect(page.locator("#outlineList")).toBeHidden();
  }

  await checkTabs();
  await page.locator("#thumbsToggle").click();
  await page.locator('[data-thumbs="bottom"]').click();
  await expect(page.locator("#app")).toHaveClass(/thumbs-bottom/);
  await checkTabs();

  // Icon-only labels should also fit the narrower bottom sidebar on phones.
  await page.setViewportSize({ width: 390, height: 740 });
  await expect.poll(() => page.locator(".pane-heading").evaluate(element =>
    Math.round(element.getBoundingClientRect().width)
  )).toBeLessThanOrEqual(100);
  const withinPane = await page.evaluate(() => {
    const pane = document.querySelector(".pane-heading").getBoundingClientRect();
    return [...document.querySelectorAll(".thumb-filter-button")].every(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= pane.left - 1 && bounds.right <= pane.right + 1;
    });
  });
  expect(withinPane).toBe(true);
  await checkTabs();
});

test("the current full-size PDF page has a restrained blue border in left and bottom preview modes", async ({ page }) => {
  await openTestPdf(page);
  const activeShell = page.locator(".page-shell.current-page");
  await expect(activeShell).toHaveCount(1);
  await expect(activeShell).toHaveAttribute("data-index", "0");

  const selectedStyle = await activeShell.evaluate(element => {
    const computed = getComputedStyle(element);
    return { borderWidth: computed.borderTopWidth, borderColor: computed.borderTopColor, shadow: computed.boxShadow };
  });
  expect(selectedStyle.borderWidth).toBe("1px");
  expect(selectedStyle.borderColor).toBe("rgb(145, 174, 231)");
  expect(selectedStyle.shadow).not.toBe("none");
  await expect(page.locator(".page-shell[data-index='1']")).not.toHaveClass(/current-page/);

  // Clicking a preview moves the subtle main-page border without changing the stronger thumbnail border.
  await page.locator('.thumb-item[data-index="2"]').click();
  await expect(page.locator("#pageInput")).toHaveValue("3");
  await expect(activeShell).toHaveCount(1);
  await expect(activeShell).toHaveAttribute("data-index", "2");
  await expect(page.locator('.thumb-item[data-index="2"]')).toHaveClass(/active/);
  await expect(page.locator(".page-shell[data-index='0']")).not.toHaveClass(/current-page/);

  await page.locator("#thumbsToggle").click();
  await page.locator('[data-thumbs="bottom"]').click();
  await expect(page.locator("#app")).toHaveClass(/thumbs-bottom/);
  await expect(activeShell).toHaveAttribute("data-index", "2");
  await page.locator('.thumb-item[data-index="1"]').click();
  await expect(page.locator("#pageInput")).toHaveValue("2");
  await expect(activeShell).toHaveCount(1);
  await expect(activeShell).toHaveAttribute("data-index", "1");

  // The main page border stays active when the preview pane is hidden.
  await page.locator("#thumbsToggle").click();
  await page.locator('[data-thumbs="hidden"]').click();
  await expect(activeShell).toHaveAttribute("data-index", "1");
  await expect(activeShell).toHaveCSS("border-top-color", "rgb(145, 174, 231)");
});
