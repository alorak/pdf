import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

/**
 * Codec correctness must be measured against the deployed static distribution.
 * Development server can trigger pre-bundle/HMR reloads during large PDF decode.
 */
export default defineConfig({
  ...base,
  testMatch: "**/p2-7-codec.spec.mjs",
  testIgnore: [],
  timeout: 300_000,
  expect: { timeout: 90_000 },
  workers: 1,
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/pdf/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
