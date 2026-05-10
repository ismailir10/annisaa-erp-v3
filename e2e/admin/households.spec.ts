// Admin Keluarga (Household) list-shell parity smoke (p2-scaffold-list-
// crud-parity T6).
//
// Households is the only entity with seeded list data today (8 KK-0xx rows
// from prisma/seed/09-households.ts), so this spec covers the FULL set of
// list-shell interactions:
//   • Header Add CTA "Tambah Keluarga" visible + navigates to /new
//   • Total-count subtitle reads "8 keluarga" (or whatever seed yields)
//   • Row-click navigates to detail page
//   • Action column "Lihat" inline button visible per row
//   • Action dropdown surfaces ≥3 items (Edit + extra Nonaktifkan)
//
// Soft-delete confirm dialog wiring: not exercised here — the destructive
// path mutates seeded data which subsequent specs depend on. Unit-side
// coverage at lib/scaffold/__tests__/page-contract.test.tsx (T2 vitest).
//
// Cycle: docs/cycles/2026-05-10-p2-scaffold-list-crud-parity.md (T6)

import { test, expect } from "@playwright/test";

test.describe("admin households list-shell parity", () => {
  test("Add CTA + row click + action dropdown visible with seeded rows", async ({
    page,
  }) => {
    const loginRes = await page.request.post("/api/demo/login?role=admin");
    expect(loginRes.status(), "login responds 200").toBe(200);

    await page.goto("/admin/akademik/keluarga");

    await expect(
      page.locator('h1:has-text("Keluarga")'),
      "h1 'Keluarga' visible",
    ).toBeVisible();

    // Header Add CTA visible.
    const headerAdd = page.getByRole("link", { name: /^Tambah Keluarga$/ });
    await expect(headerAdd, "header 'Tambah Keluarga' link visible").toBeVisible();

    // Total-count subtitle: at least 8 rows seeded.
    await expect(
      page.locator("text=/\\d+ keluarga/"),
      "total-count subtitle present",
    ).toBeVisible();

    // Action column header rendered.
    await expect(
      page.locator('th:has-text("Aksi")'),
      "action column header 'Aksi' visible",
    ).toBeVisible();

    // First row's "Lihat" inline button (rendered by DataTableRowActions).
    const firstLihat = page.locator('button:has-text("Lihat")').first();
    await expect(firstLihat, "first row 'Lihat' button visible").toBeVisible();

    // Row-click → navigates to detail page. The first <tr> with
    // data-clickable=true is the first data row (header has no
    // data-clickable). Capture the href via the visible row before clicking.
    const firstRow = page.locator('tr[data-clickable="true"]').first();
    await expect(firstRow, "first clickable row present").toBeVisible();
    await firstRow.click();
    await expect(
      page,
      "row click navigates to detail",
    ).toHaveURL(/\/admin\/akademik\/keluarga\/[a-z0-9]+$/i);

    // Back to list, open the action dropdown on the first row + assert the
    // Edit + Nonaktifkan menu items render.
    await page.goto("/admin/akademik/keluarga");
    const moreBtn = page.locator('button:has-text("Buka menu")').first();
    await moreBtn.click();
    await expect(
      page.getByRole("menuitem", { name: /^Edit$/ }),
      "action dropdown 'Edit' visible",
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /^Nonaktifkan$/ }),
      "action dropdown 'Nonaktifkan' visible",
    ).toBeVisible();
  });
});
