import { test, expect } from "@playwright/test";

// Demo mode E2E tests — uses cookie-based auth (no Supabase needed locally)

test.describe("Admin flows", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin via demo mode
    await page.goto("/");
    // Wait for user list to load
    await page.waitForSelector("text=Admin Annisaa", { timeout: 10_000 });
    // Click admin user
    await page.click("text=Admin Annisaa");
    // Wait for redirect to admin dashboard
    await page.waitForURL("**/admin", { timeout: 10_000 });
  });

  test("dashboard loads with stats", async ({ page }) => {
    await expect(page.locator("text=Selamat datang")).toBeVisible();
    await expect(page.locator("text=TOTAL KARYAWAN")).toBeVisible();
    await expect(page.locator("text=HADIR HARI INI")).toBeVisible();
  });

  test("employee list loads", async ({ page }) => {
    await page.click("text=Karyawan");
    await page.waitForURL("**/admin/employees");
    // Should show employee count
    await expect(page.locator("text=karyawan terdaftar")).toBeVisible();
  });

  test("employee detail loads with salary tab", async ({ page }) => {
    await page.click("text=Karyawan");
    await page.waitForURL("**/admin/employees");
    await page.click("text=Eneng Rina");
    await page.waitForURL("**/admin/employees/**");
    // Profile tab visible
    await expect(page.locator("text=Profil")).toBeVisible();
    await expect(page.locator("text=Gaji")).toBeVisible();
    // Click salary tab
    await page.click("text=Gaji");
    await expect(page.locator("text=Gaji Pokok")).toBeVisible();
  });

  test("attendance page loads", async ({ page }) => {
    await page.click("text=Kehadiran");
    await page.waitForURL("**/admin/attendance");
    await expect(page.locator("text=Kehadiran Hari Ini")).toBeVisible();
    await expect(page.locator("text=HADIR")).toBeVisible();
  });

  test("monthly attendance grid loads", async ({ page }) => {
    await page.click("text=Kehadiran");
    await page.waitForURL("**/admin/attendance");
    await page.click("text=Bulanan");
    await page.waitForURL("**/admin/attendance/monthly");
    await expect(page.locator("text=Kehadiran Bulanan")).toBeVisible();
  });

  test("payroll list loads", async ({ page }) => {
    await page.click("text=Penggajian");
    await page.waitForURL("**/admin/payroll");
    await expect(page.locator("text=Penggajian")).toBeVisible();
  });

  test("settings pages load", async ({ page }) => {
    // Campuses
    await page.click("text=Kampus");
    await page.waitForURL("**/admin/settings/campuses");
    await expect(page.locator("text=Taman Aster")).toBeVisible();

    // Holidays
    await page.click("text=Hari Libur");
    await page.waitForURL("**/admin/settings/holidays");
    await expect(page.locator("text=Hari Libur")).toBeVisible();

    // Salary Components
    await page.click("text=Komponen Gaji");
    await page.waitForURL("**/admin/settings/salary-components");
    await expect(page.locator("text=Gaji Pokok")).toBeVisible();
  });

  test("can navigate to new employee form", async ({ page }) => {
    await page.click("text=Karyawan");
    await page.waitForURL("**/admin/employees");
    await page.click("text=Tambah");
    await page.waitForURL("**/admin/employees/new");
    await expect(page.locator("text=Tambah Karyawan")).toBeVisible();
  });

  test("payroll detail shows employee lines", async ({ page }) => {
    await page.click("text=Penggajian");
    await page.waitForURL("**/admin/payroll");
    // Click first payroll run if exists
    const payrollLink = page.locator("a[href*='/admin/payroll/']").first();
    if (await payrollLink.isVisible()) {
      await payrollLink.click();
      await page.waitForURL("**/admin/payroll/**");
      // Should show period and employee count
      await expect(page.locator("text=Total Pendapatan")).toBeVisible();
    }
  });
});
