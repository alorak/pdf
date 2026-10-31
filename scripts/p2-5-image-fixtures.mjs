import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * P2.5 deterministic IMAGE-BASED PDF fixtures, generated fully offline.
 * "scan" pages have only an RGB image, no hidden OCR text.
 * "mixed" pages have a unique searchable text overlay and vector line art.
 * Images are independently stored FlateDecode XObjects (no shared resource).
 *
 * This is an image-heavy synthetic proxy, NOT a real scanner/photo corpus.
 */
export function generateImagePdf({
  kind = "scan", pages = 12, imageSize = 256, seed = 0x5343414e,
} = {}) {
  if (!["scan", "mixed"].includes(kind)) throw new RangeError("kind must be scan or mixed");
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > 256) {
    throw new RangeError("pages must be 1..256");
  }
  if (![128, 256, 512].includes(imageSize)) throw new RangeError("imageSize must be 128/256/512");
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("seed must be unsigned uint32");
  }
  // Collect sequential buffers instead of concatenating multi-MB binary strings.
  const chunks = [];
  let length = 0;
  const offsets = [0];
  const append = part => {
    const buffer = typeof part === "string" ? Buffer.from(part, "latin1") : part;
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (id, parts) => {
    offsets[id] = length;
    append(`${id} 0 obj\n`);
    for (const part of parts) append(part);
    append("\nendobj\n");
  };
  append("%PDF-1.4\n%\xC2\xA5\xD6\xD7\n");
  const pageId = index => 4 + index * 3;
  const kids = Array.from({ length: pages }, (_, index) => `${pageId(index)} 0 R`).join(" ");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Count ${pages} /Kids [${kids}] >>`]);
  object(3, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]);
  for (let i = 0; i < pages; i++) {
    const id = pageId(i);
    // 24-bit RGB high-entropy raster: FlateDecode cannot collapse 128 images
    // into a tiny metadata-only PDF, unlike text-only P2.4 fixtures.
    const raw = Buffer.allocUnsafe(imageSize * imageSize * 3);
    let x = (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    for (let offset = 0; offset < raw.length; offset += 3) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      raw[offset] = x & 255;
      raw[offset + 1] = (x >>> 8) & 255;
      raw[offset + 2] = (x >>> 16) & 255;
    }
    const image = deflateSync(raw, { level: 1 });
    const number = String(i + 1).padStart(5, "0");
    const overlay = kind === "mixed"
      ? `0.15 0.35 0.85 RG 2 w 35 35 m 560 790 l S\n0 0 0 rg BT /F1 16 Tf 42 802 Td (P25 MIXED PAGE ${number}) Tj ET\n`
      : "";
    const instructions = Buffer.from(
      `q 520 0 0 760 37 39 cm /Im0 Do Q\n${overlay}`, "ascii");
    object(id, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${id + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`,
    ]);
    object(id + 1, [
      `<< /Length ${instructions.length} >>\nstream\n`, instructions, "\nendstream",
    ]);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${imageSize} /Height ${imageSize} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`,
      image, "\nendstream",
    ]);
  }
  const xref = length;
  const count = 3 + pages * 3;
  append(`xref\n0 ${count + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= count; id++) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks, length);
}

export function imageFixtureManifest(buffer, settings) {
  return {
    ...settings,
    bytes: buffer.byteLength,
    sizeMiB: Number((buffer.byteLength / 1048576).toFixed(2)),
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
