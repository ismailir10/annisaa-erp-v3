import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { applyAdjustments, type AdjustmentInput, type BaseLine } from "../apply-adjustments";

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

function baseLine(overrides: Partial<BaseLine> = {}): BaseLine {
  return {
    feeComponentId: "fc-spp",
    labelSnapshot: "SPP Bulanan",
    amount: D("500000"),
    ...overrides,
  };
}

const YEAR = "ay-2026";

function adjustment(overrides: Partial<AdjustmentInput> = {}): AdjustmentInput {
  return {
    id: "adj-1",
    academicYearId: YEAR,
    feeComponentId: "fc-spp",
    type: "DISCOUNT",
    mode: "PERCENT",
    value: "10",
    reason: "Diskon saudara kandung",
    status: "ACTIVE",
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

/** Defaults the run's academic year so each test states only what it varies. */
function run(args: {
  baseLines: BaseLine[];
  adjustments: AdjustmentInput[];
  dueDate: string;
  academicYearId?: string;
}) {
  return applyAdjustments({ academicYearId: YEAR, ...args });
}

describe("applyAdjustments", () => {
  it("empty adjustments list is byte-identical to base lines, adjustmentApplied false", () => {
    const lines = [baseLine(), baseLine({ feeComponentId: "fc-uang-pangkal", amount: D("1000000") })];
    const out = run({ baseLines: lines, adjustments: [], dueDate: "2026-08-13" });

    expect(out.adjustmentApplied).toBe(false);
    expect(out.lines).toHaveLength(2);
    for (let i = 0; i < lines.length; i++) {
      expect(out.lines[i].feeComponentId).toBe(lines[i].feeComponentId);
      expect(out.lines[i].labelSnapshot).toBe(lines[i].labelSnapshot);
      expect(out.lines[i].amount.toString()).toBe(lines[i].amount.toString());
      expect(out.lines[i].finalAmount.toString()).toBe(lines[i].amount.toString());
      expect(out.lines[i].adjustmentAmount.toString()).toBe("0");
      expect(out.lines[i].adjustmentNote).toBeNull();
    }
    expect(out.totalDue.toString()).toBe(sum(lines.map((l) => l.amount)));
  });

  it("PERCENT discount reduces the line by the base-amount percentage", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ mode: "PERCENT", type: "DISCOUNT", value: "10", reason: "Diskon 10%" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentAmount.toString()).toBe("-50000");
    expect(out.lines[0].finalAmount.toString()).toBe("450000");
    expect(out.lines[0].adjustmentNote).toBe("Diskon 10%");
    expect(out.adjustmentApplied).toBe(true);
    expect(out.totalDue.toString()).toBe("450000");
  });

  it("FIXED discount subtracts a flat rupiah amount", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ mode: "FIXED", type: "DISCOUNT", value: "75000", reason: "Potongan tetap" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentAmount.toString()).toBe("-75000");
    expect(out.lines[0].finalAmount.toString()).toBe("425000");
  });

  it("SURCHARGE PERCENT adds to the line", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ mode: "PERCENT", type: "SURCHARGE", value: "5", reason: "Denda keterlambatan" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentAmount.toString()).toBe("25000");
    expect(out.lines[0].finalAmount.toString()).toBe("525000");
  });

  it("SURCHARGE FIXED adds a flat rupiah amount", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ mode: "FIXED", type: "SURCHARGE", value: "20000", reason: "Biaya tambahan" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentAmount.toString()).toBe("20000");
    expect(out.lines[0].finalAmount.toString()).toBe("520000");
  });

  it("two adjustments on one component are order-independent (amounts equal both orderings)", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const a = adjustment({ id: "a", mode: "PERCENT", type: "DISCOUNT", value: "10", reason: "Diskon saudara" });
    const b = adjustment({ id: "b", mode: "PERCENT", type: "SURCHARGE", value: "5", reason: "Denda" });

    // PERCENT must be computed against the BASE amount both times, so
    // applying [a, b] or [b, a] must produce identical resolved amounts,
    // NOT a compounded result (-10% then +5% of 450000 would differ from
    // +5% then -10% of 525000 if percentages compounded).
    const forward = run({ baseLines: lines, adjustments: [a, b], dueDate: "2026-08-13" });
    const reversed = run({ baseLines: lines, adjustments: [b, a], dueDate: "2026-08-13" });

    // -50000 (10% of 500000) + 25000 (5% of 500000) = -25000
    expect(forward.lines[0].adjustmentAmount.toString()).toBe("-25000");
    expect(forward.lines[0].finalAmount.toString()).toBe("475000");

    expect(reversed.lines[0].adjustmentAmount.toString()).toBe(forward.lines[0].adjustmentAmount.toString());
    expect(reversed.lines[0].finalAmount.toString()).toBe(forward.lines[0].finalAmount.toString());
    expect(reversed.totalDue.toString()).toBe(forward.totalDue.toString());
  });

  it("multiple reasons on one line join with ' · ' in input order", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const a = adjustment({ id: "a", reason: "Diskon saudara" });
    const b = adjustment({ id: "b", type: "SURCHARGE", reason: "Denda keterlambatan" });
    const out = run({ baseLines: lines, adjustments: [a, b], dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentNote).toBe("Diskon saudara · Denda keterlambatan");
  });

  it("clamps finalAmount at 0 when a discount exceeds the line amount", () => {
    const lines = [baseLine({ amount: D("100000") })];
    const adj = adjustment({ mode: "FIXED", type: "DISCOUNT", value: "150000", reason: "Beasiswa penuh" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    // The over-discount is clamped on BOTH figures, not just finalAmount, so
    // the line still adds up for a parent reading the invoice.
    expect(out.lines[0].adjustmentAmount.toString()).toBe("-100000");
    expect(out.lines[0].finalAmount.toString()).toBe("0");
    expect(out.totalDue.toString()).toBe("0");
  });

  it("ignores an adjustment granted for a different academic year", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ academicYearId: "ay-2025", value: "50", reason: "Beasiswa tahun lalu" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.adjustmentApplied).toBe(false);
    expect(out.lines[0].adjustmentAmount.toString()).toBe("0");
    expect(out.lines[0].adjustmentNote).toBeNull();
    expect(out.totalDue.toString()).toBe("500000");
  });

  it("ignores a deactivated adjustment", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adj = adjustment({ status: "INACTIVE", value: "50", reason: "Keringanan dicabut" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.adjustmentApplied).toBe(false);
    expect(out.lines[0].finalAmount.toString()).toBe("500000");
  });

  it("applies only the eligible member of a mixed batch", () => {
    const lines = [baseLine({ amount: D("500000") })];
    const adjustments = [
      adjustment({ id: "stale", academicYearId: "ay-2025", value: "50" }),
      adjustment({ id: "off", status: "INACTIVE", value: "50" }),
      adjustment({ id: "live", value: "10", reason: "Diskon saudara kandung" }),
    ];
    const out = run({ baseLines: lines, adjustments, dueDate: "2026-08-13" });

    expect(out.lines[0].adjustmentAmount.toString()).toBe("-50000");
    expect(out.lines[0].adjustmentNote).toBe("Diskon saudara kandung");
  });

  it("keeps amount + adjustmentAmount === finalAmount on every line", () => {
    const lines = [
      baseLine({ feeComponentId: "fc-a", amount: D("500000") }),
      baseLine({ feeComponentId: "fc-b", amount: D("75000") }),
      baseLine({ feeComponentId: "fc-c", amount: D("120000") }),
    ];
    const adjustments = [
      adjustment({ id: "a", feeComponentId: "fc-a", mode: "PERCENT", type: "DISCOUNT", value: "33" }),
      adjustment({ id: "b", feeComponentId: "fc-b", mode: "FIXED", type: "DISCOUNT", value: "999999" }),
      adjustment({ id: "c", feeComponentId: "fc-c", mode: "PERCENT", type: "SURCHARGE", value: "10" }),
    ];
    const out = run({ baseLines: lines, adjustments, dueDate: "2026-08-13" });

    for (const line of out.lines) {
      expect(line.amount.plus(line.adjustmentAmount).toString()).toBe(line.finalAmount.toString());
    }
  });

  it("clamps totalDue at 0 across multiple over-discounted lines", () => {
    const lines = [
      baseLine({ feeComponentId: "fc-a", amount: D("50000") }),
      baseLine({ feeComponentId: "fc-b", amount: D("50000") }),
    ];
    const adjustments = [
      adjustment({ id: "a", feeComponentId: "fc-a", mode: "FIXED", type: "DISCOUNT", value: "80000" }),
      adjustment({ id: "b", feeComponentId: "fc-b", mode: "FIXED", type: "DISCOUNT", value: "80000" }),
    ];
    const out = run({ baseLines: lines, adjustments, dueDate: "2026-08-13" });

    expect(out.lines[0].finalAmount.toString()).toBe("0");
    expect(out.lines[1].finalAmount.toString()).toBe("0");
    expect(out.totalDue.toString()).toBe("0");
  });

  it("ignores an adjustment for a component the student has no base line for (phantom guard)", () => {
    const lines = [baseLine({ feeComponentId: "fc-spp", amount: D("500000") })];
    const adj = adjustment({ feeComponentId: "fc-does-not-exist" });
    const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });

    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].adjustmentAmount.toString()).toBe("0");
    expect(out.lines[0].adjustmentNote).toBeNull();
    expect(out.adjustmentApplied).toBe(false);
  });

  describe("validity window vs dueDate", () => {
    it("applies when dueDate is inside [validFrom, validTo]", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: "2026-08-01", validTo: "2026-08-31" });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(true);
      expect(out.lines[0].finalAmount.toString()).toBe("450000");
    });

    it("does not apply when dueDate is before validFrom", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: "2026-09-01", validTo: null });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(false);
      expect(out.lines[0].finalAmount.toString()).toBe("500000");
    });

    it("does not apply when dueDate is after validTo", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: null, validTo: "2026-07-31" });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(false);
      expect(out.lines[0].finalAmount.toString()).toBe("500000");
    });

    it("applies when both bounds are null (fully open-ended)", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: null, validTo: null });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(true);
    });

    it("applies with only validFrom set and dueDate on/after it", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: "2026-08-13", validTo: null });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(true);
    });

    it("applies with only validTo set and dueDate on/before it", () => {
      const lines = [baseLine({ amount: D("500000") })];
      const adj = adjustment({ validFrom: null, validTo: "2026-08-13" });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.adjustmentApplied).toBe(true);
    });
  });

  describe("HALF_UP rounding", () => {
    it("rounds 33% of 12345 to 4074 (4073.85 rounds up)", () => {
      const lines = [baseLine({ amount: D("12345") })];
      const adj = adjustment({ mode: "PERCENT", type: "DISCOUNT", value: "33" });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      expect(out.lines[0].adjustmentAmount.toString()).toBe("-4074");
      expect(out.lines[0].finalAmount.toString()).toBe("8271");
    });

    it("rounds a delta landing exactly on .5 up, not to even (1% of 50 = 0.5 -> 1)", () => {
      const lines = [baseLine({ amount: D("50") })];
      const adj = adjustment({ mode: "PERCENT", type: "DISCOUNT", value: "1" });
      const out = run({ baseLines: lines, adjustments: [adj], dueDate: "2026-08-13" });
      // Plain HALF_EVEN would round 0.5 down to 0; HALF_UP must round to 1.
      expect(out.lines[0].adjustmentAmount.toString()).toBe("-1");
      expect(out.lines[0].finalAmount.toString()).toBe("49");
    });
  });
});

function sum(values: Prisma.Decimal[]): string {
  return values.reduce((acc, v) => acc.add(v), D(0)).toString();
}
