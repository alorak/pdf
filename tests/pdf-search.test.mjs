import test from "node:test";
import assert from "node:assert/strict";
import { createPdfTextCache, scanPdfText } from "../src/pdf-search.js";

function mockDocument(texts, delay = 0) {
  let reads = 0, active = 0, peak = 0;
  return {
    numPages: texts.length,
    get reads() { return reads; },
    get peak() { return peak; },
    async getPage(pageNo) {
      reads++;
      active++;
      peak = Math.max(peak, active);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      active--;
      return { async getTextContent() {
        return { items: [{ str: texts[pageNo - 1], hasEOL: false }] };
      } };
    },
  };
}

test("concurrent scan remains page-ordered and never exceeds concurrency", async () => {
  const doc = mockDocument(["target one", "none", "target three", "target four", "other", "target six"], 1);
  const progress = [];
  const found = await scanPdfText(doc, "target", {
    batchSize: 3, yieldTask: async () => {},
    onProgress: (page, count, results) => progress.push([page, count, results.length]),
  });
  assert.deepEqual(found.map(item => item.page), [1, 3, 4, 6]);
  assert.ok(doc.peak > 1 && doc.peak <= 3);
  assert.deepEqual(progress, [[3, 6, 2], [6, 6, 4]]);
});

test("repeat search uses bounded in-memory cached text, and clear forces re-read", async () => {
  const doc = mockDocument(["istanbul", "ankara", "izmir"]);
  const cache = createPdfTextCache(64);
  await scanPdfText(doc, "ankara", { cache, yieldTask: async () => {} });
  assert.equal(doc.reads, 3);
  assert.equal((await scanPdfText(doc, "izmir", { cache, yieldTask: async () => {} }))[0].page, 3);
  assert.equal(doc.reads, 3);
  cache.clear();
  await scanPdfText(doc, "istanbul", { cache, yieldTask: async () => {} });
  assert.equal(doc.reads, 6);
  assert.ok(cache.bytes <= 64);
});

test("cancellation, upper result limit and document errors are deterministic", async () => {
  let cancelled = false;
  const doc = mockDocument(["a", "a", "a", "a", "a", "a"]);
  const cancelledResult = await scanPdfText(doc, "a", {
    batchSize: 2, yieldTask: async () => { cancelled = true; },
    isCancelled: () => cancelled,
  });
  assert.equal(cancelledResult, null);
  assert.equal(doc.reads, 2);
  assert.deepEqual((await scanPdfText(doc, "a", { maxResults: 3, yieldTask: async () => {} }))
    .map(x => x.page), [1, 2, 3]);
  await assert.rejects(scanPdfText({ numPages: 1, async getPage() { throw Error("bad PDF"); } }, "test"), /bad PDF/);
});
