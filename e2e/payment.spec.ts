import { test, expect } from "@playwright/test";
import { ensureParentHasInvoice } from "./ensure-parent-invoice";

// /payment/success and /payment/cancel are thin server-side redirect shims
// that forward to /parent/invoices?invoice=<id>&paymentStatus=paid|cancel.
// As of cycle 2026-07-27-doku-payment-gateway (AC-24) the shims emit the
// gateway-neutral `paymentStatus` param instead of the legacy
// `xenditStatus` one — the rename that started with cycle
// 2026-04-27-finance-ui-polish is now generalised across both gateways.
// Return URLs are baked in at session-creation time and live up to 7 days,
// so the parent client (`app/parent/invoices/client.tsx`) must keep
// accepting the legacy `?xenditStatus=` form too, for any Xendit session
// created before this cycle shipped. The destination is auth-gated, so we
// inject the demo session cookie before each test to confirm the redirect
// actually lands on the parent portal.

let parentUserId: string;

test.describe("Payment return shims", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/auth/users");
    const users = await res.json();
    const parent = users.find((u: { role: string }) => u.role === "GUARDIAN");
    if (!parent) throw new Error("No GUARDIAN user found in demo DB");
    parentUserId = parent.id;

    // The AC-24 test below clicks the first invoice row in the parent's list,
    // so an invoice has to exist. It used to be supplied incidentally by
    // admin.spec's bulk-generate smoke — see e2e/ensure-parent-invoice.ts.
    await ensureParentHasInvoice(request, parentUserId);
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
    await page.waitForURL("**/parent/invoices?invoice=demo-fake&paymentStatus=paid", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices?invoice=demo-fake&paymentStatus=paid");
  });

  test("cancel shim redirects to /parent/invoices with cancel status", async ({ page }) => {
    await page.goto("/payment/cancel?invoice=demo-fake");
    await page.waitForURL("**/parent/invoices?invoice=demo-fake&paymentStatus=cancel", { timeout: 8_000 });
    expect(page.url()).toContain("/parent/invoices?invoice=demo-fake&paymentStatus=cancel");
  });

  test("success shim with no invoice param falls back to plain /parent/invoices", async ({ page }) => {
    await page.goto("/payment/success");
    await page.waitForURL("**/parent/invoices", { timeout: 8_000 });
    expect(page.url()).toMatch(/\/parent\/invoices(\?|$)/);
  });

  test("legacy xenditStatus param still opens the invoice detail sheet (AC-24)", async ({ page }) => {
    // Sessions created before this cycle baked `?xenditStatus=paid|cancel`
    // into their return URL at session-creation time (Xendit links live up
    // to 7 days), so the parent client must keep honouring that param even
    // though the shims above now only ever emit `paymentStatus`. Discover a
    // real invoice id belonging to this parent by opening the detail sheet
    // once through the normal UI path (click a row → sheet fetches
    // `/api/guardian/invoices/<id>`), then reload with the legacy param and
    // confirm the sheet re-opens and the query string gets stripped —
    // proof the effect in client.tsx actually consumed it.
    await page.goto("/parent/invoices");
    await page.waitForURL("**/parent/invoices");

    const rowButton = page
      .locator(
        'ul[aria-label="Tagihan belum dibayar"] button, ul[aria-label="Riwayat pembayaran"] button',
      )
      .first();
    await expect(rowButton).toBeVisible({ timeout: 15_000 });

    const [detailResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/guardian/invoices/") && res.request().method() === "GET",
      ),
      rowButton.click(),
    ]);
    const invoiceId = new URL(detailResponse.url()).pathname.split("/").pop();
    if (!invoiceId) throw new Error("Could not resolve an invoice id from the demo parent's data");

    await page.goto(`/parent/invoices?invoice=${invoiceId}&xenditStatus=paid`);
    await expect(page.getByText(/Alhamdulillah/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("dialog")).toBeVisible();
    // The effect strips invoice/xenditStatus via router.replace once it
    // fires — confirms the legacy param was consumed, not just ignored.
    await page.waitForURL((url) => !url.search.includes("xenditStatus"), { timeout: 8_000 });
  });
});
