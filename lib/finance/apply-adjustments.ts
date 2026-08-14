import { Prisma } from "@/lib/generated/prisma/client";
import { sumDecimals } from "./invoice-numbers";

export type AdjustmentInput = {
  id: string;
  academicYearId: string;
  feeComponentId: string | null;
  type: "DISCOUNT" | "SURCHARGE";
  mode: "PERCENT" | "FIXED";
  value: Prisma.Decimal | number | string;
  reason: string;
  status: string; // ACTIVE | INACTIVE
  validFrom: string | null; // YYYY-MM-DD
  validTo: string | null; // YYYY-MM-DD
};

export type BaseLine = {
  feeComponentId: string;
  labelSnapshot: string;
  amount: Prisma.Decimal;
};

export type ResolvedLine = {
  feeComponentId: string;
  labelSnapshot: string;
  amount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  adjustmentNote: string | null;
  finalAmount: Prisma.Decimal;
};

/**
 * Pure resolver: turns a student's base fee lines + the flat list of
 * candidate `StudentFeeAdjustment` rows into resolved lines carrying the
 * applied discount/surcharge, per the Cycle A spec
 * (`docs/cycles/2026-08-13-keringanan-fee-adjustments.md`).
 *
 * No Prisma queries happen in here — everything is plain input/output so it
 * is trivially unit-testable and reusable by both the batch generate route
 * and (later) the bulk wizard.
 *
 * **The full eligibility gate lives here, not in the caller.** An adjustment
 * applies only when its `status` is ACTIVE, its `academicYearId` matches the
 * run, and `dueDate` falls inside its `[validFrom, validTo]` window. Callers
 * are expected to narrow the query for efficiency, but this function re-checks
 * regardless: billing a family from a deactivated grant or a prior year's
 * scholarship because one call site forgot a `where` clause is not a failure
 * mode worth leaving open.
 *
 * **Invoice-level adjustments are out of scope this cycle.** An
 * `AdjustmentInput` with `feeComponentId === null` can never match a
 * `BaseLine` (base lines always carry a concrete component id), so it is
 * silently ignored here — no special-casing needed. Cycle B is expected to
 * handle invoice-level (whole-invoice) adjustments once there is a line to
 * hang them off.
 */
export function applyAdjustments(args: {
  baseLines: BaseLine[];
  adjustments: AdjustmentInput[];
  academicYearId: string;
  dueDate: string; // YYYY-MM-DD
}): { lines: ResolvedLine[]; totalDue: Prisma.Decimal; adjustmentApplied: boolean } {
  const { baseLines, adjustments, academicYearId, dueDate } = args;

  const eligible = adjustments.filter(
    (adj) =>
      adj.status === "ACTIVE" &&
      adj.academicYearId === academicYearId &&
      isWithinValidity(dueDate, adj.validFrom, adj.validTo)
  );

  let adjustmentApplied = false;

  const lines: ResolvedLine[] = baseLines.map((line) => {
    // Phantom guard: an adjustment whose feeComponentId doesn't match this
    // (or any) base line simply never matches here — no line is invented.
    // This also drops invoice-level (null) adjustments, which are Cycle B.
    const matched = eligible.filter((adj) => adj.feeComponentId === line.feeComponentId);

    if (matched.length === 0) {
      return {
        feeComponentId: line.feeComponentId,
        labelSnapshot: line.labelSnapshot,
        amount: line.amount,
        adjustmentAmount: new Prisma.Decimal(0),
        adjustmentNote: null,
        finalAmount: line.amount,
      };
    }

    const deltas: Prisma.Decimal[] = [];
    const notes: string[] = [];

    for (const adj of matched) {
      const magnitude = new Prisma.Decimal(adj.value);
      // PERCENT is always computed against the base line amount — never
      // against a running/adjusted total — so stacked adjustments on one
      // component are order-independent.
      const rawDelta =
        adj.mode === "PERCENT" ? line.amount.times(magnitude).dividedBy(100) : magnitude;
      // Rupiah has no cents: round each delta individually, HALF_UP, before
      // summing — rounding after summing would make the per-adjustment
      // deltas non-order-independent in edge cases.
      const roundedDelta = rawDelta.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      const signedDelta = adj.type === "DISCOUNT" ? roundedDelta.negated() : roundedDelta;

      if (!signedDelta.isZero()) adjustmentApplied = true;

      deltas.push(signedDelta);
      notes.push(adj.reason);
    }

    const rawAdjustment = sumDecimals(deltas);
    const rawFinal = line.amount.plus(rawAdjustment);
    // A discount may zero a line but never make it negative. Clamp the
    // adjustment alongside finalAmount, not just finalAmount, so the line
    // stays internally consistent: amount + adjustmentAmount === finalAmount
    // always holds. An invoice line whose three numbers don't add up is a
    // support call, and both figures are parent-visible.
    const clamped = rawFinal.lessThan(0);
    const adjustmentAmount = clamped ? line.amount.negated() : rawAdjustment;
    const finalAmount = clamped ? new Prisma.Decimal(0) : rawFinal;

    return {
      feeComponentId: line.feeComponentId,
      labelSnapshot: line.labelSnapshot,
      amount: line.amount,
      adjustmentAmount,
      adjustmentNote: notes.join(" · "),
      finalAmount,
    };
  });

  const totalDueRaw = sumDecimals(lines.map((l) => l.finalAmount));
  const totalDue = totalDueRaw.lessThan(0) ? new Prisma.Decimal(0) : totalDueRaw;

  return { lines, totalDue, adjustmentApplied };
}

/**
 * Either bound null = open-ended on that side. Inclusive on both ends.
 * Exported so callers that only need the validity-window slice of the
 * eligibility gate (e.g. `/api/invoices/generate/plan`'s `withAdjustments`
 * count, which has no base lines to run through the full resolver) can
 * reuse the exact same rule instead of re-deriving it.
 */
export function isWithinValidity(
  dueDate: string,
  validFrom: string | null,
  validTo: string | null
): boolean {
  if (validFrom !== null && dueDate < validFrom) return false;
  if (validTo !== null && dueDate > validTo) return false;
  return true;
}
