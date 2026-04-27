import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

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
 * Response shape (10 fixed buckets, all numeric, zero-filled):
 *   {
 *     total: N,
 *     byPrefix: {
 *       "5xx": M, "429": K, "408": P, "network": Q,
 *       "401": J, "403": JJ, "422": L, "4xx": R,
 *       "untagged": S, "unknown": U
 *     }
 *   }
 *
 * Any unexpected prefix (e.g. older data with a different tag scheme) is
 * defensively folded into "unknown" so the consumer never has to handle
 * surprise keys.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.$queryRaw<Array<{ prefix: string; n: bigint }>>`
    SELECT
      CASE
        WHEN "paymentLinkError" IS NULL OR position(':' in "paymentLinkError") = 0
          THEN 'untagged'
        ELSE substring("paymentLinkError" from 1 for position(':' in "paymentLinkError") - 1)
      END AS prefix,
      count(*)::bigint AS n
    FROM "Invoice"
    WHERE "tenantId" = ${session.tenantId} AND status = 'PENDING_PAYMENT_LINK'
    GROUP BY 1
  `;

  // Initialize all 10 buckets to 0 so consumer doesn't have to handle absent keys.
  const byPrefix: Record<string, number> = {
    "5xx": 0,
    "429": 0,
    "408": 0,
    network: 0,
    "401": 0,
    "403": 0,
    "422": 0,
    "4xx": 0,
    untagged: 0,
    unknown: 0,
  };

  let total = 0;
  for (const row of rows) {
    const n = Number(row.n);
    total += n;
    if (row.prefix in byPrefix) {
      byPrefix[row.prefix] = n;
    } else {
      // Defensive: an unexpected prefix from older data lands in "unknown".
      byPrefix.unknown += n;
    }
  }

  return NextResponse.json({ total, byPrefix });
}
