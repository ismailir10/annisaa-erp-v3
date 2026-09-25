import { describe, it, expect } from "vitest";
import { ageParts, formatAgeShort } from "@/lib/student/age";

const REF = new Date(2026, 7, 22); // 22 Aug 2026, local calendar date

describe("ageParts", () => {
  it("counts whole years and the remaining months", () => {
    expect(ageParts("2021-06-12", REF)).toEqual({ years: 5, months: 2 });
  });

  it("does not credit the current month before the day-of-month is reached", () => {
    // birthday on the 23rd, reference is the 22nd → one month short
    expect(ageParts("2021-07-23", REF)).toEqual({ years: 5, months: 0 });
    expect(ageParts("2021-07-22", REF)).toEqual({ years: 5, months: 1 });
  });

  it("handles an under-one child", () => {
    expect(ageParts("2026-01-10", REF)).toEqual({ years: 0, months: 7 });
  });

  it("returns zero on the birthday itself", () => {
    expect(ageParts("2026-08-22", REF)).toEqual({ years: 0, months: 0 });
  });

  it("rejects missing, malformed, and out-of-range dates", () => {
    expect(ageParts(null, REF)).toBeNull();
    expect(ageParts("", REF)).toBeNull();
    expect(ageParts("12 Juni 2021", REF)).toBeNull();
    expect(ageParts("2021-13-01", REF)).toBeNull();
    expect(ageParts("2021-06-00", REF)).toBeNull();
  });

  it("rejects a future date of birth rather than reporting a negative age", () => {
    expect(ageParts("2027-01-01", REF)).toBeNull();
  });
});

describe("formatAgeShort", () => {
  it("always carries the month component for a child over one", () => {
    expect(formatAgeShort("2021-06-12", REF)).toBe("5 thn 2 bln");
  });

  it("drops the year component under one", () => {
    expect(formatAgeShort("2026-01-10", REF)).toBe("7 bln");
  });

  it("returns null when the date is unusable", () => {
    expect(formatAgeShort(null, REF)).toBeNull();
  });
});
