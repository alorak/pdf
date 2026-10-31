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
for (const directory of ["pdfjs-wasm", "pdfjs-standard-fonts", "pdfjs-cmaps", "pdfjs-iccs"]) {
  if (!existsSync("dist/" + directory)) {
    throw new Error("PDF.js resource directory missing from Pages bundle: " + directory);
  }
}
for (const name of ["openjpeg.wasm", "jbig2.wasm"]) {
  if (!existsSync("dist/pdfjs-wasm/" + name)) {
    throw new Error("PDF.js decoder missing from Pages bundle: " + name);
  }
}
console.log("GitHub Pages output includes CSS/JS, decoders, fonts, CMaps and ICC resources.");
