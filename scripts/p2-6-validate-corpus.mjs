
import { readFile, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { validateCorpusManifest, corpusFilePath } from "../src/p2-6-corpus-policy.js";

const manifestPath = process.env.P2_REAL_CORPUS_MANIFEST;
if (!manifestPath) {
  console.error("P2_REAL_CORPUS_MANIFEST is required. No real-PDF corpus is bundled or downloaded.");
  process.exitCode = 2;
} else {
  try {
    const absolute = resolve(manifestPath);
    const root = await realpath(dirname(absolute));
    const manifest = JSON.parse(await readFile(absolute, "utf8"));
    const cases = validateCorpusManifest(manifest);
    const records = [];
    const imageOps = new Set(Object.entries(OPS)
      .filter(([name]) => /^paint.*Image/i.test(name)).map(([, value]) => value));
    for (const item of cases) {
      const candidate = corpusFilePath(root, item.file);
      const resolved = await realpath(candidate);
      if (!resolved.startsWith(root + sep)) throw Error("Corpus symlink leaves authorized directory");
      const info = await stat(resolved);
      if (!info.isFile() || info.size < 64 || info.size > 600 * 1024 * 1024) {
        throw Error("Corpus PDF outside allowed 64B..600MiB file size");
      }
      const bytes = await readFile(resolved);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== item.sha256) throw Error("Corpus SHA-256 mismatch: " + item.id);
      const beforeRss = process.memoryUsage().rss;
      const began = performance.now();
      const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
      let numPages = 0, sampledPages = [], observedImagePages = 0, observedTextPages = 0;
      try {
        const pdf = await loading.promise;
        numPages = pdf.numPages;
        if (!Number.isSafeInteger(numPages) || numPages < 1 || numPages > 10000) {
          throw Error("Unexpected PDF page count");
        }
        const selected = [...new Set([1, Math.ceil(numPages / 2), numPages])];
        for (const pageNo of selected) {
          const page = await pdf.getPage(pageNo);
          const text = await page.getTextContent();
          const operators = await page.getOperatorList();
          const textPresent = text.items.some(x => typeof x.str === "string" && x.str.trim());
          const imagePresent = operators.fnArray.some(x => imageOps.has(x));
          if (textPresent) observedTextPages++;
          if (imagePresent) observedImagePages++;
          const viewport = page.getViewport({ scale: 1 });
          sampledPages.push({ pageNo, textPresent, imagePresent,
            widthPt: Number(viewport.width.toFixed(1)), heightPt: Number(viewport.height.toFixed(1)) });
        }
        if (item.text === "present" && observedTextPages === 0) throw Error("Expected searchable text");
        if (item.text === "none" && observedTextPages !== 0) throw Error("Unexpected OCR/text");
        if (observedImagePages < item.minImagePages) throw Error("Expected image-bearing pages");
      } finally { await loading.destroy(); }
      const ms = Number((performance.now() - began).toFixed(1));
      const rssAfterMiB = Number((process.memoryUsage().rss / 1048576).toFixed(1));
      // Report excludes paths, actual text, page content, and source bytes.
      records.push({ id: item.id, sha256, bytes: bytes.byteLength, numPages,
        sampledPages, observedImagePages, observedTextPages, parseAndSampleMs: ms,
        rssBeforeMiB: Number((beforeRss / 1048576).toFixed(1)), rssAfterMiB,
        rightsBasis: item.rightsBasis, verified: true });
      console.log("P2_6_CORPUS_CASE_PASSED " + JSON.stringify({
        id: item.id, sha256, bytes: bytes.byteLength, numPages,
        sampleCount: sampledPages.length, parseAndSampleMs: ms }));
    }
    const report = { schema: 1, kind: "local-curated-real-pdf-corpus",
      measuredAt: new Date().toISOString(),
      node: process.version, commit: process.env.GITHUB_SHA || "local",
      cases: records, rawDocumentContentStored: false, pass: true };
    await mkdir("test-results/stress", { recursive: true });
    await writeFile("test-results/stress/p2-6-corpus.json", JSON.stringify(report, null, 2));
    console.log("P2_6_REAL_CORPUS_PASSED " + JSON.stringify({ cases: records.length }));
  } catch (error) {
    console.error("P2.6 corpus validation failed:", error.message);
    process.exitCode = 1;
  }
}
