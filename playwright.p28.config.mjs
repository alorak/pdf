import { defineConfig } from "@playwright/test";
import base from "./playwright.codec.config.mjs";
export default defineConfig({
  ...base,
  testMatch: "**/p2-8-reference.spec.mjs",
  testIgnore: [],
  outputDir: "test-results/playwright-p28",
  use: { ...base.use, deviceScaleFactor: 1 },
  workers: 1,
});
