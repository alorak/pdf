import { test, expect } from "@playwright/test";

async function openLibrary(page) {
  await page.locator("#menuButton").click();
  await page.locator("#openLibrary").click();
  await expect(page.locator("#libraryWorkspaceGrid")).toHaveAttribute("aria-busy", "false");
}

// Count programmatic requests instead of waiting for a negative file-chooser event.
async function trackAutomaticFilePickers(page) {
  await page.evaluate(() => {
    window.__automaticFilePickerCalls = 0;
    document.querySelector("#fileInput").click = () => {
      window.__automaticFilePickerCalls++;
    };
  });
}

async function expectEmptyWorkspace(page, label) {
  await expect(page.locator("#libraryPage")).toBeHidden();
  await expect(page.locator("#activeWorkspaceLabel")).toHaveText(label);
  await expect(page.locator("#emptyState")).toBeVisible();
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await expect(page.locator("#emptyAddPagesButton")).toBeVisible();
  await expect(page.locator("#addLinkedPagesDialog")).toBeHidden();
  expect(await page.evaluate(() => window.__automaticFilePickerCalls)).toBe(0);
}

test("Library existing empty workspace opens the reader without prompting for a PDF", async ({ page }) => {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await trackAutomaticFilePickers(page);

  await openLibrary(page);
  await expect(page.locator("#libraryWorkspaceGrid .library-workspace-select").first())
    .toContainText("Workspace'i aç");
  await page.locator("#libraryWorkspaceGrid .library-workspace-select").first().click();
  await expectEmptyWorkspace(page, "W1");

  // Choosing the page import explicitly still opens the linked-page selector.
  await page.locator("#emptyAddPagesButton").click();
  await expect(page.locator("#addLinkedPagesDialog")).toBeVisible();
  await page.locator("#closeAddLinkedPages").click();

  // Choosing the PDF import explicitly still invokes the native file picker.
  await page.evaluate(() => { delete document.querySelector("#fileInput").click; });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#emptyOpenButton").click();
  await chooser;
});

test("Library new slot creates an empty workspace and allows both import paths", async ({ page }) => {
  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await trackAutomaticFilePickers(page);

  await openLibrary(page);
  const cards = page.locator("#libraryWorkspaceGrid .library-workspace-select");
  await expect(cards.nth(1)).toHaveAttribute("aria-label", /Yeni workspace oluştur \(W2\)/);
  await cards.nth(1).click();
  await expectEmptyWorkspace(page, "W2");

  // Reopening either existing workspace does not silently choose an import method.
  await openLibrary(page);
  await page.locator("#libraryWorkspaceGrid .library-workspace-select").first().click();
  await expectEmptyWorkspace(page, "W1");
  await openLibrary(page);
  await page.locator("#libraryWorkspaceGrid .library-workspace-select").nth(1).click();
  await expectEmptyWorkspace(page, "W2");

  await expect.poll(async () => page.evaluate(async () => {
    const { readWorkspaceData } = await import("/pdf/src/workspace-data.js");
    return (await readWorkspaceData()).state.items.length;
  })).toBe(2);
  const state = await page.evaluate(async () => {
    const { readWorkspaceData } = await import("/pdf/src/workspace-data.js");
    return (await readWorkspaceData()).state;
  });
  expect(state.items.find(item => item.id === 2)?.fileName).toBe("");
});
