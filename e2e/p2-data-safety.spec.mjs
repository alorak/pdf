import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  initialWorkspaces, setWorkspaceFile, addWorkspace,
  addLinkedWorkspacePages, savePageBookmark,
} from "../src/workspace-store.js";
import { createPdfFixture } from "../tests/helpers/pdf-fixtures.mjs";

test("P0/P1 regression: browser backup, corrupt import rejection and complete restore",async({page})=>{
  const pdf=createPdfFixture(10,{prefix:"BACKUP REGRESSION"});
  let state=setWorkspaceFile(initialWorkspaces(),"source.pdf");
  state=addWorkspace(state);
  state=addLinkedWorkspacePages(state,{
    sourceWorkspaceId:1,sourceFileName:"source.pdf",sourceSize:pdf.length,
    sourceLastModified:123,pages:[2,7],
  });
  state=savePageBookmark(state,{id:"linked-note",page:2,
    fileName:"@workspace-linked-pages",savedAt:1});

  await page.goto("");
  await expect(page.locator("#emptyOpenButton")).toBeVisible();
  await page.evaluate(async ({snapshot,bytes})=>{
    const mod=await import("/pdf/src/workspace-data.js");
    const {revision}=await mod.readWorkspaceData();
    await mod.restoreWorkspaceBackup({
      state:snapshot,
      records:[{
        workspaceId:1,name:"source.pdf",lastModified:123,type:"application/pdf",
        blob:new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),
      }],
    },revision);
  },{snapshot:state,bytes:[...pdf]});
  await page.reload();
  await expect(page.locator("#pageTotal")).toHaveText("2");
  await page.locator("#menuButton").click();
  await page.locator("#openLibrary").click();
  const outgoing=page.waitForEvent("download");
  await page.locator("#backupExport").click();
  const backup=await outgoing;
  const bytes=await readFile(await backup.path());
  expect(bytes.toString("ascii",0,8)).toBe("PDFWSBK1");
  const unchanged=await page.evaluate(async()=>{
    const {readWorkspaceData}=await import("/pdf/src/workspace-data.js");
    return (await readWorkspaceData()).revision;
  });

  const bad=Buffer.from(bytes);
  bad[bad.length-1]^=1;
  await page.locator("#backupFile").setInputFiles({
    name:"corrupt.pdfworkspace",mimeType:"application/octet-stream",buffer:bad,
  });
  await expect(page.locator("#backupStatus")).toContainText("Geri yükleme başarısız");
  expect(await page.evaluate(async()=>{
    const {readWorkspaceData}=await import("/pdf/src/workspace-data.js");
    return (await readWorkspaceData()).revision;
  })).toBe(unchanged);

  await page.evaluate(async()=>{
    const {readWorkspaceData,saveWorkspaceData}=await import("/pdf/src/workspace-data.js");
    const before=await readWorkspaceData();
    const items=before.state.items.map(w=>w.id===2?{...w,notes:[],linkedPages:[]}:w);
    await saveWorkspaceData({...before.state,items},before.revision);
  });
  await page.reload();
  await expect(page.locator("#pageTotal")).toHaveText("0");
  await page.locator("#menuButton").click();
  await page.locator("#openLibrary").click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#backupFile").setInputFiles({
    name:"safe.pdfworkspace",mimeType:"application/octet-stream",buffer:bytes,
  });
  await expect(page.locator("#backupStatus")).toContainText("Yedek geri yüklendi");
  await expect(page.locator("#pageTotal")).toHaveText("2");
  const result=await page.evaluate(async()=>{
    const {readWorkspaceData,readWorkspaceBundle}=await import("/pdf/src/workspace-data.js");
    const [metadata,bundle]=await Promise.all([readWorkspaceData(),readWorkspaceBundle()]);
    return {
      links:metadata.state.items.find(x=>x.id===2).linkedPages.map(x=>x.page),
      bookmarks:metadata.state.items.find(x=>x.id===2).notes.map(x=>x.page),
      pdfNames:bundle.records.map(x=>x.name),
    };
  });
  expect(result.links).toEqual([2,7]);
  expect(result.bookmarks).toEqual([2]);
  expect(result.pdfNames).toEqual(["source.pdf"]);
});
