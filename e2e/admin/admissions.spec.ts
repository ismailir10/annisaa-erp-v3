// Admin Penerimaan (Admission) list-shell parity smoke (p2-scaffold-list-
// crud-parity T6).
//
// Admission is the entity with `createDisabled: true` — creation flow lives
// at the public `/daftar` route, not `/admin/akademik/penerimaan/new`. This
// spec asserts the negative case (Add CTA + cold-empty CTA both hidden).
//
// Row-click + action-dropdown assertions are NOT exercised here — they
// would require seeding a fresh SUBMITTED admission via
// /api/demo/admission/seed-submitted, which depends on a seeded Address row
// (the seed creates 0 Addresses; admission-admin spec works around this by
// running later in test order after the keluarga-edit spec writes one).
// CI ordering puts admissions.spec.ts FIRST alphabetically and the
// dependency leaks. Row-click + dropdown coverage for state-machine
// destructive actions is provided by the existing e2e/admission-admin.spec.ts
// state-walk test which navigates to the detail page directly.
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin admissions list-shell parity", () => {
  test("Add CTA + cold-empty CTA both HIDDEN per createDisabled=true", async ({ page }) => {
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    await page.goto("/admin/akademik/penerimaan");

    await expect(
      page.locator('h1:has-text("Pendaftaran")'),
      "h1 'Pendaftaran' visible (entity.label)",
    ).toBeVisible();

    // createDisabled: true → no header CTA.
    await expect(
      page.getByRole("link", { name: /^Tambah Pendaftaran$/ }),
      "header 'Tambah Pendaftaran' link HIDDEN (createDisabled)",
    ).toHaveCount(0);

    // createDisabled: true → no cold-empty CTA either (when list is empty).
    await expect(
      page.getByRole("link", { name: /^Tambah Pendaftaran pertama$/ }),
      "cold-empty 'Tambah Pendaftaran pertama' CTA HIDDEN",
    ).toHaveCount(0);
  });
});
