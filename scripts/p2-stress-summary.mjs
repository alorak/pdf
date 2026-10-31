import { readdir, readFile, mkdir, writeFile, appendFile } from "node:fs/promises";

const folder = "test-results/stress";
let files = [];
try { files = (await readdir(folder)).filter(name => name.endsWith(".json")).sort(); }
catch { /* A failed browser launch can produce no metrics. */ }
const results = [];
for (const file of files) {
  try { results.push(JSON.parse(await readFile(`${folder}/${file}`, "utf8"))); }
  catch (error) { console.error("Invalid stress report:", file, error); }
}
const asNum = v => typeof v === "number" ? v.toLocaleString("en-US") : "—";
const cell = v => String(v ?? "—").replace(/\|/g, "\\|");
const output = [
  "# P2 browser performance baseline",
  "",
  "Values measured on the current GitHub Actions runner. They are **not** cross-machine performance guarantees.",
  "",
  "| Fixture | Input bytes | First display (ms) | Peak JS heap (MB) | DOM nodes (end) | Page canvases (end) | Thumb canvases (end) |",
  "|---|---:|---:|---:|---:|---:|---:|",
];
for (const item of results) {
  const heaps = [item.initial?.heapBytes, ...(item.navigation||[]).map(x=>x.heapBytes)]
    .filter(Number.isFinite);
  const peak = heaps.length ? (Math.max(...heaps)/1048576).toFixed(1) : "—";
  output.push(`| ${cell(item.pages || item.profile)} | ${asNum(item.fixtureBytes)} | ${asNum(item.initialDisplayMs || item.readDurationMs)} | ${peak} | ${asNum(item.end?.domNodes)} | ${asNum(item.end?.pageCanvases)} | ${asNum(item.end?.thumbCanvases)} |`);
}
if (!results.length) output.push("| No completed profiles | — | — | — | — | — | — |");
output.push("", "**Test conditions:** Chromium (headless), one worker, 1365×900 viewport, synthetic deterministic PDF inputs.",
  "Canvas gates: at most 16 page canvases and 100 thumbnail canvases at the sampled endpoint. ",
  "Opening time and JS heap are recorded without speculative fixed thresholds; compare against this baseline on equivalent runners.",
  "A passed run also validates navigation, page counts and absence of uncaught browser errors.",
  "");
const text=output.join("\n");
console.log(text);
await mkdir("test-results",{recursive:true});
await writeFile("test-results/p2-summary.md",text);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,text);
