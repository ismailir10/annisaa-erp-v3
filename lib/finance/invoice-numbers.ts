import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Atomically allocate the next invoice number for a tenant.
 * MUST be called inside a Prisma transaction. Acquires a tenant-scoped
 * advisory lock so concurrent callers receive distinct numbers.
 *
 * Format: INV-YYYY-NNNN (4-digit zero-padded suffix, year prefix).
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  // Hash tenantId to a deterministic int — same scheme used by the legacy
  // app/api/invoices/generate/route.ts so existing in-flight transactions
  // can't grab the same lock from a different code path.
  const lockKey = tenantId.split("").reduce((h, c) => h + c.charCodeAt(0), 0);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  // ORDER BY LENGTH(invoiceNumber) first so that "INV-2026-10000" correctly
  // sorts after "INV-2026-9999" once the suffix overflows 4 digits.
  // A pure lexicographic ORDER BY invoiceNumber DESC would put "9999" after
  // "10000", causing nextNum to seed from a stale prior row.
  const result = await tx.$queryRaw<Array<{ invoiceNumber: string }>>`
    SELECT "invoiceNumber" FROM "Invoice"
    WHERE "tenantId" = ${tenantId}
    ORDER BY LENGTH("invoiceNumber") DESC, "invoiceNumber" DESC
    LIMIT 1
  `;
  const last = result[0] ?? null;

  let nextNum = 1;
  if (last?.invoiceNumber) {
    const match = last.invoiceNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }

  const year = new Date().getFullYear();
  return `INV-${year}-${String(nextNum).padStart(4, "0")}`;
}

/**
 * Decimal-safe sum that avoids IEEE-754 drift across many small line items.
 * Inputs may be Prisma.Decimal, number, or string.
 */
export function sumDecimals(
  values: Array<Prisma.Decimal | number | string>
): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, v) => acc.add(new Prisma.Decimal(v)),
    new Prisma.Decimal(0)
  );
}
