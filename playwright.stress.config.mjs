import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

/** Heavy profiles are opt-in: npm run test:stress (or scheduled GitHub Actions). */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/*.stress.spec.mjs",
  timeout: 240_000,
  expect: { timeout: 60_000 },
  workers: 1,
  retries: 0,
  use: {
    ...base.use,
    launchOptions: {
      args: ["--enable-precise-memory-info"],
    },
  },
  reporter: "list",
});
