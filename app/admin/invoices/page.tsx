import { assertPermission } from "@/lib/auth-guards";
import { invoiceCapabilities } from "@/lib/finance/invoice-capabilities";
import { getGateway } from "@/lib/payments/registry";
import { InvoicesClient } from "./invoices-client";

/**
 * Server wrapper — the invoices list is entirely client-rendered
 * (`invoices-client.tsx`), but the active gateway id must be resolved
 * server-side and handed down as a prop rather than read from
 * `process.env` inside a "use client" file (cycle 2026-07-27-doku-payment-gateway
 * T6). `PendingLinkBreakdownPopover` uses it to name the correct credential
 * env var in its auth-heavy hint.
 */
export default async function InvoicesPage() {
  const session = await assertPermission("invoices.view");
  return <InvoicesClient gatewayId={getGateway().id} capabilities={invoiceCapabilities(session)} />;
}
