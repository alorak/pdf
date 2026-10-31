import { defineConfig } from "vite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Bundle PDF.js version-matched decoders, fonts, CMaps and ICC profiles.
 * No CDN dependencies or copyrighted corpus files are bundled.
 */
const pdfjsAssets = {
  "pdfjs-wasm": "wasm",
  "pdfjs-standard-fonts": "standard_fonts",
  "pdfjs-cmaps": "cmaps",
  "pdfjs-iccs": "iccs",
};
const entries = new Map();
for (const [route, folder] of Object.entries(pdfjsAssets)) {
  const directory = resolve("node_modules/pdfjs-dist", folder);
  const files = readdirSync(directory).filter(name => /^[a-zA-Z0-9_.-]+$/.test(name)
    && !name.startsWith("."));
  if (!files.length) throw new Error("Missing pdfjs-dist assets: " + folder);
  for (const name of files) {
    entries.set(route + "/" + name, resolve(directory, name));
  }
}
for (const name of ["pdfjs-wasm/openjpeg.wasm", "pdfjs-wasm/jbig2.wasm"]) {
  if (!entries.has(name)) throw new Error("Missing PDF.js decoder: " + name);
}

function pdfjsResources() {
  return {
    name: "pdfjs-same-origin-resources",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let url;
        try { url = new URL(request.url, "http://localhost"); }
        catch { return next(); }
        const match = /^\/pdf\/(pdfjs-[a-z-]+\/[a-zA-Z0-9_.-]+)$/.exec(url.pathname);
        if (!match || !entries.has(match[1])) return next();
        const pathname = match[1];
        response.statusCode = 200;
        response.setHeader("Content-Type", pathname.endsWith(".wasm") ? "application/wasm"
          : pathname.endsWith(".js") ? "text/javascript; charset=utf-8"
          : pathname.endsWith(".icc") ? "application/vnd.iccprofile" : "application/octet-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.end(readFileSync(entries.get(pathname)));
      });
    },
    generateBundle() {
      for (const [pathname, realPath] of entries) {
        this.emitFile({
          type: "asset", fileName: pathname, source: readFileSync(realPath),
        });
      }
    },
  };
}
export default defineConfig({
  base: "/pdf/",
  plugins: [pdfjsResources()],
  build: { target: "es2022" },
});
