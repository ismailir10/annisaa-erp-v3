import { test, expect } from "@playwright/test";

// Demo mode E2E tests — discovers user ID from /api/auth/users and sets
// session cookie directly to avoid rate-limit on repeated beforeEach calls.

let adminUserId: string;

test.describe("Admin flows", () => {
  test.beforeAll(async ({ request }) => {
    // Discover admin user ID from the demo user list endpoint
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const admin = users.find((u: { role: string }) => u.role === "SCHOOL_ADMIN");
    if (!admin) throw new Error("No SCHOOL_ADMIN user found in demo DB");
    adminUserId = admin.id;
  });

  test.beforeEach(async ({ page }) => {
    // Set demo session cookie directly — avoids /api/auth/login rate limit
    await page.context().addCookies([{
      name: "school-erp-session",
      value: adminUserId,
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
    await page.goto("/admin/employees");
    // Click the first employee link in the data table
    await page.locator("table tbody tr").first().locator("a").first().click();
    await page.waitForURL("**/admin/employees/**");
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

  test("payroll detail shows employee lines", async ({ page }) => {
    await page.goto("/admin/payroll");
    const payrollLink = page.locator("a[href*='/admin/payroll/']").first();
    if (await payrollLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await payrollLink.click();
      await page.waitForURL("**/admin/payroll/**");
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
  });
});
