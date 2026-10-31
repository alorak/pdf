import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  initialWorkspaces, setWorkspaceFile, addWorkspace, addLinkedWorkspacePages,
  setWorkspaceLastPage, savePageBookmark,
} from "../src/workspace-store.js";
import { createPdfFixture } from "../tests/helpers/pdf-fixtures.mjs";

test("P2 baseline — 20 workspaces and a 100-page linked compilation", async ({ page }) => {
  const file = createPdfFixture(100, { prefix:"LINKED CAPACITY" });
  let state = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  for (let i = 1; i < 20; i++) state = addWorkspace(state);
  state = addLinkedWorkspacePages(state, {
    sourceWorkspaceId:1, sourceFileName:"source.pdf",
    sourceSize:file.length, sourceLastModified:123,
    pages:Array.from({length:100},(_,i)=>i+1),
  });
  state = savePageBookmark(state, {id:"last-note",page:99,
    fileName:"@workspace-linked-pages",savedAt:42});
  state = setWorkspaceLastPage(state,95);

  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await page.evaluate(async ({state, bytes}) => {
    const mod = await import("/pdf/src/workspace-data.js");
    const current = await mod.readWorkspaceData();
    await mod.restoreWorkspaceBackup({
      state,
      records: [{
        workspaceId:1, name:"source.pdf",type:"application/pdf",lastModified:123,
        blob:new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),
      }],
    }, current.revision);
  }, {state,bytes:[...file]});
  const start = performance.now();
  await page.reload();
  await expect(page.locator("#pageTotal")).toHaveText("100",{timeout:90000});
  await expect(page.locator("#pageInput")).toHaveValue("95",{timeout:20000});
  const loadMs = Math.round(performance.now()-start);
  await page.locator("#pageInput").fill("100");
  await page.locator("#pageInput").press("Enter");
  await expect(page.locator("#pageInput")).toHaveValue("100");
  await page.locator("#menuButton").click();
  await expect(page.locator("#workspaceCount")).toContainText("20 / 20");
  await page.locator("#openLibrary").click();
  await expect(page.locator("#libraryPage")).toBeVisible();
  await expect(page.locator("#libraryWorkspaceCount")).toContainText("20 / 20");
  await page.locator("#showSourceRelations").click();
  await expect(page.locator("#sourceRelationsList")).toContainText("W1 → W20");
  await expect(page.locator("#sourceRelationsList")).toContainText("100 sayfa");
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const current = await cdp.send("Performance.getMetrics");
  const values=Object.fromEntries(current.metrics.map(x=>[x.name,x.value]));
  const dom=await cdp.send("Memory.getDOMCounters");
  const canvases=await page.evaluate(() => ({
    pageCanvases:document.querySelectorAll(".page-surface canvas").length,
    thumbCanvases:document.querySelectorAll(".thumb-preview canvas").length,
  }));
  const result={suite:"p2-stage2",profile:"20 workspaces / 100 links",pages:100,
    firstDisplayMs:loadMs,fixtureBytes:file.length,
    heapBytes:values.JSHeapUsedSize??null,domNodes:dom.nodes,
    canvas:canvases,capturedAt:new Date().toISOString()};
  await mkdir("test-results/stress",{recursive:true});
  await writeFile("test-results/stress/workspace-20-links-100.json",JSON.stringify(result,null,2));
  console.log("P2_WORKSPACE_BASELINE "+JSON.stringify(result));
  expect(canvases.pageCanvases).toBeLessThanOrEqual(16);
  expect(canvases.thumbCanvases).toBeLessThanOrEqual(100);
});
