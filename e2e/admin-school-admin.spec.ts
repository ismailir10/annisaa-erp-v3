import { test, expect } from "@playwright/test";

// SCHOOL_ADMIN persona — restricted role, no salary/payroll access.
// Cookie-based demo auth, same pattern as admin.spec.ts.

const SCHOOL_ADMIN_USER_ID = "u_school_admin";

test.describe("SCHOOL_ADMIN role restrictions", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: SCHOOL_ADMIN_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/admin");
    await page.waitForURL("**/admin", { timeout: 15_000 });
  });

  test("payroll page redirects to /admin", async ({ page }) => {
    await page.goto("/admin/payroll");
    // Layout gate redirects non-SUPER_ADMIN back to /admin
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("payroll API returns 403", async ({ page }) => {
    const res = await page.request.get("/api/payroll");
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  test("sidebar has no Penggajian nav link", async ({ page }) => {
    // Check by href — the sidebar nav link to /admin/payroll must not exist in the DOM
    await expect(page.locator('a[href="/admin/payroll"]').first()).not.toBeVisible();
  });

  test("employee salary API returns 403", async ({ page }) => {
    // Fetch first employee from list, then try salary endpoint
    const listRes = await page.request.get("/api/employees?pageSize=1");
    expect(listRes.status()).toBe(200);
    const { data } = await listRes.json();
    const empId = data[0]?.id;
    expect(empId).toBeTruthy();

    const salaryRes = await page.request.get(`/api/employees/${empId}/salary`);
    expect(salaryRes.status()).toBe(403);
  });

  test("employee detail has no Gaji tab", async ({ page }) => {
    // Get first employee ID via API, then navigate directly (avoid UI navigation fragility)
    const listRes = await page.request.get("/api/employees?pageSize=1&status=ACTIVE");
    const { data } = await listRes.json();
    const empId = data[0]?.id;
    expect(empId).toBeTruthy();

    await page.goto(`/admin/employees/${empId}`);
    await page.waitForURL(`**/admin/employees/${empId}`, { timeout: 10_000 });

    // Profil tab should be visible
    await expect(page.getByRole("tab", { name: "Profil" })).toBeVisible({ timeout: 10_000 });
    // Gaji tab must NOT be visible (salary API returned 403 → salaryValues is null)
    await expect(page.getByRole("tab", { name: "Gaji" })).not.toBeVisible();
  });
});
