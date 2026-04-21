import { test, expect } from "@playwright/test";

// Demo mode E2E tests — discovers user ID from /api/auth/users and sets
// session cookie directly to avoid rate-limit on repeated beforeEach calls.

const ADMIN_USER_ID = "u_super_admin"; // Primary owner — SUPER_ADMIN

test.describe("Admin flows", () => {
  test.beforeEach(async ({ page }) => {
    // Set demo session cookie directly — avoids /api/auth/login rate limit
    await page.context().addCookies([{
      name: "school-erp-session",
      value: ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
  });

  test("dashboard loads with stats", async ({ page }) => {
    await expect(page.locator("text=Selamat datang")).toBeVisible();
    await expect(page.locator("text=TOTAL KARYAWAN")).toBeVisible();
    await expect(page.locator("text=HADIR HARI INI")).toBeVisible();
  });

  test("employee list loads", async ({ page }) => {
    await page.goto("/admin/employees");
    await page.waitForURL("**/admin/employees");
    await expect(page.locator("text=karyawan terdaftar")).toBeVisible();
  });

  test("employee detail loads with salary tab", async ({ page }) => {
    // Navigate via API to avoid depending on employee name in the table
    const res = await page.request.get("/api/employees?pageSize=1");
    const json = await res.json();
    const empId = json.data?.[0]?.id;
    if (!empId) return;
    await page.goto(`/admin/employees/${empId}`);
    await page.waitForURL(`**/admin/employees/${empId}`);
    await expect(page.getByRole("tab", { name: "Profil" })).toBeVisible();
    await page.getByRole("tab", { name: "Gaji" }).click();
    await expect(page.locator("text=Gaji Pokok")).toBeVisible();
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/admin/attendance");
    await page.waitForURL("**/admin/attendance");
    await expect(page.locator("text=Kehadiran Hari Ini")).toBeVisible();
  });

  test("monthly attendance grid loads", async ({ page }) => {
    await page.goto("/admin/attendance/monthly");
    await expect(page.locator("text=Kehadiran Bulanan")).toBeVisible({ timeout: 15_000 });
  });

  test("payroll list loads", async ({ page }) => {
    await page.goto("/admin/payroll");
    await page.waitForURL("**/admin/payroll");
    await expect(page.getByRole("heading", { name: /Penggajian/i }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("settings pages load", async ({ page }) => {
    await page.goto("/admin/settings/campuses");
    await page.waitForURL("**/admin/settings/campuses");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/settings/holidays");
    await page.waitForURL("**/admin/settings/holidays");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/admin/settings/salary-components");
    await page.waitForURL("**/admin/settings/salary-components");
    await expect(page.locator("text=Gaji Pokok")).toBeVisible({ timeout: 15_000 });
  });

  test("can navigate to new employee form", async ({ page }) => {
    await page.goto("/admin/employees/new");
    await page.waitForURL("**/admin/employees/new");
    await expect(page.getByRole("heading", { name: "Tambah Karyawan" })).toBeVisible({ timeout: 15_000 });
  });

  test("deleted flat assessment-templates URL redirects to nested", async ({ page }) => {
    await page.goto("/admin/assessment-templates");
    await expect(page).toHaveURL("/admin/assessments/templates");
    await expect(page.getByRole("heading", { name: /Template Penilaian/i })).toBeVisible();
  });

  test("payroll detail shows employee lines", async ({ page }) => {
    await page.goto("/admin/payroll");
    const payrollLink = page.locator("a[href*='/admin/payroll/']").first();
    if (await payrollLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payrollLink.click();
      await page.waitForURL("**/admin/payroll/**");
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
  });

  test("admin can open Buku Penghubung template config and monitoring", async ({ page }) => {
    await page.goto("/admin/student-journal");
    await expect(page.getByRole("heading", { name: /Buku Penghubung/i })).toBeVisible({ timeout: 15_000 });
    // Both scope tabs exist
    await expect(page.getByRole("tab", { name: "Sekolah" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Rumah" })).toBeVisible();

    // Navigate to monitoring
    await page.goto("/admin/student-journal/monitoring");
    await page.waitForURL("**/admin/student-journal/monitoring");
    // Monitoring page renders a PageHeader — wait for any heading to appear
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
