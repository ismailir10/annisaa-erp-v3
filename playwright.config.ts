import { defineConfig, devices } from "@playwright/test";

// Propagate DEMO_MODE to the TEST RUNNER process so `test.skip(process.env.
// DEMO_MODE === "true", ...)` guards in specs (see admin.spec.ts tagihan
// failure-path tests) actually fire. The `webServer.env` block below only
// injects DEMO_MODE into the spawned `npm run start` child process; without
// this line, the runner never sees it and the skip guards evaluate
// `undefined === "true"` → `false` → the tests run against a DEMO_MODE
// server that synthesizes Xendit SENT, breaking PENDING_PAYMENT_LINK
// assertions. CI sets DEMO_MODE explicitly in .github/workflows/ci.yml step
// env (line ~124), so this default only matters for local `npx playwright
// test` runs — but it makes local and CI behavior consistent either way.
process.env.DEMO_MODE = process.env.DEMO_MODE ?? "true";

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
    },
  },
});
