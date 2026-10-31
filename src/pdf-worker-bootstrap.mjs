import { installMapUpsertPolyfills } from "./pdfjs-compat.js";

// PDF.js 6 relies on Map/WeakMap upsert methods in *worker* contexts as well.
// Chromium 141 does not expose them there; main-thread polyfills are isolated.
// Dynamic import guarantees the compatibility layer executes first.
installMapUpsertPolyfills();
await import("pdfjs-dist/build/pdf.worker.min.mjs");
