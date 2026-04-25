import { describe, it, expect } from "vitest";
import { buildInvoicePeriods, computeInvoiceTotal } from "../invoices";

describe("buildInvoicePeriods", () => {
  const periods = buildInvoicePeriods();

  it("produces exactly 10 periods Jul-2025 → Apr-2026", () => {
    expect(periods).toHaveLength(10);
    expect(periods[0].label).toBe("Jul-2025");
    expect(periods[periods.length - 1].label).toBe("Apr-2026");
  });

  it("first 7 are HISTORICAL_PAID, last 3 are LIVE_XENDIT", () => {
    const live = periods.filter((p) => p.mode === "LIVE_XENDIT");
    const paid = periods.filter((p) => p.mode === "HISTORICAL_PAID");
    expect(paid).toHaveLength(7);
    expect(live).toHaveLength(3);
    expect(live.map((p) => p.label)).toEqual([
      "Feb-2026",
      "Mar-2026",
      "Apr-2026",
    ]);
  });

  it("dueDate is the 10th of each month", () => {
    for (const p of periods) {
      expect(p.dueDate.endsWith("-10")).toBe(true);
    }
  });
});

describe("computeInvoiceTotal", () => {
  it("matches the cycle-doc fee table", () => {
    expect(computeInvoiceTotal("DCARE")).toBe(1_700_000);
    expect(computeInvoiceTotal("KB")).toBe(800_000);
    expect(computeInvoiceTotal("TKIT-A")).toBe(975_000);
    expect(computeInvoiceTotal("TKIT-B")).toBe(1_025_000);
  });
});
