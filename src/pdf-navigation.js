export const MAX_SEARCH_RESULTS = 250;
export const MAX_SEARCH_SNIPPET = 118;

/** Simple Unicode-aware, case-insensitive PDF text matching. */
export function findTextMatches(text, query, page, limit = MAX_SEARCH_RESULTS) {
  const source = String(text || "").replace(/\s+/gu, " ").trim();
  const needle = String(query || "").trim();
  if (!needle || needle.length > 160 || !source || !Number.isInteger(limit) || limit < 1) return [];
  const haystack = source.toLocaleLowerCase("tr");
  const folded = needle.toLocaleLowerCase("tr");
  const matches = [];
  let pos = 0;
  while (matches.length < limit) {
    const at = haystack.indexOf(folded, pos);
    if (at < 0) break;
    const left = Math.max(0, at - 40);
    const right = Math.min(source.length, at + needle.length + 65);
    matches.push({ page, offset: at, snippet:
      (left ? "…" : "") + source.slice(left, right) + (right < source.length ? "…" : "") });
    pos = at + Math.max(1, folded.length);
  }
  return matches;
}

export function searchableText(content) {
  return (content?.items || []).filter(item => typeof item.str === "string")
    .map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
}

/** Only a bounded number of pages retain heavyweight canvases/text layers. */
export function evictDistantPages(renderedPages, visiblePages, currentPage, maxCount) {
  const rendered = Array.from(renderedPages);
  if (rendered.length <= maxCount) return [];
  const protectedSet = new Set(visiblePages);
  const candidates = rendered.filter(index => !protectedSet.has(index))
    .sort((a, b) => Math.abs(b - currentPage) - Math.abs(a - currentPage));
  return candidates.slice(0, Math.max(0, rendered.length - maxCount));
}

/** Limit nested outline depth and number of entries to prevent huge DOM trees. */
export function flattenOutline(outline, maxEntries = 700, maxDepth = 10) {
  const rows = [];
  const visit = (items, depth) => {
    if (!Array.isArray(items) || depth > maxDepth) return;
    for (const item of items) {
      if (rows.length >= maxEntries) return;
      if (item?.title) rows.push({ title: String(item.title).slice(0, 200),
        dest: item.dest || null, url: item.url || null, depth });
      visit(item?.items, depth + 1);
    }
  };
  visit(outline, 0);
  return rows;
}
