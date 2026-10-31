import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const profile = process.env.P2_IMAGE_PROFILE || "smoke";
const expected = {
  scan: profile === "full" ? { pages: 128, imageSize: 512 }
    : profile === "quick" ? { pages: 24, imageSize: 256 } : { pages: 5, imageSize: 128 },
  mixed: profile === "full" ? { pages: 96, imageSize: 512 }
    : profile === "quick" ? { pages: 24, imageSize: 256 } : { pages: 6, imageSize: 128 },
  mobile: profile === "full" ? { pages: 32, imageSize: 512 }
    : profile === "quick" ? { pages: 12, imageSize: 256 } : { pages: 4, imageSize: 128 },
};
const expectedNames = [
  `p2-5-scan-desktop-${profile}`,
  `p2-5-mixed-desktop-${profile}`,
  `p2-5-scan-mobile-${profile}`,
];
const reports = [];
for (const name of expectedNames) {
  const report = JSON.parse(await readFile(`test-results/stress/${name}.json`, "utf8"));
  assert.equal(report.schema, 1);
  assert.equal(report.scenario, name);
  assert.equal(report.manifest.profile, profile);
  assert.ok(/^[a-f0-9]{64}$/.test(report.manifest.sha256));
  const setting = name.includes("mobile") ? expected.mobile : name.includes("mixed") ? expected.mixed : expected.scan;
  assert.equal(report.manifest.pages, setting.pages);
  assert.equal(report.manifest.imageSize, setting.imageSize);
  assert.ok(report.manifest.bytes > setting.pages * setting.imageSize * setting.imageSize,
    "raster images must not be deduplicated or tiny metadata fixtures");
  if (profile === "full" && !name.includes("mobile")) {
    assert.ok(report.manifest.sizeMiB > (name.includes("mixed") ? 65 : 90),
      "large image fixture is not truly large");
  }
  assert.ok(Number.isFinite(report.loadMs) && report.loadMs >= 0);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.rasterErrors, []);
  assert.deepEqual(report.snapshots.map(x => x.page),
    [1, Math.ceil(setting.pages / 2), setting.pages, 1]);
  for (const snap of [...report.snapshots, report.afterSearch]) {
    assert.ok(snap.pageCanvases > 0 && snap.pageCanvases <= 16);
    assert.ok(snap.thumbnailCanvases <= 100);
    assert.ok(Number.isFinite(snap.domNodes) && snap.domNodes > 0);
    if (snap.jsHeapMiB !== null) assert.ok(Number.isFinite(snap.jsHeapMiB) && snap.jsHeapMiB > 0);
    if (snap.chromiumProcesses !== null && snap.chromiumProcesses !== undefined) {
      assert.ok(snap.chromiumProcesses.processCount >= 1);
      assert.ok(Number.isFinite(snap.chromiumProcesses.rssSumMiB) && snap.chromiumProcesses.rssSumMiB > 0);
      if (snap.chromiumProcesses.pssSumMiB != null) {
        assert.ok(Number.isFinite(snap.chromiumProcesses.pssSumMiB)
          && snap.chromiumProcesses.pssSumMiB > 0);
      }
    }
    if (name.includes("mobile")) assert.ok(snap.clientWidth <= 390, "mobile viewport was not applied");
  }
  reports.push(report);
}
const present = await readdir("test-results/stress");
assert.equal(present.filter(x => /^p2-5-(scan|mixed)-.+\.json$/.test(x)).length, 3);
const summary = {
  profile, environment: "Chromium, Linux CI; no emulated OS RAM cap",
  records: reports.map(r => ({
    scenario: r.scenario, sha256: r.manifest.sha256,
    bytes: r.manifest.bytes, pages: r.manifest.pages,
    loadMs: r.loadMs, afterSearchHeapMiB: r.afterSearch.jsHeapMiB,
    chromiumPssMiB: r.afterSearch.chromiumProcesses?.pssSumMiB ?? null,
    afterSearchDomNodes: r.afterSearch.domNodes,
  })),
  evidenceComplete: true,
};
console.log("P2_5_ACCEPTANCE_PASSED " + JSON.stringify(summary));
