import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generateCodecPdf, codecManifest } from "../scripts/p2-7-codec-fixtures.mjs";

const extra = process.env.P2_7_JBIG2_FILES ? JSON.parse(process.env.P2_7_JBIG2_FILES) : [];
if (!Array.isArray(extra) || extra.length > 10) throw new Error("P2_7_JBIG2_FILES must be a short JSON array");
for (const item of extra) {
  if (!/^[a-z0-9-]{2,50}$/.test(item.id || "") ||
      !/^[a-f0-9]{64}$/.test(item.sha256 || "") ||
      typeof item.path !== "string") throw new Error("Invalid JBIG2 case descriptor");
}
const cases = [
  { id: "jpx", kind: "jpx", data: generateCodecPdf("jpx") },
  { id: "cmyk", kind: "cmyk", data: generateCodecPdf("cmyk") },
  ...extra.map(item => ({ ...item, kind: "jbig2" })),
];

function classify([r,g,b,a], kind) {
  if (a < 160) return "transparent";
  if (kind === "jpx") {
    if (r > 150 && r > g * 1.8 && r > b * 1.8) return "red";
    if (g > 150 && g > r * 1.8 && g > b * 1.8) return "green";
    if (b > 150 && b > r * 1.8 && b > g * 1.8) return "blue";
    if (Math.min(r,g,b) > 195) return "white";
  } else if (kind === "cmyk") {
    if (r < 145 && g > r + 55 && b > r + 55) return "cyan";
    if (g < 145 && r > g + 55 && b > g + 55) return "magenta";
    if (b < 145 && r > b + 55 && g > b + 55) return "yellow";
    if (Math.max(r,g,b) < 115) return "black";
  } else {
    const avg = (r + g + b) / 3;
    if (avg < 110) return "black";
    if (avg > 185) return "white";
  }
  return "other";
}

function requiredColors(kind) {
  return kind === "jpx" ? ["red", "green", "blue", "white"]
    : kind === "cmyk" ? ["cyan", "magenta", "yellow", "black"] : ["black", "white"];
}

for (const item of cases) {
  test("P2.7 actual image codec in production Chromium: " + item.id, async ({ page }) => {
    const bytes = item.data ?? await readFile(item.path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (item.sha256) expect(sha256).toBe(item.sha256);
    if (item.kind === "jbig2") {
      expect(bytes.includes(Buffer.from("/JBIG2Decode", "ascii")),
        "PDF must contain a genuine JBIG2Decode image, not a renamed Flate image").toBe(true);
    }
    if (item.kind !== "jbig2") {
      expect(codecManifest(item.kind, bytes).sha256).toBe(sha256);
    }
    const errors = [];
    const decoderResponses = [];
    page.on("pageerror", err => errors.push("pageerror: " + err.message));
    page.on("console", msg => {
      if (msg.type() === "error" ||
          /Unable to decode|PDF page render failed|PDF thumbnail render failed/.test(msg.text())) {
        errors.push("console: " + msg.text().slice(0, 180));
      }
    });
    page.on("response", response => {
      if (response.url().includes("/pdfjs-")) {
        decoderResponses.push({ name: response.url().split("/").at(-1), status: response.status() });
        if (response.status() >= 400) errors.push("decoder HTTP " + response.status());
      }
    });
    await page.goto("");
    const assets = await page.evaluate(async () => {
      const files = ["/pdf/pdfjs-wasm/openjpeg.wasm", "/pdf/pdfjs-wasm/jbig2.wasm"];
      return Promise.all(files.map(async url => {
        const response = await fetch(url);
        return { file: url.split("/").at(-1), ok: response.ok, status: response.status,
          type: response.headers.get("content-type") };
      }));
    });
    for (const asset of assets) {
      expect(asset.ok && asset.status === 200).toBe(true);
      expect(asset.type).toContain("wasm");
    }
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#emptyOpenButton").click();
    const picker = await chooserPromise;
    await picker.setFiles(item.path ?? {
      name: item.id + ".pdf", mimeType: "application/pdf", buffer: bytes,
    });
    await page.locator("#confirmReplace").click();
    const expectedPages = item.kind === "jbig2" ? 1 : 3;
    await expect(page.locator("#pageTotal")).toHaveText(String(expectedPages), { timeout: 60_000 });
    const pages = [...new Set([1,Math.ceil(expectedPages/2),expectedPages])];
    const samples = [];
    for (const pageNo of pages) {
      await page.locator("#pageInput").fill(String(pageNo));
      await page.locator("#pageInput").press("Enter");
      await expect(page.locator("#pageInput")).toHaveValue(String(pageNo));
      const selector = '.page-shell[data-index="' + (pageNo - 1) + '"] .page-surface canvas';
      // Wait for actual decoded colors, never count a blank initialized canvas as a pass.
      await expect.poll(async () => {
        const rgba = await page.locator(selector).evaluateAll((all,kind) => {
          const c = all.find(n => n.width > 20 && n.height > 20);
          if (!c) return [];
          const context = c.getContext("2d", {willReadFrequently:true});
          const positions = kind === "jbig2"
            ? Array.from({length:17*17},(_,i)=>[(i%17+.5)/17,(Math.floor(i/17)+.5)/17])
            : [[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
          return positions.map(([x,y]) => [...context.getImageData(
            Math.min(c.width-1,Math.floor(c.width*x)),
            Math.min(c.height-1,Math.floor(c.height*y)),1,1).data]);
        }, item.kind);
        const seen = new Set(rgba.map(pixel => classify(pixel,item.kind)));
        return requiredColors(item.kind).every(color=>seen.has(color));
      }, { timeout: 90_000, message:"Expected codec-specific pixel palette on page " + pageNo })
        .toBe(true);
      samples.push({page:pageNo, colors:requiredColors(item.kind)});
    }
    expect(errors, "uncaught errors, decode errors, and missing WASM assets").toEqual([]);
    const result = { schema:1, id:item.id, kind:item.kind, sha256, bytes:bytes.length,
      pages:expectedPages, samples, decoderResponses, assets, errors, pass:true,
      browserOnly:"actual canvas color sampling; no reference-image pixel diff" };
    await mkdir("test-results/stress",{recursive:true});
    await writeFile("test-results/stress/p2-7-" + item.id + ".json",
      JSON.stringify(result,null,2));
    console.log("P2_7_CODEC_BROWSER_PASSED " + JSON.stringify({
      id:item.id,sha256,bytes:bytes.length,pages:expectedPages,samples:samples.length,
      decoderResponses:decoderResponses.filter(x=>/wasm/.test(x.name)),
    }));
  });
}
