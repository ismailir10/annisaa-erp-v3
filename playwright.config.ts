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
    env: {
      // Stub Xendit auth so `lib/xendit/client.ts:19` doesn't throw at
      // module-init time. Real api.xendit.co rejects this fake key with
      // 401, so every Xendit call from the e2e suite lands as a Xendit
      // failure → invoice ends in `PENDING_PAYMENT_LINK` with
      // `paymentLinkError` populated. Tests assert the failure-path
      // contract (which is exactly the new code surface this cycle
      // introduces). The Xendit success path is covered by Vitest unit
      // tests that mock `createXenditSessionForInvoice` directly.
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY ?? "test-secret",
      XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN ?? "test-webhook-token",
      // Demo-mode HMAC secret for /api/demo/login (lib/auth/demo-cookie.ts).
      // Required ≥32 chars; demo-mode auth never touches production. Wired
      // p2-scaffold-canary T6 — first canary needed cookie minting to work.
      SESSION_COOKIE_SECRET:
        process.env.SESSION_COOKIE_SECRET ??
        "playwright-e2e-dummy-secret-min-32-chars",
    },
  },
});
