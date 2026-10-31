import { defineConfig } from "vite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// PDF.js v6 needs WASM for JPX/JPEG2000 and JBIG2. Keep the decoder files
// same-origin and version-locked to pdfjs-dist, including GitHub Pages /pdf/.
const wasmDir = resolve("node_modules/pdfjs-dist/wasm");
const decoderFiles = readdirSync(wasmDir)
  .filter(name => /^[a-zA-Z0-9_.-]+\.(wasm|js)$/.test(name));
if (!decoderFiles.some(name => name.startsWith("openjpeg") && name.endsWith(".wasm"))
  || !decoderFiles.some(name => name.startsWith("jbig2") && name.endsWith(".wasm"))) {
  throw new Error("Missing pdfjs-dist JPX/JBIG2 WASM decoders");
}

function pdfjsDecoderAssets() {
  return {
    name: "pdfjs-decoder-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let url;
        try { url = new URL(request.url, "http://localhost"); }
        catch { return next(); }
        const match = /^\/pdf\/pdfjs-wasm\/([a-zA-Z0-9_.-]+)$/.exec(url.pathname);
        if (!match || !decoderFiles.includes(match[1])) return next();
        const filename = match[1];
        response.statusCode = 200;
        response.setHeader("Content-Type", filename.endsWith(".wasm")
          ? "application/wasm" : "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache");
        response.end(readFileSync(resolve(wasmDir, filename)));
      });
    },
    generateBundle() {
      for (const filename of decoderFiles) {
        this.emitFile({
          type: "asset",
          fileName: "pdfjs-wasm/" + filename,
          source: readFileSync(resolve(wasmDir, filename)),
        });
      }
    },
  };
}

export default defineConfig({
  base: "/pdf/",
  plugins: [pdfjsDecoderAssets()],
  build: {
    target: "es2022",
  },
});
