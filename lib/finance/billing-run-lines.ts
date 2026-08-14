import { Prisma } from "@/lib/generated/prisma/client";
import { sumDecimals } from "./invoice-numbers";

/**
 * Pure line math for the Billing Run wizard's editable step 2 (Cycle B2 —
 * docs/cycles/2026-08-14-billing-run-wizard-b2.md, Task T1). No Prisma
 * queries happen here — everything is plain input/output, mirroring
 * `lib/finance/apply-adjustments.ts` and `lib/finance/build-billing-run.ts`,
 * so this stays unit-testable without mocking Prisma and reusable by every
 * line-mutation route (T3, T4).
 *
 * Money is `Prisma.Decimal`, rounded to 0 decimal places (rupiah has no
 * cents) with the same `ROUND_HALF_UP` mechanism `apply-adjustments.ts`
 * uses — never float arithmetic, never a second rounding helper.
 */

// The `source` vocabulary and its predicates live in a Prisma-free module
// so the wizard's client components can import them without pulling
// @/lib/generated/prisma/client into the browser bundle.
export type { LineSource } from "./billing-run-line-source";
export { isKeringananLine, rowHasKeringanan } from "./billing-run-line-source";
import type { LineSource } from "./billing-run-line-source";

type Money = Prisma.Decimal | number | string;

// Rupiah has no cents — round every money value that crosses this module's
// boundary to 0 dp, HALF_UP, exactly like `apply-adjustments.ts` rounds each
// adjustment delta before summing.
function round0(value: Money): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

// A caller-supplied note is "absent" whether it is null, undefined, or
// whitespace-only — all three mean "the admin left the note field blank".
function normalizeNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const DEFAULT_ADJUSTMENT_NOTE = "Penyesuaian manual";

/**
 * When the resulting adjustment is non-zero and the caller supplied no note,
 * default it — an unexplained deduction on a family's invoice is a support
 * call (Spec acceptance: "adjustmentNote is parent-visible and is treated as
 * such"). When the adjustment is zero, the note is cleared to null: nothing
 * is rendered for a zero adjustment (see the comment in
 * `components/admin/invoices/billing-run-wizard/step-2-review.tsx` around
 * line 68 — non-zero-only rendering).
 */
function resolveNote(
  adjustmentAmount: Prisma.Decimal,
  note: string | null | undefined
): string | null {
  if (adjustmentAmount.isZero()) return null;
  const normalized = normalizeNote(note);
  return normalized ?? DEFAULT_ADJUSTMENT_NOTE;
}

export type ResolveLineEditInput = {
  /** The fee-structure snapshot amount — never overwritten (Assumption 1). */
  amount: Money;
  /** The line's source BEFORE this edit. */
  source: LineSource;
  /** The admin's new final (parent-visible) amount. */
  finalAmount: Money;
  /** Caller-supplied note; null/undefined/blank means "not supplied". */
  note?: string | null;
};

export type ResolveLineEditResult =
  | {
      ok: true;
      adjustmentAmount: Prisma.Decimal;
      finalAmount: Prisma.Decimal;
      adjustmentNote: string | null;
      source: LineSource;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Derive `adjustmentAmount` from a new `finalAmount` and apply the
 * sign/clamp rules from Assumption 2, per `source`:
 *
 * - `adjustmentAmount = finalAmount - amount`. The invariant
 *   `amount + adjustmentAmount === finalAmount` holds on every returned
 *   line — both figures are parent-visible.
 * - A `MANUAL` line may end up negative (a standalone discount line is only
 *   meaningful as a negative).
 * - A `BASE` / `ADJUSTMENT` / `EDITED` line may NOT go negative — a fee
 *   component cannot cost less than nothing. Rejected, not clamped: the
 *   admin typed a number and must be told it was refused.
 * - Editing a `BASE` or `ADJUSTMENT` line flips its source to `EDITED`
 *   (an already-`EDITED` line stays `EDITED`). A `MANUAL` line stays
 *   `MANUAL`.
 */
export function resolveLineEdit(input: ResolveLineEditInput): ResolveLineEditResult {
  const amount = round0(input.amount);
  const finalAmount = round0(input.finalAmount);
  const nextSource: LineSource = input.source === "MANUAL" ? "MANUAL" : "EDITED";

  if (nextSource !== "MANUAL" && finalAmount.lessThan(0)) {
    return {
      ok: false,
      error: "Jumlah akhir tidak boleh negatif untuk komponen biaya",
    };
  }

  const adjustmentAmount = finalAmount.minus(amount);
  const adjustmentNote = resolveNote(adjustmentAmount, input.note);

  return {
    ok: true,
    adjustmentAmount,
    finalAmount,
    adjustmentNote,
    source: nextSource,
  };
}

export type ManualLineFields = {
  labelSnapshot: string;
  amount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  adjustmentNote: string | null;
  finalAmount: Prisma.Decimal;
  source: "MANUAL";
};

/**
 * Build a new `MANUAL` line's field values from a create payload
 * (`createBillingRunLineSchema` in `lib/validations/billing-run.ts`). Keeps
 * the sign/clamp/note-default decisions in this module rather than in the
 * route, per the T1 task description.
 *
 * - `mode: "CATALOG"` — the line prices a catalog component: `amount` is
 *   the positive magnitude, `adjustmentAmount: 0`, `finalAmount === amount`.
 * - `mode: "DISCOUNT"` — the line IS the credit: `amount: 0`,
 *   `adjustmentAmount: -X`, `finalAmount: -X` (Spec acceptance: "persisted
 *   as amount: 0, adjustmentAmount: −X, finalAmount: −X, source: MANUAL").
 *   `amount` here is the positive magnitude the admin typed (never negative
 *   — the schema already rejects a negative `amount`).
 */
export function buildManualLineFields(input: {
  mode: "CATALOG" | "DISCOUNT";
  label: string;
  amount: Money;
}): ManualLineFields {
  const magnitude = round0(input.amount);

  if (input.mode === "CATALOG") {
    const zero = new Prisma.Decimal(0);
    return {
      labelSnapshot: input.label,
      amount: magnitude,
      adjustmentAmount: zero,
      adjustmentNote: resolveNote(zero, null),
      finalAmount: magnitude,
      source: "MANUAL",
    };
  }

  const adjustmentAmount = magnitude.negated();
  return {
    labelSnapshot: input.label,
    amount: new Prisma.Decimal(0),
    adjustmentAmount,
    adjustmentNote: resolveNote(adjustmentAmount, null),
    finalAmount: adjustmentAmount,
    source: "MANUAL",
  };
}

/**
 * Re-sum a row's `totalDue` from its current lines, clamped at zero
 * (Assumption 2 / Spec acceptance: "BillingRunRow.totalDue is re-summed
 * from the row's lines on every line mutation, clamped at zero" — this
 * deliberately supersedes B1's "applyAdjustments owns totalDue" rule, since
 * once a line is hand-edited the resolver's total is stale by construction).
 */
export function sumRowTotal(lines: Array<{ finalAmount: Money }>): Prisma.Decimal {
  const total = sumDecimals(lines.map((l) => l.finalAmount));
  return total.lessThan(0) ? new Prisma.Decimal(0) : total;
}
