import { prisma } from "@/lib/db";
import {
  PAYMENT_LINK_ERROR_PREFIXES,
  type PaymentLinkErrorPrefix,
} from "@/lib/xendit/error-prefix";

export interface PendingPaymentLinkBreakdown {
  total: number;
  byPrefix: Record<PaymentLinkErrorPrefix, number>;
}

/**
 * Aggregate a tenant's `PENDING_PAYMENT_LINK` invoices by `paymentLinkError`
 * prefix. Single source of truth for two consumers:
 *   - `GET /api/invoices/pending-payment-link/breakdown` (admin UI popover)
 *   - `scripts/backfill-pending-payment-links.ts` (operator CLI sweep)
 *
 * SQL aggregation via `$queryRaw` so we don't pull rows into Node. The CASE
 * expression splits `paymentLinkError` on the first colon; the
 * `IS NULL OR position(':' in ...) = 0` guard puts pre-cycle unprefixed rows
 * into the explicit `'untagged'` bucket (avoids the `LEFT(str, -1) = ''`
 * Postgres edge case).
 *
 * Defensive: any unexpected `prefix` value (e.g. older data with a different
 * tag scheme like `weirdold:`) folds into `byPrefix.unknown` rather than
 * leaking surprise keys to the consumer. All 10 buckets in
 * `PAYMENT_LINK_ERROR_PREFIXES` are zero-filled in the response.
 */
export async function getPendingPaymentLinkBreakdown(
  tenantId: string,
): Promise<PendingPaymentLinkBreakdown> {
  const rows = await prisma.$queryRaw<Array<{ prefix: string; n: bigint }>>`
    SELECT
      CASE
        WHEN "paymentLinkError" IS NULL OR position(':' in "paymentLinkError") = 0
          THEN 'untagged'
        ELSE substring("paymentLinkError" from 1 for position(':' in "paymentLinkError") - 1)
      END AS prefix,
      count(*)::bigint AS n
    FROM "Invoice"
    WHERE "tenantId" = ${tenantId} AND status = 'PENDING_PAYMENT_LINK'
    GROUP BY 1
  `;

  const byPrefix = Object.fromEntries(
    PAYMENT_LINK_ERROR_PREFIXES.map((p) => [p, 0]),
  ) as Record<PaymentLinkErrorPrefix, number>;

  let total = 0;
  for (const row of rows) {
    const n = Number(row.n);
    total += n;
    if (row.prefix in byPrefix) {
      byPrefix[row.prefix as PaymentLinkErrorPrefix] = n;
    } else {
      byPrefix.unknown += n;
    }
  }

  return { total, byPrefix };
}
