import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generatePdfFixture } from "./pdf-fixtures.mjs";

// CI guard: passing Playwright suites is not enough when a later suite deletes
// the previous suite's JSON results or when navigation never renders the target.
const root = "test-results/stress";
const profile = process.env.P2_STRESS_PROFILE || "full";
const expected = profile === "quick" ? [100, 1000] : [100, 1000, 5000];
const capacity = (process.env.P2_STRESS_PAGES || expected.join(",")).split(",").map(Number);
assert.deepEqual(capacity, expected, "model/browser profiles must cover the same page counts");

const json = async path => JSON.parse(await readFile(path, "utf8"));
const modelLog = await readFile(`${root}/model.log`, "utf8");
const model = modelLog.split("\n").flatMap(line => {
  const tag = "P2_STRESS_MODEL ";
  const index = line.indexOf(tag);
  if (index < 0) return [];
  return [JSON.parse(line.slice(index + tag.length))];
});
const linked = model.find(entry => entry.scenario === "20-workspaces-1900-linked-pages");
assert.ok(linked, "1900-link model stress log must be archived");
assert.equal(linked.linkedPages, 1900);
assert.equal(linked.workspaceCount, 20);
assert.ok(linked.exportedBytes > 0);

const browser = (await readFile(`${root}/baseline.jsonl`, "utf8"))
  .trim().split("\n").filter(Boolean).map(JSON.parse);
assert.equal(browser.length, expected.length, "every browser profile must have a baseline");

for (const pages of expected) {
  const m = model.find(item => item.scenario === "fixture-pdfjs" && item.pages === pages);
  const b = browser.find(item => item.pages === pages);
  const c = await json(`${root}/pages-${pages}.json`);
  assert.ok(m, `model PDF.js ${pages}-page measurement missing`);
  assert.ok(b, `browser search ${pages}-page measurement missing`);
  assert.equal(b.lastPageCanvasRendered, true, "last-page timing must await actual PDF canvas");
  if (pages >= 300) {
    assert.ok(b.afterLoad.pageShells > 0 && b.afterLoad.pageShells <= 80);
    assert.ok(c.initial.pages > 0 && c.initial.pages <= 80);
    assert.ok(c.end.pages > 0 && c.end.pages <= 80);
  } else {
    assert.equal(b.afterLoad.pageShells, pages);
    assert.equal(c.initial.pages, pages);
    assert.equal(c.end.pages, pages);
  }
  assert.ok(Number.isFinite(b.firstPageMs) && b.firstPageMs >= 0);
  assert.ok(Number.isFinite(b.lastPageJumpMs) && b.lastPageJumpMs >= 0);
  assert.ok(Number.isFinite(b.searchMs) && b.searchMs >= 0);
  assert.ok(b.afterSearch.pageCanvases <= 30 && b.afterSearch.thumbnailCanvases <= 110);
  assert.equal(c.pages, pages);
  assert.deepEqual(c.browserErrors, []);
  assert.ok(c.end.pageCanvases <= 16 && c.end.thumbCanvases <= 100);
  const hash = createHash("sha256").update(generatePdfFixture(pages)).digest("hex");
  assert.equal(m.sha256, hash, "Node fixture hash changed");
  assert.equal(b.sha256, hash, "browser fixture hash changed");
}

const workspace = await json(`${root}/workspace-20-links-100.json`);
assert.equal(workspace.pages, 100);
assert.ok(workspace.canvas.pageCanvases <= 16 && workspace.canvas.thumbCanvases <= 100);

const markdown = await readFile(`${root}/baseline.md`, "utf8");
const summary = await readFile("test-results/p2-summary.md", "utf8");
assert.ok(markdown.includes("20-workspaces-1900-linked-pages"), "model metrics missing from Markdown report");
assert.ok(!markdown.includes("| Not run |"), "model baseline was silently lost");
assert.ok(!summary.includes("| No completed profiles |"), "capacity JSON reports were lost");
for (const pages of expected) {
  assert.ok(summary.includes(`| ${pages} |`), `capacity profile ${pages} missing from summary`);
}

console.log("P2_3_ACCEPTANCE_PASSED " + JSON.stringify({
  profile, pages: expected, modelScenarios: model.length,
  browserProfiles: browser.length, capacityProfiles: expected.length,
  linkedPages: linked.linkedPages, workspaceCount: linked.workspaceCount,
  evidenceComplete: true,
}));
