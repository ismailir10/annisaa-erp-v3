import type { APIRequestContext } from "@playwright/test";

/**
 * Give the demo guardian an invoice of their own.
 *
 * Why this exists: `parent.spec.ts` and `payment.spec.ts` used to pass only
 * because an unrelated test — the bulk-generate smoke in `admin.spec.ts` —
 * billed *every* eligible student earlier in the run, incidentally supplying
 * the demo parent with invoices. Nothing declared that dependency. When the
 * Billing Run wizard replaced that test with one scoped to a single class
 * (docs/cycles/2026-08-14-billing-run-wizard.md, Task T11), the supply
 * vanished: payment.spec had no invoice row to click, and parent.spec's list
 * rendered its no-invoices state instead of the lunas copy.
 *
 * A spec should not depend on another spec's side effects, so both now create
 * their own fixture in `beforeAll`. Each call adds one unpaid invoice with a
 * unique period label — cheap on the ephemeral CI database, and it makes the
 * precondition explicit at the point that needs it.
 */
const ADMIN_USER_ID = "u_super_admin";

export async function ensureParentHasInvoice(
  request: APIRequestContext,
  parentUserId: string,
): Promise<void> {
  // Read the guardian's own children as the guardian — the same view the
  // parent portal builds from.
  const childrenRes = await request.get("/api/parent/children", {
    headers: { cookie: `school-erp-session=${parentUserId}` },
  });
  if (!childrenRes.ok()) {
    throw new Error(
      `ensureParentHasInvoice: GET /api/parent/children failed (${childrenRes.status()})`,
    );
  }
  const children = (await childrenRes.json()) as { data: Array<{ id: string; name: string }> };
  const child = children.data[0];
  if (!child) {
    throw new Error("ensureParentHasInvoice: demo guardian has no children in this database");
  }

  // Creating an invoice is admin-only, so switch identity for the write.
  const asAdmin = { headers: { cookie: `school-erp-session=${ADMIN_USER_ID}` } };

  const componentsRes = await request.get("/api/fee-components", asAdmin);
  if (!componentsRes.ok()) {
    throw new Error(
      `ensureParentHasInvoice: GET /api/fee-components failed (${componentsRes.status()})`,
    );
  }
  const components = (await componentsRes.json()) as Array<{
    id: string;
    status: string;
    isEnabled: boolean;
  }>;
  const component = components.find((c) => c.status === "ACTIVE" && c.isEnabled);
  if (!component) {
    throw new Error("ensureParentHasInvoice: no enabled fee component in this database");
  }

  const created = await request.post("/api/invoices", {
    ...asAdmin,
    data: {
      studentId: child.id,
      periodLabel: `E2E Fixture ${Date.now()}`,
      dueDate: "2026-12-31",
      lines: [{ feeComponentId: component.id, amount: 100_000 }],
    },
  });
  if (!created.ok()) {
    const detail = await created.text();
    throw new Error(
      `ensureParentHasInvoice: POST /api/invoices failed (${created.status()}): ${detail}`,
    );
  }
}
