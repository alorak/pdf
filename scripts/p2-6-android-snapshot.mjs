
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const stage = process.argv[2];
if (!["before", "after", "reopen"].includes(stage)) {
  console.error("Usage: node scripts/p2-6-android-snapshot.mjs before|after|reopen");
  process.exit(2);
}
const serial = process.env.P2_ANDROID_SERIAL;
const adb = (...args) => {
  const chosen = serial ? ["-s", serial, ...args] : args;
  return execFileSync("adb", chosen, { encoding: "utf8", timeout: 20_000,
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 3 * 1024 * 1024 }).trim();
};
try {
  const model = adb("shell", "getprop", "ro.product.model").slice(0, 100);
  const android = adb("shell", "getprop", "ro.build.version.release").slice(0, 32);
  const mem = adb("shell", "cat", "/proc/meminfo");
  const chrome = adb("shell", "dumpsys", "meminfo", "com.android.chrome");
  const totalKiB = Number((/^MemTotal:\s+(\d+)\s+kB/m.exec(mem) || [])[1]);
  const availableKiB = Number((/^MemAvailable:\s+(\d+)\s+kB/m.exec(mem) || [])[1]);
  const summaryPssKiB = Number((/TOTAL PSS:\s+(\d+)/m.exec(chrome)
    || /^\s*TOTAL\s+(\d+)\s+/m.exec(chrome) || [])[1]);
  const value = v => Number.isFinite(v) && v > 0 ? Math.round(v / 1024) : null;
  const report = { schema: 1, kind: "physical-android-adb", stage,
    measuredAt: new Date().toISOString(),
    model, android, memTotalMiB: value(totalKiB),
    memAvailableMiB: value(availableKiB), chromePssMiB: value(summaryPssKiB),
    chromeInstalled: !/No process found|Unknown package/i.test(chrome),
    note: "Only device stats; no serial, PDF file, browser history, URL or raw dumpsys saved",
  };
  await mkdir("test-results/manual", { recursive: true });
  await writeFile("test-results/manual/p2-6-android-" + stage + ".json",
    JSON.stringify(report, null, 2));
  console.log("P2_6_ANDROID_SNAPSHOT " + JSON.stringify(report));
} catch (error) {
  console.error("ADB measurement could not complete. Use a connected authorized Android device.",
    error.message.slice(0, 170));
  process.exitCode = 1;
}
