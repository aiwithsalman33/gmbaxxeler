import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a running stack (docker compose up), never a mocked UI.
 * E2E_BASE_URL defaults to the local Caddy port; use 127.0.0.1 on Windows, where localhost can hang.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
