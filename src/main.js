import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { clampPage, clampScale, chooseDeviceScale, fitScale, readableSize, MIN_SCALE, MAX_SCALE } from "./viewer-math.js";
import "./style.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = (id) => document.getElementById(id);
const ui = {
  app: $("app"), open: $("openButton"), input: $("fileInput"), emptyOpen: $("emptyOpenButton"),
  fileLabel: $("fileLabel"), prev: $("prevPage"), next: $("nextPage"),
  pageInput: $("pageInput"), pageTotal: $("pageTotal"), zoomOut: $("zoomOut"),
  zoomIn: $("zoomIn"), zoomRange: $("zoomRange"), zoomInput: $("zoomInput"),
  fitButtons: [...document.querySelectorAll("[data-fit]")],
  direction: $("directionButton"), thumbnails: $("thumbsToggle"),
  settings: $("settingsButton"), dialog: $("settingsDialog"), closeSettings: $("closeSettings"),
  doneSettings: $("doneSettings"), viewer: $("viewer"), pages: $("pages"),
  empty: $("emptyState"), thumbPane: $("thumbsPane"), thumbList: $("thumbList"),
  thumbCount: $("thumbCount"), loading: $("loading"), loadingText: $("loadingText"),
  status: $("statusText"), fileSize: $("fileSize"), orientationText: $("orientationText"),
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
  dimensions: [], shells: [], thumbs: [],
  visible: new Set(), pending: new Set(), rendered: new Map(),
  renderTasks: new Map(), activeRenders: 0, observer: null,
  thumbVisible: new Set(), thumbPending: new Set(), thumbRendered: new Set(),
  thumbTasks: new Map(), activeThumbRenders: 0, thumbObserver: null,
  scrollFrame: 0, toastTimer: 0,
};

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

function updateSettingsView() {
  ui.app.classList.toggle("thumbs-left", state.thumbPosition === "left");
  ui.app.classList.toggle("thumbs-bottom", state.thumbPosition === "bottom");
  ui.app.classList.toggle("thumbs-hidden", !state.thumbsVisible);
  ui.pages.classList.toggle("vertical", state.orientation === "vertical");
  ui.pages.classList.toggle("horizontal", state.orientation === "horizontal");
  ui.orientationText.textContent = state.orientation === "vertical" ? "Dikey akış" : "Yatay akış";
  ui.direction.title = state.orientation === "vertical" ? "Yatay akışa geç" : "Dikey akışa geç";
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
    if (scrollThumbnail && state.thumbsVisible) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  updateToolbar();
}

function goToPage(page, smooth = true) {
  if (!state.doc) return;
  const index = clampPage(page, state.pageCount) - 1;
  setCurrentPage(index);
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
  state.rendered.clear();
}

function setScale(scale, fit = "custom") {
  if (!state.doc) return;
  const next = clampScale(scale);
  if (state.scale === next && state.fit === fit) return;
  const anchor = captureViewportAnchor();
  const changed = state.scale !== next;
  state.fit = fit;
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
  const gutters = { x: 82, y: 116 };
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
  ui.thumbList.replaceChildren();
  ui.app.classList.remove("has-document");
  ui.empty.hidden = false;
  ui.pages.hidden = true;
  ui.fileLabel.textContent = "PDF açılmadı";
  ui.fileLabel.title = "Henüz dosya açılmadı";
  ui.fileSize.textContent = "";
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
    const stamp = document.createElement("span");
    stamp.className = "page-stamp";
    stamp.textContent = `${index + 1} / ${state.pageCount}`;
    shell.append(surface, stamp);
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
  ui.thumbList.replaceChildren(thumbFragment);
  ui.thumbCount.textContent = String(state.pageCount);
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

async function openPDF(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showToast("Lütfen bir PDF dosyası seç.");
    return;
  }
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
    state.dimensions = new Array(state.pageCount);
    state.dimensions[0] = { width: rect.width, height: rect.height };
    ui.app.classList.add("has-document");
    ui.empty.hidden = true;
    ui.pages.hidden = false;
    ui.fileLabel.textContent = file.name;
    ui.fileLabel.title = file.name;
    ui.fileSize.textContent = readableSize(file.size);
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
  } finally {
    if (generation === state.generation) setLoading(false);
  }
}

function stepZoom(direction) {
  if (!state.doc) return;
  const value = state.scale;
  const next = direction > 0
    ? (ZOOM_STEPS.find((step) => step > value + .005) ?? MAX_SCALE)
    : ([...ZOOM_STEPS].reverse().find((step) => step < value - .005) ?? MIN_SCALE);
  setScale(next);
}

ui.open.addEventListener("click", () => ui.input.click());
ui.emptyOpen.addEventListener("click", () => ui.input.click());
ui.input.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) void openPDF(file);
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

ui.viewer.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
ui.viewer.addEventListener("wheel", (event) => {
  if (!state.doc || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * .006);
  setScale(Math.round(clampScale(state.scale * factor) * 100) / 100);
}, { passive: false });

document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "o") {
    event.preventDefault();
    ui.input.click();
    return;
  }
  if (!state.doc || ui.dialog.open || event.altKey || modifier) return;
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
  if (file) void openPDF(file);
  else showToast("Lütfen PDF dosyası bırak.");
});

const resizeObserver = new ResizeObserver(() => {
  if (state.doc && state.fit !== "custom") applyFit(state.fit);
});
resizeObserver.observe(ui.viewer);

updateSettingsView();
updateToolbar();
