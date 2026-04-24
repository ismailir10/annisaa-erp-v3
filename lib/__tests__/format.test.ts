import { describe, it, expect } from "vitest";
import { formatRupiah } from "@/lib/format";

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
