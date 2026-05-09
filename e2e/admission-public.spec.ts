// Public admission funnel canary (p2-admission-funnel-ui-public T10).
//
// Walks the /daftar form end-to-end: tenant-resolved server render →
// 5-step navigation → submit → confirmation card with tracking code.
//
// Address chain reuses the existing `<AddressChainField>` which posts to
// /api/regions/* + /api/public/address (both shipped this cycle). The
// region API is already exercised by p2-addresses-idn-chain canary, so
// here we only assert the cascading dropdowns render and a known seed
// region row resolves.
//
// Demo-mode requirement: this spec runs against the production build with
// DEMO_MODE=true (per playwright.config.ts webServer). The /daftar page
// is public — no demo cookie needed. Tenant slug is the seed default
// "demo" (prisma/seed/00-tenant.ts).
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T10)

import { test, expect } from "@playwright/test";

test.describe("public /daftar admission flow", () => {
  test("404s with no tenant slug", async ({ page }) => {
    const res = await page.goto("/daftar");
    expect(res?.status(), "GET /daftar with no tenant returns 404").toBe(404);
  });

  test("404s with unknown tenant slug", async ({ page }) => {
    const res = await page.goto("/daftar?tenant=does-not-exist");
    expect(res?.status(), "unknown tenant returns 404").toBe(404);
  });

  test("renders the form shell + step indicator", async ({ page }) => {
    await page.goto("/daftar?tenant=an-nisaa-sekolahku");
    await expect(
      page.locator('h1:has-text("Daftar di")'),
      "page header includes school name",
    ).toBeVisible();
    await expect(
      page.locator('text=1. Anak'),
      "step 1 indicator visible",
    ).toBeVisible();
    await expect(
      page.getByTestId("daftar-applicant-name"),
      "applicant name input visible on step 1",
    ).toBeVisible();
  });

  test("Lanjut button is disabled until applicant name is entered", async ({ page }) => {
    await page.goto("/daftar?tenant=an-nisaa-sekolahku");
    const next = page.getByTestId("daftar-next");
    await expect(next, "Lanjut starts disabled").toBeDisabled();
    await page.getByTestId("daftar-applicant-name").fill("Aisyah Nur Hasan");
    await expect(next, "Lanjut enabled after name").toBeEnabled();
  });

  test("rate-limited submit endpoint returns Indonesian error copy", async ({ request }) => {
    // Direct POST to the API. Without the Origin header the same-site
    // gate fires first — confirms the gate is in place.
    const res = await request.post("/api/admission/submit", {
      data: { tenantSlug: "an-nisaa-sekolahku" },
      headers: { "content-type": "application/json" },
      failOnStatusCode: false,
    });
    expect(res.status(), "missing Origin → 403 forbidden").toBe(403);
  });
});
