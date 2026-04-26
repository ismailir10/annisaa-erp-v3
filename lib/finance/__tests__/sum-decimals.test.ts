import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { sumDecimals } from "../invoice-numbers";

describe("sumDecimals", () => {
  it("returns Decimal(0) on empty input", () => {
    const out = sumDecimals([]);
    expect(out).toBeInstanceOf(Prisma.Decimal);
    expect(out.toString()).toBe("0");
  });

  it("sums string integers exactly", () => {
    const out = sumDecimals(["100", "200", "300"]);
    expect(out.toString()).toBe("600");
  });

  it("avoids IEEE-754 drift: 0.1 + 0.2 = 0.3 exactly", () => {
    const out = sumDecimals([0.1, 0.2]);
    expect(out.toString()).toBe("0.3");
    // Sanity: native floats DO drift here.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("accepts mixed inputs (Decimal, number, string)", () => {
    const out = sumDecimals([new Prisma.Decimal("100.50"), 50, "49.50"]);
    expect(out.toString()).toBe("200");
  });

  it("handles large fee-component sums without precision loss", () => {
    // 12 monthly recurring fees of 2,750,000.55 each
    const fees = Array.from({ length: 12 }, () => "2750000.55");
    const out = sumDecimals(fees);
    expect(out.toString()).toBe("33000006.6");
  });
});
