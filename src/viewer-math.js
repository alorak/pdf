export const MIN_SCALE = 0.2;
export const MAX_SCALE = 6;

export function clampScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, numeric));
}

export function fitScale(mode, area, page, gutters = { x: 72, y: 72 }) {
  const width = Math.max(1, area.width - gutters.x);
  const height = Math.max(1, area.height - gutters.y);
  const widthScale = width / Math.max(1, page.width);
  const heightScale = height / Math.max(1, page.height);

  if (mode === "width") return clampScale(widthScale);
  if (mode === "height") return clampScale(heightScale);
  if (mode === "page") return clampScale(Math.min(widthScale, heightScale));
  return 1;
}

export function clampPage(page, count) {
  const numeric = Math.trunc(Number(page));
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(Math.max(1, count), numeric));
}

export function chooseDeviceScale(cssWidth, cssHeight, dpr = 1, maxPixels = 12_000_000) {
  const pixels = Math.max(1, cssWidth * cssHeight);
  const density = Math.sqrt(maxPixels / pixels);
  const maxEdge = 16_384;
  return Math.max(0.001, Math.min(2, Math.max(1, dpr), density, maxEdge / Math.max(1, cssWidth), maxEdge / Math.max(1, cssHeight)));
}

export function readableSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 ** 2)).toFixed(1) + " MB";
}
