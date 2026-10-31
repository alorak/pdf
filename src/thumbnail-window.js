/** Fixed-size, contiguous list virtualization with flex-gap-aware spacers. */
export const THUMBNAIL_VIRTUAL_THRESHOLD = 300;
export function thumbnailWindow(count, scroll, viewport, size, gap, overscan = 500, maxItems = 80) {
  if (![count, scroll, viewport, size, gap, overscan, maxItems].every(Number.isFinite)
      || count < 0 || !Number.isInteger(count) || size <= 0 || gap < 0 || viewport < 0
      || overscan < 0 || maxItems < 1) throw new RangeError("Invalid thumbnail geometry");
  if (!count) return { start: 0, end: 0, before: 0, after: 0, total: 0 };
  const step = size + gap;
  const startVisible = Math.max(0, Math.min(count - 1, Math.floor(Math.max(0, scroll) / step)));
  const endVisible = Math.min(count, Math.ceil((Math.max(0, scroll) + viewport) / step));
  let start = Math.max(0, Math.floor((Math.max(0, scroll) - overscan) / step));
  let end = Math.min(count, Math.ceil((Math.max(0, scroll) + viewport + overscan) / step));
  const visibleCount = Math.max(1, endVisible - startVisible);
  if (end - start > maxItems && visibleCount <= maxItems) {
    start = Math.max(0, startVisible - Math.floor((maxItems - visibleCount) / 2));
    end = Math.min(count, Math.max(endVisible, start + maxItems));
    start = Math.max(0, end - maxItems);
  }
  const total = count * size + (count - 1) * gap;
  return {
    start, end,
    before: start ? start * step - gap : 0,
    after: end < count ? (count - end) * step - gap : 0,
    total,
  };
}
export function thumbnailScrollOffset(index, size, gap) {
  return Math.max(0, index) * (size + gap);
}
