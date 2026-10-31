import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { exportLinkedPages } from "../src/pdf-export.js";

async function pdfSource(name, size, lastModified, caption) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 3; index++) {
    const page = pdf.addPage([300 + size + index, 500 + index]);
    page.drawText(caption + " page " + (index + 1), { x: 30, y: 400, size: 14, font });
  }
  const data = await pdf.save();
  const file = new Blob([data], { type: "application/pdf" });
  file.name = name;
  file.lastModified = lastModified;
  return file;
}

test("export creates a real PDF containing selected source pages in custom order", async () => {
  const a = await pdfSource("first.pdf", 20, 101, "First");
  const b = await pdfSource("second.pdf", 60, 202, "Second");
  const refs = [
    { sourceWorkspaceId: 2, sourceFileName: b.name, sourceSize: b.size,
      sourceLastModified: b.lastModified, page: 3 },
    { sourceWorkspaceId: 1, sourceFileName: a.name, sourceSize: a.size,
      sourceLastModified: a.lastModified, page: 2 },
    { sourceWorkspaceId: 2, sourceFileName: b.name, sourceSize: b.size,
      sourceLastModified: b.lastModified, page: 1 },
  ];
  let loads = 0, progress = [];
  const output = await exportLinkedPages({
    workspace: { id: 3, mode: "pages", fileName: "", linkedPages: refs },
    workspaces: [{ id: 1, fileName: a.name },{ id: 2, fileName: b.name }],
    loadFile: async id => { loads++; return id===1 ? a : b; },
    onProgress: update => progress.push(update.completed),
  });
  const merged = await PDFDocument.load(output);
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(merged.getPages().map(p=>p.getWidth()), [362,321,360]);
  assert.equal(loads, 2, "one source opened once regardless of number of selected pages");
  assert.deepEqual(progress, [1,2,3]);
});

test("export refuses missing/replaced sources and never substitutes placeholder pages", async () => {
  const source = await pdfSource("paper.pdf", 10, 101, "Paper");
  const ref = { sourceWorkspaceId:1, sourceFileName:"paper.pdf",
    sourceSize:source.size, sourceLastModified:101, page:1 };
  const args = {
    workspace:{ mode:"pages", fileName:"", linkedPages:[ref] },
    workspaces:[{ id:1, fileName:"paper.pdf" }],
    loadFile:async()=>({...source, lastModified:999}),
  };
  await assert.rejects(exportLinkedPages(args), /doğrulanamadı/);
  await assert.rejects(exportLinkedPages({...args,workspaces:[]}), /değişmiş|silinmiş/);
  await assert.rejects(exportLinkedPages({...args,loadFile:async()=>source,
    workspace:{...args.workspace, linkedPages:[{...ref,page:99}]} }), /bulunamadı/);
});

test("export supports cancellation without modifying persisted metadata", async () => {
  const a = await pdfSource("cancel.pdf", 20, 101, "Cancel");
  const ref = {sourceWorkspaceId:1, sourceFileName:a.name, sourceSize:a.size, sourceLastModified:101, page:1};
  let cancel=false;
  const args={workspace:{mode:"pages",fileName:"",linkedPages:[ref,{...ref,page:2}]},
    workspaces:[{id:1,fileName:"cancel.pdf"}],loadFile:async()=>a,
    isCancelled:()=>cancel,onProgress:()=>{cancel=true}};
  await assert.rejects(exportLinkedPages(args), /iptal/);
  assert.equal(args.workspace.linkedPages.length,2);
});
