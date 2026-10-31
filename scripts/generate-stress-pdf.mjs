import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { generatePdfFixture } from "./pdf-fixtures.mjs";

const count = Number(process.argv[2] || 100);
const path = process.argv[3] || `test-results/stress/fixture-${count}.pdf`;
try {
  const pdf = generatePdfFixture(count);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, pdf);
  console.log(JSON.stringify({
    pages: count, path, bytes: pdf.length,
    sha256: createHash("sha256").update(pdf).digest("hex"),
  }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
