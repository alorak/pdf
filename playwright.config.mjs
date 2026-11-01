import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.stress.spec.mjs", "**/p2-7-codec.spec.mjs", "**/p2-9-advanced.spec.mjs", "**/p2-9-print.spec.mjs", "**/p2-8-reference.spec.mjs", "**/p2-8-jbig2-parity.spec.mjs"],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5173/pdf/",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1365, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/pdf/",
    reuseExistingServer: !process.env.CI,
    timeout: 40_000,
  },
  reporter: process.env.CI ? "github" : "list",
  workers: 1,
});
