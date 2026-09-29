import { describe, it, expect } from "vitest";
import { jakartaMonthRangeUtc } from "../jakarta-month";

describe("jakartaMonthRangeUtc", () => {
  it("mid-month: WIB month boundaries as UTC instants", () => {
    const { start, end } = jakartaMonthRangeUtc(new Date("2026-09-15T05:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("23:30 UTC on the 31st is already the 1st in Jakarta", () => {
    const { start, end } = jakartaMonthRangeUtc(new Date("2026-08-31T23:30:00Z"));
    expect(start.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("December rolls over to January", () => {
    const { start, end } = jakartaMonthRangeUtc(new Date("2026-12-10T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
});
