import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
if (html.includes('src="/src/main.js"')) {
  throw new Error("GitHub Pages must receive compiled Vite HTML, not the source entrypoint.");
}

const assets = [...html.matchAll(/(?:href|src)="\/pdf\/(assets\/[^"]+\.(?:css|js))"/g)].map((match) => match[1]);
for (const extension of [".css", ".js"]) {
  const matches = assets.filter((asset) => asset.endsWith(extension));
  if (!matches.length) throw new Error(`Compiled HTML is missing a /pdf/ ${extension} asset reference.`);
  for (const asset of matches) {
    if (!existsSync(`dist/${asset}`)) throw new Error(`Referenced Pages asset not found: ${asset}`);
  }
}
// JPX/JPEG2000 and JBIG2 image decoding must work on GitHub Pages as
// same-origin static assets. Vite's dev server uses the matching middleware.
for (const name of ["openjpeg.wasm", "jbig2.wasm"]) {
  if (!existsSync(`dist/pdfjs-wasm/${name}`)) {
    throw new Error(`Missing PDF.js image decoder asset: ${name}`);
  }
}
console.log("GitHub Pages output contains compiled CSS/JS and both PDF.js WASM decoders.");
