/**
 * `BillingRunLine.source` vocabulary and the predicates over it (Cycle B2 —
 * docs/cycles/2026-08-14-billing-run-wizard-b2.md).
 *
 * Deliberately its own module, and deliberately **free of any Prisma import**:
 * step 2 and step 3 of the wizard are client components, and pulling
 * `lib/finance/billing-run-lines.ts` into them dragged
 * `@/lib/generated/prisma/client` into the client bundle, which fails the
 * Turbopack build with "the chunking context does not support external modules
 * (request: node:module)". Money math stays in `billing-run-lines.ts` where the
 * `Prisma.Decimal` import belongs; the source vocabulary lives here so both
 * sides can share it.
 */

// BASE / ADJUSTMENT are pre-existing (BASE from `build-billing-run.ts`;
// ADJUSTMENT reserved for a base line a keringanan touched — see the
// `BillingRunLine.source` schema comment). Cycle B2 adds EDITED (a
// BASE/ADJUSTMENT line the admin hand-edited) and MANUAL (an admin-invented
// line with no fee-structure amount behind it) per Assumption 4.
export type LineSource = "BASE" | "ADJUSTMENT" | "EDITED" | "MANUAL";

/** Sources the admin authored themselves, as opposed to the resolver's. */
const ADMIN_AUTHORED_SOURCES = new Set(["EDITED", "MANUAL"]);

/**
 * Does this line carry a **keringanan** — a durable `StudentFeeAdjustment`
 * grant (Cycle A) resolved onto the row — as opposed to an admin's own Cycle
 * B2 hand-edit?
 *
 * `adjustmentAmount !== 0` alone is NOT the test, and getting that wrong is
 * what preview-verify caught on PR #495: Assumption 1 has a manual edit write
 * its delta into `adjustmentAmount` too, so every hand-edited row rendered the
 * "Keringanan" badge and counted toward step 3's "Dengan keringanan" — even an
 * edit that *raised* the bill, which is the exact opposite of a fee waiver, on
 * the screen the admin approves the run from.
 *
 * `source` is the discriminator: `BASE`/`ADJUSTMENT` lines came out of
 * `applyAdjustments`, `EDITED`/`MANUAL` lines are the admin's own.
 */
export function isKeringananLine(line: {
  adjustmentAmount: number | string;
  source: string;
}): boolean {
  if (ADMIN_AUTHORED_SOURCES.has(line.source)) return false;
  return Number(line.adjustmentAmount) !== 0;
}

/** A row shows the "Keringanan" badge when any of its lines does. */
export function rowHasKeringanan(
  lines: Array<{ adjustmentAmount: number | string; source: string }>,
): boolean {
  return lines.some(isKeringananLine);
}
