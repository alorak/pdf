import { findTextMatches, MAX_SEARCH_RESULTS } from "./pdf-navigation.js";

/**
 * Match text-layer chunks with the same whitespace and Turkish-case rules as
 * document search. Keep source offsets so a DOM Range can span several PDF.js
 * text spans without modifying their selectable contents.
 */
export function indexTextLayerMatches(chunks, query, limit = MAX_SEARCH_RESULTS) {
  const text = [];
  const positions = [];
  let previousSpan = null;
  function append(character, node, offset) {
    if (/\s/u.test(character)) {
      if (text.length && text[text.length - 1] !== " ") {
        text.push(" ");
        positions.push(null);
      }
      return;
    }
    text.push(character);
    positions.push({ node, offset });
  }

  for (const { node, span, value } of chunks) {
    if (!value || !node) continue;
    // searchableText() inserts a separator between PDF text items. TextLayer
    // usually renders each item into its own span; preserve that separator.
    if (previousSpan && previousSpan !== span) append(" ", null, 0);
    for (let offset = 0; offset < value.length; offset++) {
      const character = value[offset];
      if (/\s/u.test(character)) {
        append(character, null, 0);
      } else {
        append(character, node, offset);
      }
    }
    previousSpan = span;
  }
  while (text[text.length - 1] === " ") { text.pop(); positions.pop(); }

  const needle = String(query || "").trim();
  return findTextMatches(text.join(""), needle, 1, limit).flatMap((match) => {
    const first = positions[match.offset];
    const last = positions[match.offset + needle.length - 1];
    return first && last ? [{ offset: match.offset, first, last }] : [];
  });
}

/** Convert the visible text layer's DOM ranges into page-relative rectangles. */
export function textLayerSearchRects(layer, surface, query, limit = MAX_SEARCH_RESULTS) {
  if (!layer || !surface || !String(query || "").trim()) return [];
  const chunks = [];
  const walker = layer.ownerDocument.createTreeWalker(layer, 4); // NodeFilter.SHOW_TEXT
  let node;
  while ((node = walker.nextNode())) {
    const span = node.parentElement?.closest("span");
    if (!span || !layer.contains(span) || span.classList.contains("markedContent")) continue;
    chunks.push({ node, span, value: node.textContent || "" });
  }
  const matches = indexTextLayerMatches(chunks, query, limit);
  const bounds = surface.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];

  return matches.map((match) => {
    const range = layer.ownerDocument.createRange();
    range.setStart(match.first.node, match.first.offset);
    range.setEnd(match.last.node, match.last.offset + 1);
    const rects = [];
    for (const rect of range.getClientRects()) {
      const left = Math.max(bounds.left, rect.left);
      const top = Math.max(bounds.top, rect.top);
      const right = Math.min(bounds.right, rect.right);
      const bottom = Math.min(bounds.bottom, rect.bottom);
      if (right - left < 0.5 || bottom - top < 0.5) continue;
      rects.push([
        (left - bounds.left) / bounds.width,
        (top - bounds.top) / bounds.height,
        (right - left) / bounds.width,
        (bottom - top) / bounds.height,
      ]);
    }
    return { offset: match.offset, rects };
  });
}
