import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { getPendingPaymentLinkBreakdown } from "@/lib/finance/pending-breakdown";

/**
 * GET /api/invoices/pending-payment-link/breakdown
 *
 * Admin-only diagnostic. Aggregates the tenant's `PENDING_PAYMENT_LINK` invoices
 * by `paymentLinkError` prefix in SQL (no row pull into Node) so the admin UI
 * can render a category breakdown popover next to the "Coba Lagi Link (N)"
 * button. Categories come from `lib/xendit/error-prefix.ts` (see Task 4) —
 * persisted strings have shape `"<prefix>: <message>"`. Rows from before this
 * cycle have unprefixed strings (no colon) and land in the "untagged" bucket.
 *
 * Aggregation logic lives in `lib/finance/pending-breakdown.ts` — shared with
 * the backfill CLI script.
 *
 * Response shape (10 fixed buckets, all numeric, zero-filled):
 *   {
 *     total: N,
 *     byPrefix: {
 *       "5xx": M, "429": K, "408": P, "network": Q,
 *       "401": J, "403": JJ, "422": L, "4xx": R,
 *       "untagged": S, "unknown": U
 *     }
 *   }
 */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const breakdown = await getPendingPaymentLinkBreakdown(session.tenantId);
  return NextResponse.json(breakdown);
}
