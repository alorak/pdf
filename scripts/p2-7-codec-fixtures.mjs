import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * Self-created deterministic JPEG2000 raw J2K codestream, 64x64, lossless.
 * Generated from four solid RGB quadrants by Pillow + OpenJPEG 2.5.4.
 * Red, green, blue and near-white; embedded data is an original test pattern.
 * This is actual JPEG2000 compressed data, not a renamed Flate/JPEG image.
 */
const JPX_J2K = "/0//UQAvAAAAAABAAAAAQAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAADBwEBBwEBBwEB/1IADAAAAAEABQQEAAH/XAATQEBISFBISFBISFBISFBISFD/ZAAlAAFDcmVhdGVkIGJ5IE9wZW5KUEVHIHZlcnNpb24gMi41LjT/kAAKAAAAAAHTAAH/k9+AKAVZO66834AoCVbfZ8/fgCgGpuxpr8/AGn4AsPtBQA4j4WEfrwFGz/NrABJ2OU/H2goACB4e6Y+j7QUACaQZPDjH2hsfaGQ+0HAXsR+2InIQundsX2l/DxQL2SFcQuy25ePXFqgvQKfUl8faFAAXKuExCEThA6BMo+0JAAx2eBge7ZT5wM/AWn4CsPtCQCQh0gBSDVEWd5OWEPW6FimpXQjaux8kIMnK7+aNcImMWsJiqmJDV3y5oGgkKouEydvNkr/H2hwAIW4HIUbPpPzujHMBcAOj7Q4AANS/9wqsiaFMaT+PE7/PwG5+A5H4BICDE48CYjOkVkfPLNS8cXPnkt9SJPGP6rvc6C+DE2/gQZTHtZ+UFrGuLzBBU7otDcEE2cYK2WBFgxT4T+3T2Nyfx9okADXyP6qutxWsPrYM4xnC8QfhW6PtEgBnaqrlPb276VVAMH/35IQghg/PwF5+AxD7QUDIN1b0Vl5DTHansUWqAwNpMaNnXAGEf8g3UQw1ovdmAv9mxZkYBgbSiUWnRQDCP8g3W3mXx9okAF76xT+a+MuAGEhL4WaAAwj/f6PtEQDEMOqOiYJjHgGEhL6QbAAwj//Z";
export const CODEC_FIXTURE_PAGES = 3;

function cmykRaster() {
  const bytes = Buffer.alloc(64 * 64 * 4);
  const palette = [[255, 0, 0, 0], [0, 255, 0, 0],
    [0, 0, 255, 0], [0, 0, 0, 255]];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const color = palette[(y >= 32 ? 2 : 0) + (x >= 32 ? 1 : 0)];
    const at = (y * 64 + x) * 4;
    for (let c = 0; c < 4; c++) bytes[at + c] = color[c];
  }
  return deflateSync(bytes, { level: 9 });
}

export const CODEC_CASES = Object.freeze({
  jpx: { name: "jpx-jpeg2000", imageFilter: "/JPXDecode", colorSpace: "/DeviceRGB" },
  cmyk: { name: "cmyk-device-cmyk", imageFilter: "/FlateDecode", colorSpace: "/DeviceCMYK" },
});

export function generateCodecPdf(format) {
  const settings = CODEC_CASES[format];
  if (!settings) throw new RangeError("Unsupported PDF codec fixture");
  const binary = format === "jpx" ? Buffer.from(JPX_J2K, "base64") : cmykRaster();
  const header = format === "jpx" ? "/ColorSpace /DeviceRGB /Filter /JPXDecode"
    : "/ColorSpace /DeviceCMYK /Filter /FlateDecode";
  const chunks = [];
  const offsets = [0];
  let size = 0;
  function append(bytes) {
    const value = typeof bytes === "string" ? Buffer.from(bytes, "latin1") : bytes;
    chunks.push(value); size += value.length;
  }
  function object(id, parts) {
    offsets[id] = size;
    append(id + " 0 obj\n");
    for (const part of parts) append(part);
    append("\nendobj\n");
  }
  append("%PDF-1.7\n%\xB5\xD6\xEA\xCE\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Count 3 /Kids [3 0 R 4 0 R 5 0 R] >>"]);
  for (let id = 3; id <= 5; id++) {
    object(id, [
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] ",
      "/Resources << /XObject << /Im0 7 0 R >> >> /Contents 6 0 R >>",
    ]);
  }
  const instructions = Buffer.from("q 64 0 0 64 0 0 cm /Im0 Do Q\n", "ascii");
  object(6, ["<< /Length " + instructions.length + " >>\nstream\n",
    instructions, "endstream"]);
  object(7, [
    "<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /BitsPerComponent 8 ",
    header, " /Length " + binary.length + " >>\nstream\n", binary, "\nendstream",
  ]);
  const xref = size;
  append("xref\n0 8\n0000000000 65535 f \n");
  for (let id = 1; id <= 7; id++) {
    append(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  }
  append("trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n" + xref + "\n%%EOF\n");
  return Buffer.concat(chunks, size);
}

export function codecManifest(format, pdf) {
  return { format, pages: CODEC_FIXTURE_PAGES, bytes: pdf.length,
    filter: CODEC_CASES[format].imageFilter, colorSpace: CODEC_CASES[format].colorSpace,
    sha256: createHash("sha256").update(pdf).digest("hex") };
}
