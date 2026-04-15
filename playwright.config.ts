import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  // Run tests serially — demo mode server is stateful (cookie-based auth)
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Chromium only — faster than multi-browser, consistent with CI
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "DEMO_MODE=true npm run start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    // Production server starts fast — no JIT compilation
    timeout: 30_000,
  },
});
