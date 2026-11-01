import { defineConfig } from "@playwright/test";
import base from "./playwright.reference.config.mjs";
export default defineConfig({
  ...base,testMatch:"**/p2-9-print.spec.mjs",testIgnore:[],
  timeout:180_000,expect:{timeout:60_000},workers:1,
  outputDir:"test-results/playwright-p29-print",
  use:{...base.use,deviceScaleFactor:1},
});
