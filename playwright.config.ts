import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parse as parseEnv } from "dotenv";

// Guard against polluting a shared database. These e2e specs CREATE + mutate
// real rows through the demo-cookie API on localhost:3000 (e.g.
// curriculum-promes-import.spec.ts POSTs `E2E PROMES Import <ts>` academic
// years). `lib/db.ts` always connects to `process.env.DATABASE_URL` — DEMO_MODE
// switches only AUTH, never the database — and the repo `.env` points at the
// shared staging Supabase. So a local `npx playwright test` writes those `E2E …`
// rows straight into staging (the source of the 2026-06-04 UAT data pollution,
// which had no hard-delete path to clean up). Resolve DATABASE_URL the way
// `npm run start` will (process.env > .env.local > .env) and refuse to run
// against a non-local host unless explicitly opted in. CI sets DATABASE_URL to
// an ephemeral localhost Postgres, so CI is unaffected.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [".env.local", ".env"]) {
    try {
      const parsed = parseEnv(readFileSync(file));
      if (parsed.DATABASE_URL) return parsed.DATABASE_URL;
    } catch {
      // file may not exist — keep looking
    }
  }
  return "";
}

const E2E_DATABASE_URL = resolveDatabaseUrl();

function assertLocalDatabaseForE2E(): void {
  let host = "";
  try {
    host = new URL(E2E_DATABASE_URL).hostname;
  } catch {
    host = "";
  }
  const isLocal = host === "" || host === "localhost" || host === "127.0.0.1";
  if (!isLocal && process.env.E2E_ALLOW_REMOTE_DB !== "1") {
    throw new Error(
      `Refusing to run e2e against non-local DATABASE_URL host "${host}". These ` +
        `specs create + mutate data via the API and would pollute that database ` +
        `(DEMO_MODE does not switch the DB — see lib/db.ts). Point DATABASE_URL at ` +
        `a local/ephemeral Postgres, or set E2E_ALLOW_REMOTE_DB=1 to override.`,
    );
  }
}

assertLocalDatabaseForE2E();

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
      // Pin the database the child server uses to the exact URL the guard
      // above validated — no drift between what we checked and what runs.
      DATABASE_URL: E2E_DATABASE_URL,
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
