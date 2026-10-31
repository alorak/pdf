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
