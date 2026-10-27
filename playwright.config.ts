import { defineConfig, devices } from "@playwright/test";

// The app and the worker must both run: sign-up emails go through the queue.
// Locally this reuses `pnpm dev` / `pnpm worker:dev` if they are already up.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000/sign-in",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm worker:dev",
      // The worker has no port; wait for the app instead.
      url: "http://localhost:3000/sign-in",
      reuseExistingServer: true,
    },
  ],
});
