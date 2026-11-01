import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";
export default defineConfig({
  ...base,
  testMatch: "**/p2-8-reference.spec.mjs",
  testIgnore: [],
  workers: 1,
  timeout: 270_000,
  expect: { timeout: 90_000 },
  // Do not delete prior quota/codec artifacts when launching Playwright.
  outputDir: "test-results/playwright-p2-8-reference",
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/pdf/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
