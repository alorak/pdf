/**
 * P2.10 continuous Android field-metric analytics. Pure functions, no ADB/browser.
 * A passing report requires real device attestation from the acquisition CLI;
 * synthetic tests of these functions do NOT constitute a physical-device run.
 */
export function quantile(values, fraction) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (!(fraction >= 0 && fraction <= 1)) throw new RangeError("Invalid quantile");
  const pos = (xs.length - 1) * fraction;
  const lower = Math.floor(pos), upper = Math.ceil(pos);
  return Number((xs[lower] + (xs[upper] - xs[lower]) * (pos - lower)).toFixed(2));
}

export function validateSoakPlan({minutes, intervalSeconds, pages, sizeBytes}) {
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 120)
    throw new RangeError("Use 15..120 minutes for physical device sampling");
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 30)
    throw new RangeError("Use 5..30 second sampling intervals");
  if (!Number.isInteger(pages) || pages < 3 || pages > 20_000)
    throw new RangeError("A real scan must have at least 3 pages");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 25e6 || sizeBytes > 100e6)
    throw new RangeError("Real scan input must be 25..100 MB (decimal)");
  return {minutes, intervalSeconds, pages, sizeBytes};
}

const stat = values => ({
  minimum: quantile(values, 0),
  median: quantile(values, 0.5),
  p95: quantile(values, 0.95),
  maximum: quantile(values, 1),
});

export function summarizeAndroidSoak({plan, samples, navigations, recovery, device}) {
  validateSoakPlan(plan);
  if (!device || device.physical !== true || !device.model || !device.android ||
      !Array.isArray(samples) || !Array.isArray(navigations))
    throw new Error("Physical device attestation and measured series required");
  if (!samples.length || samples.some(s => s.kind !== "physical-android-soak-sample" ||
      !Number.isFinite(s.elapsedSeconds) || s.elapsedSeconds < 0))
    throw new Error("Missing or invalid physical ADB samples");
  const memory = samples.map(s => s.chrome?.pssMiB).filter(Number.isFinite);
  const availability = samples.map(s => s.system?.availableMiB).filter(Number.isFinite);
  const pressure = samples.map(s => s.psi?.some?.avg10).filter(Number.isFinite);
  const latency = navigations.filter(n => n.ok === true).map(n => n.durationMs);
  const failed = navigations.filter(n => n.ok !== true);
  const elapsedSeconds = Math.max(...samples.map(s => s.elapsedSeconds));
  const expectedSamples = Math.floor(plan.minutes * 60 / plan.intervalSeconds);
  const coverage = Number((memory.length / samples.length).toFixed(3));
  const actualCoverage = Number((samples.length / Math.max(1, expectedSamples)).toFixed(3));
  const firstPss = memory.length ? memory[0] : null;
  const lastPss = memory.length ? memory.at(-1) : null;
  const reloadCount = samples.reduce((state, sample) => {
    const observed = sample.browser?.unexpectedReload === true;
    if (observed && !state.previous) state.count++;
    state.previous = observed;
    return state;
  }, {count: 0, previous: false}).count;
  const pageMismatch = samples.filter(s => s.browser?.pageError === true).length;
  const profile = {
    schema: 1,
    kind: "physical-android-soak-analysis",
    device,
    plan,
    measuredDurationSeconds: Number(elapsedSeconds.toFixed(2)),
    memory: {
      chromePssMiB: stat(memory),
      firstPssMiB: firstPss,
      lastPssMiB: lastPss,
      lastMinusFirstMiB: firstPss !== null && lastPss !== null ?
        Number((lastPss - firstPss).toFixed(2)) : null,
      validPssSamples: memory.length,
      totalSamples: samples.length,
      pssCoverageFraction: coverage,
      intervalCoverageFraction: actualCoverage,
      availableSystemMiB: stat(availability),
      psiSomeAvg10: stat(pressure),
    },
    browser: {
      navigationCount: navigations.length,
      successfulNavigations: latency.length,
      navigationFailures: failed.length,
      navigationLatencyMs: stat(latency),
      unexpectedDocumentReloads: reloadCount,
      pageErrorsObserved: pageMismatch,
      expectedReopenRecovered: recovery?.restored === true,
      recoveryDetails: recovery?.details || "Recovery not confirmed",
    },
    // Strongly distinguish an incomplete protocol from a validated result.
    evidenceComplete: elapsedSeconds >= plan.minutes * 60 * 0.95 &&
      coverage >= 0.9 && actualCoverage >= 0.9 && latency.length >= 6 &&
      failed.length === 0 && reloadCount === 0 &&
      pageMismatch === 0 && recovery?.restored === true,
    potentialMemoryGrowthNotProof: memory.length >= 5 &&
      lastPss !== null && firstPss !== null && lastPss - firstPss > 100,
    lmkOrOomConfirmed: null,
    note: "PSS is Chrome package-level dumpsys, not isolated PDF tab; no LMK/OOM assertion from PSS alone.",
  };
  return profile;
}
