
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
  // Production preview avoids Vite development optimizer/HMR-triggered document reloads.
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/pdf/", reuseExistingServer: false, timeout: 60_000,
  },
});
