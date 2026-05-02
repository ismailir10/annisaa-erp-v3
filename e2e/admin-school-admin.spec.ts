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
  });

  test("employees list API returns 403 (hr.view gated)", async ({ page }) => {
    // Post-RBAC: /api/employees requires hr.view, which SCHOOL_ADMIN no longer holds.
    const res = await page.request.get("/api/employees?pageSize=1");
    expect(res.status()).toBe(403);
  });

  test("sidebar has no Penggajian nav link", async ({ page }) => {
    // Check by href — the sidebar nav link to /admin/payroll must not exist in the DOM
    await expect(page.locator('a[href="/admin/payroll"]').first()).not.toBeVisible();
  });

  test("employee salary API returns 403", async ({ page, request }) => {
    // Fetch an employee ID via a SUPER_ADMIN request context (post-RBAC,
    // SCHOOL_ADMIN cannot list employees), then probe the salary endpoint
    // with the SCHOOL_ADMIN page session — must be 403.
    const adminRes = await request.get("/api/employees?pageSize=1", {
      headers: { cookie: "school-erp-session=u_super_admin" },
    });
    expect(adminRes.status()).toBe(200);
    const { data } = await adminRes.json();
    const empId = data?.[0]?.id;
    if (!empId) {
      test.skip(true, "No employees seeded");
      return;
    }

    const salaryRes = await page.request.get(`/api/employees/${empId}/salary`);
    expect(salaryRes.status()).toBe(403);
  });

  test("SCHOOL_ADMIN demo user sees no SDM group in sidebar", async ({ page }) => {
    // Whole HR group (SDM) and its items must not render for SCHOOL_ADMIN.
    // Match the sidebar group label exactly to avoid accidental matches.
    // Use `not.toBeAttached()` not `toHaveCount(0)` — we want "never mounted",
    // not "mounted-but-hidden". Filter by permission in Task 6 removes the
    // whole group from the DOM, so the stricter assertion is accurate.
    await expect(page.getByRole("button", { name: "SDM" })).not.toBeAttached();
    await expect(page.locator('a[href="/admin/employees"]')).not.toBeAttached();
    await expect(page.locator('a[href="/admin/payroll"]')).not.toBeAttached();
  });

  test("/admin/employees redirects SCHOOL_ADMIN back to /admin", async ({ page }) => {
    await page.goto("/admin/employees");
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("Settings not pinned in sidebar footer (Keluar only)", async ({ page }) => {
    // Footer must contain only the Keluar button — Pengaturan moved into
    // the scrollable SidebarContent in Task 7.
    const footer = page.locator('[data-sidebar="footer"]');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("button", { name: /Keluar/i })).toBeVisible();
    await expect(footer.getByRole("button", { name: /Pengaturan/i })).not.toBeAttached();
  });

  test("employee detail page redirects SCHOOL_ADMIN to /admin", async ({ page, request }) => {
    // Post-RBAC the whole (hr) route group — including employee detail —
    // is gated by hr.view at the layout. SCHOOL_ADMIN must be redirected.
    const adminRes = await request.get("/api/employees?pageSize=1&status=ACTIVE", {
      headers: { cookie: "school-erp-session=u_super_admin" },
    });
    const { data } = await adminRes.json();
    const empId = data?.[0]?.id;
    if (!empId) {
      test.skip(true, "No employees seeded");
      return;
    }

    await page.goto(`/admin/employees/${empId}`);
    await page.waitForURL(/\/admin$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin$/);
  });
});
