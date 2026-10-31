
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const snapshots = {};
for (const operation of ["write", "restore"]) {
  const report = JSON.parse(await readFile(
    "test-results/stress/p2-6-quota-" + operation + ".json", "utf8"));
  assert.equal(report.schema, 2);
  assert.equal(report.kind, "chromium-quota-probe-and-native-abort");
  assert.equal(report.operation, operation);
  assert.equal(report.pass, true);
  assert.equal(report.failure.rejected, true);
  assert.equal(report.failure.abortTriggered, true);
  assert.equal(report.quotaProbe.overrideActive, true);
  assert.equal(typeof report.quotaProbe.enforced, "boolean");
  assert.ok(typeof report.failure.name === "string" && report.failure.name);
  assert.deepEqual(report.afterFailure, report.before);
  assert.ok(report.quotaProbe.overrideBytes >= 0);
  assert.equal(report.recovered.revision, report.before.revision + 1);
  assert.match(report.before.sha256, /^[0-9a-f]{64}$/);
  assert.equal(report.before.fileName, "original.pdf");
  assert.deepEqual(report.before.pagesBookmarked, [3]);
  snapshots[operation] = { failureName: report.failure.name,
    quotaBytes: report.quotaProbe.overrideBytes,
    quotaActuallyEnforced: report.quotaProbe.enforced, originalSha256: report.before.sha256,
    revision: report.before.revision };
}
assert.equal(snapshots.write.originalSha256, snapshots.restore.originalSha256);
console.log("P2_6_ATOMIC_RECOVERY_PASSED " + JSON.stringify(snapshots));
