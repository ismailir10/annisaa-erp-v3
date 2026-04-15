import { test, expect } from "@playwright/test";

// Demo mode E2E — direct cookie auth to avoid rate limit on repeated logins.
const PARENT_USER_ID = "u_rightjet"; // Demo Parent (Test Parent) — GUARDIAN

test.describe("Parent flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: PARENT_USER_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.goto("/parent");
    await page.waitForURL("**/parent", { timeout: 15_000 });
  });

  test("dashboard loads with child info", async ({ page }) => {
    await expect(page.locator("text=Assalamu")).toBeVisible();
    // Dashboard always shows quick-link cards for a logged-in parent with a child
    await expect(page.locator("text=Tagihan").first()).toBeVisible();
  });

  test("unpaid invoices section visible on dashboard", async ({ page }) => {
    // Either shows unpaid invoices table or all-paid state in the dashboard
    await expect(
      page.locator("text=Tagihan Belum Lunas").or(page.locator("text=Semua tagihan lunas"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("invoices page loads", async ({ page }) => {
    await page.goto("/parent/invoices");
    await page.waitForURL("**/parent/invoices");
    await expect(page.locator("text=Tagihan Saya")).toBeVisible();
    // Wait for client component to hydrate and reveal content or empty state
    await expect(
      page.locator("text=Belum ada tagihan").or(page.locator("table"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("attendance page loads", async ({ page }) => {
    await page.goto("/parent/attendance");
    await page.waitForURL("**/parent/attendance");
    // Use first() — "Kehadiran" appears in both nav and page heading
    await expect(page.locator("text=Kehadiran").first()).toBeVisible();
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/parent/reports");
    await page.waitForURL("**/parent/reports");
    // Use first() — "Laporan Perkembangan" appears in heading and in table rows
    await expect(page.locator("text=Laporan Perkembangan").first()).toBeVisible();
    // Wait for DataTable to hydrate — uses literal <table> selector
    await expect(
      page.locator("text=Belum ada rapor").or(page.locator("table")).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    // Use first() — "An Nisaa" appears multiple times on login page
    await expect(page.locator("text=An Nisaa").first()).toBeVisible();
  });
});
