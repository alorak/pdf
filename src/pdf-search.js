import { findTextMatches, searchableText, MAX_SEARCH_RESULTS } from "./pdf-navigation.js";

/**
 * Document-scoped, bounded LRU cache. Never writes source text to IndexedDB
 * or network. A new PDF clears this cache through the reader lifecycle.
 */
export function createPdfTextCache(maxBytes = 24 * 1024 * 1024) {
  let bytes = 0;
  const items = new Map();
  return {
    get(page) {
      if (!items.has(page)) return undefined;
      const text = items.get(page);
      items.delete(page);
      items.set(page, text);
      return text;
    },
    set(page, text) {
      if (typeof text !== "string" || text.length * 2 > maxBytes) return;
      if (items.has(page)) { bytes -= items.get(page).length * 2; items.delete(page); }
      items.set(page, text);
      bytes += text.length * 2;
      while (bytes > maxBytes) {
        const key = items.keys().next().value;
        bytes -= items.get(key).length * 2;
        items.delete(key);
      }
    },
    clear() { items.clear(); bytes = 0; },
    get size() { return items.size; },
    get bytes() { return bytes; },
  };
}

/**
 * Scan in small concurrent batches while merging matches in physical page
 * order. Yield between batches so progress, cancellation and UI stay responsive.
 * Unlike Promise.all(5000), no unbounded PDF.js jobs can accumulate.
 */
export async function scanPdfText(doc, query, {
  cache = createPdfTextCache(),
  maxResults = MAX_SEARCH_RESULTS,
  batchSize = 8,
  isCancelled = () => false,
  onProgress = () => {},
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  if (!doc || !Number.isInteger(doc.numPages) || doc.numPages < 1) return [];
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 16) {
    throw new RangeError("PDF search concurrency must be 1..16");
  }
  const needle = String(query || "").trim();
  if (!needle || needle.length > 160) return [];
  const results = [];
  for (let first = 1; first <= doc.numPages && results.length < maxResults; first += batchSize) {
    if (isCancelled()) return null;
    const last = Math.min(doc.numPages, first + batchSize - 1);
    const batch = await Promise.all(Array.from({ length: last - first + 1 }, async (_, i) => {
      const pageNo = first + i;
      const cached = cache.get(pageNo);
      if (cached !== undefined) return cached;
      if (isCancelled()) return "";
      const page = await doc.getPage(pageNo);
      if (isCancelled()) return "";
      const content = await page.getTextContent();
      if (isCancelled()) return "";
      const text = searchableText(content);
      cache.set(pageNo, text);
      return text;
    }));
    if (isCancelled()) return null;
    for (let i = 0; i < batch.length && results.length < maxResults; i++) {
      results.push(...findTextMatches(batch[i], needle, first + i, maxResults - results.length));
    }
    onProgress(last, doc.numPages, results);
    // Only yield once per batch; the old scanner waited after every six pages
    // and forced the full search-results DOM to be rebuilt at each interval.
    if (last < doc.numPages && results.length < maxResults) await yieldTask();
  }
  return isCancelled() ? null : results;
}
