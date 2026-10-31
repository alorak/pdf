/**
 * Deterministic, self-contained PDF generator for regression and load tests.
 * Uncompressed single-page streams; no third-party random fixtures or network.
 * Layout and PDF xref offsets are reproducible across Node versions.
 */
export function generatePdfFixture(pageCount, { label = "P2 STRESS", seed = 17 } = {}) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 5000) {
    throw new RangeError("PDF fixture page count must be between 1 and 5000");
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 65535 ||
      !/^[A-Za-z0-9 -]{1,40}$/.test(label)) throw new Error("Invalid PDF fixture parameters");
  // ID 1: catalog, 2: page tree, 3: shared font, then (page, stream) pairs.
  const pageIds = Array.from({ length: pageCount }, (_, i) => 4 + i * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [ ${pageIds.map(id => id + " 0 R").join(" ")} ] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let i = 0; i < pageCount; i++) {
    const number = i + 1;
    const id = pageIds[i];
    const token = ((number * 1103515245 + seed) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const lines = [
      `PAGE ${String(number).padStart(5, "0")} ${label}`,
      `DETERMINISTIC FIXTURE ${token} SEARCH VALIDATION`,
    ];
    const stream = `BT /F1 14 Tf 44 775 Td (${lines[0]}) Tj 0 -28 Td (${lines[1]}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  }
  const parts = ["%PDF-1.4\n"];
  let byteOffset = Buffer.byteLength(parts[0], "latin1");
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteOffset);
    const part = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    parts.push(part);
    byteOffset += Buffer.byteLength(part, "latin1");
  }
  const xrefOffset = byteOffset;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (const position of offsets.slice(1)) xref.push(`${String(position).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(parts.join("") + xref.join(""), "latin1");
}
