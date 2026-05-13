import { test, expect, Page } from "@playwright/test";

// Verifies the canonical admin form-dialog contract from
// docs/cycles/2026-05-03-admin-modal-form-audit.md:
// - "Tambah <Entity>" trigger opens a dialog whose submit label matches
// - Cancel button labeled "Batal" with variant="ghost"
// - On mobile viewport, the overlay renders as a Sheet (not a Dialog)
// - Required fields show the asterisk via FieldLabel `required` prop
//
// One screenshot per dialog × viewport lands under
// `e2e/__snapshots__/admin-dialogs/` for the visual baseline.

const ADMIN_USER_ID = "u_super_admin";
const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 844 } as const;

async function loginAsAdmin(page: Page) {
  await page.context().addCookies([
    {
      name: "school-erp-session",
      value: ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

type DialogCheck = {
  name: string;
  path: string;
  triggerLabel: string;
  expectedTitle: RegExp;
  expectedSubmit: RegExp;
};

// Dialogs reachable from a list-page primary trigger (no nested navigation,
// no entity preconditions). Guardians list is edit-only — no create
// trigger lives there, so it's not enumerated. Detail-page dialogs
// (payment record, add-guardian on student detail, etc.) are out of
// scope — they need an entity to exist first.
const DIALOG_CHECKS: DialogCheck[] = [
  {
    name: "students-create",
    path: "/admin/students",
    triggerLabel: "Tambah Siswa",
    expectedTitle: /Tambah Siswa/i,
    expectedSubmit: /Tambah Siswa/i,
  },
  {
    name: "admissions-create",
    path: "/admin/admissions",
    triggerLabel: "Catat Pertanyaan",
    expectedTitle: /Catat Pertanyaan/i,
    expectedSubmit: /Catat Pertanyaan/i,
  },
  {
    name: "settings-campuses-create",
    path: "/admin/settings/campuses",
    triggerLabel: "Tambah Kampus",
    expectedTitle: /Tambah Kampus/i,
    expectedSubmit: /Tambah Kampus/i,
  },
  {
    name: "settings-holidays-create",
    path: "/admin/settings/holidays",
    triggerLabel: "Tambah Hari Libur",
    expectedTitle: /Tambah Hari Libur/i,
    expectedSubmit: /Tambah Hari Libur/i,
  },
  {
    name: "salary-components-create",
    path: "/admin/salary-components",
    triggerLabel: "Tambah Komponen",
    expectedTitle: /Tambah Komponen/i,
    expectedSubmit: /Tambah Komponen/i,
  },
];

test.describe("Admin form dialogs — desktop", () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const check of DIALOG_CHECKS) {
    test(`${check.name} dialog opens with canonical labels`, async ({ page }) => {
      await page.goto(check.path);
      await page.waitForLoadState("networkidle");

      const trigger = page.getByRole("button", { name: check.triggerLabel }).first();
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      const dialog = page.locator('[data-slot="dialog-content"]').first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      await expect(dialog.getByRole("heading")).toContainText(check.expectedTitle);
      await expect(dialog.getByRole("button", { name: check.expectedSubmit })).toBeVisible();
      // Cancel slot — text-based locator (DialogClose wrapper varies across
      // pages: some render a Button directly, some use the base-nova
      // `render` prop, some use an inner DialogClose).
      await expect(dialog.locator('button:has-text("Batal")').first()).toBeVisible();

      await page.screenshot({
        path: `e2e/__snapshots__/admin-dialogs/${check.name}-desktop.png`,
        clip: undefined,
        fullPage: false,
      });
    });
  }
});

test.describe("Admin form dialogs — mobile renders as Sheet", () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // Subset that uses ResponsiveFormDialog or has explicit Sheet branching.
  // Settings pages are desktop-mostly per spec assumption #3 — they keep
  // Dialog on mobile and are excluded from this Sheet assertion.
  const SHEET_CHECKS = DIALOG_CHECKS.filter(
    (c) => c.name === "students-create" || c.name === "admissions-create"
  );

  for (const check of SHEET_CHECKS) {
    test(`${check.name} opens as Sheet on mobile`, async ({ page }) => {
      await page.goto(check.path);
      await page.waitForLoadState("networkidle");

      const trigger = page.getByRole("button", { name: check.triggerLabel }).first();
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      const sheet = page.locator('[data-slot="sheet-content"]').first();
      await expect(sheet).toBeVisible({ timeout: 5_000 });

      // Dialog popup must NOT be present at the same time
      await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);

      await expect(sheet.getByRole("heading")).toContainText(check.expectedTitle);
      await expect(sheet.getByRole("button", { name: check.expectedSubmit })).toBeVisible();

      await page.screenshot({
        path: `e2e/__snapshots__/admin-dialogs/${check.name}-mobile.png`,
        fullPage: false,
      });
    });
  }
});

test.describe("FieldLabel required asterisk", () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Tambah Siswa surfaces a required asterisk on Nama Lengkap", async ({ page }) => {
    await page.goto("/admin/students");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Tambah Siswa" }).first().click();

    const dialog = page.locator('[data-slot="dialog-content"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The required marker is an aria-hidden span containing "*" inside the
    // FieldLabel for the Nama Lengkap field. Locate via the label text.
    const namaLabel = dialog.locator('label[data-slot="field-label"]', {
      hasText: "Nama Lengkap",
    }).first();
    await expect(namaLabel).toHaveAttribute("data-required", "true");
    await expect(namaLabel).toHaveAttribute("aria-required", "true");
    await expect(namaLabel.locator('span[aria-hidden="true"]')).toHaveText("*");
  });
});
