import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { clampPage, clampScale, chooseDeviceScale, fitScale, MIN_SCALE, MAX_SCALE } from "./viewer-math.js";
import {
  WORKSPACE_STORAGE_KEY, MAX_WORKSPACES, MAX_SAVED_TEXTS,
  initialWorkspaces, readWorkspaces, activeWorkspace, addWorkspace, switchWorkspace,
  setWorkspaceFile, clearActiveWorkspace, removeWorkspace, saveSelectedText, savePageBookmark,
  removeSelectedText, removePageBookmarks, bookmarkedPageNumbers, orderedBookmarkedPageNumbers,
  reorderBookmarkedPage, moveBookmarkedPage, MAX_HIGHLIGHT_RECTS,
  DEFAULT_WORKSPACE_VIEW, setWorkspaceView,
  MAX_LINKED_PAGES, addLinkedWorkspacePages, removeLinkedWorkspacePage,
} from "./workspace-store.js";
import { saveWorkspacePdf, loadWorkspacePdf, deleteWorkspacePdf, listWorkspacePdfs, deleteWorkspacePdfIfMatches, replaceWorkspacePdfWithMetadata } from "./pdf-storage.js";
import { samePdfContent, replacementWorkspaceState } from "./pdf-replacement.js";
import { initializeWorkspaceData, readWorkspaceData, saveWorkspaceData, writeWorkspaceAndPdf,
  getAllStoredPdfs, createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup,
  inspectWorkspaceIntegrity } from "./workspace-data.js";
import { classifyLibraryPdfs, measureLocalStorage, formatBytes, libraryWorkspaceSlots, libraryBookmarkSummary, paginateLibraryBookmarkPages } from "./library-utils.js";
import { linkedPickerWindow, isOutsideDialogRect } from "./linked-picker-utils.js";
import { openLinkedDocument, isLinkedOnlyWorkspace, workspaceDocumentName } from "./linked-document.js";
import "./style.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = (id) => document.getElementById(id);
const ui = {
  app: $("app"), menu: $("menuButton"),
  input: $("fileInput"), emptyOpen: $("emptyOpenButton"),
  emptyHeading: $("emptyHeading"), emptyDescription: $("emptyDescription"),
  emptyDropHint: $("emptyDropHint"),
  emptyAddPages: $("emptyAddPagesButton"), addPagesToolbar: $("addPagesToolbar"),
  activeWorkspaceLabel: $("activeWorkspaceLabel"), workspaceSidebar: $("workspaceSidebar"),
  sidebarBackdrop: $("sidebarBackdrop"), closeSidebar: $("closeSidebar"),
  workspaceList: $("workspaceList"), workspaceCount: $("workspaceCount"),
  createWorkspace: $("createWorkspace"), openLibrary: $("openLibrary"),
  readerPage: document.querySelector("main.workspace"), libraryPage: $("libraryPage"),
  libraryTitle: $("libraryTitle"),
  addLinkedPagesDialog: $("addLinkedPagesDialog"), closeAddLinkedPages: $("closeAddLinkedPages"),
  cancelAddLinkedPages: $("cancelAddLinkedPages"), confirmAddLinkedPages: $("confirmAddLinkedPages"),
  linkedSourceGrid: $("linkedSourceGrid"), linkedSourceCount: $("linkedSourceCount"),
  linkedPagePickerGrid: $("linkedPagePickerGrid"), linkedSelectionCount: $("linkedSelectionCount"),
  linkedPickerPrev: $("linkedPickerPrev"), linkedPickerNext: $("linkedPickerNext"),
  linkedPickerPageLabel: $("linkedPickerPageLabel"), linkedPagesMessage: $("linkedPagesMessage"),
  libraryPdfSize: $("libraryPdfSize"), libraryPdfCount: $("libraryPdfCount"),
  libraryLocalSize: $("libraryLocalSize"), libraryLocalCount: $("libraryLocalCount"),
  libraryTotalSize: $("libraryTotalSize"), libraryOrphanCount: $("libraryOrphanCount"),
  libraryList: $("libraryList"), libraryWorkspaceGrid: $("libraryWorkspaceGrid"),
  libraryWorkspaceCount: $("libraryWorkspaceCount"), libraryQuotaText: $("libraryQuotaText"),
  libraryQuotaProgress: $("libraryQuotaProgress"), libraryPersistenceStatus: $("libraryPersistenceStatus"),
  libraryPersist: $("libraryPersist"),
  backupExport: $("backupExport"), backupImport: $("backupImport"), backupFile: $("backupFile"),
  backupStatus: $("backupStatus"), integrityStatus: $("integrityStatus"), integrityRefresh: $("integrityRefresh"),
  libraryBookmarksDialog: $("libraryBookmarksDialog"),
  libraryBookmarksTitle: $("libraryBookmarksTitle"),
  libraryBookmarksSummary: $("libraryBookmarksSummary"),
  libraryBookmarkPages: $("libraryBookmarkPages"),
  libraryBookmarkPrev: $("libraryBookmarkPrev"),
  libraryBookmarkNext: $("libraryBookmarkNext"),
  libraryBookmarkPaginationLabel: $("libraryBookmarkPaginationLabel"),
  closeLibraryBookmarks: $("closeLibraryBookmarks"),
  deleteLibraryPdfDialog: $("deleteLibraryPdfDialog"), deleteLibraryPdfName: $("deleteLibraryPdfName"),
  cancelDeleteLibraryPdf: $("cancelDeleteLibraryPdf"), cancelDeleteLibraryPdfTop: $("cancelDeleteLibraryPdfTop"),
  confirmDeleteLibraryPdf: $("confirmDeleteLibraryPdf"),
  replaceDialog: $("replaceDialog"), replaceTitle: $("replaceTitle"), replaceWorkspaceName: $("replaceWorkspaceName"), replaceMessage: $("replaceMessage"),
  deleteWorkspaceDialog: $("deleteWorkspaceDialog"), deleteWorkspaceName: $("deleteWorkspaceName"),
  cancelDeleteWorkspace: $("cancelDeleteWorkspace"), cancelDeleteWorkspaceTop: $("cancelDeleteWorkspaceTop"),
  confirmDeleteWorkspace: $("confirmDeleteWorkspace"),
  cancelReplace: $("cancelReplace"), cancelReplaceTop: $("cancelReplaceTop"),
  confirmReplace: $("confirmReplace"), selectionMenu: $("selectionMenu"),
  copySelection: $("copySelection"), saveSelection: $("saveSelection"), bookmarkPage: $("bookmarkPage"),
  moveBookmarkPrevious: $("moveBookmarkPrevious"), moveBookmarkNext: $("moveBookmarkNext"),
  removeBookmarkedPage: $("removeBookmarkedPage"), removeHighlight: $("removeHighlight"),
  fileLabel: $("fileLabel"), pdfInfoButton: $("pdfInfoButton"), pdfInfoDialog: $("pdfInfoDialog"),
  closePdfInfo: $("closePdfInfo"), pdfInfoFileName: $("pdfInfoFileName"), pdfInfoDetails: $("pdfInfoDetails"),
  prev: $("prevPage"), next: $("nextPage"),
  pageInput: $("pageInput"), pageTotal: $("pageTotal"), zoomOut: $("zoomOut"),
  zoomIn: $("zoomIn"), zoomRange: $("zoomRange"), zoomInput: $("zoomInput"),
  fitTrigger: $("fitMenuButton"), fitMenu: $("fitMenu"),
  fitButtons: [...document.querySelectorAll("[data-fit]")],
  direction: $("directionButton"), directionMenu: $("directionMenu"),
  directionOptions: [...document.querySelectorAll("[data-orientation]")],
  thumbnails: $("thumbsToggle"), thumbsMenu: $("thumbsMenu"),
  thumbnailOptions: [...document.querySelectorAll("[data-thumbs]")],
  viewer: $("viewer"), pages: $("pages"), bookmarkPagesEmpty: $("bookmarkPagesEmpty"),
  empty: $("emptyState"), thumbPane: $("thumbsPane"), thumbList: $("thumbList"),
  thumbPages: $("thumbPages"), thumbBookmarks: $("thumbBookmarks"), thumbEmpty: $("thumbEmpty"),
  thumbPagesCount: $("thumbPagesCount"), thumbBookmarksCount: $("thumbBookmarksCount"),
  loading: $("loading"), loadingText: $("loadingText"),
  status: $("statusText"),
  toast: $("toast"), dropOverlay: $("dropOverlay"),
};

const ZOOM_STEPS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6];
const MAX_PAGE_RENDERS = 2;
const MAX_THUMB_RENDERS = 1;
const state = {
  doc: null, loadingTask: null, generation: 0, renderEpoch: 0, thumbEpoch: 0,
  pageCount: 0, current: 1, scale: 1, fit: "page", fileSize: 0,
  orientation: "vertical", thumbPosition: "left", thumbsVisible: true,
  thumbnailMode: "pages",
  dimensions: [], shells: [], thumbs: [], thumbEntries: [],
  visible: new Set(), pending: new Set(), rendered: new Map(),
  renderTasks: new Map(), textLayers: new Map(), highlightRegions: new Map(), activeRenders: 0, observer: null,
  thumbVisible: new Set(), thumbPending: new Set(), thumbRendered: new Set(),
  thumbTasks: new Map(), activeThumbRenders: 0, thumbObserver: null,
  scrollFrame: 0, toastTimer: 0,
};

let workspaces = loadWorkspaces();
let workspaceRevision = 0;
let persistedWorkspaces = workspaces;
let persistenceReady = false;
let persistenceFailed = false;
let pendingSaves = Promise.resolve();
const workspaceBroadcast = typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("pdf-workspace-database-v2") : null;
let staleExternalRevision = false;
const workspaceFiles = new Map(); // Active files are cached in memory; persistent copies live in IndexedDB.
let pendingDeleteWorkspaceId = null;
let pendingLibraryDeletion = null;
let libraryBookmarkWorkspaceId = null;
let libraryBookmarkPageIndex = 0;
let libraryBookmarkPreviewSession = null;
let libraryRequestId = 0;
let linkedPickerSession = null;
const LINKED_PICKER_PAGE_SIZE = 12;
const libraryPreviewTasks = new Set();
const libraryPreviewCache = new Map(); // Small in-memory first-page thumbnails, not PDF files.
let pendingDropFile = null;
let pendingOpenWorkspaceId = null;
let pickingWorkspaceId = null;
let contextSelection = null;
let contextPageBookmark = null;
let hoveredHighlightNoteId = null;
let draggingBookmarkPage = null;
let touchBookmarkDrag = null;
let mousePan = null;
let touchPinch = null;
let trackpadGestureScale = null;
let openViewPanel = null;
let openViewTrigger = null;

function loadWorkspaces() {
  try { return readWorkspaces(localStorage.getItem(WORKSPACE_STORAGE_KEY)); }
  catch { return initialWorkspaces(); }
}

function ensureWritable() {
  if (!persistenceReady || persistenceFailed || staleExternalRevision) {
    throw new Error(staleExternalRevision
      ? "Başka sekmede yeni kayıt var. Kaybetmemek için bu sekmeyi yenile."
      : "Veri deposu hazır değil veya yazma hatası oluştu. Sayfayı yenile.");
  }
}
function broadcastWorkspaceRevision() {
  workspaceBroadcast?.postMessage({ revision: workspaceRevision });
}
async function handlePersistenceFailure(error) {
  if (persistenceFailed) return;
  persistenceFailed = true;
  console.error("Workspace IndexedDB save failed:", error);
  showToast("Kayıt yapılamadı! Önceki kayıtlar korunuyor. Veri kaybını önlemek için sayfayı yenile.");
  const old = workspaces.activeId;
  cancelAllWork();
  workspaces = persistedWorkspaces;
  renderWorkspaceSidebar();
  applyWorkspaceView();
  void restoreWorkspacePdf(workspaces.activeId);
}
function persistWorkspaces() {
  if (!persistenceReady || persistenceFailed || staleExternalRevision) {
    showToast("Workspace kaydedilemedi. Diğer sekmeleri kapatıp sayfayı yenile.");
    return Promise.reject(new Error("Workspace kayıtları kilitlendi"));
  }
  // Each immutable snapshot is committed in order; compare-and-swap revision
  // prevents any other tab from silently overwriting this tab's changes.
  const snapshot = workspaces;
  pendingSaves = pendingSaves.then(async () => {
    ensureWritable();
    const revision = await saveWorkspaceData(snapshot, workspaceRevision);
    workspaceRevision = revision;
    persistedWorkspaces = snapshot;
    broadcastWorkspaceRevision();
    return revision;
  });
  pendingSaves.catch(error => { void handlePersistenceFailure(error); });
  return pendingSaves;
}
async function waitForWorkspaceSaves() {
  await pendingSaves;
  ensureWritable();
}
async function initializePersistence() {
  try {
    const legacy = (() => { try { return localStorage.getItem(WORKSPACE_STORAGE_KEY); } catch { return null; } })();
    const loaded = await initializeWorkspaceData(legacy);
    workspaces = loaded.state;
    persistedWorkspaces = loaded.state;
    workspaceRevision = loaded.revision;
    persistenceReady = true;
    renderWorkspaceSidebar();
    applyWorkspaceView();
    await restoreWorkspacePdf(workspaces.activeId);
    if (loaded.migrated) showToast("Workspace ve yer imleri IndexedDB'ye güvenle aktarıldı.");
  } catch (error) {
    console.error("Workspace IndexedDB initialisation failed:", error);
    persistenceFailed = true;
    showToast("IndexedDB açılamadı: değişiklikler kaydedilmeyecek. Tarayıcı depolama ayarlarını kontrol et.");
    renderWorkspaceSidebar();
    applyWorkspaceView();
  } finally {
    document.body.style.pointerEvents = "";
  }
}
workspaceBroadcast?.addEventListener("message", (event) => {
  if (event.data?.revision > workspaceRevision) {
    staleExternalRevision = true;
    showToast("Workspace başka sekmede değişti. Çakışmayı önlemek için sayfayı yenile.");
  }
});

function updateWorkspaces(next) {
  if (next === workspaces) return;
  try { ensureWritable(); } catch (error) { showToast(error.message); return; }
  workspaces = next;
  persistWorkspaces();
  hideHighlightRemove();
  renderWorkspaceSidebar();
  refreshVisibleHighlights();
}

function workspaceDisplayName(item) {
  return `W${item.id}`;
}

function renderWorkspaceSidebar() {
  const active = activeWorkspace(workspaces);
  ui.activeWorkspaceLabel.textContent = workspaceDisplayName(active);
  ui.addPagesToolbar.hidden = !isLinkedOnlyWorkspace(active);
  ui.emptyOpen.hidden = isLinkedOnlyWorkspace(active);
  ui.emptyAddPages.hidden = Boolean(active?.fileName || active?.mode === "pdf");
  if (isLinkedOnlyWorkspace(active)) {
    ui.emptyHeading.textContent = "Sayfalarını ekle, okumaya başla.";
    ui.emptyDescription.textContent = "Diğer workspace'lerdeki PDF'lerden sayfalar seç. Kaynak dosyalar korunur.";
    ui.emptyDropHint.hidden = true;
  } else {
    ui.emptyHeading.textContent = "PDF dosyanı aç, okumaya başla.";
    ui.emptyDescription.textContent = "Bilgisayarından PDF açabilir veya başka workspace'lerden sayfa seçebilirsin.";
    ui.emptyDropHint.hidden = false;
  }
  ui.workspaceCount.textContent = `${workspaces.items.length} / ${MAX_WORKSPACES}`;
  ui.createWorkspace.disabled = workspaces.items.length >= MAX_WORKSPACES;
  ui.createWorkspace.title = ui.createWorkspace.disabled ? `En fazla ${MAX_WORKSPACES} workspace oluşturulabilir` : "Yeni çalışma alanı";
  updateThumbnailFilter();
  ui.workspaceList.replaceChildren();
  for (const item of workspaces.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-choice" + (item.id === workspaces.activeId ? " active" : "");
    button.setAttribute("aria-current", item.id === workspaces.activeId ? "true" : "false");
    const number = document.createElement("span");
    number.className = "workspace-number";
    number.textContent = String(item.id);
    const metadata = document.createElement("span");
    metadata.className = "workspace-meta";
    const title = document.createElement("strong");
    title.textContent = workspaceDisplayName(item);
    const caption = document.createElement("small");
    caption.textContent = `${item.notes.length} yer imi · ${item.linkedPages?.length || 0} ek sayfa · ${item.fileName || (isLinkedOnlyWorkspace(item) ? "Sayfa derlemesi" : "PDF açılmadı")}`;
    metadata.append(title, caption);
    button.append(number, metadata);
    button.addEventListener("click", () => changeWorkspace(item.id));
    const open = document.createElement("button");
    open.type = "button";
    open.className = "workspace-open";
    open.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';
    open.title = isLinkedOnlyWorkspace(item)
      ? `${workspaceDisplayName(item)} için sayfa ekle`
      : `${workspaceDisplayName(item)} için PDF aç`;
    open.setAttribute("aria-label", open.title);
    open.addEventListener("click", () => {
      if (isLinkedOnlyWorkspace(item)) {
        if (workspaces.activeId !== item.id) changeWorkspace(item.id);
        openAddLinkedPagesDialog();
      } else askToOpen(null, item.id);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "workspace-delete";
    remove.textContent = "×";
    remove.title = `${workspaceDisplayName(item)} çalışma alanını sil`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => askDeleteWorkspace(item.id));
    const row = document.createElement("div");
    row.className = "workspace-row";
    row.append(button, open, remove);
    ui.workspaceList.append(row);
  }

}

function openSidebar() {
  hideSelectionMenu();
  ui.workspaceSidebar.inert = false;
  ui.workspaceSidebar.setAttribute("aria-hidden", "false");
  ui.workspaceSidebar.classList.add("is-open");
  ui.sidebarBackdrop.hidden = false;
  ui.menu.setAttribute("aria-expanded", "true");
  ui.closeSidebar.focus();
}

function closeSidebar() {
  ui.workspaceSidebar.classList.remove("is-open");
  ui.workspaceSidebar.setAttribute("aria-hidden", "true");
  ui.workspaceSidebar.inert = true;
  ui.sidebarBackdrop.hidden = true;
  ui.menu.setAttribute("aria-expanded", "false");
  ui.menu.focus({ preventScroll: true });
}

function changeWorkspace(id) {
  closeLibrary();
  if (id === workspaces.activeId) { closeSidebar(); return; }
  cancelAllWork();
  workspaces = switchWorkspace(workspaces, id);
  persistWorkspaces();
  applyWorkspaceView();
  renderWorkspaceSidebar();
  closeSidebar();
  void restoreWorkspacePdf(id);
}

async function restoreWorkspacePdf(workspaceId) {
  if (workspaces.activeId !== workspaceId) return;
  const saved = activeWorkspace(workspaces);
  if (!saved) return;
  if (isLinkedOnlyWorkspace(saved)) {
    if (saved.linkedPages?.length) await openLinkedWorkspaceReader();
    return;
  }
  if (!saved.fileName) return;
  const generation = state.generation;
  setLoading(true, "Workspace PDF'si geri yükleniyor…");
  try {
    const file = workspaceFiles.get(workspaceId) || await loadWorkspacePdf(workspaceId);
    if (generation !== state.generation || workspaces.activeId !== workspaceId) return;
    if (!file || file.name.slice(0, 255) !== saved.fileName) {
      showToast("Kaydedilmiş PDF bulunamadı. Yer imleri korunuyor; PDF'yi yeniden açabilirsin.");
      return;
    }
    workspaceFiles.set(workspaceId, file);
    if (saved.linkedPages?.length) await openLinkedWorkspaceReader(file);
    else await openPDF(file, { persistFile: false });
  } catch (error) {
    if (generation === state.generation) {
      console.warn("Workspace PDF restore failed:", error);
      showToast("PDF geri yüklenemedi. Tarayıcı depolaması engellenmiş veya temizlenmiş olabilir.");
    }
  } finally {
    if (generation === state.generation) setLoading(false);
  }
}

/** Reuse the normal page, thumbnail, zoom and annotation renderer for referenced pages. */
async function openLinkedWorkspaceReader(baseFile = null) {
  const workspace = activeWorkspace(workspaces);
  if (!workspace?.linkedPages?.length) return;
  if (!isLinkedOnlyWorkspace(workspace) && (!baseFile || !workspace.fileName)) return;
  const workspaceId = workspace.id;
  cancelAllWork();
  state.fit = workspace.view?.fit || DEFAULT_WORKSPACE_VIEW.fit;
  state.thumbnailMode = "pages";
  ui.pages.classList.toggle("fit-height", state.fit === "height");
  const generation = state.generation;
  setLoading(true, "Seçilen PDF sayfaları açılıyor…");
  let linkedDoc;
  try {
    linkedDoc = await openLinkedDocument({
      references: workspace.linkedPages,
      base: baseFile,
      workspaces: workspaces.items,
      loadFile: loadWorkspacePdf,
      pdfjs,
      isCancelled: () => generation !== state.generation || workspaces.activeId !== workspaceId,
    });
    if (generation !== state.generation || workspaces.activeId !== workspaceId) {
      await linkedDoc.destroy();
      return;
    }
    const first = await linkedDoc.getPage(1);
    if (generation !== state.generation || workspaces.activeId !== workspaceId) {
      await linkedDoc.destroy();
      return;
    }
    const rect = first.getViewport({ scale: 1 });
    state.loadingTask = linkedDoc;
    state.doc = linkedDoc;
    state.pageCount = linkedDoc.numPages;
    state.dimensions = new Array(state.pageCount);
    state.dimensions[0] = { width: rect.width, height: rect.height };
    state.fileSize = baseFile?.size || 0;
    ui.app.classList.add("has-document");
    ui.empty.hidden = true;
    ui.pages.hidden = false;
    ui.fileLabel.textContent = baseFile
      ? `${workspace.fileName} + ${workspace.linkedPages.length} sayfa`
      : `Sayfa derlemesi · ${linkedDoc.numPages} sayfa`;
    ui.fileLabel.title = `W${workspaceId} · kaynak PDF'lerden seçilmiş sayfalar`;
    ui.pdfInfoButton.disabled = true;
    ui.status.textContent = `${linkedDoc.numPages} sayfa · PDF'ler kaynak workspace'lerde`;
    createPageElements();
    updateSettingsView();
    updateToolbar();
    renderWorkspaceSidebar();
    applyFit(state.fit === "custom" ? "width" : state.fit);
    initializeObservers();
    ui.viewer.scrollTop = 0;
    ui.viewer.scrollLeft = 0;
  } catch (error) {
    if (linkedDoc && state.loadingTask !== linkedDoc) await linkedDoc.destroy();
    if (generation !== state.generation) return;
    console.warn("Linked page reader failed:", error);
    cancelAllWork();
    showToast(error?.message || "Kaynak PDF sayfaları açılamadı.");
  } finally {
    if (generation === state.generation) setLoading(false);
  }
}

function askDeleteWorkspace(id) {
  const item = workspaces.items.find((entry) => entry.id === id);
  if (!item) return;
  pendingDeleteWorkspaceId = id;
  ui.deleteWorkspaceName.textContent = workspaceDisplayName(item);
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  ui.deleteWorkspaceDialog.showModal();
}

async function confirmDeleteWorkspace() {
  const id = pendingDeleteWorkspaceId;
  if (!Number.isSafeInteger(id)) return;
  ui.confirmDeleteWorkspace.disabled = true;
  ui.cancelDeleteWorkspace.disabled = true;
  ui.cancelDeleteWorkspaceTop.disabled = true;
  try {
    await waitForWorkspaceSaves();
    if (pendingDeleteWorkspaceId !== id) throw new Error("Silme hedefi değişti");
    const wasActive = workspaces.activeId === id;
    const next = removeWorkspace(workspaces, id);
    const revision = await writeWorkspaceAndPdf(next, workspaceRevision, { remove: id });
    workspaceRevision = revision;
    persistedWorkspaces = next;
    workspaces = next;
    broadcastWorkspaceRevision();
    workspaceFiles.delete(id);
    if (wasActive) cancelAllWork();
    if (wasActive) applyWorkspaceView();
    renderWorkspaceSidebar();
    ui.deleteWorkspaceDialog.close();
    pendingDeleteWorkspaceId = null;
    if (wasActive) void restoreWorkspacePdf(workspaces.activeId);
    showToast("Workspace PDF'si ve yer imleri silindi.");
  } catch (error) {
    console.warn("Workspace delete failed:", error);
    showToast("Workspace silinemedi. Tarayıcı depolamasını kontrol edip tekrar dene.");
  } finally {
    ui.confirmDeleteWorkspace.disabled = false;
    ui.cancelDeleteWorkspace.disabled = false;
    ui.cancelDeleteWorkspaceTop.disabled = false;
  }
}

async function askToOpen(file = null, workspaceId = workspaces.activeId) {
  const workspace = workspaces.items.find((item) => item.id === workspaceId);
  if (!workspace) return;
  if (isLinkedOnlyWorkspace(workspace)) {
    showToast("Bu workspace yalnızca başka PDF'lerden sayfa kabul ediyor.");
    return;
  }
  hideSelectionMenu();
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  // Select the PDF first; only warn when the chosen file really differs.
  if (!file) {
    pickingWorkspaceId = workspaceId;
    ui.input.click();
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showToast("Lütfen bir PDF dosyası seç.");
    return;
  }
  try {
    if (workspace.fileName) {
      const existing = await loadWorkspacePdf(workspaceId);
      if (existing && await samePdfContent(existing, file)) {
        showToast("Aynı PDF zaten kayıtlı. Yer imleri ve vurgular korundu.");
        if (workspaces.activeId === workspaceId && !state.doc) void restoreWorkspacePdf(workspaceId);
        return;
      }
    }
  } catch (error) {
    console.warn("PDF identity comparison failed:", error);
    showToast("PDF karşılaştırılamadı; önceki kayıtlar korundu. Yeniden dene.");
    return;
  }
  if (!workspaces.items.some(item => item.id === workspaceId) ||
      workspaces.items.find(item => item.id === workspaceId)?.fileName !== workspace.fileName) {
    showToast("Workspace değişti. PDF seçimini yeniden yap.");
    return;
  }
  pendingDropFile = file;
  pendingOpenWorkspaceId = workspaceId;
  ui.replaceWorkspaceName.textContent = workspaceDisplayName(workspace);
  const hasPdf = Boolean(workspace.fileName);
  ui.replaceTitle.textContent = hasPdf ? "Mevcut PDF değiştirilsin mi?" : "Bu workspace'e PDF açılsın mı?";
  ui.replaceMessage.textContent = hasPdf
    ? ` çalışma alanında “${workspace.fileName}” adlı PDF bulunuyor. Farklı PDF başarıyla kaydedilirse eski PDF, yer imleri ve metin vurguları silinecek. Devam edilsin mi? Diğer workspace'ler korunacak.`
    : workspace.notes.length
      ? " çalışma alanına PDF kaydedildiğinde önceki yer imleri temizlenecek. Devam edilsin mi?"
      : " çalışma alanına seçilen PDF kaydedilsin mi?";
  ui.confirmReplace.textContent = hasPdf ? "Evet, PDF'yi değiştir" : "PDF'yi aç";
  ui.replaceDialog.showModal();
}

function openPdfForWorkspace(file, workspaceId) {
  if (!file || !workspaces.items.some((item) => item.id === workspaceId)) return;
  closeLibrary();
  if (isLinkedOnlyWorkspace(workspaces.items.find((item) => item.id === workspaceId))) {
    showToast("Bu workspace'e PDF eklenemez; yalnızca sayfa eklenebilir.");
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showToast("Lütfen bir PDF dosyası seç.");
    return;
  }
  if (workspaces.activeId !== workspaceId) {
    cancelAllWork();
    workspaces = switchWorkspace(workspaces, workspaceId);
    persistWorkspaces();
    applyWorkspaceView();
    renderWorkspaceSidebar();
  }
  void openPDF(file, { replaceWorkspace: true });
}

// PDF text layers are rebuilt at every zoom level. Store selected glyph geometry as
// fractions of the page, so yellow highlights survive zoom, reload and workspace switches.
function highlightRectsFromRange(range, layer, surface) {
  if (!range || !layer || !surface) return [];
  const bounds = surface.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];
  const rects = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && rects.length < MAX_HIGHLIGHT_RECTS) {
    if (!node.textContent || !range.intersectsNode(node)) continue;
    const fragment = document.createRange();
    fragment.selectNodeContents(node);
    if (range.startContainer === node) fragment.setStart(node, range.startOffset);
    if (range.endContainer === node) fragment.setEnd(node, range.endOffset);
    for (const rect of fragment.getClientRects()) {
      const left = Math.max(rect.left, bounds.left);
      const top = Math.max(rect.top, bounds.top);
      const right = Math.min(rect.right, bounds.right);
      const bottom = Math.min(rect.bottom, bounds.bottom);
      if (right - left < 0.5 || bottom - top < 0.5) continue;
      const normalized = [
        (left - bounds.left) / bounds.width,
        (top - bounds.top) / bounds.height,
        (right - left) / bounds.width,
        (bottom - top) / bounds.height,
      ];
      if (!rects.some((saved) => normalized.every((v, i) => Math.abs(v - saved[i]) < 0.0005))) {
        rects.push(normalized);
      }
      if (rects.length >= MAX_HIGHLIGHT_RECTS) break;
    }
  }
  return rects;
}

// Older saved selections only contain text. Locate their first exact match,
// ignoring PDF.js line breaks, for a best-effort highlight without changing data.
function findLegacyHighlightRects(layer, surface, text) {
  if (!layer || !text) return [];
  const fold = (value) => value.replace(/\s/gu, "").toLocaleLowerCase("tr");
  const needle = fold(text);
  if (!needle) return [];
  let flat = "";
  const positions = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const value = node.textContent || "";
    for (let offset = 0; offset < value.length; offset++) {
      if (/\s/u.test(value[offset])) continue;
      const normalized = value[offset].toLocaleLowerCase("tr");
      for (const character of normalized) {
        flat += character;
        positions.push({ node, offset });
      }
    }
  }
  const found = flat.indexOf(needle);
  if (found === -1 || !positions[found + needle.length - 1]) return [];
  const first = positions[found];
  const last = positions[found + needle.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return highlightRectsFromRange(range, layer, surface);
}

function refreshPageHighlights(index) {
  const surface = state.shells[index]?.querySelector(".page-surface");
  if (!surface) return;
  surface.querySelector(".page-highlight-layer")?.remove();
  state.highlightRegions.delete(index);
  const workspace = activeWorkspace(workspaces);
  const documentName = workspaceDocumentName(workspace);
  if (!state.doc || !documentName) return;
  const notes = workspace.notes.filter((note) =>
    note.kind !== "page" && note.fileName === documentName && note.page === index + 1);
  if (!notes.length) return;
  const layer = surface.querySelector(".textLayer");
  const highlights = document.createElement("div");
  highlights.className = "page-highlight-layer";
  highlights.setAttribute("aria-hidden", "true");
  const regions = [];
  for (const note of notes) {
    const rects = note.rects?.length
      ? note.rects : findLegacyHighlightRects(layer, surface, note.text);
    if (rects.length) regions.push({ noteId: note.id, rects });
    for (const [x, y, width, height] of rects) {
      const block = document.createElement("span");
      block.className = "page-highlight";
      block.style.left = `${x * 100}%`;
      block.style.top = `${y * 100}%`;
      block.style.width = `${width * 100}%`;
      block.style.height = `${height * 100}%`;
      highlights.append(block);
    }
  }
  if (regions.length) state.highlightRegions.set(index, regions);
  if (highlights.childElementCount) surface.append(highlights);
}

function refreshVisibleHighlights() {
  for (const [index, epoch] of state.rendered) {
    if (epoch === state.renderEpoch) refreshPageHighlights(index);
  }
}

function hideHighlightRemove() {
  ui.removeHighlight.hidden = true;
  hoveredHighlightNoteId = null;
}

function handleHighlightHover(event) {
  if (!state.doc || mousePan || event.pointerType === "touch") { hideHighlightRemove(); return; }
  if (ui.removeHighlight.contains(event.target)) return;
  if (!ui.removeHighlight.hidden) {
    const rect = ui.removeHighlight.getBoundingClientRect();
    if (event.clientX >= rect.left - 7 && event.clientX <= rect.right + 7
      && event.clientY >= rect.top - 7 && event.clientY <= rect.bottom + 7) return;
  }
  const shell = event.target instanceof Element ? event.target.closest(".page-shell") : null;
  const index = shell ? Number(shell.dataset.index) : -1;
  const surface = shell?.querySelector(".page-surface");
  const bounds = surface?.getBoundingClientRect();
  const regions = state.highlightRegions.get(index) || [];
  if (!bounds || !regions.length) { hideHighlightRemove(); return; }
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i];
    for (const [x, y, width, height] of region.rects) {
      const left = bounds.left + x * bounds.width;
      const top = bounds.top + y * bounds.height;
      const right = left + width * bounds.width;
      const bottom = top + height * bounds.height;
      if (event.clientX < left - 2 || event.clientX > right + 2
        || event.clientY < top - 2 || event.clientY > bottom + 2) continue;
      hoveredHighlightNoteId = region.noteId;
      const viewer = ui.viewer.getBoundingClientRect();
      ui.removeHighlight.style.left = `${Math.max(viewer.left + 5, Math.min(right - 9, viewer.right - 32))}px`;
      ui.removeHighlight.style.top = `${Math.max(viewer.top + 5, Math.min(top - 12, viewer.bottom - 32))}px`;
      ui.removeHighlight.hidden = false;
      return;
    }
  }
  hideHighlightRemove();
}

function selectedPdfText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!ui.pages.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const start = range.startContainer;
  const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
  const pageElement = element?.closest(".page-shell");
  if (!pageElement) return null;
  const surface = pageElement.querySelector(".page-surface");
  return {
    text,
    page: Number(pageElement.dataset.index) + 1,
    fileName: workspaceDocumentName(activeWorkspace(workspaces)),
    rects: highlightRectsFromRange(range, surface?.querySelector(".textLayer"), surface),
  };
}

function hideSelectionMenu() {
  ui.selectionMenu.hidden = true;
  contextSelection = null;
  contextPageBookmark = null;
}

function showSelectionMenu(mode, clientX, clientY) {
  const pageMode = mode === "page";
  const bookmarkView = pageMode && state.thumbnailMode === "bookmarks";
  ui.copySelection.hidden = pageMode;
  ui.saveSelection.hidden = pageMode;
  ui.bookmarkPage.hidden = !pageMode || bookmarkView;
  ui.removeBookmarkedPage.hidden = !bookmarkView;
  ui.moveBookmarkPrevious.hidden = !bookmarkView;
  ui.moveBookmarkNext.hidden = !bookmarkView;
  if (bookmarkView) {
    const workspace = activeWorkspace(workspaces);
    const order = orderedBookmarkedPageNumbers(workspace, workspaceDocumentName(workspace), state.pageCount);
    const at = order.indexOf(contextPageBookmark);
    ui.moveBookmarkPrevious.disabled = at <= 0;
    ui.moveBookmarkNext.disabled = at < 0 || at >= order.length - 1;
    const vertical = state.thumbPosition === "left";
    ui.moveBookmarkPrevious.textContent = vertical ? "↑ Yukarı taşı" : "← Sola taşı";
    ui.moveBookmarkNext.textContent = vertical ? "↓ Aşağı taşı" : "Sağa taşı →";
  }
  ui.selectionMenu.setAttribute("aria-label", pageMode ? "Sayfa yer imi işlemleri" : "Seçili metin işlemleri");
  ui.selectionMenu.hidden = false;
  const width = ui.selectionMenu.offsetWidth;
  const height = ui.selectionMenu.offsetHeight;
  ui.selectionMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - width - 8))}px`;
  ui.selectionMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - height - 8))}px`;
}

function openPageContextMenu(page, clientX, clientY) {
  if (!state.doc || !Number.isSafeInteger(page) || page < 1 || page > state.pageCount) return;
  contextSelection = null;
  contextPageBookmark = page;
  ui.bookmarkPage.textContent = findPageBookmark(page) ? "Sayfa yer imini kaldır" : "Sayfayı yer imlerine ekle";
  showSelectionMenu("page", clientX, clientY);
}

function findPageBookmark(page) {
  const workspace = activeWorkspace(workspaces);
  return workspace.notes.find((note) =>
    note.kind === "page" && note.fileName === workspaceDocumentName(workspace) && note.page === page);
}

function togglePageBookmark() {
  const page = contextPageBookmark;
  hideSelectionMenu();
  if (!state.doc || !Number.isSafeInteger(page) || page < 1 || page > state.pageCount) return;
  const existing = findPageBookmark(page);
  if (existing) {
    updateWorkspaces(removeSelectedText(workspaces, existing.id));
    showToast(`Sayfa ${page} yer imi kaldırıldı.`);
    return;
  }
  const current = workspaces;
  const next = savePageBookmark(current, {
    id: typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `page-${Date.now()}-${Math.random()}`,
    page, fileName: workspaceDocumentName(activeWorkspace(workspaces)), savedAt: Date.now(),
  });
  if (next === current) {
    showToast(`Bir workspace en fazla ${MAX_SAVED_TEXTS} yer imi saklayabilir.`);
    return;
  }
  updateWorkspaces(next);
  showToast(`Sayfa ${page} yer imlerine eklendi.`);
}

function removeBookmarkedPageFromWorkspace(page) {
  const workspace = activeWorkspace(workspaces);
  const next = removePageBookmarks(workspaces, workspaceDocumentName(workspace), page);
  hideSelectionMenu();
  if (next === workspaces) return;
  updateWorkspaces(next);
  hideHighlightRemove();
  showToast(`Sayfa ${page} ve üzerindeki metin yer imleri kaldırıldı.`);
}

function moveContextBookmark(direction) {
  const page = contextPageBookmark;
  hideSelectionMenu();
  if (!state.doc || !Number.isSafeInteger(page)) return;
  const workspace = activeWorkspace(workspaces);
  updateWorkspaces(moveBookmarkedPage(workspaces, workspaceDocumentName(workspace), state.pageCount, page, direction));
}

async function copyText(value) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(value);
    showToast("Metin kopyalandı.");
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    showToast(copied ? "Metin kopyalandı." : "Kopyalama başarısız. Ctrl/Cmd+C kullanabilirsin.");
  }
}

function saveContextText() {
  if (!contextSelection) return;
  const current = workspaces;
  const next = saveSelectedText(current, {
    ...contextSelection,
    id: typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `note-${Date.now()}-${Math.random()}`,
    savedAt: Date.now(),
  });
  hideSelectionMenu();
  if (next !== current) window.getSelection()?.removeAllRanges();
  if (next === current) {
    showToast(`Bir workspace en fazla ${MAX_SAVED_TEXTS} yer imi saklayabilir.`);
    return;
  }
  updateWorkspaces(next);
  showToast("Seçilen metin workspace'e kaydedildi.");
}

function applyWorkspaceView() {
  const view = activeWorkspace(workspaces)?.view || DEFAULT_WORKSPACE_VIEW;
  state.fit = view.fit;
  state.orientation = view.orientation;
  state.thumbPosition = view.thumbPosition;
  state.thumbsVisible = view.thumbsVisible;
  state.scale = 1;
  ui.pages.classList.toggle("fit-height", view.fit === "height");
  updateSettingsView();
  updateToolbar();
}

function persistWorkspaceView(fit = null) {
  const current = activeWorkspace(workspaces);
  if (!current) return;
  const previous = current.view || DEFAULT_WORKSPACE_VIEW;
  const next = {
    fit: fit || previous.fit,
    orientation: state.orientation,
    thumbPosition: state.thumbPosition,
    thumbsVisible: state.thumbsVisible,
  };
  if (Object.keys(next).every((key) => next[key] === previous[key])) return;
  workspaces = setWorkspaceView(workspaces, next);
  persistWorkspaces();
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4500);
}

function formatPdfFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Bilinmiyor";
  const size = bytes >= 1024 * 1024 ? bytes / (1024 * 1024) : bytes / 1024;
  const unit = bytes >= 1024 * 1024 ? "MB" : "KB";
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(size)} ${unit} (${new Intl.NumberFormat("tr-TR").format(bytes)} bayt)`;
}

function pdfMetadataValue(value) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function formatPdfMetadataDate(value) {
  const text = pdfMetadataValue(value);
  const parts = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(.*)$/.exec(text);
  if (!parts) return text;
  const zone = parts[7].replace(/'/g, "");
  const zoneLabel = zone === "Z" ? " UTC"
    : /^[+-]\d{4}$/.test(zone) ? ` UTC${zone.slice(0, 3)}:${zone.slice(3)}` : "";
  return `${parts[3]}.${parts[2]}.${parts[1]} ${parts[4]}:${parts[5]}:${parts[6]}${zoneLabel}`;
}

function renderPdfInfoDetails(entries) {
  const fragment = document.createDocumentFragment();
  for (const [label, rawValue] of entries) {
    const value = pdfMetadataValue(rawValue);
    if (!value) continue;
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value; // PDF-provided strings must never become HTML.
    fragment.append(term, detail);
  }
  ui.pdfInfoDetails.replaceChildren(fragment);
}

async function showPdfInfo() {
  const doc = state.doc;
  if (!doc) return;
  const generation = state.generation;
  const workspace = activeWorkspace(workspaces);
  const basic = [
    ["Sayfa sayısı", new Intl.NumberFormat("tr-TR").format(state.pageCount)],
    ["Dosya boyutu", formatPdfFileSize(state.fileSize)],
  ];
  ui.pdfInfoFileName.textContent = workspace.fileName;
  renderPdfInfoDetails([...basic, ["Metadata", "Okunuyor…"]]);
  ui.pdfInfoDialog.showModal();
  try {
    const result = await doc.getMetadata();
    if (doc !== state.doc || generation !== state.generation || !ui.pdfInfoDialog.open) return;
    const info = result?.info || {};
    const metadata = result?.metadata;
    const xmp = (key) => {
      const value = metadata?.get?.(key);
      return pdfMetadataValue(value);
    };
    const fields = [
      ["PDF sürümü", info.PDFFormatVersion],
      ["Başlık", info.Title || xmp("dc:title")],
      ["Yazar", info.Author || xmp("dc:creator")],
      ["Konu", info.Subject || xmp("dc:description")],
      ["Anahtar kelimeler", info.Keywords],
      ["Oluşturan uygulama", info.Creator],
      ["PDF üreticisi", info.Producer],
      ["Oluşturulma tarihi", formatPdfMetadataDate(info.CreationDate)],
      ["Değiştirilme tarihi", formatPdfMetadataDate(info.ModDate)],
    ].filter(([, value]) => pdfMetadataValue(value));
    renderPdfInfoDetails([...basic, ...(fields.length ? fields : [["Ek metadata", "Bu PDF dosyasında belirtilmemiş."]])]);
  } catch (error) {
    if (doc !== state.doc || generation !== state.generation || !ui.pdfInfoDialog.open) return;
    console.warn("PDF metadata read failed:", error);
    renderPdfInfoDetails([...basic, ["Metadata", "Okunamadı."]]);
  }
}

function setLoading(busy, label = "PDF açılıyor…") {
  ui.loading.hidden = !busy;
  ui.loadingText.textContent = label;
}

function getDimensions(index) {
  return state.dimensions[index] || state.dimensions[0] || { width: 595, height: 842 };
}

function setPageSize(index) {
  const shell = state.shells[index];
  if (!shell) return;
  const { width, height } = getDimensions(index);
  shell.style.width = `${Math.ceil(width * state.scale) + 2}px`;
  shell.style.height = `${Math.ceil(height * state.scale) + 2}px`;
}

function visiblePageNumbers() {
  if (!state.doc) return [];
  if (state.thumbnailMode === "bookmarks") {
    const workspace = activeWorkspace(workspaces);
    return orderedBookmarkedPageNumbers(workspace, workspaceDocumentName(workspace), state.pageCount);
  }
  return Array.from({ length: state.pageCount }, (_, index) => index + 1);
}

function pageInActiveView(page) {
  const pages = visiblePageNumbers();
  if (!pages.length) return null;
  const requested = clampPage(page, state.pageCount);
  if (pages.includes(requested)) return requested;
  return pages.reduce((nearest, candidate) =>
    Math.abs(candidate - requested) < Math.abs(nearest - requested) ? candidate : nearest, pages[0]);
}

function stepVisiblePage(direction) {
  const pages = visiblePageNumbers();
  const index = pages.indexOf(state.current);
  if (index < 0) return pages[0] ?? null;
  return pages[Math.max(0, Math.min(pages.length - 1, index + direction))] ?? null;
}

function updateThumbnailFilter(resetScroll = false) {
  const workspace = activeWorkspace(workspaces);
  const ordered = orderedBookmarkedPageNumbers(workspace, workspaceDocumentName(workspace), state.doc ? state.pageCount : 0);
  const bookmarked = new Set(ordered);
  const onlyBookmarks = state.thumbnailMode === "bookmarks";
  ui.app.classList.toggle("bookmark-mode", onlyBookmarks);
  ui.thumbPages.classList.toggle("active", !onlyBookmarks);
  ui.thumbPages.setAttribute("aria-pressed", String(!onlyBookmarks));
  ui.thumbBookmarks.classList.toggle("active", onlyBookmarks);
  ui.thumbBookmarks.setAttribute("aria-pressed", String(onlyBookmarks));
  ui.thumbPagesCount.textContent = String(state.pageCount);
  ui.thumbBookmarksCount.textContent = String(bookmarked.size);
  for (let index = 0; index < state.thumbs.length; index++) {
    const isBookmarked = bookmarked.has(index + 1);
    state.thumbs[index].classList.toggle("bookmarked", isBookmarked);
    state.thumbEntries[index].draggable = onlyBookmarks && isBookmarked;
    state.thumbEntries[index].querySelector(".thumb-remove").hidden = !onlyBookmarks || !isBookmarked;
    state.thumbEntries[index].querySelector(".thumb-drag-handle").hidden = !onlyBookmarks || !isBookmarked;
    state.thumbEntries[index].querySelector(".thumb-unlink").hidden =
      onlyBookmarks || !isLinkedOnlyWorkspace(workspace);
  }

  // Both the thumbnail strip and the main PDF viewport share the same page
  // selection. Detached shells are not rendered, laid out or scrollable.
  const visiblePages = onlyBookmarks
    ? ordered : Array.from({ length: state.pageCount }, (_, index) => index + 1);
  const fragment = document.createDocumentFragment();
  for (const page of visiblePages) {
    const entry = state.thumbEntries[page - 1];
    if (entry) fragment.append(entry);
  }
  ui.thumbList.replaceChildren(fragment, ui.thumbEmpty);
  ui.thumbEmpty.hidden = !onlyBookmarks || ordered.length > 0 || !state.doc;
  ui.bookmarkPagesEmpty.hidden = !onlyBookmarks || ordered.length > 0 || !state.doc;
  ui.pages.classList.toggle("bookmarks-empty", onlyBookmarks && visiblePages.length === 0 && Boolean(state.doc));

  const currentOrder = [...ui.pages.children].filter((element) => element !== ui.bookmarkPagesEmpty);
  const nextOrder = visiblePages.map((page) => state.shells[page - 1]).filter(Boolean);
  const pageOrderChanged = currentOrder.length !== nextOrder.length
    || nextOrder.some((shell, index) => currentOrder[index] !== shell);
  if (pageOrderChanged) {
    for (const shell of state.shells) {
      if (shell) state.observer?.unobserve(shell);
    }
    state.visible.clear();
    state.pending.clear();
    const pageFragment = document.createDocumentFragment();
    for (const shell of nextOrder) pageFragment.append(shell);
    ui.pages.replaceChildren(pageFragment, ui.bookmarkPagesEmpty);
    for (const shell of nextOrder) state.observer?.observe(shell);
  }
  const previousPage = state.current;
  if (visiblePages.length && !visiblePages.includes(previousPage)) state.current = visiblePages[0];
  for (let index = 0; index < state.thumbs.length; index++) {
    state.thumbs[index].classList.toggle("active", index + 1 === state.current);
  }
  updateToolbar();
  if (resetScroll) {
    ui.thumbList.scrollTop = 0;
    ui.thumbList.scrollLeft = 0;
  }
  if (pageOrderChanged && visiblePages.length && state.doc) {
    const generation = state.generation;
    requestAnimationFrame(() => {
      if (generation === state.generation && state.shells[state.current - 1]?.isConnected) {
        goToPage(state.current, false);
      }
    });
  }
}

function setThumbnailMode(mode) {
  if (!["pages", "bookmarks"].includes(mode) || state.thumbnailMode === mode) return;
  state.thumbnailMode = mode;
  hideSelectionMenu();
  clearBookmarkDrag();
  touchBookmarkDrag = null;
  updateThumbnailFilter(true);
}

function updateSettingsView() {
  ui.app.classList.toggle("thumbs-left", state.thumbPosition === "left");
  ui.app.classList.toggle("thumbs-bottom", state.thumbPosition === "bottom");
  ui.app.classList.toggle("thumbs-hidden", !state.thumbsVisible);
  ui.pages.classList.toggle("vertical", state.orientation === "vertical");
  ui.pages.classList.toggle("horizontal", state.orientation === "horizontal");
  ui.app.classList.toggle("flow-horizontal", state.orientation === "horizontal");
  ui.app.classList.toggle("flow-vertical", state.orientation === "vertical");
  const directionLabel = state.orientation === "vertical" ? "Dikey akış" : "Yatay akış";
  ui.direction.title = `Akış yönü: ${directionLabel}`;
  ui.direction.setAttribute("aria-label", ui.direction.title);
  for (const option of ui.directionOptions) {
    option.setAttribute("aria-pressed", String(option.dataset.orientation === state.orientation));
  }
  const position = !state.thumbsVisible ? "hidden" : state.thumbPosition;
  const positionLabel = { left: "Sidebar solda", bottom: "Sidebar aşağıda", hidden: "Sidebar gizli" }[position];
  ui.thumbnails.title = `Küçük resimler: ${positionLabel}`;
  ui.thumbnails.setAttribute("aria-label", ui.thumbnails.title);
  for (const option of ui.thumbnailOptions) {
    option.setAttribute("aria-pressed", String(option.dataset.thumbs === position));
  }
}

function syncPageFieldWidth() {
  ui.pageInput.style.width = `${Math.max(2, ui.pageInput.value.length + 0.8)}ch`;
}

function updateToolbar() {
  const hasDoc = Boolean(state.doc);
  [ui.prev, ui.next, ui.pageInput, ui.zoomOut, ui.zoomIn, ui.zoomRange, ui.zoomInput].forEach((button) => { button.disabled = !hasDoc; });
  const shownPages = visiblePageNumbers();
  const shownIndex = shownPages.indexOf(state.current);
  ui.prev.disabled = !hasDoc || shownIndex <= 0;
  ui.next.disabled = !hasDoc || shownIndex < 0 || shownIndex === shownPages.length - 1;
  ui.pageInput.disabled = !hasDoc || shownIndex < 0;
  ui.zoomIn.disabled = !hasDoc || state.scale >= MAX_SCALE;
  ui.zoomOut.disabled = !hasDoc || state.scale <= MIN_SCALE;
  ui.pageInput.value = shownIndex < 0 && hasDoc ? "" : String(state.current);
  ui.pageInput.placeholder = shownIndex < 0 && hasDoc ? "—" : "";
  ui.pageInput.max = String(Math.max(1, state.pageCount));
  syncPageFieldWidth();
  ui.pageTotal.textContent = String(state.pageCount);
  ui.zoomInput.value = String(Math.round(state.scale * 100));
  ui.zoomRange.value = String(Math.round(state.scale * 100));
  const fitLabels = { width: "Genişliğe sığdır", height: "Yüksekliğe sığdır", page: "Tamamını sığdır", custom: "Özel yakınlaştırma" };
  ui.fitTrigger.title = `Sığdırma: ${fitLabels[state.fit] || fitLabels.custom}`;
  ui.fitTrigger.setAttribute("aria-label", ui.fitTrigger.title);
  ui.app.classList.toggle("fit-width", state.fit === "width");
  ui.app.classList.toggle("fit-height-mode", state.fit === "height");
  ui.app.classList.toggle("fit-page", state.fit === "page");
  ui.app.classList.toggle("fit-custom", state.fit === "custom");
  for (const button of ui.fitButtons) {
    button.setAttribute("aria-pressed", String(hasDoc && state.fit === button.dataset.fit));
  }
}

function setCurrentPage(index, scrollThumbnail = true) {
  if (!state.doc) return;
  const page = clampPage(index + 1, state.pageCount);
  if (state.thumbnailMode === "bookmarks" && !visiblePageNumbers().includes(page)) return;
  if (page === state.current) return;
  const previous = state.thumbs[state.current - 1];
  if (previous) previous.classList.remove("active");
  state.current = page;
  const thumb = state.thumbs[page - 1];
  if (thumb) {
    thumb.classList.add("active");
    if (scrollThumbnail && state.thumbsVisible && thumb.isConnected) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  updateToolbar();
}

function goToPage(page, smooth = true) {
  if (!state.doc) return;
  const visiblePage = pageInActiveView(page);
  if (visiblePage === null) return;
  const index = visiblePage - 1;
  setCurrentPage(index);
  if (state.fit !== "custom") applyFit(state.fit);
  state.shells[index]?.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    block: state.orientation === "vertical" ? "start" : "nearest",
    inline: state.orientation === "horizontal" ? "start" : "nearest",
  });
  ui.viewer.focus({ preventScroll: true });
}

function captureViewportAnchor() {
  if (!state.doc) return null;
  const shell = state.shells[state.current - 1];
  if (!shell) return null;
  const area = ui.viewer.getBoundingClientRect();
  const rect = shell.getBoundingClientRect();
  return {
    index: state.current - 1,
    x: (area.left + area.width / 2 - rect.left) / Math.max(1, rect.width),
    y: (area.top + area.height / 2 - rect.top) / Math.max(1, rect.height),
  };
}

function restoreViewportAnchor(anchor) {
  if (!anchor) return;
  const shell = state.shells[anchor.index];
  if (!shell) return;
  const area = ui.viewer.getBoundingClientRect();
  const rect = shell.getBoundingClientRect();
  ui.viewer.scrollLeft += rect.left + rect.width * anchor.x - area.left - area.width / 2;
  ui.viewer.scrollTop += rect.top + rect.height * anchor.y - area.top - area.height / 2;
}

function cancelPageRenders() {
  state.renderEpoch++;
  state.pending.clear();
  for (const task of state.renderTasks.values()) task.cancel();
  for (const layer of state.textLayers.values()) layer.cancel();
  state.textLayers.clear();
  for (const shell of state.shells) shell.querySelector(".textLayer")?.remove();
  state.rendered.clear();
}

function setScale(scale, fit = "custom") {
  if (!state.doc) return;
  const next = clampScale(scale);
  if (state.scale === next && state.fit === fit) return;
  const anchor = captureViewportAnchor();
  const changed = state.scale !== next;
  state.fit = fit;
  ui.pages.classList.toggle("fit-height", fit === "height");
  state.scale = next;
  if (changed) {
    cancelPageRenders();
    for (let i = 0; i < state.shells.length; i++) setPageSize(i);
    restoreViewportAnchor(anchor);
    for (const index of state.visible) state.pending.add(index);
    pumpPages();
  }
  updateToolbar();
}

function applyFit(mode) {
  if (!state.doc) return;
  const size = getDimensions(state.current - 1);
  const gutters = mode === "height" ? { x: 82, y: 4 } : { x: 82, y: 116 };
  const scale = fitScale(mode, { width: ui.viewer.clientWidth, height: ui.viewer.clientHeight }, size, gutters);
  setScale(scale, mode);
}

function updateOrientation(direction) {
  if (!["vertical", "horizontal"].includes(direction) || direction === state.orientation) return;
  state.orientation = direction;
  updateSettingsView();
  persistWorkspaceView();
  if (state.doc) {
    ui.viewer.scrollTop = 0;
    ui.viewer.scrollLeft = 0;
    if (state.fit !== "custom") applyFit(state.fit);
    requestAnimationFrame(() => goToPage(state.current, false));
  }
}

function setThumbnailPosition(position) {
  if (!["left", "bottom", "hidden"].includes(position)) return;
  const current = state.thumbsVisible ? state.thumbPosition : "hidden";
  if (position === current) return;
  state.thumbsVisible = position !== "hidden";
  if (position !== "hidden") state.thumbPosition = position;
  hideSelectionMenu();
  updateSettingsView();
  persistWorkspaceView();
  if (state.doc && state.fit !== "custom") requestAnimationFrame(() => applyFit(state.fit));
}

function closeViewMenu(restoreFocus = false) {
  if (!openViewPanel) return;
  openViewPanel.hidden = true;
  openViewTrigger.setAttribute("aria-expanded", "false");
  const previousTrigger = openViewTrigger;
  openViewPanel = null;
  openViewTrigger = null;
  if (restoreFocus) previousTrigger.focus({ preventScroll: true });
}

function toggleViewMenu(trigger, panel) {
  if (openViewPanel === panel) {
    closeViewMenu(true);
    return;
  }
  closeViewMenu();
  if (trigger.disabled) return;
  panel.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  openViewPanel = panel;
  openViewTrigger = trigger;
  const bounds = trigger.getBoundingClientRect();
  panel.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - panel.offsetWidth - 8))}px`;
  panel.style.top = `${bounds.bottom + 7}px`;
  (panel.querySelector('[aria-pressed="true"]') || panel.querySelector("button"))?.focus({ preventScroll: true });
}

function cancelAllWork() {
  mousePan = null;
  touchPinch = null;
  trackpadGestureScale = null;
  ui.viewer.classList.remove("is-dragging");
  state.generation++;
  cancelPageRenders();
  state.thumbEpoch++;
  state.thumbPending.clear();
  state.visible.clear();
  state.thumbVisible.clear();
  state.rendered.clear();
  state.thumbRendered.clear();
  state.observer?.disconnect();
  state.thumbObserver?.disconnect();
  state.observer = null;
  state.thumbObserver = null;
  for (const task of state.thumbTasks.values()) task.cancel();
  state.renderTasks.clear();
  state.textLayers.clear();
  state.thumbTasks.clear();
  state.activeRenders = 0;
  state.activeThumbRenders = 0;
  // PDF.js 6 removed PDFDocumentProxy.destroy(); the loading task owns cleanup.
  if (state.loadingTask) void state.loadingTask.destroy().catch(() => {});
  state.loadingTask = null;
  state.doc = null;
  state.pageCount = 0;
  state.current = 1;
  state.fileSize = 0;
  ui.pdfInfoButton.disabled = true;
  if (ui.pdfInfoDialog.open) ui.pdfInfoDialog.close();
  state.dimensions = [];
  state.shells = [];
  state.thumbs = [];
  state.thumbEntries = [];
  state.highlightRegions.clear();
  draggingBookmarkPage = null;
  touchBookmarkDrag = null;
  hideHighlightRemove();
  ui.pages.replaceChildren();
  ui.thumbList.replaceChildren(ui.thumbEmpty);
  ui.thumbEmpty.hidden = true;
  ui.app.classList.remove("has-document");
  ui.empty.hidden = false;
  ui.pages.hidden = true;
  ui.fileLabel.textContent = "PDF açılmadı";
  ui.fileLabel.title = "Henüz dosya açılmadı";
  ui.thumbPagesCount.textContent = "0";
  ui.thumbBookmarksCount.textContent = "0";
  ui.status.textContent = "Hazır · Dosyalar cihazında kalır";
  ui.viewer.scrollTop = 0;
  ui.viewer.scrollLeft = 0;
  updateToolbar();
}

function createPageElements() {
  const pageFragment = document.createDocumentFragment();
  const thumbFragment = document.createDocumentFragment();
  state.shells = new Array(state.pageCount);
  state.thumbs = new Array(state.pageCount);
  state.thumbEntries = new Array(state.pageCount);
  for (let index = 0; index < state.pageCount; index++) {
    const shell = document.createElement("article");
    shell.className = "page-shell";
    shell.dataset.index = String(index);
    shell.setAttribute("aria-label", `Sayfa ${index + 1}`);
    const surface = document.createElement("div");
    surface.className = "page-surface";
    shell.append(surface);
    state.shells[index] = shell;
    setPageSize(index);
    pageFragment.append(shell);

    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "thumb-item" + (index === 0 ? " active" : "");
    thumb.dataset.index = String(index);
    thumb.setAttribute("aria-label", `Sayfa ${index + 1} konumuna git`);
    const preview = document.createElement("span");
    preview.className = "thumb-preview";
    const number = document.createElement("span");
    number.className = "thumb-number";
    const linkedSource = isLinkedOnlyWorkspace(activeWorkspace(workspaces))
      ? activeWorkspace(workspaces).linkedPages[index] : null;
    number.textContent = linkedSource
      ? `${index + 1} · W${linkedSource.sourceWorkspaceId}/${linkedSource.page}`
      : String(index + 1);
    if (linkedSource) thumb.title = `W${linkedSource.sourceWorkspaceId} · ${linkedSource.sourceFileName} · sayfa ${linkedSource.page}`;
    thumb.append(preview, number);
    thumb.addEventListener("click", () => goToPage(index + 1));
    const entry = document.createElement("div");
    entry.className = "thumb-entry";
    entry.dataset.index = String(index);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "thumb-remove";
    remove.textContent = "×";
    remove.title = `Sayfa ${index + 1} yer imini kaldır`;
    remove.setAttribute("aria-label", remove.title);
    remove.hidden = true;
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeBookmarkedPageFromWorkspace(index + 1);
    });
    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "thumb-drag-handle";
    grip.textContent = "⋮⋮";
    grip.title = `Sayfa ${index + 1} sırasını sürükle; klavyede ok tuşlarıyla taşı`;
    grip.setAttribute("aria-label", grip.title);
    grip.hidden = true;
    grip.addEventListener("keydown", (event) => {
      const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1
        : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 0;
      if (!direction || state.thumbnailMode !== "bookmarks") return;
      event.preventDefault();
      event.stopPropagation(); // Arrow keys here reorder bookmarks, not PDF pages.
      const workspace = activeWorkspace(workspaces);
      updateWorkspaces(moveBookmarkedPage(workspaces, workspaceDocumentName(workspace), state.pageCount, index + 1, direction));
    });
    const unlink = document.createElement("button");
    unlink.type = "button";
    unlink.className = "thumb-unlink";
    unlink.textContent = "×";
    unlink.title = "Bu sayfayı derlemeden kaldır (kaynak PDF korunur)";
    unlink.setAttribute("aria-label", `Derleme sayfası ${index + 1} kaldır`);
    unlink.hidden = !isLinkedOnlyWorkspace(activeWorkspace(workspaces));
    unlink.addEventListener("click", async (event) => {
      event.stopPropagation();
      const item = activeWorkspace(workspaces);
      const reference = item?.linkedPages?.[index];
      if (!isLinkedOnlyWorkspace(item) || !reference) return;
      const next = removeLinkedWorkspacePage(workspaces, reference.id);
      if (next === workspaces) return;
      workspaces = next;
      persistWorkspaces();
      if (activeWorkspace(workspaces)?.linkedPages?.length) await openLinkedWorkspaceReader();
      else {
        cancelAllWork();
        renderWorkspaceSidebar();
      }
      showToast("Sayfa bağlantısı kaldırıldı. Kaynak PDF korunuyor.");
    });
    entry.append(thumb, remove, grip, unlink);
    entry.addEventListener("contextmenu", (event) => {
      if (!state.doc) return;
      event.preventDefault();
      const rect = thumb.getBoundingClientRect();
      openPageContextMenu(index + 1, event.clientX || rect.left + rect.width / 2, event.clientY || rect.top + 20);
    });
    state.thumbs[index] = thumb;
    state.thumbEntries[index] = entry;
    thumbFragment.append(entry);
  }
  ui.pages.replaceChildren(pageFragment);
  ui.thumbList.replaceChildren(thumbFragment, ui.thumbEmpty);
  updateThumbnailFilter();
}

function initializeObservers() {
  const generation = state.generation;
  state.observer = new IntersectionObserver((entries) => {
    if (generation !== state.generation) return;
    for (const entry of entries) {
      const index = Number(entry.target.dataset.index);
      if (entry.isIntersecting) {
        state.visible.add(index);
        if (state.rendered.get(index) !== state.renderEpoch) state.pending.add(index);
      } else {
        state.visible.delete(index);
        state.pending.delete(index);
        state.renderTasks.get(index)?.cancel();
        state.textLayers.get(index)?.cancel();
        state.textLayers.delete(index);
        state.highlightRegions.delete(index);
        entry.target.querySelector(".page-surface")?.replaceChildren();
        state.rendered.delete(index);
      }
    }
    pumpPages();
    scheduleScrollUpdate();
  }, { root: ui.viewer, rootMargin: "850px", threshold: 0 });

  state.thumbObserver = new IntersectionObserver((entries) => {
    if (generation !== state.generation) return;
    for (const entry of entries) {
      const index = Number(entry.target.dataset.index);
      if (entry.isIntersecting) {
        state.thumbVisible.add(index);
        if (!state.thumbRendered.has(index)) state.thumbPending.add(index);
      } else {
        state.thumbVisible.delete(index);
        state.thumbPending.delete(index);
        state.thumbTasks.get(index)?.cancel();
        entry.target.querySelector(".thumb-preview")?.replaceChildren();
        state.thumbRendered.delete(index);
      }
    }
    pumpThumbs();
  }, { root: ui.thumbList, rootMargin: "240px", threshold: 0 });

  for (const shell of state.shells) state.observer.observe(shell);
  for (const thumb of state.thumbs) state.thumbObserver.observe(thumb);
}

function pickClosest(pending) {
  let best = -1;
  let distance = Infinity;
  for (const index of pending) {
    const candidate = Math.abs(index - (state.current - 1));
    if (candidate < distance) {
      best = index;
      distance = candidate;
    }
  }
  return best;
}

function pumpPages() {
  if (!state.doc) return;
  while (state.activeRenders < MAX_PAGE_RENDERS && state.pending.size) {
    const index = pickClosest(state.pending);
    state.pending.delete(index);
    if (!state.visible.has(index) || state.rendered.get(index) === state.renderEpoch) continue;
    const generation = state.generation;
    const epoch = state.renderEpoch;
    state.activeRenders++;
    void renderPage(index, generation, epoch).finally(() => {
      if (generation !== state.generation) return;
      state.activeRenders--;
      pumpPages();
    });
  }
}

async function renderPage(index, generation, epoch) {
  let task;
  try {
    const doc = state.doc;
    const page = await doc.getPage(index + 1);
    if (generation !== state.generation || epoch !== state.renderEpoch || !state.visible.has(index)) return;
    const base = page.getViewport({ scale: 1 });
    const previous = state.dimensions[index];
    if (!previous || Math.abs(previous.width - base.width) > .5 || Math.abs(previous.height - base.height) > .5) {
      state.dimensions[index] = { width: base.width, height: base.height };
      setPageSize(index);
      if (index === state.current - 1 && state.fit !== "custom") {
        requestAnimationFrame(() => {
          if (generation === state.generation && state.fit !== "custom") applyFit(state.fit);
        });
      }
    }
    const viewport = page.getViewport({ scale: state.scale });
    const density = chooseDeviceScale(viewport.width, viewport.height, window.devicePixelRatio || 1);
    const renderViewport = page.getViewport({ scale: state.scale * density });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    task = page.render({ canvasContext: context, viewport: renderViewport, canvas });
    state.renderTasks.set(index, task);
    await task.promise;
    if (generation !== state.generation || epoch !== state.renderEpoch || !state.visible.has(index)) return;
    const surface = state.shells[index]?.querySelector(".page-surface");
    if (!surface) return;
    surface.replaceChildren(canvas);
    state.rendered.set(index, epoch);
    refreshPageHighlights(index);
    // Render a text overlay only for nearby pages; the canvas remains visible.
    const overlay = document.createElement("div");
    overlay.className = "textLayer";
    overlay.style.setProperty("--total-scale-factor", String(state.scale * (page.userUnit || 1)));
    const layer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: overlay,
      viewport,
    });
    state.textLayers.set(index, layer);
    surface.append(overlay);
    try {
      await layer.render();
      if (generation !== state.generation || epoch !== state.renderEpoch || !state.visible.has(index)) {
        overlay.remove();
      } else {
        refreshPageHighlights(index);
      }
    } catch (error) {
      overlay.remove();
      if (generation === state.generation && epoch === state.renderEpoch && error?.name !== "AbortException") {
        console.warn("PDF text layer unavailable on page", index + 1, error);
      }
    } finally {
      if (state.textLayers.get(index) === layer) state.textLayers.delete(index);
    }
  } catch (error) {
    if (error?.name !== "RenderingCancelledException" && generation === state.generation) {
      console.error("PDF page render failed:", error);
    }
  } finally {
    if (generation === state.generation && state.renderTasks.get(index) === task) state.renderTasks.delete(index);
  }
}

function pumpThumbs() {
  if (!state.doc) return;
  while (state.activeThumbRenders < MAX_THUMB_RENDERS && state.thumbPending.size) {
    const index = pickClosest(state.thumbPending);
    state.thumbPending.delete(index);
    if (!state.thumbVisible.has(index) || state.thumbRendered.has(index)) continue;
    const generation = state.generation;
    const epoch = state.thumbEpoch;
    state.activeThumbRenders++;
    void renderThumb(index, generation, epoch).finally(() => {
      if (generation !== state.generation) return;
      state.activeThumbRenders--;
      pumpThumbs();
    });
  }
}

async function renderThumb(index, generation, epoch) {
  let task;
  try {
    const page = await state.doc.getPage(index + 1);
    if (generation !== state.generation || epoch !== state.thumbEpoch || !state.thumbVisible.has(index)) return;
    const slot = state.thumbs[index]?.querySelector(".thumb-preview");
    if (!slot) return;
    const original = page.getViewport({ scale: 1 });
    const logicalScale = Math.min((slot.clientWidth - 3) / original.width, (slot.clientHeight - 3) / original.height);
    const density = Math.min(1.5, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: Math.max(0.01, logicalScale) * density });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    task = page.render({ canvasContext: context, viewport, canvas });
    state.thumbTasks.set(index, task);
    await task.promise;
    if (generation !== state.generation || epoch !== state.thumbEpoch || !state.thumbVisible.has(index)) return;
    slot.replaceChildren(canvas);
    state.thumbRendered.add(index);
  } catch (error) {
    if (error?.name !== "RenderingCancelledException" && generation === state.generation) {
      console.error("PDF thumbnail render failed:", error);
    }
  } finally {
    if (generation === state.generation && state.thumbTasks.get(index) === task) state.thumbTasks.delete(index);
  }
}

function scheduleScrollUpdate() {
  if (state.scrollFrame) return;
  state.scrollFrame = requestAnimationFrame(() => {
    state.scrollFrame = 0;
    if (!state.doc || !state.visible.size) return;
    const area = ui.viewer.getBoundingClientRect();
    const center = state.orientation === "vertical" ? area.top + area.height / 2 : area.left + area.width / 2;
    let bestIndex = state.current - 1;
    let bestDistance = Infinity;
    for (const index of state.visible) {
      const rect = state.shells[index].getBoundingClientRect();
      const position = state.orientation === "vertical" ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      const distance = Math.abs(center - position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    setCurrentPage(bestIndex);
  });
}

async function openPDF(file, { replaceWorkspace = false, persistFile = true } = {}) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showToast("Lütfen bir PDF dosyası seç.");
    return;
  }
  const workspaceId = workspaces.activeId;
  // Verify identity again at commit time in case the PDF changed since confirmation.
  if (replaceWorkspace && persistFile && activeWorkspace(workspaces)?.fileName) {
    try {
      const existing = await loadWorkspacePdf(workspaceId);
      if (existing && await samePdfContent(existing, file)) {
        showToast("Aynı PDF yeniden seçildi. Yer imleri ve vurgular korundu.");
        if (!state.doc) void restoreWorkspacePdf(workspaceId);
        return;
      }
    } catch (error) {
      console.warn("PDF equality check failed:", error);
      showToast("PDF kimliği doğrulanamadı; önceki dosya ve yer imleri korundu.");
      return;
    }
  }
  cancelAllWork();
  state.fit = activeWorkspace(workspaces)?.view?.fit || DEFAULT_WORKSPACE_VIEW.fit;
  ui.pages.classList.toggle("fit-height", state.fit === "height");
  const generation = state.generation;
  setLoading(true);
  ui.status.textContent = "Dosya okunuyor…";
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    if (generation !== state.generation) return;
    state.loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
    const doc = await state.loadingTask.promise;
    if (generation !== state.generation) {
      // cancelAllWork() already destroyed this document's loading task.
      return;
    }
    state.doc = doc;
    state.pageCount = doc.numPages;
    state.fileSize = data.byteLength;
    const first = await doc.getPage(1);
    if (generation !== state.generation) return;
    const rect = first.getViewport({ scale: 1 });
    if (persistFile) {
      try {
        await waitForWorkspaceSaves();
        if (generation !== state.generation || workspaces.activeId !== workspaceId) return;
        const next = replaceWorkspace
          ? replacementWorkspaceState(workspaces, workspaceId, file.name)
          : setWorkspaceFile(workspaces, file.name);
        const revision = await writeWorkspaceAndPdf(next, workspaceRevision, {
          put: { id: workspaceId, file },
        });
        workspaceRevision = revision;
        workspaces = next;
        persistedWorkspaces = next;
        broadcastWorkspaceRevision();
      } catch (error) {
        console.error("PDF transaction failed:", error);
        cancelAllWork();
        showToast("PDF kaydedilemedi; eski PDF ve yer imleri korundu. Sayfayı yenilemeden tekrar deneme.");
        void restoreWorkspacePdf(workspaceId);
        return;
      }
    }
    if (generation !== state.generation || workspaces.activeId !== workspaceId) return;
    // Restoring an existing PDF must not rewrite its bookmark metadata.
    workspaceFiles.set(workspaceId, file);
    if (persistFile && replaceWorkspace) libraryPreviewCache.delete(workspaceId);
    renderWorkspaceSidebar();
    // Existing workspaces may contain both a base PDF and older linked-page
    // references. Preserve and display all pages in the same reader.
    if (activeWorkspace(workspaces)?.linkedPages?.length) {
      await openLinkedWorkspaceReader(file);
      return;
    }
    state.dimensions = new Array(state.pageCount);
    state.dimensions[0] = { width: rect.width, height: rect.height };
    ui.app.classList.add("has-document");
    ui.empty.hidden = true;
    ui.pages.hidden = false;
    ui.fileLabel.textContent = file.name;
    ui.fileLabel.title = file.name;
    ui.pdfInfoButton.disabled = false;
    ui.status.textContent = `${state.pageCount} sayfa · Yalnızca cihazında açık`;
    createPageElements();
    updateSettingsView();
    updateToolbar();
    applyFit(state.fit === "custom" ? "width" : state.fit);
    initializeObservers();
    ui.viewer.scrollTop = 0;
    ui.viewer.scrollLeft = 0;
    setLoading(false);
    ui.viewer.focus({ preventScroll: true });
  } catch (error) {
    if (generation !== state.generation) return;
    console.error("PDF open failed:", error);
    const message = error?.name === "PasswordException"
      ? "Bu PDF parola korumalı. Parola giriş desteği henüz eklenmedi."
      : "PDF açılamadı. Dosyanın geçerli ve okunabilir olduğundan emin ol.";
    cancelAllWork();
    showToast(message);
    setLoading(false);
    if (replaceWorkspace && workspaces.activeId === workspaceId) void restoreWorkspacePdf(workspaceId);
  } finally {
    if (generation === state.generation) setLoading(false);
  }
}

function zoomAtPoint(nextScale, clientX, clientY) {
  if (!state.doc) return;
  const node = document.elementFromPoint(clientX, clientY);
  const shell = node?.closest?.(".page-shell") || state.shells[state.current - 1];
  if (!shell) { setScale(nextScale); return; }
  const before = shell.getBoundingClientRect();
  const x = (clientX - before.left) / Math.max(1, before.width);
  const y = (clientY - before.top) / Math.max(1, before.height);
  const previousScale = state.scale;
  setScale(Math.round(clampScale(nextScale) * 100) / 100);
  if (state.scale === previousScale) return;
  const after = shell.getBoundingClientRect();
  ui.viewer.scrollLeft += after.left + after.width * x - clientX;
  ui.viewer.scrollTop += after.top + after.height * y - clientY;
}

function touchDistanceAndCenter(touches) {
  const a = touches[0];
  const b = touches[1];
  return {
    distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function stepZoom(direction) {
  if (!state.doc) return;
  const value = state.scale;
  const next = direction > 0
    ? (ZOOM_STEPS.find((step) => step > value + .005) ?? MAX_SCALE)
    : ([...ZOOM_STEPS].reverse().find((step) => step < value - .005) ?? MIN_SCALE);
  setScale(next);
}


function linkedPickerActive(session, epoch = null) {
  return linkedPickerSession === session && !session.closed
    && ui.addLinkedPagesDialog.open && workspaces.activeId === session.targetId
    && (epoch === null || session.renderEpoch === epoch);
}

function releaseLinkedPickerSource(session) {
  session.sourceEpoch++;
  session.renderEpoch++;
  try { session.renderTask?.cancel(); } catch { /* Render already settled */ }
  session.renderTask = null;
  if (session.task) void session.task.destroy().catch(() => {});
  session.task = null;
  session.doc = null;
  session.file = null;
  session.sourceId = null;
  session.total = 0;
  session.index = 0;
  session.selected.clear();
  session.pageCache.clear();
}

function disposeLinkedPicker() {
  const session = linkedPickerSession;
  linkedPickerSession = null;
  if (!session) return;
  session.closed = true;
  releaseLinkedPickerSource(session);
  for (const task of session.covers) void task.destroy().catch(() => {});
  session.covers.clear();
}

function linkedPickerMessage(message) { ui.linkedPagesMessage.textContent = message; }

function updateLinkedPickerSelection(session) {
  if (!linkedPickerActive(session)) return;
  const count = session.selected.size;
  ui.linkedSelectionCount.textContent = count + " sayfa seçili";
  ui.confirmAddLinkedPages.textContent = "Sayfaları ekle (" + count + ")";
  ui.confirmAddLinkedPages.disabled = session.saving || !session.doc || count === 0;
}

function linkedPickerPaper(message) {
  const paper = document.createElement("span");
  paper.className = "linked-picker-paper";
  const placeholder = document.createElement("span");
  placeholder.className = "linked-picker-placeholder";
  placeholder.textContent = message;
  paper.append(placeholder);
  return { paper, placeholder };
}

async function renderLinkedPickerCover(session, item) {
  if (!linkedPickerActive(session)) return;
  let task;
  try {
    const source = item.workspace;
    const file = await loadWorkspacePdf(source.id);
    if (!linkedPickerActive(session)) return;
    if (!file || file.name !== source.fileName) throw new Error("PDF bulunamadı");
    const cached = libraryPreviewCache.get(source.id);
    if (cached && cached.name === file.name && cached.size === file.size
      && cached.lastModified === file.lastModified) {
      const img = document.createElement("img");
      img.src = cached.src;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      item.paper.replaceChildren(img);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!linkedPickerActive(session)) return;
    task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    session.covers.add(task);
    const pdf = await task.promise;
    if (!linkedPickerActive(session)) return;
    const page = await pdf.getPage(1);
    if (!linkedPickerActive(session)) return;
    const base = page.getViewport({ scale: 1 });
    const scale = Math.max(.01, Math.min(
      Math.max(1, item.paper.clientWidth - 8) / base.width,
      Math.max(1, item.paper.clientHeight - 8) / base.height
    ));
    const viewport = page.getViewport({ scale: scale * Math.min(window.devicePixelRatio || 1, 2) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas kullanılamıyor");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    if (!linkedPickerActive(session)) return;
    item.paper.replaceChildren(canvas);
    try {
      libraryPreviewCache.set(source.id, {
        name: file.name, size: file.size, lastModified: file.lastModified,
        src: canvas.toDataURL("image/webp", .8),
      });
    } catch { /* Cover stays visible. */ }
    page.cleanup();
  } catch (error) {
    if (linkedPickerActive(session)) {
      item.paper.textContent = "Önizleme yok";
      console.warn("Linked PDF cover unavailable:", error);
    }
  } finally {
    if (task) {
      session.covers.delete(task);
      try { await task.destroy(); } catch { /* Already closed */ }
    }
  }
}

async function renderLinkedPickerCovers(session, entries) {
  let next = 0;
  async function worker() {
    while (linkedPickerActive(session) && next < entries.length) {
      await renderLinkedPickerCover(session, entries[next++]);
    }
  }
  await Promise.all([worker(), worker()]);
}

async function chooseLinkedPickerSource(session, sourceId) {
  if (!linkedPickerActive(session) || session.saving) return;
  const source = workspaces.items.find(item =>
    item.id === sourceId && item.id !== session.targetId && item.fileName);
  if (!source) return;
  releaseLinkedPickerSource(session);
  session.sourceId = sourceId;
  const epoch = session.sourceEpoch;
  for (const entry of session.sources) {
    entry.button.setAttribute("aria-pressed", String(entry.workspace.id === sourceId));
  }
  const pending = document.createElement("p");
  pending.className = "linked-picker-empty";
  pending.textContent = "W" + sourceId + " PDF'si açılıyor…";
  ui.linkedPagePickerGrid.replaceChildren(pending);
  ui.linkedPickerPrev.disabled = true;
  ui.linkedPickerNext.disabled = true;
  ui.linkedPickerPageLabel.textContent = "—";
  linkedPickerMessage("PDF sayfaları hazırlanıyor…");
  updateLinkedPickerSelection(session);
  try {
    const file = await loadWorkspacePdf(sourceId);
    if (!linkedPickerActive(session) || session.sourceEpoch !== epoch) return;
    if (!file || file.name !== source.fileName) throw new Error("Kaynak PDF depoda bulunamadı.");
    session.file = file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!linkedPickerActive(session) || session.sourceEpoch !== epoch) return;
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    session.task = task;
    const doc = await task.promise;
    if (!linkedPickerActive(session) || session.sourceEpoch !== epoch) return;
    session.doc = doc;
    session.total = doc.numPages;
    linkedPickerMessage(doc.numPages + " sayfa · Seçimler sayfa grupları arasında korunur; önceden eklenen sayfalar tekrar seçilemez.");
    renderLinkedPickerPage(session, 0);
  } catch (error) {
    if (!linkedPickerActive(session) || session.sourceEpoch !== epoch) return;
    pending.textContent = "PDF okunamadı. Başka bir kaynak seç.";
    linkedPickerMessage(error?.message || "PDF açılamadı.");
    console.warn("Source PDF picker failed:", error);
  }
}

function linkedPickerAlreadyAdded(session, page) {
  const target = workspaces.items.find(item => item.id === session.targetId);
  const file = session.file;
  return Boolean(target?.linkedPages?.some(ref =>
    ref.sourceWorkspaceId === session.sourceId && ref.sourceFileName === file?.name
    && ref.sourceSize === file.size && ref.sourceLastModified === file.lastModified
    && ref.page === page));
}

function toggleLinkedPickerPage(session, page, button, check) {
  if (!linkedPickerActive(session) || session.saving || !session.doc) return;
  if (session.selected.has(page)) session.selected.delete(page);
  else {
    const target = workspaces.items.find(item => item.id === session.targetId);
    const remaining = MAX_LINKED_PAGES - (target?.linkedPages?.length || 0);
    if (session.selected.size >= remaining) {
      linkedPickerMessage("Bu workspace en fazla " + MAX_LINKED_PAGES + " bağlantılı sayfa tutabilir.");
      return;
    }
    session.selected.add(page);
  }
  const selected = session.selected.has(page);
  button.setAttribute("aria-pressed", String(selected));
  check.hidden = !selected;
  button.setAttribute("aria-label", "Sayfa " + page + (selected ? " seçili" : " seç"));
  updateLinkedPickerSelection(session);
}

function renderLinkedPickerPage(session, index) {
  if (!linkedPickerActive(session) || !session.doc) return;
  if (session.saving) return;
  const windowInfo = linkedPickerWindow(session.total, index, LINKED_PICKER_PAGE_SIZE);
  session.index = windowInfo.index;
  const epoch = ++session.renderEpoch;
  try { session.renderTask?.cancel(); } catch { /* Render finished */ }
  session.renderTask = null;
  const { first, last } = windowInfo;
  const fragment = document.createDocumentFragment();
  const previews = [];
  for (let pageNumber = first; pageNumber <= last; pageNumber++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "linked-picker-page";
    const already = linkedPickerAlreadyAdded(session, pageNumber);
    const selected = session.selected.has(pageNumber);
    button.disabled = already;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", "Sayfa " + pageNumber +
      (already ? " zaten ekli" : selected ? " seçili" : " seç"));
    const { paper, placeholder } = linkedPickerPaper("Yükleniyor…");
    const title = document.createElement("span");
    title.className = "linked-picker-page-number";
    title.textContent = "Sayfa " + pageNumber + (already ? " · Ekli" : "");
    const check = document.createElement("span");
    check.className = "linked-picker-check";
    check.textContent = "✓";
    check.hidden = !selected;
    check.setAttribute("aria-hidden", "true");
    button.append(paper, title, check);
    if (!already) button.addEventListener("click", () => toggleLinkedPickerPage(session, pageNumber, button, check));
    previews.push({ pageNumber, paper, placeholder });
    fragment.append(button);
  }
  ui.linkedPagePickerGrid.replaceChildren(fragment);
  ui.linkedPickerPageLabel.textContent = (session.index + 1) + " / " + windowInfo.groups + " · Sayfa " + first + "–" + last;
  ui.linkedPickerPrev.disabled = session.index === 0;
  ui.linkedPickerNext.disabled = session.index >= windowInfo.groups - 1;
  updateLinkedPickerSelection(session);
  void renderLinkedPickerPagePreviews(session, previews, epoch);
}

async function renderLinkedPickerPagePreviews(session, entries, epoch) {
  const current = () => linkedPickerActive(session, epoch);
  for (const { pageNumber, paper, placeholder } of entries) {
    if (!current()) return;
    const cached = session.pageCache.get(pageNumber);
    if (cached) {
      const img = document.createElement("img");
      img.src = cached;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      paper.replaceChildren(img);
      continue;
    }
    try {
      const page = await session.doc.getPage(pageNumber);
      if (!current()) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.max(.01, Math.min(
        Math.max(1, paper.clientWidth - 10) / base.width,
        Math.max(1, paper.clientHeight - 10) / base.height
      ));
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      canvas.style.width = Math.floor(viewport.width / ratio) + "px";
      canvas.style.height = Math.floor(viewport.height / ratio) + "px";
      canvas.setAttribute("aria-hidden", "true");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas kullanılamıyor");
      const task = page.render({ canvas, canvasContext: context, viewport });
      session.renderTask = task;
      await task.promise;
      if (session.renderTask === task) session.renderTask = null;
      if (!current()) return;
      paper.replaceChildren(canvas);
      if (session.pageCache.size >= 40) session.pageCache.delete(session.pageCache.keys().next().value);
      try { session.pageCache.set(pageNumber, canvas.toDataURL("image/webp", .72)); }
      catch { /* Rendered thumbnail remains visible. */ }
      page.cleanup();
    } catch (error) {
      if (!current()) return;
      console.warn("Page thumbnail failed:", error);
      placeholder.textContent = "Önizleme yok";
    }
  }
}

function openAddLinkedPagesDialog() {
  const target = activeWorkspace(workspaces);
  disposeLinkedPicker();
  const sources = workspaces.items.filter(item => item.id !== target.id && item.fileName);
  const session = {
    targetId: target.id, closed: false, saving: false,
    sourceId: null, sourceEpoch: 0, renderEpoch: 0,
    file: null, task: null, doc: null, renderTask: null,
    total: 0, index: 0, selected: new Set(), pageCache: new Map(),
    covers: new Set(), sources: [],
  };
  linkedPickerSession = session;
  ui.linkedSourceGrid.replaceChildren();
  ui.linkedPagePickerGrid.replaceChildren();
  ui.linkedSelectionCount.textContent = "0 sayfa seçili";
  ui.linkedSourceCount.textContent = sources.length + " PDF";
  ui.linkedPickerPageLabel.textContent = "—";
  ui.linkedPickerPrev.disabled = true;
  ui.linkedPickerNext.disabled = true;
  ui.confirmAddLinkedPages.disabled = true;
  ui.confirmAddLinkedPages.textContent = "Sayfaları ekle (0)";
  const cards = [];
  for (const workspace of sources) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "linked-source-card";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "W" + workspace.id + " PDF seç: " + workspace.fileName);
    const { paper, placeholder } = linkedPickerPaper("Önizleme…");
    const label = document.createElement("span");
    label.className = "linked-source-card-label";
    label.textContent = "W" + workspace.id;
    const filename = document.createElement("span");
    filename.className = "linked-source-card-file";
    filename.textContent = workspace.fileName;
    filename.title = workspace.fileName;
    button.append(paper, label, filename);
    button.addEventListener("click", () => { void chooseLinkedPickerSource(session, workspace.id); });
    cards.push({ workspace, paper, button });
    ui.linkedSourceGrid.append(button);
  }
  session.sources = cards;
  if (!sources.length) {
    const empty = document.createElement("p");
    empty.className = "linked-picker-empty";
    empty.textContent = "Diğer workspace'lerde kayıtlı PDF yok.";
    ui.linkedSourceGrid.append(empty);
  }
  const notice = document.createElement("p");
  notice.className = "linked-picker-empty";
  notice.textContent = sources.length
    ? "Önce bir kaynak PDF kapağı seç."
    : "Önce başka bir workspace'e PDF ekle.";
  ui.linkedPagePickerGrid.append(notice);
  linkedPickerMessage("PDF kopyalanmaz. Seçtiğin sayfalar kaynak çalışma alanına bağlantı olarak eklenir.");
  ui.addLinkedPagesDialog.showModal();
  if (cards.length) cards[0].button.focus();
  else ui.closeAddLinkedPages.focus();
  void renderLinkedPickerCovers(session, cards);
}

async function confirmAddLinkedPages() {
  const session = linkedPickerSession;
  if (!session || !linkedPickerActive(session) || session.saving
    || !session.file || !session.selected.size) return;
  session.saving = true;
  ui.confirmAddLinkedPages.disabled = true;
  ui.closeAddLinkedPages.disabled = true;
  ui.cancelAddLinkedPages.disabled = true;
  linkedPickerMessage("Seçilen sayfalar doğrulanıyor…");
  try {
    const stored = await loadWorkspacePdf(session.sourceId);
    const source = workspaces.items.find(item => item.id === session.sourceId);
    if (!linkedPickerActive(session) || !source || !stored ||
      source.fileName !== session.file.name || stored.name !== session.file.name
      || stored.size !== session.file.size || stored.lastModified !== session.file.lastModified) {
      throw new Error("Kaynak PDF silinmiş veya değiştirilmiş. Yeniden seç.");
    }
    const pages = [...session.selected].sort((a, b) => a - b);
    const next = addLinkedWorkspacePages(workspaces, {
      sourceWorkspaceId: session.sourceId, sourceFileName: stored.name,
      sourceSize: stored.size, sourceLastModified: stored.lastModified, pages,
    });
    if (next === workspaces) throw new Error("Sayfalar zaten eklenmiş veya workspace sınırına ulaşılmış.");
    const added = activeWorkspace(next).linkedPages.length - activeWorkspace(workspaces).linkedPages.length;
    if (added !== pages.length) throw new Error("Seçilen sayfaların tümü eklenemedi.");
    workspaces = next;
    persistWorkspaces();
    renderWorkspaceSidebar();
    ui.addLinkedPagesDialog.close();
    await openLinkedWorkspaceReader();
    showToast(added + " sayfa eklendi. Kaynak PDF kopyalanmadı.");
  } catch (error) {
    if (linkedPickerActive(session)) linkedPickerMessage(error?.message || "Sayfalar eklenemedi.");
  } finally {
    session.saving = false;
    ui.closeAddLinkedPages.disabled = false;
    ui.cancelAddLinkedPages.disabled = false;
    if (linkedPickerActive(session)) updateLinkedPickerSelection(session);
  }
}

function cancelLibraryPreviews() {
  for (const task of libraryPreviewTasks) void task.destroy().catch(() => {});
  libraryPreviewTasks.clear();
}

function closeLibrary() {
  if (ui.libraryPage.hidden) return;
  libraryRequestId++;
  cancelLibraryPreviews();
  ui.libraryPage.hidden = true;
  ui.readerPage.hidden = false;
  ui.libraryTitle.hidden = true;
  ui.app.classList.remove("library-open");
  ui.openLibrary.setAttribute("aria-current", "false");
}

function openLibraryPage() {
  closeSidebar();
  ui.readerPage.hidden = true;
  ui.libraryPage.hidden = false;
  ui.libraryTitle.hidden = false;
  ui.app.classList.add("library-open");
  ui.openLibrary.setAttribute("aria-current", "page");
  ui.libraryTitle.focus({ preventScroll: true });
  void refreshLibrary();
}

function createWorkspaceFromLibrary() {
  const next = addWorkspace(workspaces);
  if (next === workspaces) return;
  cancelAllWork();
  workspaces = next;
  persistWorkspaces();
  applyWorkspaceView();
  renderWorkspaceSidebar();
  closeLibrary();
  askToOpen(null, next.activeId);
}

function releaseLibraryBookmarkPreviews() {
  const session = libraryBookmarkPreviewSession;
  libraryBookmarkPreviewSession = null;
  if (!session) return;
  session.cancelled = true;
  session.epoch++;
  try { session.renderTask?.cancel(); } catch { /* Already finished */ }
  if (session.loadingTask) void session.loadingTask.destroy().catch(() => {});
}

function currentLibraryBookmarkPreview(session, epoch) {
  return libraryBookmarkPreviewSession === session && !session.cancelled
    && session.epoch === epoch && ui.libraryBookmarksDialog.open;
}

function loadLibraryBookmarkDocument(session) {
  if (!session.documentPromise) {
    session.documentPromise = (async () => {
      const workspace = workspaces.items.find(item => item.id === session.workspaceId);
      if (isLinkedOnlyWorkspace(workspace)) {
        const virtualDoc = await openLinkedDocument({
          references: workspace.linkedPages, workspaces: workspaces.items,
          loadFile: loadWorkspacePdf, pdfjs,
          isCancelled: () => session.cancelled || libraryBookmarkPreviewSession !== session,
        });
        session.loadingTask = virtualDoc;
        return virtualDoc;
      }
      let file = workspaceFiles.get(session.workspaceId);
      if (!file || file.name !== session.fileName) file = await loadWorkspacePdf(session.workspaceId);
      if (session.cancelled || libraryBookmarkPreviewSession !== session) return null;
      if (!file || file.name !== session.fileName) throw new Error("PDF bulunamadı");
      const data = new Uint8Array(await file.arrayBuffer());
      if (session.cancelled || libraryBookmarkPreviewSession !== session) return null;
      const task = pdfjs.getDocument({ data, isEvalSupported: false });
      session.loadingTask = task;
      return task.promise;
    })();
  }
  return session.documentPromise;
}

async function drawLibraryBookmarkPreviews(session, previews, epoch) {
  const current = () => currentLibraryBookmarkPreview(session, epoch);
  try {
    const pdf = await loadLibraryBookmarkDocument(session);
    if (!current() || !pdf) return;
    for (const { pageNumber, frame, placeholder } of previews) {
      if (!current()) return;
      if (pageNumber > pdf.numPages) {
        placeholder.textContent = "Sayfa bulunamadı";
        continue;
      }
      const cached = session.cache.get(pageNumber);
      if (cached) {
        const img = document.createElement("img");
        img.src = cached;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        frame.replaceChildren(img);
        continue;
      }
      try {
        const page = await pdf.getPage(pageNumber);
        if (!current()) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(0.01, Math.min(
          Math.max(1, frame.clientWidth - 12) / base.width,
          Math.max(1, frame.clientHeight - 12) / base.height
        ));
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * pixelRatio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
        canvas.setAttribute("aria-hidden", "true");
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) throw new Error("Canvas context unavailable");
        const task = page.render({ canvas, canvasContext, viewport });
        session.renderTask = task;
        await task.promise;
        if (session.renderTask === task) session.renderTask = null;
        if (!current()) return;
        frame.replaceChildren(canvas);
        if (session.cache.size >= 20) session.cache.delete(session.cache.keys().next().value);
        try { session.cache.set(pageNumber, canvas.toDataURL("image/webp", 0.8)); }
        catch { /* Thumbnail is still visible without a cache entry. */ }
        page.cleanup();
      } catch (error) {
        if (!current()) return;
        console.warn("Bookmark thumbnail render failed:", error);
        placeholder.textContent = "Önizleme yok";
      }
    }
  } catch (error) {
    if (!current()) return;
    console.warn("Bookmark PDF preview failed:", error);
    for (const entry of previews) {
      if (entry.frame.contains(entry.placeholder)) entry.placeholder.textContent = "PDF önizlemesi açılamadı";
    }
  }
}

function openLibraryBookmarkModal(workspaceId) {
  const workspace = workspaces.items.find((entry) => entry.id === workspaceId);
  if (!workspace || ui.libraryPage.hidden) return;
  releaseLibraryBookmarkPreviews();
  libraryBookmarkWorkspaceId = workspaceId;
  libraryBookmarkPageIndex = 0;
  libraryBookmarkPreviewSession = {
    workspaceId, fileName: workspaceDocumentName(workspace), cancelled: false,
    epoch: 0, documentPromise: null, loadingTask: null,
    renderTask: null, cache: new Map(),
  };
  ui.libraryBookmarksDialog.showModal();
  renderLibraryBookmarkModal();
  ui.closeLibraryBookmarks.focus();
}

function renderLibraryBookmarkModal() {
  const workspace = workspaces.items.find((entry) => entry.id === libraryBookmarkWorkspaceId);
  if (!workspace) return;
  const session = libraryBookmarkPreviewSession;
  const epoch = session ? ++session.epoch : 0;
  try { session?.renderTask?.cancel(); } catch { /* Already finished */ }
  if (session) session.renderTask = null;

  const summary = libraryBookmarkSummary(workspace);
  const current = paginateLibraryBookmarkPages(summary.pages, libraryBookmarkPageIndex);
  libraryBookmarkPageIndex = current.pageIndex;
  ui.libraryBookmarksTitle.textContent = `W${workspace.id} · Yer imleri`;
  ui.libraryBookmarksSummary.textContent =
    `${summary.count} yer imi · ${summary.pages.length} sayfa` +
    (workspace.fileName ? ` · ${workspace.fileName}` : "");

  const fragment = document.createDocumentFragment();
  const previews = [];
  if (!current.items.length) {
    const empty = document.createElement("p");
    empty.className = "library-bookmark-empty";
    empty.textContent = "Bu workspace'te kayıtlı sayfa veya metin yer imi bulunmuyor.";
    fragment.append(empty);
  }
  for (const group of current.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-bookmark-destination";
    button.setAttribute("aria-label", `W${workspace.id} PDF'sinde sayfa ${group.page} aç`);
    const frame = document.createElement("span");
    frame.className = "library-bookmark-preview";
    const placeholder = document.createElement("span");
    placeholder.className = "library-bookmark-preview-placeholder";
    placeholder.textContent = "Yükleniyor…";
    frame.append(placeholder);
    previews.push({ pageNumber: group.page, frame, placeholder });

    const details = document.createElement("span");
    details.className = "library-bookmark-details";
    const title = document.createElement("strong");
    title.textContent = `Sayfa ${group.page}`;
    const subtitle = document.createElement("small");
    const parts = [];
    if (group.pageBookmarks) parts.push(`${group.pageBookmarks} sayfa yer imi`);
    if (group.textNotes) parts.push(`${group.textNotes} metin yer imi`);
    subtitle.textContent = parts.join(" · ");
    details.append(title, subtitle);
    if (group.preview) {
      const snippet = document.createElement("span");
      snippet.className = "library-bookmark-snippet";
      snippet.textContent = group.preview;
      details.append(snippet);
    }
    button.append(frame, details);
    button.addEventListener("click", () => {
      void navigateToLibraryBookmark(workspace.id, workspace.fileName, group.page);
    });
    fragment.append(button);
  }
  ui.libraryBookmarkPages.replaceChildren(fragment);
  ui.libraryBookmarkPaginationLabel.textContent = `${current.pageIndex + 1} / ${current.totalPages}`;
  ui.libraryBookmarkPrev.disabled = current.pageIndex === 0;
  ui.libraryBookmarkNext.disabled = current.pageIndex >= current.totalPages - 1;
  if (session && previews.length) void drawLibraryBookmarkPreviews(session, previews, epoch);
}

async function navigateToLibraryBookmark(workspaceId, fileName, page) {
  const workspace = workspaces.items.find((entry) => entry.id === workspaceId);
  if (!workspace || !fileName || workspaceDocumentName(workspace) !== fileName
    || !libraryBookmarkSummary(workspace).pages.some((item) => item.page === page)) {
    showToast("Yer imi artık mevcut değil. Library'yi yeniden açıp kontrol et.");
    return;
  }
  ui.libraryBookmarksDialog.close();
  closeLibrary();
  const alreadyLoaded = workspaces.activeId === workspaceId
    && Boolean(state.doc) && workspaceDocumentName(activeWorkspace(workspaces)) === fileName;
  if (workspaces.activeId !== workspaceId) {
    cancelAllWork();
    workspaces = switchWorkspace(workspaces, workspaceId);
    persistWorkspaces();
    applyWorkspaceView();
    renderWorkspaceSidebar();
  }
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  if (!alreadyLoaded) await restoreWorkspacePdf(workspaceId);
  if (workspaces.activeId !== workspaceId || !state.doc ||
    workspaceDocumentName(activeWorkspace(workspaces)) !== fileName || page > state.pageCount) {
    showToast("PDF veya istenen sayfa açılamadı. Dosyayı yeniden açman gerekebilir.");
    return;
  }
  setThumbnailMode("pages");
  const generation = state.generation;
  requestAnimationFrame(() => {
    if (generation === state.generation && workspaces.activeId === workspaceId && state.doc) {
      goToPage(page, false);
    }
  });
}

function buildLibraryWorkspaceCards(records) {
  const byWorkspace = new Map(records.filter((record) => !record.orphan)
    .map((record) => [record.workspaceId, record]));
  const previews = [];
  const fragment = document.createDocumentFragment();
  ui.libraryWorkspaceCount.textContent = `${workspaces.items.length} / ${MAX_WORKSPACES}`;

  for (const slot of libraryWorkspaceSlots(workspaces, MAX_WORKSPACES)) {
    const { workspace } = slot;
    const record = workspace ? byWorkspace.get(workspace.id) : null;
    const card = document.createElement("div");
    card.className = "library-workspace-card";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "library-workspace-select";
    if (!workspace) card.classList.add("is-uncreated");
    if (workspace && workspace.id === workspaces.activeId) card.classList.add("is-active");
    const label = workspace
      ? `W${workspace.id}: ${workspace.fileName || "PDF yok"}`
      : `Yeni workspace oluştur (W${slot.id})`;
    select.setAttribute("aria-label", label);
    select.title = label;

    const preview = document.createElement("div");
    preview.className = "library-workspace-preview";
    const placeholder = document.createElement("span");
    placeholder.className = "library-workspace-placeholder";
    const symbol = document.createElement("span");
    symbol.className = "symbol";
    const linkedCount = workspace?.linkedPages?.length || 0;
    symbol.textContent = record ? "PDF" : linkedCount ? "↗" : workspace?.fileName ? "!" : "+";
    const message = document.createElement("span");
    message.className = "message";
    message.textContent = record ? "Önizleme…" :
      linkedCount ? `${linkedCount} ek sayfa` :
      workspace?.fileName ? "PDF kaydı bulunamadı" : workspace ? "PDF ekle" : "Yeni workspace";
    placeholder.append(symbol, message);
    preview.append(placeholder);

    if (record) {
      const cached = libraryPreviewCache.get(record.workspaceId);
      if (cached && cached.name === record.name && cached.size === record.size
        && cached.lastModified === record.lastModified) {
        const image = document.createElement("img");
        image.src = cached.src;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        placeholder.hidden = true;
        preview.append(image);
      } else {
        const canvas = document.createElement("canvas");
        canvas.hidden = true;
        canvas.setAttribute("aria-hidden", "true");
        preview.append(canvas);
        previews.push({ canvas, placeholder, record });
      }
    }
    const footer = document.createElement("div");
    footer.className = "library-workspace-meta";
    const title = document.createElement("div");
    title.className = "library-workspace-name";
    const workspaceName = document.createElement("strong");
    workspaceName.textContent = `W${slot.id}`;
    const size = document.createElement("small");
    size.textContent = record ? formatBytes(record.size) :
      workspace ? (linkedCount ? `${linkedCount} ek sayfa` : `${workspace.notes.length} kayıt`) : "Oluşturulmadı";
    title.append(workspaceName, size);
    const filename = document.createElement("span");
    filename.className = "library-workspace-file";
    filename.textContent = record?.name || workspace?.fileName
      || (workspace ? (linkedCount ? "Bağlantılı PDF sayfaları" : "Boş workspace") : "Oluşturmak için tıkla");
    filename.title = filename.textContent;
    footer.append(title, filename);
    select.append(preview, footer);
    select.addEventListener("click", () => {
      if (!workspace) {
        createWorkspaceFromLibrary();
      } else {
        changeWorkspace(workspace.id);
        if (!workspace.fileName && !workspace.linkedPages?.length) {
          if (isLinkedOnlyWorkspace(workspace)) openAddLinkedPagesDialog();
          else askToOpen(null, workspace.id);
        }
      }
    });
    card.append(select);
    if (workspace) {
      const { count } = libraryBookmarkSummary(workspace);
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "library-bookmark-badge" + (count === 0 ? " is-empty" : "");
      badge.textContent = String(count);
      badge.setAttribute("aria-label", `W${workspace.id}: ${count} yer imi, listeyi aç`);
      badge.title = `${count} yer imi · Sayfalara git`;
      badge.addEventListener("click", () => openLibraryBookmarkModal(workspace.id));
      card.append(badge);
    }
    fragment.append(card);
  }
  ui.libraryWorkspaceGrid.replaceChildren(fragment);
  return previews;
}

/* First-page previews are generated on demand without persisting another copy
   of the PDF; at most two PDF.js instances are active at once. */
async function renderLibraryPreview({ record, canvas, placeholder }, requestId) {
  let loadingTask = null;
  const isCurrent = () => requestId === libraryRequestId && !ui.libraryPage.hidden;
  try {
    let file = workspaceFiles.get(record.workspaceId);
    if (!file || file.name !== record.name || file.size !== record.size) {
      file = await loadWorkspacePdf(record.workspaceId);
    }
    if (!file || !isCurrent() || file.name !== record.name || file.size !== record.size) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isCurrent()) return;
    loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    libraryPreviewTasks.add(loadingTask);
    const pdf = await loadingTask.promise;
    if (!isCurrent()) return;
    const page = await pdf.getPage(1);
    if (!isCurrent()) return;
    const frame = canvas.parentElement;
    const size = page.getViewport({ scale: 1 });
    const scale = Math.max(0.01, Math.min(
      Math.max(40, frame.clientWidth - 14) / size.width,
      Math.max(50, frame.clientHeight - 12) / size.height,
    ));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * pixelRatio });
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
    const canvasContext = canvas.getContext("2d", { alpha: false });
    if (!canvasContext) throw new Error("Canvas kullanılamıyor");
    await page.render({ canvas, canvasContext, viewport }).promise;
    if (!isCurrent()) return;
    canvas.hidden = false;
    placeholder.hidden = true;
    try {
      libraryPreviewCache.set(record.workspaceId, {
        name: record.name, size: record.size, lastModified: record.lastModified,
        src: canvas.toDataURL("image/png"),
      });
    } catch { /* A failed cache export must never hide a successfully drawn thumbnail. */ }
  } catch (error) {
    if (isCurrent()) {
      console.warn("Library preview failed:", error);
      placeholder.querySelector(".message").textContent = "Önizleme yok";
    }
  } finally {
    if (loadingTask) {
      libraryPreviewTasks.delete(loadingTask);
      try { await loadingTask.destroy(); } catch { /* Already cancelled or disposed. */ }
    }
  }
}

function startLibraryPreviews(previews, requestId) {
  let next = 0;
  async function worker() {
    while (requestId === libraryRequestId && !ui.libraryPage.hidden && next < previews.length) {
      const preview = previews[next++];
      await renderLibraryPreview(preview, requestId);
    }
  }
  for (let index = 0; index < Math.min(2, previews.length); index++) void worker();
}

function makeLibraryPdfRow(record) {
  const row = document.createElement("article");
  row.className = "library-file";
  const icon = document.createElement("span");
  icon.className = "library-file-icon";
  icon.textContent = "PDF";
  icon.setAttribute("aria-hidden", "true");
  const details = document.createElement("div");
  details.className = "library-file-details";
  const name = document.createElement("strong");
  name.textContent = record.name || "Adsız PDF";
  name.title = record.name;
  const meta = document.createElement("small");
  meta.textContent = `${formatBytes(record.size)} · ${record.orphan
    ? (record.workspace ? `W${record.workspaceId} · ilişkisiz kayıt` : `W${record.workspaceId} · workspace silinmiş`)
    : `W${record.workspaceId} · workspace'e bağlı`}`;
  details.append(name, meta);
  const status = document.createElement("span");
  status.className = "library-file-status" + (record.orphan ? " is-orphan" : "");
  status.textContent = record.orphan ? "Sahipsiz" : "Kullanımda";
  row.append(icon, details, status);
  if (record.orphan) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "library-remove";
    remove.textContent = "Sil";
    remove.setAttribute("aria-label", `${record.name || "Adsız PDF"} dosyasını sil`);
    remove.addEventListener("click", () => askDeleteLibraryPdf(record));
    row.append(remove);
  }
  return row;
}

async function refreshLibrary() {
  const requestId = ++libraryRequestId;
  cancelLibraryPreviews();
  ui.libraryList.setAttribute("aria-busy", "true");
  ui.libraryWorkspaceGrid.setAttribute("aria-busy", "true");
  ui.libraryList.textContent = "PDF kayıtları okunuyor…";
  let local;
  try { local = measureLocalStorage(window.localStorage); }
  catch { local = null; }
  ui.libraryLocalSize.textContent = local ? formatBytes(local.bytes) : "Kullanılamıyor";
  ui.libraryLocalCount.textContent = local ? `${local.keys} anahtar` : "Erişim engellendi";
  void updateLibraryQuota(requestId);
  try {
    const records = await listWorkspacePdfs();
    if (requestId !== libraryRequestId) return;
    const classified = classifyLibraryPdfs(records, workspaces.items);
    const pdfBytes = classified.reduce((total, record) => total + record.size, 0);
    const orphans = classified.filter((record) => record.orphan)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const orphanBytes = orphans.reduce((total, record) => total + record.size, 0);
    ui.libraryPdfSize.textContent = formatBytes(pdfBytes);
    ui.libraryPdfCount.textContent = `${classified.length} PDF`;
    ui.libraryTotalSize.textContent = local ? formatBytes(pdfBytes + local.bytes) : "—";
    ui.libraryOrphanCount.textContent = `${orphans.length} · ${formatBytes(orphanBytes)}`;

    const previews = buildLibraryWorkspaceCards(classified);
    ui.libraryList.replaceChildren();
    if (!orphans.length) {
      const empty = document.createElement("p");
      empty.className = "library-empty";
      empty.textContent = "Workspace'e bağlı olmayan PDF bulunmuyor.";
      ui.libraryList.append(empty);
    } else {
      orphans.forEach((record) => ui.libraryList.append(makeLibraryPdfRow(record)));
    }
    startLibraryPreviews(previews, requestId);
  } catch (error) {
    if (requestId !== libraryRequestId) return;
    console.warn("Library load failed:", error);
    buildLibraryWorkspaceCards([]);
    ui.libraryPdfSize.textContent = "Kullanılamıyor";
    ui.libraryPdfCount.textContent = "PDF kayıtları okunamadı";
    ui.libraryTotalSize.textContent = "—";
    ui.libraryOrphanCount.textContent = "—";
    ui.libraryList.textContent = "Sahipsiz PDF'ler okunamadı. Tarayıcı depolama izinlerini kontrol edip yeniden dene.";
  } finally {
    if (requestId === libraryRequestId) {
      ui.libraryList.setAttribute("aria-busy", "false");
      ui.libraryWorkspaceGrid.setAttribute("aria-busy", "false");
    }
  }
}

async function updateLibraryQuota(requestId) {
  ui.libraryPersist.hidden = true;
  if (!navigator.storage?.estimate) {
    ui.libraryQuotaText.textContent = "Bu tarayıcıda desteklenmiyor";
    ui.libraryPersistenceStatus.textContent = "Kalıcı depolama API'si kullanılamıyor";
    return;
  }
  try {
    const estimate = await navigator.storage.estimate();
    if (requestId !== libraryRequestId) return;
    const usage = estimate.usage;
    const quota = estimate.quota;
    if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
      ui.libraryQuotaText.textContent = "Kota bilgisi yok";
      ui.libraryQuotaProgress.value = 0;
    } else {
      const percent = Math.min(100, 100 * usage / quota);
      ui.libraryQuotaText.textContent = `${formatBytes(usage)} / ${formatBytes(quota)}`;
      ui.libraryQuotaProgress.value = percent;
      ui.libraryQuotaProgress.title = `Kota kullanımı: %${percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
    }
    const persisted = typeof navigator.storage.persisted === "function"
      ? await navigator.storage.persisted() : null;
    if (requestId !== libraryRequestId) return;
    ui.libraryPersistenceStatus.textContent = persisted === true
      ? "Kalıcı depolama açık"
      : "Standart depolama";
    ui.libraryPersist.hidden = persisted === true || typeof navigator.storage.persist !== "function";
  } catch (error) {
    if (requestId !== libraryRequestId) return;
    console.warn("Storage quota unavailable:", error);
    ui.libraryQuotaText.textContent = "Kota okunamadı";
    ui.libraryPersistenceStatus.textContent = "Depolama durumu öğrenilemedi.";
  }
}

function askDeleteLibraryPdf(record) {
  if (!record.orphan || ui.libraryPage.hidden) return;
  pendingLibraryDeletion = record;
  ui.deleteLibraryPdfName.textContent = record.name || "Adsız PDF";
  ui.deleteLibraryPdfDialog.showModal();
}

async function confirmDeleteLibraryPdf() {
  const record = pendingLibraryDeletion;
  if (!record) return;
  ui.confirmDeleteLibraryPdf.disabled = true;
  ui.cancelDeleteLibraryPdf.disabled = true;
  ui.cancelDeleteLibraryPdfTop.disabled = true;
  try {
    // Check both in-memory and saved workspace metadata immediately before removal.
    // Never remove a PDF that became associated with a workspace meanwhile.
    await waitForWorkspaceSaves();
    const persisted = await readWorkspaceData();
    const linked = [...workspaces.items, ...persisted.state.items].some(
      (item) => item.id === record.workspaceId && item.fileName === record.name
    );
    if (linked) {
      showToast("PDF artık bir workspace'e bağlı; silinmedi.");
    } else if (await deleteWorkspacePdfIfMatches(record.workspaceId, record)) {
      const cached = workspaceFiles.get(record.workspaceId);
      if (cached?.name === record.name && cached.size === record.size) workspaceFiles.delete(record.workspaceId);
      libraryPreviewCache.delete(record.workspaceId);
      showToast("Sahipsiz PDF silindi.");
    } else {
      showToast("PDF değişmiş veya zaten silinmiş; kayıtlar yeniden okunuyor.");
    }
    ui.deleteLibraryPdfDialog.close();
    await refreshLibrary();
  } catch (error) {
    console.warn("Orphan PDF delete failed:", error);
    showToast("PDF silinemedi. Depolama izinlerini kontrol et.");
  } finally {
    ui.confirmDeleteLibraryPdf.disabled = false;
    ui.cancelDeleteLibraryPdf.disabled = false;
    ui.cancelDeleteLibraryPdfTop.disabled = false;
  }
}

ui.menu.addEventListener("click", () => {
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  else openSidebar();
});
ui.closeSidebar.addEventListener("click", closeSidebar);
ui.sidebarBackdrop.addEventListener("click", closeSidebar);
ui.emptyOpen.addEventListener("click", () => askToOpen());
ui.openLibrary.addEventListener("click", openLibraryPage);
ui.emptyAddPages.addEventListener("click", openAddLinkedPagesDialog);
ui.addPagesToolbar.addEventListener("click", openAddLinkedPagesDialog);
ui.closeAddLinkedPages.addEventListener("click", () => ui.addLinkedPagesDialog.close());
ui.cancelAddLinkedPages.addEventListener("click", () => ui.addLinkedPagesDialog.close());
ui.confirmAddLinkedPages.addEventListener("click", () => { void confirmAddLinkedPages(); });
ui.linkedPickerPrev.addEventListener("click", () => {
  if (linkedPickerSession) renderLinkedPickerPage(linkedPickerSession, linkedPickerSession.index - 1);
});
ui.linkedPickerNext.addEventListener("click", () => {
  if (linkedPickerSession) renderLinkedPickerPage(linkedPickerSession, linkedPickerSession.index + 1);
});
ui.addLinkedPagesDialog.addEventListener("close", disposeLinkedPicker);
ui.addLinkedPagesDialog.addEventListener("cancel", (event) => {
  if (linkedPickerSession?.saving) event.preventDefault();
});
ui.closeLibraryBookmarks.addEventListener("click", () => ui.libraryBookmarksDialog.close());
ui.libraryBookmarksDialog.addEventListener("close", () => {
  releaseLibraryBookmarkPreviews();
  libraryBookmarkWorkspaceId = null;
});
ui.libraryBookmarkPrev.addEventListener("click", () => {
  libraryBookmarkPageIndex--;
  renderLibraryBookmarkModal();
});
ui.libraryBookmarkNext.addEventListener("click", () => {
  libraryBookmarkPageIndex++;
  renderLibraryBookmarkModal();
});
let backupBusy = false;
function setBackupBusy(busy, status) {
  backupBusy = busy;
  ui.backupExport.disabled = busy;
  ui.backupImport.disabled = busy;
  ui.integrityRefresh.disabled = busy;
  if (status) ui.backupStatus.textContent = status;
}
async function refreshIntegrityReport() {
  try {
    await waitForWorkspaceSaves();
    const report = await inspectWorkspaceIntegrity(workspaces, await getAllStoredPdfs());
    const bits = [];
    bits.push(`${report.missing.length} eksik PDF`);
    bits.push(`${report.orphan.length} sahipsiz kayıt`);
    bits.push(`${report.brokenLinks.length} bozuk sayfa bağlantısı`);
    ui.integrityStatus.textContent = "Depolama denetimi: " + bits.join(" · ");
    if (report.missing.length || report.brokenLinks.length) {
      ui.integrityStatus.textContent += " · Kaynaklar silinmiş/değişmiş olabilir; yer imleri silinmedi.";
    }
  } catch (error) {
    ui.integrityStatus.textContent = "Denetim yapılamadı: " + (error?.message || error);
  }
}
ui.integrityRefresh.addEventListener("click", () => { void refreshIntegrityReport(); });
ui.backupExport.addEventListener("click", async () => {
  if (backupBusy) return;
  setBackupBusy(true, "PDF'ler ve yer imleri yedekleniyor…");
  try {
    await waitForWorkspaceSaves();
    const snapshot = await readWorkspaceData();
    if (snapshot.revision !== workspaceRevision) throw new Error("Başka sekmede kayıt değişmiş. Önce sayfayı yenile.");
    const records = await getAllStoredPdfs();
    const blob = await createWorkspaceBackup(snapshot.state, records);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pdf-workspace-${new Date().toISOString().slice(0, 10)}.pdfworkspace`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    ui.backupStatus.textContent = `Yedek hazır · ${records.length} PDF · ${snapshot.state.items.length} workspace · ${formatBytes(blob.size)}`;
  } catch (error) {
    console.warn("Workspace backup failed:", error);
    ui.backupStatus.textContent = "Yedekleme başarısız: " + (error?.message || error);
  } finally { setBackupBusy(false); }
});
ui.backupImport.addEventListener("click", () => {
  if (!backupBusy) { ui.backupFile.value = ""; ui.backupFile.click(); }
});
ui.backupFile.addEventListener("change", async () => {
  const file = ui.backupFile.files?.[0];
  ui.backupFile.value = "";
  if (!file || backupBusy) return;
  setBackupBusy(true, "Yedek dosyası ve PDF bütünlükleri doğrulanıyor…");
  try {
    const parsed = await parseWorkspaceBackup(file);
    const report = await inspectWorkspaceIntegrity(parsed.state, parsed.records);
    const problems = report.missing.length + report.brokenLinks.length;
    const warning = problems ? `Yedekte ${problems} eksik veya bozuk kaynak bağlantısı var.\n` : "";
    if (!window.confirm(
      `${parsed.state.items.length} workspace ve ${parsed.records.length} PDF geri yüklenecek.\n` +
      warning + "MEVCUT TÜM WORKSPACE'LER, PDF'LER VE YER İMLERİ DEĞİŞTİRİLECEK.\n" +
      "Devam etmeden mevcut verilerini ayrıca yedeklediğinden emin misin?"
    )) {
      ui.backupStatus.textContent = "Geri yükleme iptal edildi. Mevcut veriler korunuyor.";
      return;
    }
    await waitForWorkspaceSaves();
    const revision = await restoreWorkspaceBackup(parsed, workspaceRevision);
    cancelAllWork();
    workspaces = parsed.state;
    persistedWorkspaces = parsed.state;
    workspaceRevision = revision;
    workspaceFiles.clear();
    libraryPreviewCache.clear();
    broadcastWorkspaceRevision();
    applyWorkspaceView();
    renderWorkspaceSidebar();
    await refreshLibrary();
    await restoreWorkspacePdf(workspaces.activeId);
    ui.backupStatus.textContent = `Yedek geri yüklendi · ${parsed.records.length} PDF, ${parsed.state.items.length} workspace`;
    void refreshIntegrityReport();
  } catch (error) {
    console.warn("Backup import failed:", error);
    ui.backupStatus.textContent = "Geri yükleme başarısız; önceki kayıtlar korundu: " + (error?.message || error);
  } finally { setBackupBusy(false); }
});

ui.libraryPersist.addEventListener("click", async () => {
  ui.libraryPersist.disabled = true;
  try {
    const allowed = await navigator.storage.persist();
    showToast(allowed ? "Kalıcı depolama etkinleştirildi." : "Tarayıcı kalıcı depolama izni vermedi.");
  } catch {
    showToast("Kalıcı depolama isteği başarısız oldu.");
  } finally {
    ui.libraryPersist.disabled = false;
    if (!ui.libraryPage.hidden) void refreshLibrary();
  }
});
ui.cancelDeleteLibraryPdf.addEventListener("click", () => ui.deleteLibraryPdfDialog.close());
ui.cancelDeleteLibraryPdfTop.addEventListener("click", () => ui.deleteLibraryPdfDialog.close());
ui.deleteLibraryPdfDialog.addEventListener("cancel", (event) => {
  if (ui.confirmDeleteLibraryPdf.disabled) event.preventDefault();
});
ui.deleteLibraryPdfDialog.addEventListener("close", () => { pendingLibraryDeletion = null; });
ui.confirmDeleteLibraryPdf.addEventListener("click", () => { void confirmDeleteLibraryPdf(); });
window.addEventListener("storage", (event) => {
  if (event.key === WORKSPACE_STORAGE_KEY && !ui.libraryPage.hidden) void refreshLibrary();
});
ui.createWorkspace.addEventListener("click", () => {
  const next = addWorkspace(workspaces);
  if (next === workspaces) return;
  cancelAllWork();
  closeLibrary();
  workspaces = next;
  persistWorkspaces();
  applyWorkspaceView();
  renderWorkspaceSidebar();
  // Keep the workspace drawer open so the newly created entry is immediately
  // visible and users can add Workspace 3, 4, etc. without reopening it.
  ui.workspaceList.scrollTop = ui.workspaceList.scrollHeight;
  showToast(`${workspaceDisplayName(activeWorkspace(workspaces))} oluşturuldu.`);
});
ui.cancelDeleteWorkspace.addEventListener("click", () => ui.deleteWorkspaceDialog.close());
ui.cancelDeleteWorkspaceTop.addEventListener("click", () => ui.deleteWorkspaceDialog.close());
ui.deleteWorkspaceDialog.addEventListener("close", () => { pendingDeleteWorkspaceId = null; });
ui.deleteWorkspaceDialog.addEventListener("cancel", (event) => { if (ui.confirmDeleteWorkspace.disabled) event.preventDefault(); });
ui.confirmDeleteWorkspace.addEventListener("click", () => { void confirmDeleteWorkspace(); });
ui.cancelReplace.addEventListener("click", () => ui.replaceDialog.close());
ui.cancelReplaceTop.addEventListener("click", () => ui.replaceDialog.close());
ui.replaceDialog.addEventListener("close", () => {
  pendingDropFile = null;
  pendingOpenWorkspaceId = null;
});
ui.confirmReplace.addEventListener("click", () => {
  const file = pendingDropFile;
  const workspaceId = pendingOpenWorkspaceId;
  pendingDropFile = null;
  pendingOpenWorkspaceId = null;
  ui.replaceDialog.close();
  if (file && workspaceId !== null) openPdfForWorkspace(file, workspaceId);
});
ui.input.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  const workspaceId = pickingWorkspaceId;
  pickingWorkspaceId = null;
  if (file && workspaceId !== null) void askToOpen(file, workspaceId);
});
ui.viewer.addEventListener("contextmenu", (event) => {
  const shell = event.target instanceof Element ? event.target.closest(".page-shell") : null;
  if (!state.doc || !shell) { hideSelectionMenu(); return; }
  event.preventDefault();
  const page = Number(shell.dataset.index) + 1;
  const chosen = selectedPdfText();
  if (chosen && chosen.page === page) {
    contextSelection = chosen;
    contextPageBookmark = null;
    showSelectionMenu("text", event.clientX, event.clientY);
  } else {
    // Blank areas of a PDF page use the same bookmark menu as its thumbnail.
    openPageContextMenu(page, event.clientX, event.clientY);
  }
});
ui.pdfInfoButton.addEventListener("click", () => { void showPdfInfo(); });
ui.closePdfInfo.addEventListener("click", () => ui.pdfInfoDialog.close());
// A click on the backdrop is targeted at the dialog itself. Only close when
// the pointer is outside the rendered dialog rectangle, not on its padding.
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog || event.button !== 0) return;
    if (!isOutsideDialogRect(event.clientX, event.clientY, dialog.getBoundingClientRect())) return;
    if (dialog === ui.deleteWorkspaceDialog && ui.confirmDeleteWorkspace.disabled) return;
    if (dialog === ui.deleteLibraryPdfDialog && ui.confirmDeleteLibraryPdf.disabled) return;
    if (dialog === ui.addLinkedPagesDialog && linkedPickerSession?.saving) return;
    dialog.close();
  });
}

ui.copySelection.addEventListener("click", () => {
  const text = contextSelection?.text;
  hideSelectionMenu();
  if (text) void copyText(text);
});
ui.saveSelection.addEventListener("click", saveContextText);
ui.bookmarkPage.addEventListener("click", togglePageBookmark);
ui.moveBookmarkPrevious.addEventListener("click", () => moveContextBookmark(-1));
ui.moveBookmarkNext.addEventListener("click", () => moveContextBookmark(1));
ui.removeBookmarkedPage.addEventListener("click", () => {
  const page = contextPageBookmark;
  if (page) removeBookmarkedPageFromWorkspace(page);
});
ui.removeHighlight.addEventListener("click", () => {
  const noteId = hoveredHighlightNoteId;
  hideHighlightRemove();
  if (noteId) {
    updateWorkspaces(removeSelectedText(workspaces, noteId));
    showToast("Metin vurgusu yer imlerinden kaldırıldı.");
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!ui.selectionMenu.contains(event.target)) hideSelectionMenu();
});
ui.prev.addEventListener("click", () => goToPage(stepVisiblePage(-1)));
ui.next.addEventListener("click", () => goToPage(stepVisiblePage(1)));
ui.pageInput.addEventListener("input", syncPageFieldWidth);
ui.pageInput.addEventListener("change", () => goToPage(ui.pageInput.value));
ui.pageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { goToPage(ui.pageInput.value); ui.pageInput.blur(); }
});
ui.zoomOut.addEventListener("click", () => stepZoom(-1));
ui.zoomIn.addEventListener("click", () => stepZoom(1));
ui.zoomRange.addEventListener("input", () => setScale(Number(ui.zoomRange.value) / 100));
ui.zoomInput.addEventListener("change", () => setScale(Number(ui.zoomInput.value) / 100));
ui.zoomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { setScale(Number(ui.zoomInput.value) / 100); ui.zoomInput.blur(); }
});
const viewMenus = [
  [ui.fitTrigger, ui.fitMenu],
  [ui.direction, ui.directionMenu],
  [ui.thumbnails, ui.thumbsMenu],
];
for (const [trigger, panel] of viewMenus) {
  trigger.addEventListener("click", () => toggleViewMenu(trigger, panel));
}
for (const button of ui.fitButtons) button.addEventListener("click", () => {
  if (state.doc) applyFit(button.dataset.fit);
  else {
    state.fit = button.dataset.fit;
    ui.pages.classList.toggle("fit-height", state.fit === "height");
    updateToolbar();
  }
  persistWorkspaceView(button.dataset.fit);
  closeViewMenu(true);
});
for (const button of ui.directionOptions) button.addEventListener("click", () => {
  updateOrientation(button.dataset.orientation);
  closeViewMenu(true);
});
for (const button of ui.thumbnailOptions) button.addEventListener("click", () => {
  setThumbnailPosition(button.dataset.thumbs);
  closeViewMenu(true);
});
document.addEventListener("pointerdown", (event) => {
  if (openViewPanel && !openViewPanel.contains(event.target) && !openViewTrigger.contains(event.target)) closeViewMenu();
});
document.addEventListener("keydown", (event) => {
  if (openViewPanel && event.key === "Escape") {
    event.preventDefault();
    closeViewMenu(true);
  }
});
document.addEventListener("focusin", (event) => {
  if (openViewPanel && !openViewPanel.contains(event.target) && !openViewTrigger.contains(event.target)) closeViewMenu();
});
window.addEventListener("resize", () => closeViewMenu());
ui.app.querySelector(".topbar").addEventListener("scroll", () => closeViewMenu(), { passive: true });
ui.thumbPages.addEventListener("click", () => setThumbnailMode("pages"));
ui.thumbBookmarks.addEventListener("click", () => setThumbnailMode("bookmarks"));

ui.viewer.addEventListener("scroll", () => { scheduleScrollUpdate(); hideSelectionMenu(); }, { passive: true });
ui.thumbList.addEventListener("scroll", hideSelectionMenu, { passive: true });
ui.viewer.addEventListener("pointermove", handleHighlightHover);
ui.viewer.addEventListener("pointerleave", hideHighlightRemove);
ui.viewer.addEventListener("scroll", hideHighlightRemove, { passive: true });

// Native drag/drop reorders bookmarks. Pages mode is always in PDF page order.
function reorderBookmarkAt(source, entry, clientX, clientY) {
  const target = entry ? Number(entry.dataset.index) + 1 : null;
  if (!source || !target || source === target || state.thumbnailMode !== "bookmarks") return;
  const bounds = entry.getBoundingClientRect();
  const after = state.thumbPosition === "bottom"
    ? clientX > bounds.left + bounds.width / 2
    : clientY > bounds.top + bounds.height / 2;
  const workspace = activeWorkspace(workspaces);
  const next = reorderBookmarkedPage(workspaces, workspace.fileName, state.pageCount, source, target, after);
  if (next !== workspaces) updateWorkspaces(next);
}
function clearBookmarkDrag() {
  draggingBookmarkPage = null;
  for (const entry of state.thumbEntries) entry.classList.remove("dragging", "drag-over");
}
ui.thumbList.addEventListener("dragstart", (event) => {
  const entry = event.target instanceof Element ? event.target.closest(".thumb-entry") : null;
  if (state.thumbnailMode !== "bookmarks" || !entry) { event.preventDefault(); return; }
  draggingBookmarkPage = Number(entry.dataset.index) + 1;
  entry.classList.add("dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(draggingBookmarkPage));
  }
  hideSelectionMenu();
});
ui.thumbList.addEventListener("dragover", (event) => {
  const entry = event.target instanceof Element ? event.target.closest(".thumb-entry") : null;
  if (state.thumbnailMode !== "bookmarks" || !draggingBookmarkPage || !entry) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  for (const node of state.thumbEntries) node.classList.remove("drag-over");
  if (Number(entry.dataset.index) + 1 !== draggingBookmarkPage) entry.classList.add("drag-over");
});
ui.thumbList.addEventListener("drop", (event) => {
  if (state.thumbnailMode !== "bookmarks" || !draggingBookmarkPage) return;
  event.preventDefault();
  event.stopPropagation();
  const entry = event.target instanceof Element ? event.target.closest(".thumb-entry") : null;
  reorderBookmarkAt(draggingBookmarkPage, entry, event.clientX, event.clientY);
  clearBookmarkDrag();
});
ui.thumbList.addEventListener("dragend", clearBookmarkDrag);

// Touch/pen reorder uses a dedicated grip, keeping one-finger list scrolling natural.
ui.thumbList.addEventListener("pointerdown", (event) => {
  const grip = event.target instanceof Element ? event.target.closest(".thumb-drag-handle") : null;
  if (!grip || state.thumbnailMode !== "bookmarks" || event.pointerType === "mouse") return;
  const entry = grip.closest(".thumb-entry");
  if (!entry) return;
  event.preventDefault();
  event.stopPropagation();
  hideSelectionMenu();
  touchBookmarkDrag = { pointerId: event.pointerId, source: Number(entry.dataset.index) + 1 };
  entry.classList.add("dragging");
  grip.setPointerCapture(event.pointerId);
});
ui.thumbList.addEventListener("pointermove", (event) => {
  if (!touchBookmarkDrag || touchBookmarkDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".thumb-entry");
  for (const entry of state.thumbEntries) entry.classList.remove("drag-over");
  if (hovered && Number(hovered.dataset.index) + 1 !== touchBookmarkDrag.source) hovered.classList.add("drag-over");
});
function finishTouchBookmarkDrag(event) {
  if (!touchBookmarkDrag || touchBookmarkDrag.pointerId !== event.pointerId) return;
  const source = touchBookmarkDrag.source;
  touchBookmarkDrag = null;
  if (event.type === "pointerup") {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".thumb-entry");
    reorderBookmarkAt(source, target, event.clientX, event.clientY);
  }
  clearBookmarkDrag();
}
ui.thumbList.addEventListener("pointerup", finishTouchBookmarkDrag);
ui.thumbList.addEventListener("pointercancel", finishTouchBookmarkDrag);

// Drag the PDF with a mouse from blank areas; clicks on actual text still select it.
ui.viewer.addEventListener("pointerdown", (event) => {
  if (!state.doc || event.pointerType !== "mouse" || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(".textLayer span, .highlight-remove")) return;
  mousePan = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  ui.viewer.setPointerCapture(event.pointerId);
});
ui.viewer.addEventListener("pointermove", (event) => {
  if (!mousePan || mousePan.id !== event.pointerId) return;
  const dx = event.clientX - mousePan.x;
  const dy = event.clientY - mousePan.y;
  if (!mousePan.moved && Math.hypot(dx, dy) < 4) return;
  mousePan.moved = true;
  ui.viewer.classList.add("is-dragging");
  ui.viewer.scrollLeft -= dx;
  ui.viewer.scrollTop -= dy;
  mousePan.x = event.clientX;
  mousePan.y = event.clientY;
  event.preventDefault();
});
function stopMousePan(event) {
  if (!mousePan || mousePan.id !== event.pointerId) return;
  mousePan = null;
  ui.viewer.classList.remove("is-dragging");
  if (ui.viewer.hasPointerCapture(event.pointerId)) ui.viewer.releasePointerCapture(event.pointerId);
}
ui.viewer.addEventListener("pointerup", stopMousePan);
ui.viewer.addEventListener("pointercancel", stopMousePan);

// Native one-finger touch scrolling is preserved; two fingers pinch the PDF itself.
ui.viewer.addEventListener("touchstart", (event) => {
  if (!state.doc || event.touches.length !== 2) return;
  event.preventDefault();
  const position = touchDistanceAndCenter(event.touches);
  touchPinch = { distance: position.distance, scale: state.scale, x: position.x, y: position.y };
}, { passive: false });
ui.viewer.addEventListener("touchmove", (event) => {
  if (!state.doc || event.touches.length !== 2) return;
  event.preventDefault();
  const position = touchDistanceAndCenter(event.touches);
  if (!touchPinch) {
    touchPinch = { distance: position.distance, scale: state.scale, x: position.x, y: position.y };
    return;
  }
  ui.viewer.scrollLeft -= position.x - touchPinch.x;
  ui.viewer.scrollTop -= position.y - touchPinch.y;
  zoomAtPoint(touchPinch.scale * position.distance / touchPinch.distance, position.x, position.y);
  touchPinch.x = position.x;
  touchPinch.y = position.y;
}, { passive: false });
ui.viewer.addEventListener("touchend", (event) => {
  if (event.touches.length < 2) touchPinch = null;
}, { passive: true });
ui.viewer.addEventListener("touchcancel", () => { touchPinch = null; }, { passive: true });

// Trackpads emit Ctrl+wheel in Chromium/Firefox and gesture events in Safari.
ui.viewer.addEventListener("wheel", (event) => {
  if (!state.doc) return;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * .006);
    zoomAtPoint(state.scale * factor, event.clientX, event.clientY);
  } else if (state.orientation === "horizontal" && !event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? ui.viewer.clientWidth : 1;
    ui.viewer.scrollLeft += event.deltaY * unit;
  }
}, { passive: false });
ui.viewer.addEventListener("gesturestart", (event) => {
  if (!state.doc) return;
  event.preventDefault();
  trackpadGestureScale = state.scale;
}, { passive: false });
ui.viewer.addEventListener("gesturechange", (event) => {
  if (!state.doc || trackpadGestureScale === null || !Number.isFinite(event.scale)) return;
  event.preventDefault();
  const bounds = ui.viewer.getBoundingClientRect();
  const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : bounds.left + bounds.width / 2;
  const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : bounds.top + bounds.height / 2;
  zoomAtPoint(trackpadGestureScale * event.scale, x, y);
}, { passive: false });
ui.viewer.addEventListener("gestureend", () => { trackpadGestureScale = null; }, { passive: true });

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "o") {
    event.preventDefault();
    if (!ui.replaceDialog.open) askToOpen();
    return;
  }
  if (event.key === "Escape") {
    hideSelectionMenu();
    if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  }
  if (!ui.libraryPage.hidden || !state.doc || document.querySelector("dialog[open]") || event.altKey || event.shiftKey || modifier || event.defaultPrevented) return;
  const active = document.activeElement;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName) || active?.isContentEditable) return;
  // The arrow keys move by whole pages in either flow direction; wheel/touch/mouse handle panning.
  const arrowStep = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1
    : ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 0;
  if (arrowStep) {
    event.preventDefault();
    goToPage(stepVisiblePage(arrowStep), false);
    return;
  }
  if (event.key === "+" || event.key === "=") { event.preventDefault(); stepZoom(1); }
  else if (event.key === "-") { event.preventDefault(); stepZoom(-1); }
  else if (event.key === "0") { event.preventDefault(); applyFit("page"); }
  else if (event.key === "PageDown") { event.preventDefault(); goToPage(stepVisiblePage(1)); }
  else if (event.key === "PageUp") { event.preventDefault(); goToPage(stepVisiblePage(-1)); }
  else if (event.key === "Home") { event.preventDefault(); goToPage(1); }
  else if (event.key === "End") { event.preventDefault(); goToPage(state.pageCount); }
});

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  if (![...event.dataTransfer?.types || []].includes("Files")) return;
  event.preventDefault();
  if (isLinkedOnlyWorkspace(activeWorkspace(workspaces))) return;
  dragDepth++;
  ui.dropOverlay.hidden = false;
});
window.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer?.types || []].includes("Files")) event.preventDefault();
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) ui.dropOverlay.hidden = true;
});
window.addEventListener("drop", (event) => {
  if (![...event.dataTransfer?.types || []].includes("Files")) return;
  event.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.hidden = true;
  if (isLinkedOnlyWorkspace(activeWorkspace(workspaces))) {
    showToast("Bu workspace'e PDF eklenemez. Sayfa ekle seçeneğini kullan.");
    return;
  }
  const file = [...event.dataTransfer?.files || []].find((candidate) => candidate.name.toLowerCase().endsWith(".pdf") || candidate.type === "application/pdf");
  if (file) askToOpen(file);
  else showToast("Lütfen PDF dosyası bırak.");
});

const resizeObserver = new ResizeObserver(() => {
  if (state.doc && state.fit !== "custom") applyFit(state.fit);
});
resizeObserver.observe(ui.viewer);

document.body.style.pointerEvents = "none";
void initializePersistence();
