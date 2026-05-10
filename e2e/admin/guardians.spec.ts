// Admin Wali (Guardian) list-shell parity smoke (p2-scaffold-list-crud-parity T6).
//
// Verifies the upgraded ScaffoldListPage shell affordances on the Wali list:
//   • Header Add CTA "Tambah Wali" → /admin/akademik/wali/new
//   • Action column header rendered + at least one row's "Lihat" inline button
//
// Cold-empty-state CTA NOT asserted: prisma/seed/10-demo-parent-guardian.ts
// seeds 4 Guardian rows (the parent OAuth canary), so the list is never
// empty in the e2e environment. The cold-empty branch is unit-covered by
// the page-contract.test.tsx vitest in `lib/scaffold/__tests__/`.
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin guardians list-shell parity", () => {
  test("header Add CTA + action column visible with seeded rows", async ({ page }) => {
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    await page.goto("/admin/akademik/wali");

    await expect(
      page.locator('h1:has-text("Wali")'),
      "h1 'Wali' visible",
    ).toBeVisible();

    const headerAdd = page.getByRole("link", { name: /^Tambah Wali$/ });
    await expect(headerAdd, "header 'Tambah Wali' link visible").toBeVisible();

    // Action column header rendered (rowActions.length > 0).
    await expect(
      page.locator('th:has-text("Aksi")'),
      "action column header 'Aksi' visible",
    ).toBeVisible();

    // First row's inline "Lihat" button (DataTableRowActions primitive).
    await expect(
      page.locator('button:has-text("Lihat")').first(),
      "first row 'Lihat' button visible",
    ).toBeVisible();

    // Header Add CTA navigates to /new.
    await headerAdd.click();
    await expect(
      page,
      "header CTA navigates to /new",
    ).toHaveURL(/\/admin\/akademik\/wali\/new$/);
  });
});
