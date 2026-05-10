// Admin Wali (Guardian) list-shell parity smoke (p2-scaffold-list-crud-parity T6).
//
// Verifies the upgraded ScaffoldListPage shell affordances on the Wali list:
//   • Header Add CTA "Tambah Wali" → /admin/akademik/wali/new
//   • Cold-empty-state CTA "Tambah Wali pertama" → same route
//   • Total-count subtitle reads "0 wali" when empty
//
// Row-click + action-dropdown assertions deferred — Guardian seed today is
// empty (CI runs `db push --force-reset` + seed without Guardian fixtures).
// Households spec (which has 8 seeded rows) covers the row-interaction
// assertions per cycle T6 plan.
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin guardians list-shell parity", () => {
  test("header Add CTA + cold-empty CTA both navigate to /new", async ({ page }) => {
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    await page.goto("/admin/akademik/wali");

    await expect(
      page.locator('h1:has-text("Wali")'),
      "h1 'Wali' visible",
    ).toBeVisible();

    const headerAdd = page.getByRole("link", { name: /^Tambah Wali$/ });
    await expect(headerAdd, "header 'Tambah Wali' link visible").toBeVisible();

    const emptyCta = page.getByRole("link", { name: /^Tambah Wali pertama$/ });
    await expect(emptyCta, "cold-empty 'Tambah Wali pertama' CTA visible").toBeVisible();

    await expect(
      page.locator("text=/^0 wali$/"),
      "total-count subtitle reads '0 wali' when empty",
    ).toBeVisible();

    await emptyCta.click();
    await expect(
      page,
      "empty-state CTA navigates to /new",
    ).toHaveURL(/\/admin\/akademik\/wali\/new$/);

    await page.goto("/admin/akademik/wali");
    await page.getByRole("link", { name: /^Tambah Wali$/ }).click();
    await expect(
      page,
      "header CTA also navigates to /new",
    ).toHaveURL(/\/admin\/akademik\/wali\/new$/);
  });
});
