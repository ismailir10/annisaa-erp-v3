import { describe, it, expect } from "vitest";
import { formatRupiah, formatWeekRangeLabel, maskBankAccount } from "@/lib/format";

describe("formatRupiah", () => {
  it("formats integer amount with Indonesian thousand separators", () => {
    expect(formatRupiah(3300000)).toBe("Rp 3.300.000");
  });

  it("coerces numeric strings (Prisma Decimal serialization)", () => {
    expect(formatRupiah("750000")).toBe("Rp 750.000");
  });

  it("rounds fractional amounts", () => {
    expect(formatRupiah(1234.56)).toBe("Rp 1.235");
  });

  it("handles zero", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  it("formats the reported bug case correctly (no string concat)", () => {
    // Reproduces the reported bug: "750000" + "2000000" + "550000" used to produce
    // "7500002000000550000" → "Rp 7.500.002.000.000.550.000". Correct sum is 3,300,000.
    const amounts = ["750000", "2000000", "550000"];
    const total = amounts.reduce<number>((s, v) => s + (Number(v) || 0), 0);
    expect(total).toBe(3_300_000);
    expect(formatRupiah(total)).toBe("Rp 3.300.000");
  });
});

describe("maskBankAccount", () => {
  it("masks all but the last 4 digits", () => {
    expect(maskBankAccount("1234567890")).toBe("******7890");
  });

  it("masks a longer real account number", () => {
    expect(maskBankAccount("0000000001")).toBe("******0001");
  });

  it("fully masks a ≤4-char account (security primitive — never reveal short values)", () => {
    expect(maskBankAccount("1234")).toBe("****");
    expect(maskBankAccount("12")).toBe("**");
    expect(maskBankAccount("1")).toBe("*");
  });

  it("returns an empty string unchanged (caller decides empty-state)", () => {
    expect(maskBankAccount("")).toBe("");
  });
});

describe("numeric reduce defensive pattern", () => {
  it("coerces mixed string+number inputs without concatenating", () => {
    const mixed: Array<string | number> = ["1000", 2000, "3000"];
    const total = mixed.reduce<number>((s, v) => s + (Number(v) || 0), 0);
    expect(total).toBe(6000);
  });

  it("treats invalid values as zero", () => {
    const vals: Array<string | number | undefined> = ["abc", undefined, 500];
    const total = vals.reduce<number>((s, v) => s + (Number(v) || 0), 0);
    expect(total).toBe(500);
  });
});

describe("formatWeekRangeLabel", () => {
  it("prints the year once, at the end of the range", () => {
    // The teacher journal printed "7 Jun – 11 Jun" — the same string in 2025,
    // 2026 and 2027, on a control that let the reader page years away.
    expect(formatWeekRangeLabel("2026-08-24", "2026-08-28")).toBe("24 Agu – 28 Agu 2026");
  });

  it("keeps both month names when a week straddles a month boundary", () => {
    expect(formatWeekRangeLabel("2026-08-31", "2026-09-04")).toBe("31 Agu – 4 Sep 2026");
  });

  it("returns an empty string for an empty range so callers can fall back", () => {
    expect(formatWeekRangeLabel("", "")).toBe("");
  });
});
