// Admin Penerimaan (Admission) list-shell parity smoke (p2-scaffold-list-
// crud-parity T6).
//
// Admission is the entity with `createDisabled: true` — creation flow lives
// at the public `/daftar` route, not `/admin/akademik/penerimaan/new`. This
// spec asserts the negative case (Add CTA hidden) plus row-click + action
// dropdown on a seeded row from the demo POST endpoint.
//
// Action dropdown on admission rows surfaces 1 destructive item — Tarik
// kembali. Edit dropped per T3 entity wiring (no `[id]/edit` route for
// admission; mutations on the detail page via state-machine action
// buttons).
//
// Cleanup: the seeded admission row gets cleaned up by the existing
// /api/demo/admission/[id]/effects DELETE handler (cycle T7 wraps that in
// afterEach).
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin admissions list-shell parity", () => {
  let admissionId: string | null = null;
  let cleanupContext: { request: import("@playwright/test").APIRequestContext } | null = null;

  test.afterEach(async () => {
    if (admissionId && cleanupContext) {
      await cleanupContext.request.delete(
        `/api/demo/admission/${admissionId}/effects`,
        { failOnStatusCode: false },
      );
      admissionId = null;
      cleanupContext = null;
    }
  });

  test("Add CTA HIDDEN (createDisabled) + row click + Tarik kembali in dropdown", async ({
    page,
  }) => {
    // Use page.request (matches e2e/admission-admin.spec.ts pattern that
    // passes in CI). The test-level `request` fixture has its own isolated
    // cookie jar — flaky in CI when seed-submitted needs the admin cookie
    // to land cleanly.
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    // Seed a fresh SUBMITTED admission so the list has at least one row.
    const seedRes = await page.request.post(
      "/api/demo/admission/seed-submitted",
      { failOnStatusCode: false },
    );
    expect(seedRes.status(), "seed-submitted 200").toBe(200);
    const seed = await seedRes.json();
    admissionId = seed.admissionId;
    cleanupContext = { request: page.request };
    expect(admissionId, "seed returns admissionId").toBeTruthy();

    await page.goto("/admin/akademik/penerimaan");

    await expect(
      page.locator('h1:has-text("Pendaftaran")'),
      "h1 'Pendaftaran' visible (entity.label)",
    ).toBeVisible();

    // createDisabled: true → no header CTA + no cold-empty CTA.
    await expect(
      page.getByRole("link", { name: /^Tambah Pendaftaran$/ }),
      "header 'Tambah Pendaftaran' link HIDDEN (createDisabled)",
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^Tambah Pendaftaran pertama$/ }),
      "cold-empty 'Tambah Pendaftaran pertama' CTA HIDDEN",
    ).toHaveCount(0);

    // Action column header rendered (rowActions.length > 0).
    await expect(
      page.locator('th:has-text("Aksi")'),
      "action column header 'Aksi' visible",
    ).toBeVisible();

    // Row-click → navigates to admission detail.
    const firstRow = page.locator('tr[data-clickable="true"]').first();
    await expect(firstRow, "first clickable row present").toBeVisible();
    await firstRow.click();
    await expect(
      page,
      "row click navigates to detail",
    ).toHaveURL(/\/admin\/akademik\/penerimaan\/[a-z0-9]+$/i);

    // Back to list — assert dropdown surfaces Tarik kembali (no Edit per T3).
    await page.goto("/admin/akademik/penerimaan");
    const moreBtn = page.locator('button:has-text("Buka menu")').first();
    await moreBtn.click();
    await expect(
      page.getByRole("menuitem", { name: /^Tarik kembali$/ }),
      "action dropdown 'Tarik kembali' visible",
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /^Edit$/ }),
      "action dropdown 'Edit' HIDDEN for admission",
    ).toHaveCount(0);
  });
});
