import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Resolve the current Asia/Jakarta year as a 4-digit number. Uses
 * `formatToParts` to extract the `year` token explicitly — defensive against
 * future ICU changes to how `en-CA` renders a stand-alone year.
 */
function jakartaYear(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).formatToParts(new Date());
  const yearPart = parts.find((p) => p.type === "year");
  if (!yearPart) throw new Error("Failed to extract Jakarta year");
  return Number(yearPart.value);
}

/**
 * Atomically allocate the next invoice number for a tenant.
 *
 * MUST be called inside a Prisma transaction (`tx`). The allocator issues a
 * single `INSERT … ON CONFLICT DO UPDATE … RETURNING` against the
 * `InvoiceNumberSequence` table — one round-trip, one row write, no advisory
 * lock, no MAX-scan, no client-side regex parsing. Concurrent callers serialise
 * at the row level on `(tenantId, year)`. An outer rollback returns the
 * allocated number too (sequence stays consistent with committed invoices).
 *
 * Year prefix is computed in **Asia/Jakarta** (WIB) so allocations on Jan 1
 * mornings don't produce `INV-2025-NNNN` invoices because Vercel happens to be
 * on UTC.
 *
 * Format: `INV-YYYY-NNNN` (4-digit zero-padded suffix; longer suffixes are not
 * truncated once the year crosses 9999 invoices).
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  const [number] = await reserveInvoiceNumbers(tx, tenantId, 1);
  return number;
}

/**
 * Atomically reserve N consecutive invoice numbers for a tenant.
 *
 * Single round-trip: bumps `lastNumber` by `count` and returns the new value;
 * caller derives the start as `(returned - count + 1)`. Used by the bulk
 * generate route to allocate a contiguous range without N round-trips and
 * without the per-invoice race-loss of allocating one then incrementing
 * client-side (which would leave the DB sequence behind by `count - 1`).
 *
 * Returns numbers in ascending order: `[INV-2026-0001, INV-2026-0002, ...]`.
 */
export async function reserveInvoiceNumbers(
  tx: Prisma.TransactionClient,
  tenantId: string,
  count: number
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`reserveInvoiceNumbers: count must be a positive integer, got ${count}`);
  }
  const year = jakartaYear();

  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "InvoiceNumberSequence" ("tenantId", "year", "lastNumber")
    VALUES (${tenantId}, ${year}, ${count})
    ON CONFLICT ("tenantId", "year")
    DO UPDATE SET "lastNumber" = "InvoiceNumberSequence"."lastNumber" + ${count}
    RETURNING "lastNumber";
  `;
  const last = rows[0]?.lastNumber ?? count;
  const start = last - count + 1;

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`INV-${year}-${String(start + i).padStart(4, "0")}`);
  }
  return out;
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
