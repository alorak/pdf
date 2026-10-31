/**
 * P2.4 vertical reader windowing. Page offsets include the inter-page gap,
 * except after the final page. Unknown dimensions use a supplied fallback.
 * Pure functions make scroll geometry testable without a browser.
 */
export const VIRTUAL_PAGE_THRESHOLD = 300;

export function pageOffsets(heights, scale = 1, gap = 40) {
  if (!Array.isArray(heights) || !Number.isFinite(scale) || scale <= 0 || gap < 0) {
    throw new RangeError("Invalid virtual page layout");
  }
  const offsets = [0];
  for (let i = 0; i < heights.length; i++) {
    const height = Math.ceil(Math.max(1, Number(heights[i]) || 1) * scale) + 2;
    offsets.push(offsets[i] + height + (i < heights.length - 1 ? gap : 0));
  }
  return offsets;
}

export function pageIndexAtOffset(offsets, position) {
  if (offsets.length <= 1) return 0;
  let lo = 0, hi = offsets.length - 1;
  const target = Math.max(0, Number(position) || 0);
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] <= target) lo = mid;
    else hi = mid;
  }
  return Math.min(offsets.length - 2, lo);
}

export function pageWindow(offsets, start, viewportSize, overscan = 1200, maxPages = 80) {
  const total = offsets.length - 1;
  if (!total) return { start: 0, end: 0, before: 0, after: 0 };
  const firstVisible = pageIndexAtOffset(offsets, start);
  const lastVisible = pageIndexAtOffset(offsets, Math.max(0, start) + Math.max(0, viewportSize));
  let from = pageIndexAtOffset(offsets, Math.max(0, start - overscan));
  let to = Math.min(total, pageIndexAtOffset(offsets, start + Math.max(0, viewportSize) + overscan) + 1);
  // Never drop actual viewport pages, even at very small zoom levels.
  if (to - from > maxPages && lastVisible - firstVisible + 1 < maxPages) {
    const extra = maxPages - (lastVisible - firstVisible + 1);
    from = Math.max(0, firstVisible - Math.floor(extra / 2));
    to = Math.min(total, Math.max(lastVisible + 1, from + maxPages));
    from = Math.max(0, to - maxPages);
  }
  return { start: from, end: to };
}

export function pageSpacerHeights(offsets, start, end, gap) {
  const total = offsets.length - 1;
  if (!total || start < 0 || end < start || end > total) throw new RangeError("Invalid page window");
  return {
    before: start > 0 ? Math.max(0, offsets[start] - gap) : 0,
    after: end < total ? Math.max(0, offsets[total] - offsets[end]) : 0,
  };
}
