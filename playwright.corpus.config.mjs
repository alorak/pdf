
import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";
export default defineConfig({
  ...base,
  testMatch: "**/*.corpus.mjs",
  testIgnore: [],
  timeout: 360_000,
  expect: { timeout: 180_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/playwright-real-corpus",
});
