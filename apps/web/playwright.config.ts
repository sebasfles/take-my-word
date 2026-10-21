import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile(join(import.meta.dirname, "..", "..", ".env"));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.WEB_URL ?? "https://dev.takemyword.fless.dev",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
