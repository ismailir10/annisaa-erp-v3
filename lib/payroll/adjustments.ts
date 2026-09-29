import { Prisma } from "@/lib/generated/prisma/client";
import type { PayrollLineResult } from "./engine";

/**
 * A payroll line's manual adjustment as stored on `PayrollItemLine`. Amounts
 * are `Prisma.Decimal` in the database; strings and numbers are accepted so
 * callers (and tests) do not have to build Decimals.
 */
export type ExistingLineAdjustment = {
  componentDefId: string;
  adjustmentAmount: { toString(): string } | number | string;
  adjustmentNote: string | null;
};

export type LineWithAdjustment = {
  componentDefId: string;
  labelSnapshot: string;
  categorySnapshot: "INCOME" | "DEDUCTION";
  calculatedAmount: number;
  adjustmentAmount: Prisma.Decimal;
  adjustmentNote: string | null;
  finalAmount: Prisma.Decimal;
};

export type RecomputedItem = {
  lines: LineWithAdjustment[];
  grossAmount: Prisma.Decimal;
  deductions: Prisma.Decimal;
  netAmount: Prisma.Decimal;
};

/**
 * Re-apply an admin's manual line adjustments onto freshly calculated lines.
 *
 * "Edit Variabel Kehadiran" recalculates every line from the engine, which
 * only knows the *calculated* amount. Rebuilding the lines from that result
 * alone silently dropped each `adjustmentAmount`/`adjustmentNote` the admin had
 * entered (HR-2: +Rp 100.000 on Gaji Pokok came back as Rp 0). The adjustment
 * belongs to the component, not to the calculation, so it is carried across by
 * `componentDefId` and layered on the new calculated amount:
 * `finalAmount = calculatedAmount + adjustmentAmount`. Item totals are then
 * derived from the final amounts, exactly as the line-adjust route does.
 *
 * An adjustment whose component no longer produces a line (component disabled
 * since the run was generated) has nowhere to attach and is not carried.
 */
export function applyLineAdjustments(
  calculated: PayrollLineResult[],
  existing: ExistingLineAdjustment[],
): RecomputedItem {
  const adjustmentByComponent = new Map(existing.map((e) => [e.componentDefId, e]));
  const zero = new Prisma.Decimal(0);

  const lines: LineWithAdjustment[] = calculated.map((line) => {
    const prior = adjustmentByComponent.get(line.componentDefId);
    const adjustmentAmount = prior ? new Prisma.Decimal(prior.adjustmentAmount.toString()) : zero;
    return {
      componentDefId: line.componentDefId,
      labelSnapshot: line.labelSnapshot,
      categorySnapshot: line.categorySnapshot,
      calculatedAmount: line.calculatedAmount,
      adjustmentAmount,
      adjustmentNote: prior?.adjustmentNote ?? null,
      finalAmount: new Prisma.Decimal(line.calculatedAmount).plus(adjustmentAmount),
    };
  });

  const sum = (category: "INCOME" | "DEDUCTION") =>
    lines.filter((l) => l.categorySnapshot === category).reduce((s, l) => s.plus(l.finalAmount), zero);
  const grossAmount = sum("INCOME");
  const deductions = sum("DEDUCTION");

  return { lines, grossAmount, deductions, netAmount: grossAmount.minus(deductions) };
}
