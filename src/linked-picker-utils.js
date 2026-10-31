/** Render a bounded set of page thumbnails rather than all pages of a large PDF. */
export function linkedPickerWindow(pageCount, requestedIndex, pageSize = 12) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 0 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("Invalid page picker size");
  }
  const groups = Math.max(1, Math.ceil(pageCount / pageSize));
  const index = Math.max(0, Math.min(groups - 1,
    Number.isFinite(requestedIndex) ? Math.trunc(requestedIndex) : 0));
  const first = pageCount ? index * pageSize + 1 : 0;
  const last = pageCount ? Math.min(pageCount, first + pageSize - 1) : 0;
  return { index, groups, first, last };
}

/** Prevent a click inside dialog padding or content from closing the modal. */
export function isOutsideDialogRect(x, y, rect) {
  return x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom;
}
