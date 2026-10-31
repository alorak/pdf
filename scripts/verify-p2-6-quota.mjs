
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const snapshots = {};
for (const operation of ["write", "restore"]) {
  const report = JSON.parse(await readFile(
    "test-results/stress/p2-6-quota-" + operation + ".json", "utf8"));
  assert.equal(report.schema, 1);
  assert.equal(report.kind, "real-chromium-quota");
  assert.equal(report.operation, operation);
  assert.equal(report.pass, true);
  assert.equal(report.failure.rejected, true);
  assert.ok(typeof report.failure.name === "string" && report.failure.name);
  assert.deepEqual(report.afterFailure, report.before);
  assert.ok(report.overrideBytes >= 0);
  assert.match(report.before.sha256, /^[0-9a-f]{64}$/);
  assert.equal(report.before.fileName, "original.pdf");
  assert.deepEqual(report.before.pagesBookmarked, [3]);
  snapshots[operation] = { failureName: report.failure.name,
    quotaBytes: report.overrideBytes, originalSha256: report.before.sha256,
    revision: report.before.revision };
}
assert.equal(snapshots.write.originalSha256, snapshots.restore.originalSha256);
console.log("P2_6_QUOTA_ACCEPTANCE_PASSED " + JSON.stringify(snapshots));
