import { test, expect } from "@playwright/test";

const SUPER_ADMIN_USER_ID = "u_super_admin";
const SCHOOL_ADMIN_USER_ID = "u_school_admin";

async function loginAs(page: import("@playwright/test").Page, userId: string) {
  await page.context().addCookies([{
    name: "school-erp-session",
    value: userId,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

test.describe("admin dashboard rebuild — SUPER_ADMIN", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, SUPER_ADMIN_USER_ID);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
  });

  test("renders stat grid with all four metric cards", async ({ page }) => {
    await expect(page.getByText("Total Karyawan", { exact: false })).toBeVisible();
    await expect(page.getByText("Hadir Hari Ini", { exact: false })).toBeVisible();
    await expect(page.getByText("Terlambat", { exact: false })).toBeVisible();
    await expect(page.getByText("Tidak Hadir", { exact: false })).toBeVisible();
  });

  test("renders attendance trend chart container or its empty state", async ({ page }) => {
    await expect(page.getByText("Tren Kehadiran (7 Hari Terakhir)")).toBeVisible();
    // Either the chart container is rendered (data path), or the empty state copy
    // is visible (zero-data path). Accept either — both are valid.
    const chartEl = page.locator('[data-slot="chart"]');
    const emptyEl = page.getByText("Data kehadiran belum tersedia");
    const chartOrEmpty = chartEl.or(emptyEl).first();
    await expect(chartOrEmpty).toBeVisible();
  });

  test("renders pending actions with leave + admissions rows", async ({ page }) => {
    // Scope to the PendingActions card to avoid sidebar nav matches
    const pendingCard = page.getByTestId("pending-actions");
    await expect(pendingCard.getByText("Pengajuan Cuti")).toBeVisible(); // SUPER_ADMIN has leave.view
    await expect(pendingCard.getByText("Pendaftaran Baru")).toBeVisible(); // SUPER_ADMIN has admissions.view
  });

  test("renders activity feed (rows or empty state copy)", async ({ page }) => {
    await expect(page.getByText("Aktivitas Terbaru")).toBeVisible();
    // Either activity rows (avatar) or empty-state copy — both valid
    const avatarEl = page.locator('[data-slot="avatar"]');
    const emptyEl = page.getByText("Belum ada aktivitas hari ini");
    const feedOrEmpty = avatarEl.or(emptyEl).first();
    await expect(feedOrEmpty).toBeVisible();
  });

  test("renders quick actions with all four links for full perms", async ({ page }) => {
    // Scope to quick-actions section (h2 with "Aksi Cepat" + sibling grid)
    const quickActionsSection = page.getByTestId("quick-actions");
    await expect(quickActionsSection.getByText("Aksi Cepat")).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Jalankan Penggajian/ })).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Lihat Kehadiran/ })).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Pengajuan Cuti/ })).toBeVisible();
    await expect(quickActionsSection.getByRole("link", { name: /Tambah Karyawan/ })).toBeVisible();
  });
});

test.describe("admin dashboard rebuild — SCHOOL_ADMIN gating", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, SCHOOL_ADMIN_USER_ID);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
  });

  test("hides payroll row in pending actions", async ({ page }) => {
    // Scope to the PendingActions card
    const pendingCard = page.getByTestId("pending-actions");
    await expect(pendingCard).toBeVisible();
    await expect(pendingCard.getByText("Penggajian Terakhir")).toHaveCount(0);
  });

  test("hides leave row (SCHOOL_ADMIN lacks leave.view)", async ({ page }) => {
    // Scope to the PendingActions card — sidebar nav may still have "Pengajuan Cuti"
    const pendingCard = page.getByTestId("pending-actions");
    await expect(pendingCard).toBeVisible();
    await expect(pendingCard.getByText("Pengajuan Cuti")).toHaveCount(0);
  });

  test("hides the Aksi Cepat section entirely", async ({ page }) => {
    // SCHOOL_ADMIN lacks `hr.view`, so all four HR-anchored quick actions
    // (Jalankan Penggajian + Lihat Kehadiran + Pengajuan Cuti + Tambah
    // Karyawan) gate out and the whole `<QuickActions>` returns null.
    await expect(page.getByTestId("quick-actions")).toHaveCount(0);
    await expect(page.getByText("Aksi Cepat")).toHaveCount(0);
  });
});
