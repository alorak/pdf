import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cpus, totalmem, platform, arch } from "node:os";
const directory = "test-results/stress";
const readMaybe = async name => {
  try { return await readFile(directory + "/" + name, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
};
const browser = (await readMaybe("baseline.jsonl")).trim().split("\n").filter(Boolean).map(JSON.parse);
const model = (await readMaybe("model.log")).split("\n").flatMap(line => {
  const at = line.indexOf("P2_STRESS_MODEL ");
  if (at < 0) return [];
  try { return [JSON.parse(line.slice(at + "P2_STRESS_MODEL ".length))]; } catch { return []; }
});
const fmt = v => v === null || v === undefined ? "n/a" : String(v);
const lines = [
  "# PDF Viewer — P2 Performance Baseline",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Git SHA: ${process.env.GITHUB_SHA || "local"}`,
  `Environment: ${platform()}/${arch()}, Node ${process.version}, ${cpus().length} vCPUs, ${Math.round(totalmem()/1048576)} MiB host RAM`,
  "",
  "**Measurement, not a promised SLA.** Compare measurements only on equivalent runners and browser versions. This report is reproducible from the attached deterministic fixture SHA-256 values.",
  "",
  "## Chromium UI baseline",
  "",
  "| Pages | PDF bytes | First document load (ms) | Last-page jump (ms) | Full-text search (ms) | Heap after search (MiB) | Rendered page canvases |",
  "|---:|---:|---:|---:|---:|---:|---:|",
  ...browser.map(b => `| ${b.pages} | ${b.bytes} | ${b.firstPageMs} | ${b.lastPageJumpMs} | ${b.searchMs} | ${fmt(b.afterSearch?.jsHeapMb)} | ${fmt(b.afterSearch?.pageCanvases)} |`),
  ...(!browser.length ? ["| Not run | — | — | — | — | — | — |"] : []),
  "",
  "## Node stress/model baseline",
  "",
  "| Scenario | Pages | Duration (ms) | RSS (MiB) | File bytes |",
  "|---|---:|---:|---:|---:|",
  ...model.map(m => `| ${m.scenario} | ${fmt(m.pages ?? m.linkedPages)} | ${m.durationMs} | ${m.rssMb} | ${fmt(m.bytes ?? m.sourceBytes)} |`),
  ...(!model.length ? ["| Not run | — | — | — | — |"] : []),
  "",
  "## Reproduction and acceptance",
  "",
  "- Normal PR CI: unit/integration and standard Chromium E2E, plus optional 100-page smoke baseline.",
  "- Manual/nightly: 100/1000/5000 page Chromium load, last-page navigation and full-text search, plus 20-workspace/1900-referenced-page integrity test.",
  "- Correctness gates: exact page counts, deterministic SHA-256, no uncaught page exceptions, matching PDF text, linked-page source validation and backup round-trip.",
  "- Bounded canvas gates: <=30 main page canvases and <=110 thumbnail canvases, allowing in-flight renders.",
  "- Latency and heap numbers are initially observational; do not interpret them as absolute targets until multiple stable baseline runs establish confidence intervals.",
  "",
];
await mkdir(directory, { recursive: true });
await writeFile(directory + "/baseline.md", lines.join("\n"));
console.log(lines.join("\n"));
