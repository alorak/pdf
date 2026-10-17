import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { clampPage, clampScale, chooseDeviceScale, fitScale, MIN_SCALE, MAX_SCALE } from "./viewer-math.js";
import {
  WORKSPACE_STORAGE_KEY, MAX_WORKSPACES, MAX_SAVED_TEXTS,
  initialWorkspaces, readWorkspaces, activeWorkspace, addWorkspace, switchWorkspace,
  setWorkspaceFile, clearActiveWorkspace, removeWorkspace, saveSelectedText, removeSelectedText, bookmarkedPageNumbers,
} from "./workspace-store.js";
import { saveWorkspacePdf, loadWorkspacePdf, deleteWorkspacePdf } from "./pdf-storage.js";
import "./style.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = (id) => document.getElementById(id);
const ui = {
  app: $("app"), menu: $("menuButton"), sidebarOpen: $("sidebarOpenButton"),
  input: $("fileInput"), emptyOpen: $("emptyOpenButton"),
  activeWorkspaceLabel: $("activeWorkspaceLabel"), workspaceSidebar: $("workspaceSidebar"),
  sidebarBackdrop: $("sidebarBackdrop"), closeSidebar: $("closeSidebar"),
  workspaceList: $("workspaceList"), workspaceCount: $("workspaceCount"),
  createWorkspace: $("createWorkspace"), savedTexts: $("savedTexts"), savedCount: $("savedCount"),
  replaceDialog: $("replaceDialog"), replaceWorkspaceName: $("replaceWorkspaceName"),
  deleteWorkspaceDialog: $("deleteWorkspaceDialog"), deleteWorkspaceName: $("deleteWorkspaceName"),
  cancelDeleteWorkspace: $("cancelDeleteWorkspace"), cancelDeleteWorkspaceTop: $("cancelDeleteWorkspaceTop"),
  confirmDeleteWorkspace: $("confirmDeleteWorkspace"),
  cancelReplace: $("cancelReplace"), cancelReplaceTop: $("cancelReplaceTop"),
  confirmReplace: $("confirmReplace"), selectionMenu: $("selectionMenu"),
  copySelection: $("copySelection"), saveSelection: $("saveSelection"),
  fileLabel: $("fileLabel"), prev: $("prevPage"), next: $("nextPage"),
  pageInput: $("pageInput"), pageTotal: $("pageTotal"), zoomOut: $("zoomOut"),
  zoomIn: $("zoomIn"), zoomRange: $("zoomRange"), zoomInput: $("zoomInput"),
  fitButtons: [...document.querySelectorAll("[data-fit]")],
  direction: $("directionButton"), thumbnails: $("thumbsToggle"),
  settings: $("settingsButton"), dialog: $("settingsDialog"), closeSettings: $("closeSettings"),
  doneSettings: $("doneSettings"), viewer: $("viewer"), pages: $("pages"),
  empty: $("emptyState"), thumbPane: $("thumbsPane"), thumbList: $("thumbList"),
  thumbPages: $("thumbPages"), thumbBookmarks: $("thumbBookmarks"), thumbEmpty: $("thumbEmpty"),
  thumbCount: $("thumbCount"), loading: $("loading"), loadingText: $("loadingText"),
  status: $("statusText"),
  toast: $("toast"), dropOverlay: $("dropOverlay"),
};

const SETTINGS_KEY = "pdf-viewer-preferences-v1";
const ZOOM_STEPS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6];
const MAX_PAGE_RENDERS = 2;
const MAX_THUMB_RENDERS = 1;
const settings = readSettings();

const state = {
  doc: null, loadingTask: null, generation: 0, renderEpoch: 0, thumbEpoch: 0,
  pageCount: 0, current: 1, scale: 1, fit: "width",
  orientation: settings.orientation, thumbPosition: settings.thumbPosition, thumbsVisible: settings.thumbsVisible,
  thumbnailMode: "pages",
  dimensions: [], shells: [], thumbs: [],
  visible: new Set(), pending: new Set(), rendered: new Map(),
  renderTasks: new Map(), textLayers: new Map(), activeRenders: 0, observer: null,
  thumbVisible: new Set(), thumbPending: new Set(), thumbRendered: new Set(),
  thumbTasks: new Map(), activeThumbRenders: 0, thumbObserver: null,
  scrollFrame: 0, toastTimer: 0,
};

let workspaces = loadWorkspaces();
const workspaceFiles = new Map(); // Active files are cached in memory; persistent copies live in IndexedDB.
let pendingDeleteWorkspaceId = null;
let pendingDropFile = null;
let pickingNewFile = false;
let contextSelection = null;
let mousePan = null;
let touchPinch = null;
let trackpadGestureScale = null;

function loadWorkspaces() {
  try { return readWorkspaces(localStorage.getItem(WORKSPACE_STORAGE_KEY)); }
  catch { return initialWorkspaces(); }
}

function persistWorkspaces() {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaces));
  } catch {
    showToast("Tarayıcı depolaması dolu veya kullanılamıyor; kayıtlar kalıcı olmayabilir.");
  }
}

function updateWorkspaces(next) {
  if (next === workspaces) return;
  workspaces = next;
  persistWorkspaces();
  renderWorkspaceSidebar();
}

function renderWorkspaceSidebar() {
  const active = activeWorkspace(workspaces);
  ui.activeWorkspaceLabel.textContent = active.name;
  ui.workspaceCount.textContent = `${workspaces.items.length} / ${MAX_WORKSPACES}`;
  ui.savedCount.textContent = String(active.notes.length);
  ui.createWorkspace.disabled = workspaces.items.length >= MAX_WORKSPACES;
  ui.createWorkspace.title = ui.createWorkspace.disabled ? "En fazla 10 workspace oluşturulabilir" : "Yeni çalışma alanı";
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
    title.textContent = item.name;
    const caption = document.createElement("small");
    caption.textContent = `${item.notes.length} kayıt · ${item.fileName || "PDF açılmadı"}`;
    metadata.append(title, caption);
    button.append(number, metadata);
    button.addEventListener("click", () => changeWorkspace(item.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "workspace-delete";
    remove.textContent = "×";
    remove.title = `${item.name} çalışma alanını sil`;
    remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => askDeleteWorkspace(item.id));
    const row = document.createElement("div");
    row.className = "workspace-row";
    row.append(button, remove);
    ui.workspaceList.append(row);
  }
  ui.savedTexts.replaceChildren();
  if (!active.notes.length) {
    const empty = document.createElement("div");
    empty.className = "saved-empty";
    empty.textContent = "PDF'den metin seçip sağ tıklayarak buraya kalıcı olarak kaydedebilirsin.";
    ui.savedTexts.append(empty);
    return;
  }
  for (const note of [...active.notes].reverse()) {
    const card = document.createElement("article");
    card.className = "saved-card";
    const quote = document.createElement("p");
    quote.textContent = note.text;
    quote.title = note.text;
    const footer = document.createElement("div");
    footer.className = "saved-card-footer";
    const source = document.createElement("small");
    const parts = [note.fileName, note.page ? `s. ${note.page}` : ""].filter(Boolean);
    source.textContent = parts.join(" · ") || "Kaydedilen metin";
    source.title = note.savedAt ? new Date(note.savedAt).toLocaleString("tr-TR") : "";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Kopyala";
    copy.addEventListener("click", () => { void copyText(note.text); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-saved";
    remove.textContent = "Sil";
    remove.setAttribute("aria-label", "Kayıtlı metni sil");
    remove.addEventListener("click", () => updateWorkspaces(removeSelectedText(workspaces, note.id)));
    footer.append(source, copy, remove);
    card.append(quote, footer);
    ui.savedTexts.append(card);
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
  if (id === workspaces.activeId) { closeSidebar(); return; }
  cancelAllWork();
  workspaces = switchWorkspace(workspaces, id);
  persistWorkspaces();
  renderWorkspaceSidebar();
  closeSidebar();
  void restoreWorkspacePdf(id);
}

async function restoreWorkspacePdf(workspaceId) {
  if (workspaces.activeId !== workspaceId) return;
  const saved = activeWorkspace(workspaces);
  if (!saved?.fileName) return;
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
    await openPDF(file, { persistFile: false });
  } catch (error) {
    if (generation === state.generation) {
      console.warn("Workspace PDF restore failed:", error);
      showToast("PDF geri yüklenemedi. Tarayıcı depolaması engellenmiş veya temizlenmiş olabilir.");
    }
  } finally {
    if (generation === state.generation) setLoading(false);
  }
}

function askDeleteWorkspace(id) {
  const item = workspaces.items.find((entry) => entry.id === id);
  if (!item) return;
  pendingDeleteWorkspaceId = id;
  ui.deleteWorkspaceName.textContent = item.name;
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
    await deleteWorkspacePdf(id);
    workspaceFiles.delete(id);
    const wasActive = workspaces.activeId === id;
    if (wasActive) cancelAllWork();
    workspaces = removeWorkspace(workspaces, id);
    persistWorkspaces();
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

function askToOpen(file = null) {
  pickingNewFile = false;
  pendingDropFile = file;
  hideSelectionMenu();
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  ui.replaceWorkspaceName.textContent = activeWorkspace(workspaces).name;
  ui.replaceDialog.showModal();
}

function selectedPdfText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!ui.pages.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const element = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode : selection.anchorNode?.parentElement;
  const pageElement = element?.closest(".page-shell");
  return {
    text,
    page: pageElement ? Number(pageElement.dataset.index) + 1 : state.current,
    fileName: activeWorkspace(workspaces).fileName,
  };
}

function hideSelectionMenu() {
  ui.selectionMenu.hidden = true;
  contextSelection = null;
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
  if (next === current) {
    showToast(`Bir workspace en fazla ${MAX_SAVED_TEXTS} metin saklayabilir.`);
    return;
  }
  updateWorkspaces(next);
  showToast("Seçilen metin workspace'e kaydedildi.");
}

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      orientation: ["vertical", "horizontal"].includes(value.orientation) ? value.orientation : "vertical",
      thumbPosition: ["left", "bottom"].includes(value.thumbPosition) ? value.thumbPosition : "left",
      thumbsVisible: value.thumbsVisible !== false,
    };
  } catch {
    return { orientation: "vertical", thumbPosition: "left", thumbsVisible: true };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      orientation: state.orientation, thumbPosition: state.thumbPosition, thumbsVisible: state.thumbsVisible,
    }));
  } catch {
    // Private mode and constrained storage must not prevent PDF reading.
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 4500);
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

function updateThumbnailFilter(resetScroll = false) {
  const workspace = activeWorkspace(workspaces);
  const bookmarked = new Set(bookmarkedPageNumbers(workspace, workspace?.fileName, state.doc ? state.pageCount : 0));
  const onlyBookmarks = state.thumbnailMode === "bookmarks";
  ui.thumbPages.classList.toggle("active", !onlyBookmarks);
  ui.thumbPages.setAttribute("aria-pressed", String(!onlyBookmarks));
  ui.thumbBookmarks.classList.toggle("active", onlyBookmarks);
  ui.thumbBookmarks.setAttribute("aria-pressed", String(onlyBookmarks));
  ui.thumbCount.textContent = String(onlyBookmarks ? bookmarked.size : state.pageCount);
  for (let index = 0; index < state.thumbs.length; index++) {
    state.thumbs[index].hidden = onlyBookmarks && !bookmarked.has(index + 1);
  }
  ui.thumbEmpty.hidden = !onlyBookmarks || bookmarked.size > 0 || !state.doc;
  if (resetScroll) {
    ui.thumbList.scrollTop = 0;
    ui.thumbList.scrollLeft = 0;
  }
}

function setThumbnailMode(mode) {
  if (!["pages", "bookmarks"].includes(mode) || state.thumbnailMode === mode) return;
  state.thumbnailMode = mode;
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
  const nextDirection = state.orientation === "vertical" ? "Yatay akışa geç" : "Dikey akışa geç";
  ui.direction.title = nextDirection;
  ui.direction.setAttribute("aria-label", nextDirection);
  ui.thumbnails.setAttribute("aria-pressed", String(state.thumbsVisible));
  document.querySelectorAll('input[name="thumbPosition"]').forEach((input) => { input.checked = input.value === state.thumbPosition; });
  document.querySelectorAll('input[name="scrollDirection"]').forEach((input) => { input.checked = input.value === state.orientation; });
}

function updateToolbar() {
  const hasDoc = Boolean(state.doc);
  [ui.prev, ui.next, ui.pageInput, ui.zoomOut, ui.zoomIn, ui.zoomRange, ui.zoomInput, ui.direction, ...ui.fitButtons].forEach((button) => { button.disabled = !hasDoc; });
  ui.prev.disabled = !hasDoc || state.current <= 1;
  ui.next.disabled = !hasDoc || state.current >= state.pageCount;
  ui.zoomIn.disabled = !hasDoc || state.scale >= MAX_SCALE;
  ui.zoomOut.disabled = !hasDoc || state.scale <= MIN_SCALE;
  ui.pageInput.value = String(state.current);
  ui.pageInput.max = String(Math.max(1, state.pageCount));
  ui.pageTotal.textContent = String(state.pageCount);
  ui.zoomInput.value = String(Math.round(state.scale * 100));
  ui.zoomRange.value = String(Math.round(state.scale * 100));
  for (const button of ui.fitButtons) {
    button.classList.toggle("active", hasDoc && state.fit === button.dataset.fit);
    button.setAttribute("aria-pressed", String(hasDoc && state.fit === button.dataset.fit));
  }
}

function setCurrentPage(index, scrollThumbnail = true) {
  if (!state.doc) return;
  const page = clampPage(index + 1, state.pageCount);
  if (page === state.current) return;
  const previous = state.thumbs[state.current - 1];
  if (previous) previous.classList.remove("active");
  state.current = page;
  const thumb = state.thumbs[page - 1];
  if (thumb) {
    thumb.classList.add("active");
    if (scrollThumbnail && state.thumbsVisible && !thumb.hidden) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  updateToolbar();
}

function goToPage(page, smooth = true) {
  if (!state.doc) return;
  const index = clampPage(page, state.pageCount) - 1;
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
  saveSettings();
  if (state.doc) {
    ui.viewer.scrollTop = 0;
    ui.viewer.scrollLeft = 0;
    if (state.fit !== "custom") applyFit(state.fit);
    requestAnimationFrame(() => goToPage(state.current, false));
  }
}

function updateThumbPosition(position) {
  if (!["left", "bottom"].includes(position) || position === state.thumbPosition) return;
  state.thumbPosition = position;
  updateSettingsView();
  saveSettings();
  if (state.doc && state.fit !== "custom") requestAnimationFrame(() => applyFit(state.fit));
}

function toggleThumbnails() {
  state.thumbsVisible = !state.thumbsVisible;
  updateSettingsView();
  saveSettings();
  if (state.doc && state.fit !== "custom") requestAnimationFrame(() => applyFit(state.fit));
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
  if (state.doc) void state.doc.destroy().catch(() => {});
  else if (state.loadingTask) void state.loadingTask.destroy().catch(() => {});
  state.loadingTask = null;
  state.doc = null;
  state.pageCount = 0;
  state.current = 1;
  state.dimensions = [];
  state.shells = [];
  state.thumbs = [];
  ui.pages.replaceChildren();
  ui.thumbList.replaceChildren(ui.thumbEmpty);
  ui.thumbEmpty.hidden = true;
  ui.app.classList.remove("has-document");
  ui.empty.hidden = false;
  ui.pages.hidden = true;
  ui.fileLabel.textContent = "PDF açılmadı";
  ui.fileLabel.title = "Henüz dosya açılmadı";
  ui.thumbCount.textContent = "0";
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
    number.textContent = String(index + 1);
    thumb.append(preview, number);
    thumb.addEventListener("click", () => goToPage(index + 1));
    state.thumbs[index] = thumb;
    thumbFragment.append(thumb);
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
  cancelAllWork();
  const generation = state.generation;
  setLoading(true);
  ui.status.textContent = "Dosya okunuyor…";
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    if (generation !== state.generation) return;
    state.loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
    const doc = await state.loadingTask.promise;
    if (generation !== state.generation) {
      void doc.destroy();
      return;
    }
    state.doc = doc;
    state.pageCount = doc.numPages;
    const first = await doc.getPage(1);
    if (generation !== state.generation) return;
    const rect = first.getViewport({ scale: 1 });
    if (persistFile) {
      try {
        await saveWorkspacePdf(workspaceId, file);
      } catch (error) {
        console.warn("PDF persistence failed:", error);
        showToast("PDF açıldı ancak kalıcı kaydedilemedi. Tarayıcı depolama alanını kontrol et.");
      }
    }
    if (generation !== state.generation || workspaces.activeId !== workspaceId) return;
    if (replaceWorkspace) workspaces = clearActiveWorkspace(workspaces);
    workspaces = setWorkspaceFile(workspaces, file.name);
    workspaceFiles.set(workspaceId, file);
    persistWorkspaces();
    renderWorkspaceSidebar();
    state.dimensions = new Array(state.pageCount);
    state.dimensions[0] = { width: rect.width, height: rect.height };
    ui.app.classList.add("has-document");
    ui.empty.hidden = true;
    ui.pages.hidden = false;
    ui.fileLabel.textContent = file.name;
    ui.fileLabel.title = file.name;
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

ui.menu.addEventListener("click", () => {
  if (ui.workspaceSidebar.classList.contains("is-open")) closeSidebar();
  else openSidebar();
});
ui.closeSidebar.addEventListener("click", closeSidebar);
ui.sidebarBackdrop.addEventListener("click", closeSidebar);
ui.emptyOpen.addEventListener("click", openSidebar);
ui.sidebarOpen.addEventListener("click", () => askToOpen());
ui.createWorkspace.addEventListener("click", () => {
  if (workspaces.items.length >= MAX_WORKSPACES) return;
  cancelAllWork();
  updateWorkspaces(addWorkspace(workspaces));
});
ui.cancelDeleteWorkspace.addEventListener("click", () => ui.deleteWorkspaceDialog.close());
ui.cancelDeleteWorkspaceTop.addEventListener("click", () => ui.deleteWorkspaceDialog.close());
ui.deleteWorkspaceDialog.addEventListener("click", (event) => {
  if (event.target === ui.deleteWorkspaceDialog) ui.deleteWorkspaceDialog.close();
});
ui.deleteWorkspaceDialog.addEventListener("close", () => { pendingDeleteWorkspaceId = null; });
ui.deleteWorkspaceDialog.addEventListener("cancel", (event) => { if (ui.confirmDeleteWorkspace.disabled) event.preventDefault(); });
ui.confirmDeleteWorkspace.addEventListener("click", () => { void confirmDeleteWorkspace(); });
ui.cancelReplace.addEventListener("click", () => ui.replaceDialog.close());
ui.cancelReplaceTop.addEventListener("click", () => ui.replaceDialog.close());
ui.replaceDialog.addEventListener("click", (event) => {
  if (event.target === ui.replaceDialog) ui.replaceDialog.close();
});
ui.confirmReplace.addEventListener("click", () => {
  const file = pendingDropFile;
  pendingDropFile = null;
  ui.replaceDialog.close();
  if (file) void openPDF(file, { replaceWorkspace: true });
  else {
    pickingNewFile = true;
    ui.input.click();
  }
});
ui.input.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  const approved = pickingNewFile;
  pickingNewFile = false;
  if (approved && file) void openPDF(file, { replaceWorkspace: true });
});
ui.viewer.addEventListener("contextmenu", (event) => {
  const chosen = selectedPdfText();
  if (!state.doc || !chosen) { hideSelectionMenu(); return; }
  event.preventDefault();
  contextSelection = chosen;
  ui.selectionMenu.hidden = false;
  const width = ui.selectionMenu.offsetWidth;
  const height = ui.selectionMenu.offsetHeight;
  ui.selectionMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8))}px`;
  ui.selectionMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))}px`;
});
ui.copySelection.addEventListener("click", () => {
  const text = contextSelection?.text;
  hideSelectionMenu();
  if (text) void copyText(text);
});
ui.saveSelection.addEventListener("click", saveContextText);
document.addEventListener("pointerdown", (event) => {
  if (!ui.selectionMenu.contains(event.target)) hideSelectionMenu();
});
ui.prev.addEventListener("click", () => goToPage(state.current - 1));
ui.next.addEventListener("click", () => goToPage(state.current + 1));
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
for (const button of ui.fitButtons) button.addEventListener("click", () => applyFit(button.dataset.fit));
ui.direction.addEventListener("click", () => updateOrientation(state.orientation === "vertical" ? "horizontal" : "vertical"));
ui.thumbnails.addEventListener("click", toggleThumbnails);
ui.thumbPages.addEventListener("click", () => setThumbnailMode("pages"));
ui.thumbBookmarks.addEventListener("click", () => setThumbnailMode("bookmarks"));
ui.settings.addEventListener("click", () => ui.dialog.showModal());
ui.closeSettings.addEventListener("click", () => ui.dialog.close());
ui.doneSettings.addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", (event) => { if (event.target === ui.dialog) ui.dialog.close(); });
document.querySelectorAll('input[name="thumbPosition"]').forEach((input) => input.addEventListener("change", () => {
  if (input.checked) updateThumbPosition(input.value);
}));
document.querySelectorAll('input[name="scrollDirection"]').forEach((input) => input.addEventListener("change", () => {
  if (input.checked) updateOrientation(input.value);
}));

ui.viewer.addEventListener("scroll", () => { scheduleScrollUpdate(); hideSelectionMenu(); }, { passive: true });

// Drag the PDF with a mouse from blank areas; clicks on actual text still select it.
ui.viewer.addEventListener("pointerdown", (event) => {
  if (!state.doc || event.pointerType !== "mouse" || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(".textLayer span")) return;
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
  if (!state.doc || ui.dialog.open || ui.replaceDialog.open || event.altKey || modifier) return;
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (event.key === "+" || event.key === "=") { event.preventDefault(); stepZoom(1); }
  else if (event.key === "-") { event.preventDefault(); stepZoom(-1); }
  else if (event.key === "0") { event.preventDefault(); applyFit("page"); }
  else if (event.key === "PageDown") { event.preventDefault(); goToPage(state.current + 1); }
  else if (event.key === "PageUp") { event.preventDefault(); goToPage(state.current - 1); }
  else if (event.key === "Home") { event.preventDefault(); goToPage(1); }
  else if (event.key === "End") { event.preventDefault(); goToPage(state.pageCount); }
});

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  if (![...event.dataTransfer?.types || []].includes("Files")) return;
  event.preventDefault();
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
  event.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.hidden = true;
  const file = [...event.dataTransfer?.files || []].find((candidate) => candidate.name.toLowerCase().endsWith(".pdf") || candidate.type === "application/pdf");
  if (file) askToOpen(file);
  else showToast("Lütfen PDF dosyası bırak.");
});

const resizeObserver = new ResizeObserver(() => {
  if (state.doc && state.fit !== "custom") applyFit(state.fit);
});
resizeObserver.observe(ui.viewer);

updateSettingsView();
updateToolbar();
renderWorkspaceSidebar();
void restoreWorkspacePdf(workspaces.activeId);
