import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./stress",
  testMatch: "**/*.perf.mjs",
  timeout: 360_000,
  expect: { timeout: 150_000 },
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173/pdf/",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1365, height: 900 },
    launchOptions: { args: ["--enable-precise-memory-info"] },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/pdf/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? "github" : "list",
});
