import test from "node:test";
import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import {
  initialWorkspaces, addWorkspace, switchWorkspace, activeWorkspace,
  setWorkspaceFile, addLinkedWorkspacePages, reorderLinkedWorkspacePage,
  removeLinkedWorkspacePage, removeWorkspace, readWorkspaces, savePageBookmark,
  saveSelectedText, setWorkspaceLastPage, MAX_WORKSPACES, MAX_LINKED_PAGES,
} from "../src/workspace-store.js";
import { createWorkspaceBackup, parseWorkspaceBackup, inspectWorkspaceIntegrity } from "../src/workspace-data.js";
import { samePdfContent, replacementWorkspaceState } from "../src/pdf-replacement.js";
import { dependentPageLinks, stalePageLinks } from "../src/workspace-dependencies.js";
import { createPdfFixture } from "./helpers/pdf-fixtures.mjs";

function workspaceGrid() {
  let state = setWorkspaceFile(initialWorkspaces(), "source.pdf");
  for (let index = 1; index < MAX_WORKSPACES; index++) state = addWorkspace(state);
  return state;
}
function linkedFixture(sourceSize) {
  let state = workspaceGrid();
  const source = { sourceWorkspaceId:1,sourceFileName:"source.pdf", sourceSize,
    sourceLastModified:123, pages:Array.from({length:MAX_LINKED_PAGES},(_,i)=>i+1) };
  state = addLinkedWorkspacePages(state,source);
  return state;
}

test("maximum 20 workspaces remain distinct and cannot silently exceed limit",()=>{
  const state=workspaceGrid();
  assert.equal(state.items.length,20);
  assert.equal(state.activeId,20);
  assert.equal(addWorkspace(state),state);
  const restored=readWorkspaces(JSON.stringify(state));
  assert.deepEqual(restored.items.map(w=>w.id),Array.from({length:20},(_,i)=>i+1));
});

test("100 linked pages survive reorder, annotation remap, removal and serialization",()=>{
  const state=linkedFixture(1250);
  assert.equal(activeWorkspace(state).linkedPages.length,100);
  assert.equal(activeWorkspace(state).mode,"pages");
  assert.equal(addLinkedWorkspacePages(state,{sourceWorkspaceId:1,sourceFileName:"source.pdf",
    sourceSize:1250,sourceLastModified:123,pages:[101]}),state);
  let changed=savePageBookmark(state,{id:"first",page:1,fileName:"@workspace-linked-pages",savedAt:10});
  changed=saveSelectedText(changed,{id:"last",text:"valuable",page:100,fileName:"@workspace-linked-pages",
    savedAt:11,rects:[]});
  changed=setWorkspaceLastPage(changed,100);
  changed=reorderLinkedWorkspacePage(changed,100,1,false);
  assert.equal(activeWorkspace(changed).linkedPages[0].page,100);
  assert.equal(activeWorkspace(changed).notes.find(n=>n.id==="last").page,1);
  assert.equal(activeWorkspace(changed).notes.find(n=>n.id==="first").page,2);
  assert.equal(activeWorkspace(changed).lastPage,1);
  const restored=readWorkspaces(JSON.stringify(changed));
  assert.equal(restored.items[19].linkedPages.length,100);
  assert.equal(restored.items[19].notes.length,2);
  const removed=removeLinkedWorkspacePage(restored,restored.items[19].linkedPages[0].id);
  assert.equal(activeWorkspace(removed).linkedPages.length,99);
  assert.equal(activeWorkspace(removed).notes.some(n=>n.id==="last"),false);
  assert.equal(activeWorkspace(removed).notes.find(n=>n.id==="first").page,1);
});

test("source replacement leaves dependent references stale, not silently redirected",()=>{
  const state=linkedFixture(1250);
  assert.equal(dependentPageLinks(state,1).length,100);
  const sourceState=switchWorkspace(state,1);
  const next=replacementWorkspaceState(sourceState,1,"replacement.pdf");
  assert.equal(next.items[19].linkedPages.length,100);
  const links=stalePageLinks(next,[{workspaceId:1,name:"replacement.pdf",size:1250,lastModified:124}]);
  assert.equal(links.length,100);
  const deleted=removeWorkspace(sourceState,1);
  assert.equal(dependentPageLinks(deleted,1).length,100);
});

test("same PDF bytes retain identity even if file name and mtime change",async()=>{
  const bytes=createPdfFixture(10);
  const a=new Blob([bytes]);a.name="original.pdf";a.lastModified=1;
  const b=new Blob([bytes]);b.name="renamed.pdf";b.lastModified=2;
  const changed=new Blob([createPdfFixture(10,{prefix:"CHANGED"})]);
  assert.equal(await samePdfContent(a,b,1024),true);
  assert.equal(await samePdfContent(a,changed,1024),false);
});

test("full backup round-trip retains 20 workspaces, all source PDF bytes, 100 links and bookmarks",async()=>{
  const bytes=createPdfFixture(100,{prefix:"BACKUP"});
  let state=linkedFixture(bytes.length);
  state=savePageBookmark(state,{id:"linked-bookmark",page:99,
    fileName:"@workspace-linked-pages",savedAt:42});
  const record={workspaceId:1,name:"source.pdf",type:"application/pdf",lastModified:123,
    blob:new Blob([bytes],{type:"application/pdf"})};
  assert.deepEqual(await inspectWorkspaceIntegrity(state,[record]),{
    missing:[],orphan:[],brokenLinks:[],
  });
  const backup=await createWorkspaceBackup(state,[record]);
  const restored=await parseWorkspaceBackup(backup);
  assert.equal(restored.state.items.length,20);
  assert.equal(restored.state.items[19].linkedPages.length,100);
  assert.equal(restored.state.items[19].notes[0].page,99);
  assert.equal(restored.records.length,1);
  const restoredBytes=new Uint8Array(await restored.records[0].blob.arrayBuffer());
  assert.deepEqual(restoredBytes,new Uint8Array(bytes));
  const corrupted=new Uint8Array(await backup.arrayBuffer());
  corrupted[corrupted.length-1]^=1;
  await assert.rejects(parseWorkspaceBackup(new Blob([corrupted])),/bütünlük/);
});
