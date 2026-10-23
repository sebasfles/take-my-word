import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

process.loadEnvFile(join(import.meta.dirname, "..", "..", ".env"));

const baseURL = process.env.WEB_URL;
if (!baseURL) throw new Error("missing WEB_URL in .env");

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
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
