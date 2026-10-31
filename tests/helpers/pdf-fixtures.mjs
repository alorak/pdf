/**
 * Deterministic self-contained PDF fixtures. No downloads, fonts, or external PDFs.
 * The file uses one shared text stream and font for the lightweight smoke case,
 * and distinct text streams for page indexing/search/large-document stress tests.
 * Byte offsets are computed from ASCII-only fixtures.
 */
export function createPdfFixture(pageCount, { uniqueText = true, prefix = "FIXTURE" } = {}) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 5000) {
    throw new RangeError("Page count must be between 1 and 5000");
  }
  if (!/^[A-Z0-9 _-]{1,42}$/.test(prefix)) throw new Error("ASCII fixture prefix required");
  const pagesRoot = 2;
  const fontRef = 3;
  const pageRef = index => 4 + index * (uniqueText ? 2 : 1);
  const contentRef = index => 5 + index * 2;
  const sharedContentRef = 4 + pageCount;
  const objects = new Map();
  const kids = Array.from({ length: pageCount }, (_, index) => `${pageRef(index)} 0 R`).join(" ");
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(pagesRoot, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.set(fontRef, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const makeContent = index => {
    const marker = uniqueText ? String(index + 1).padStart(5, "0") : "00001";
    const stream = `BT /F1 16 Tf 36 750 Td (${prefix} PAGE ${marker}) Tj ET`;
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  };
  if (!uniqueText) objects.set(sharedContentRef, makeContent(0));
  for (let index = 0; index < pageCount; index++) {
    const content = uniqueText ? contentRef(index) : sharedContentRef;
    objects.set(pageRef(index),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);
    if (uniqueText) objects.set(content, makeContent(index));
  }
  const total = Math.max(...objects.keys());
  let out = "%PDF-1.4\n";
  const offsets = Array(total + 1).fill(0);
  for (let id = 1; id <= total; id++) {
    if (!objects.has(id)) continue;
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= total; id++) {
    out += offsets[id]
      ? `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
      : "0000000000 00000 f \n";
  }
  out += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "ascii");
}
