import { test, expect } from "@playwright/test";

// /payment/success and /payment/cancel are now thin server-side redirect
// shims that forward to /parent/invoices?invoice=<id>&xenditStatus=paid|cancel
// for backwards compatibility with Xendit sessions created before cycle
// 2026-04-27-finance-ui-polish (return URLs are baked at session-creation
// time and live up to 7 days). The destination is auth-gated, so we inject
// the demo session cookie before each test to confirm the redirect actually
// lands on the parent portal.

let parentUserId: string;

test.describe("Payment return shims", () => {
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

  test("success shim redirects to /parent/invoices with paid status", async ({ page }) => {
    await page.goto("/payment/success?invoice=demo-fake");
    await page.waitForURL("**/parent/invoices?invoice=demo-fake&xenditStatus=paid", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices?invoice=demo-fake&xenditStatus=paid");
  });

  test("cancel shim redirects to /parent/invoices with cancel status", async ({ page }) => {
    await page.goto("/payment/cancel?invoice=demo-fake");
    await page.waitForURL("**/parent/invoices?invoice=demo-fake&xenditStatus=cancel", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices?invoice=demo-fake&xenditStatus=cancel");
  });

  test("success shim with no invoice param falls back to plain /parent/invoices", async ({ page }) => {
    await page.goto("/payment/success");
    await page.waitForURL("**/parent/invoices", { timeout: 8_000 });
    expect(page.url()).toMatch(/\/parent\/invoices(\?|$)/);
  });
});
