import { describe, expect, it } from "vitest";
import { applyLineAdjustments } from "../adjustments";
import type { PayrollLineResult } from "../engine";

const line = (
  componentDefId: string,
  category: "INCOME" | "DEDUCTION",
  amount: number,
): PayrollLineResult => ({
  componentDefId,
  labelSnapshot: componentDefId,
  categorySnapshot: category,
  calculatedAmount: amount,
  finalAmount: amount,
});

describe("applyLineAdjustments (HR-2)", () => {
  it("keeps a manual +100.000 on Gaji Pokok across a recalculation", () => {
    const out = applyLineAdjustments(
      [line("gp", "INCOME", 0), line("bpjs", "DEDUCTION", 50_000)],
      [{ componentDefId: "gp", adjustmentAmount: "100000.00", adjustmentNote: "Koreksi" }],
    );

    const gp = out.lines.find((l) => l.componentDefId === "gp")!;
    expect(gp.adjustmentAmount.toString()).toBe("100000");
    expect(gp.adjustmentNote).toBe("Koreksi");
    expect(gp.finalAmount.toString()).toBe("100000");
    expect(out.grossAmount.toString()).toBe("100000");
    expect(out.deductions.toString()).toBe("50000");
    expect(out.netAmount.toString()).toBe("50000");
  });

  it("layers the adjustment on the NEW calculated amount when attendance changes it", () => {
    const out = applyLineAdjustments(
      [line("outdoor", "INCOME", 200_000)],
      [{ componentDefId: "outdoor", adjustmentAmount: 25_000, adjustmentNote: null }],
    );
    expect(out.lines[0]!.calculatedAmount).toBe(200_000);
    expect(out.lines[0]!.finalAmount.toString()).toBe("225000");
    expect(out.grossAmount.toString()).toBe("225000");
  });

  it("carries negative adjustments on a deduction line", () => {
    const out = applyLineAdjustments(
      [line("gp", "INCOME", 1_000_000), line("pot", "DEDUCTION", 100_000)],
      [{ componentDefId: "pot", adjustmentAmount: "-40000", adjustmentNote: "Ringan" }],
    );
    expect(out.deductions.toString()).toBe("60000");
    expect(out.netAmount.toString()).toBe("940000");
  });

  it("leaves untouched lines at a zero adjustment and matches the engine totals", () => {
    const calculated = [line("gp", "INCOME", 3_000_000), line("pot", "DEDUCTION", 250_000)];
    const out = applyLineAdjustments(calculated, []);
    expect(out.lines.every((l) => l.adjustmentAmount.isZero() && l.adjustmentNote === null)).toBe(true);
    expect(out.grossAmount.toString()).toBe("3000000");
    expect(out.netAmount.toString()).toBe("2750000");
  });

  it("drops an adjustment whose component no longer produces a line", () => {
    const out = applyLineAdjustments(
      [line("gp", "INCOME", 1_000_000)],
      [{ componentDefId: "gone", adjustmentAmount: "500", adjustmentNote: "x" }],
    );
    expect(out.lines).toHaveLength(1);
    expect(out.grossAmount.toString()).toBe("1000000");
  });
});
