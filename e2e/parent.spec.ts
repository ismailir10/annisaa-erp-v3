import { test, expect } from "@playwright/test";

// Demo mode E2E — discovers guardian user ID from /api/auth/users and sets
// session cookie directly to avoid rate limit on repeated logins.

let parentUserId: string;

test.describe("Parent flows", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const parent = users.find((u: { role: string }) => u.role === "GUARDIAN");
    if (!parent) throw new Error("No GUARDIAN user found in demo DB");
    parentUserId = parent.id;
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{
      name: "school-erp-session",
      value: parentUserId,
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
    // Week summary strip rendered above the table (Task 5)
    await expect(page.getByTestId("attendance-week-summary")).toBeVisible();
    await expect(page.getByTestId("attendance-week-summary")).toContainText("Minggu ini");
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/parent/reports");
    await page.waitForURL("**/parent/reports");
    // Use first() — "Laporan Perkembangan" appears in heading and in table rows
    await expect(page.locator("text=Laporan Perkembangan").first()).toBeVisible();
    // Wait for card list or empty state — DataTable replaced by card stack in Task 3
    await expect(
      page.locator("text=Belum ada rapor").or(page.locator("button:has-text('Lihat')")).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("logout works", async ({ page }) => {
    await page.click("[title='Keluar']");
    await page.waitForURL("/", { timeout: 10_000 });
    // Use first() — "An Nisaa" appears multiple times on login page
    await expect(page.locator("text=An Nisaa").first()).toBeVisible();
  });
});
