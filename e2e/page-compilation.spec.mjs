import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

function fixture() {
  const words = ["FIRST VECTOR PAGE", "MIDDLE VECTOR PAGE", "LAST VECTOR PAGE"];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
    ...[6, 7, 8].map(n => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents ${n} 0 R >>`),
    ...words.map(word => {
      const stream = `BT /F1 16 Tf 64 735 Td (${word}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, index) => { offsets.push(pdf.length); pdf += `${index+1} 0 obj\n${o}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(pos => { pdf += `${String(pos).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

test("page-only workspace reorders its source pages and exports original PDF page text", async ({ page }) => {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  const chooserEvent = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  const chooser = await chooserEvent;
  await chooser.setFiles({ name: "vector-source.pdf", mimeType: "application/pdf", buffer: fixture() });
  await page.locator("#confirmReplace").click();
  await expect(page.locator("#pageTotal")).toHaveText("3");

  await page.locator("#menuButton").click();
  await page.locator("#createWorkspace").click();
  await page.locator("#closeSidebar").click();
  await page.locator("#emptyAddPagesButton").click();
  await expect(page.locator("#addLinkedPagesDialog")).toBeVisible();
  await page.locator("#linkedSourceGrid .linked-source-card").first().click();
  await expect(page.locator("#linkedPagePickerGrid .linked-picker-page")).toHaveCount(3);
  await page.locator("#linkedPagePickerGrid .linked-picker-page").nth(0).click();
  await page.locator("#linkedPagePickerGrid .linked-picker-page").nth(2).click();
  await page.locator("#confirmAddLinkedPages").click();
  await expect(page.locator("#pageTotal")).toHaveText("2");
  await expect(page.locator("#exportLinkedPdf")).toBeVisible();
  await expect(page.locator(".thumb-number").first()).toContainText("W1/1");

  const handle = page.locator(".thumb-entry").first().locator(".thumb-drag-handle");
  await expect(handle).toBeVisible();
  await handle.focus();
  await handle.press("ArrowDown");
  await expect(page.locator(".thumb-number").first()).toContainText("W1/3");

  const downloadEvent = page.waitForEvent("download");
  await page.locator("#exportLinkedPdf").click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/sayfalar\.pdf$/);
  const bytes = new Uint8Array(await readFile(await download.path()));
  const task = getDocument({ data: bytes });
  const output = await task.promise;
  try {
    expect(output.numPages).toBe(2);
    const first = (await (await output.getPage(1)).getTextContent()).items.map(i=>i.str).join(" ");
    const second = (await (await output.getPage(2)).getTextContent()).items.map(i=>i.str).join(" ");
    expect(first).toContain("LAST VECTOR PAGE");
    expect(second).toContain("FIRST VECTOR PAGE");
  } finally {
    await task.destroy();
  }

  await page.locator("#menuButton").click();
  await page.locator("#openLibrary").click();
  await page.locator("#showSourceRelations").click();
  await expect(page.locator("#sourceRelationsDialog")).toBeVisible();
  await expect(page.locator("#sourceRelationsList")).toContainText("W1 → W2");
});
