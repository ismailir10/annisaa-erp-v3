import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { buildManualLineFields, resolveLineEdit, sumRowTotal } from "../billing-run-lines";
// Imported from its own module rather than through billing-run-lines' re-export,
// so the test exercises the same Prisma-free entry point the client components use.
import { rowHasKeringanan } from "../billing-run-line-source";

describe("resolveLineEdit", () => {
  it("edits a BASE line's finalAmount up and derives a positive adjustmentAmount", () => {
    const r = resolveLineEdit({ amount: 500_000, source: "BASE", finalAmount: 600_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentAmount.toString()).toBe("100000");
    expect(r.finalAmount.toString()).toBe("600000");
    // Invariant: amount + adjustmentAmount === finalAmount.
    expect(new Prisma.Decimal(500_000).plus(r.adjustmentAmount).toString()).toBe(
      r.finalAmount.toString()
    );
  });

  it("edits a BASE line's finalAmount down and derives a negative adjustmentAmount", () => {
    const r = resolveLineEdit({ amount: 500_000, source: "BASE", finalAmount: 300_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentAmount.toString()).toBe("-200000");
    expect(r.finalAmount.toString()).toBe("300000");
  });

  it("rejects (does not clamp) a BASE line edit that would go negative", () => {
    const r = resolveLineEdit({ amount: 500_000, source: "BASE", finalAmount: -1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThan(0);
  });

  it("rejects a negative edit on an ADJUSTMENT line the same as a BASE line", () => {
    const r = resolveLineEdit({ amount: 100_000, source: "ADJUSTMENT", finalAmount: -50_000 });
    expect(r.ok).toBe(false);
  });

  it("rejects a negative edit on an already-EDITED line", () => {
    const r = resolveLineEdit({ amount: 100_000, source: "EDITED", finalAmount: -1 });
    expect(r.ok).toBe(false);
  });

  it("allows a MANUAL line's finalAmount to go negative, unclamped", () => {
    const r = resolveLineEdit({ amount: 0, source: "MANUAL", finalAmount: -150_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.finalAmount.toString()).toBe("-150000");
    expect(r.adjustmentAmount.toString()).toBe("-150000");
    expect(r.source).toBe("MANUAL");
  });

  it("flips a BASE line's source to EDITED", () => {
    const r = resolveLineEdit({ amount: 100_000, source: "BASE", finalAmount: 90_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("EDITED");
  });

  it("flips an ADJUSTMENT line's source to EDITED", () => {
    const r = resolveLineEdit({ amount: 100_000, source: "ADJUSTMENT", finalAmount: 90_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("EDITED");
  });

  it("keeps a MANUAL line's source as MANUAL after editing", () => {
    const r = resolveLineEdit({ amount: 0, source: "MANUAL", finalAmount: -20_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("MANUAL");
  });

  it("defaults the note to 'Penyesuaian manual' when adjustmentAmount is non-zero and no note is supplied", () => {
    const r = resolveLineEdit({ amount: 500_000, source: "BASE", finalAmount: 450_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentNote).toBe("Penyesuaian manual");
  });

  it("does NOT default the note when adjustmentAmount is zero (finalAmount === amount)", () => {
    const r = resolveLineEdit({
      amount: 500_000,
      source: "BASE",
      finalAmount: 500_000,
      note: "should be ignored",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentAmount.toString()).toBe("0");
    expect(r.adjustmentNote).toBeNull();
  });

  it("clears a supplied note to null when the resulting adjustmentAmount is zero", () => {
    const r = resolveLineEdit({
      amount: 500_000,
      source: "EDITED",
      finalAmount: 500_000,
      note: "old reason",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentNote).toBeNull();
  });

  it("preserves a caller-supplied note when adjustmentAmount is non-zero", () => {
    const r = resolveLineEdit({
      amount: 500_000,
      source: "BASE",
      finalAmount: 400_000,
      note: "Diskon kakak-adik",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentNote).toBe("Diskon kakak-adik");
  });

  it("treats a whitespace-only note as absent and applies the default", () => {
    const r = resolveLineEdit({
      amount: 500_000,
      source: "BASE",
      finalAmount: 400_000,
      note: "   ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustmentNote).toBe("Penyesuaian manual");
  });

  it("holds the invariant amount + adjustmentAmount === finalAmount across a mixed set of edits", () => {
    const cases = [
      { amount: 500_000, source: "BASE" as const, finalAmount: 600_000 },
      { amount: 200_000, source: "ADJUSTMENT" as const, finalAmount: 150_000 },
      { amount: 0, source: "MANUAL" as const, finalAmount: -75_000 },
      { amount: 100_000, source: "EDITED" as const, finalAmount: 100_000 },
    ];

    for (const c of cases) {
      const r = resolveLineEdit(c);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(new Prisma.Decimal(c.amount).plus(r.adjustmentAmount).toString()).toBe(
        r.finalAmount.toString()
      );
    }
  });
});

describe("buildManualLineFields", () => {
  it("builds a CATALOG line with amount === finalAmount and a zero adjustment", () => {
    const f = buildManualLineFields({ mode: "CATALOG", label: "Seragam", amount: 250_000 });
    expect(f.amount.toString()).toBe("250000");
    expect(f.finalAmount.toString()).toBe("250000");
    expect(f.adjustmentAmount.toString()).toBe("0");
    expect(f.adjustmentNote).toBeNull();
    expect(f.source).toBe("MANUAL");
  });

  it("builds a DISCOUNT line with amount: 0 and a negative finalAmount/adjustmentAmount", () => {
    const f = buildManualLineFields({ mode: "DISCOUNT", label: "Potongan yatim", amount: 75_000 });
    expect(f.amount.toString()).toBe("0");
    expect(f.adjustmentAmount.toString()).toBe("-75000");
    expect(f.finalAmount.toString()).toBe("-75000");
    expect(f.source).toBe("MANUAL");
  });

  it("defaults the note on a non-zero DISCOUNT adjustment", () => {
    const f = buildManualLineFields({ mode: "DISCOUNT", label: "Potongan", amount: 50_000 });
    expect(f.adjustmentNote).toBe("Penyesuaian manual");
  });
});

describe("sumRowTotal", () => {
  it("sums finalAmount across lines", () => {
    const total = sumRowTotal([{ finalAmount: 500_000 }, { finalAmount: -100_000 }]);
    expect(total.toString()).toBe("400000");
  });

  it("clamps a row whose lines sum below zero to zero", () => {
    const total = sumRowTotal([{ finalAmount: 200_000 }, { finalAmount: -350_000 }]);
    expect(total.toString()).toBe("0");
  });

  it("returns Decimal(0) for an empty line set", () => {
    const total = sumRowTotal([]);
    expect(total.toString()).toBe("0");
  });

  it("does not clamp a positive total", () => {
    const total = sumRowTotal([{ finalAmount: 100_000 }, { finalAmount: 50_000 }]);
    expect(total.toString()).toBe("150000");
  });
});

// Regression guard for the defect preview-verify caught on PR #495: the
// "Keringanan" badge in step 2 and the "Dengan keringanan" count in step 3
// both tested `adjustmentAmount !== 0`, which a Cycle B2 hand-edit also
// satisfies (Assumption 1 writes the edit's delta into adjustmentAmount).
// A student whose SPP was edited UPWARD was badged as having a fee waiver,
// on the screen the admin approves the billing run from.
describe("rowHasKeringanan", () => {
  it("is true for a BASE line carrying a resolver-applied adjustment", () => {
    expect(rowHasKeringanan([{ adjustmentAmount: -240_000, source: "BASE" }])).toBe(true);
  });

  it("is true for an ADJUSTMENT-source line", () => {
    expect(rowHasKeringanan([{ adjustmentAmount: -50_000, source: "ADJUSTMENT" }])).toBe(true);
  });

  it("is FALSE for a hand-edited line, even though its adjustmentAmount is non-zero", () => {
    expect(rowHasKeringanan([{ adjustmentAmount: 300_000, source: "EDITED" }])).toBe(false);
  });

  it("is FALSE for an ad-hoc MANUAL discount line", () => {
    expect(rowHasKeringanan([{ adjustmentAmount: -250_000, source: "MANUAL" }])).toBe(false);
  });

  it("is false for an unadjusted row", () => {
    expect(
      rowHasKeringanan([
        { adjustmentAmount: 0, source: "BASE" },
        { adjustmentAmount: 0, source: "BASE" },
      ]),
    ).toBe(false);
  });

  it("is true when a keringanan line sits alongside hand-edited ones", () => {
    expect(
      rowHasKeringanan([
        { adjustmentAmount: -240_000, source: "BASE" },
        { adjustmentAmount: 300_000, source: "EDITED" },
        { adjustmentAmount: -250_000, source: "MANUAL" },
      ]),
    ).toBe(true);
  });
});
