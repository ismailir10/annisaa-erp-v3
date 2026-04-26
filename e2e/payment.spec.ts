import { test, expect } from "@playwright/test";

// /payment/success and /payment/cancel are auth-exempt per proxy.ts:55-60.
// However the *destination* /parent/invoices IS auth-gated, so we inject
// the demo session cookie before each test to confirm the click/timer
// actually lands on the parent portal (not the / login page).

let parentUserId: string;

test.describe("Payment return pages", () => {
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
  });

  test("success: Kembali button navigates to /parent/invoices", async ({ page }) => {
    await page.goto("/payment/success?invoice=demo-fake");
    const link = page.getByRole("link", { name: /Kembali ke Portal Orang Tua/i });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/parent/invoices", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices");
  });

  test("cancel: auto-redirect lands on /parent/invoices within 8s", async ({ page }) => {
    await page.goto("/payment/cancel?invoice=demo-fake");
    // 5s countdown + ≤3s cold-server hydration buffer
    await page.waitForURL("**/parent/invoices", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices");
  });
});
