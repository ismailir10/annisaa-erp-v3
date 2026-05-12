import { describe, it, expect } from "vitest";
import { mapIncomeFreeText } from "../canonicalize-income";

describe("mapIncomeFreeText", () => {
  it("maps `< Rp 1 Juta` style to LT_1M", () => {
    expect(mapIncomeFreeText("< Rp 1 Juta")).toBe("LT_1M");
    expect(mapIncomeFreeText("< 1jt")).toBe("LT_1M");
    expect(mapIncomeFreeText("< 1.000.000")).toBe("LT_1M");
  });

  it("maps `Rp 1-3 Juta` variants to R_1_3M", () => {
    expect(mapIncomeFreeText("Rp 1 - 3 Juta")).toBe("R_1_3M");
    expect(mapIncomeFreeText("1.000.000 s/d 3.000.000")).toBe("R_1_3M");
    expect(mapIncomeFreeText("1-3jt")).toBe("R_1_3M");
  });

  it("maps `Rp 3-5 Juta` to R_3_5M", () => {
    expect(mapIncomeFreeText("Rp. 3.000.000 s/d Rp. 5.000.000")).toBe("R_3_5M");
    expect(mapIncomeFreeText("3-5 juta")).toBe("R_3_5M");
  });

  it("maps `Rp 5-10 Juta` to R_5_10M", () => {
    expect(mapIncomeFreeText("Rp. 5.000.000 s/d Rp. 10.000.000")).toBe("R_5_10M");
    expect(mapIncomeFreeText("5-10jt")).toBe("R_5_10M");
  });

  it("maps `> Rp 10 Juta` to GT_10M", () => {
    expect(mapIncomeFreeText("> Rp 10 Juta")).toBe("GT_10M");
    expect(mapIncomeFreeText("> 10.000.000")).toBe("GT_10M");
    expect(mapIncomeFreeText("> Rp. 10.000.000")).toBe("GT_10M");
  });

  it("returns null for unmappable input", () => {
    expect(mapIncomeFreeText("")).toBe(null);
    expect(mapIncomeFreeText(null)).toBe(null);
    expect(mapIncomeFreeText("tidak ada penghasilan")).toBe(null);
    expect(mapIncomeFreeText("xyz")).toBe(null);
  });

  it("trims and lowercases before matching", () => {
    expect(mapIncomeFreeText("  RP 1 - 3 JUTA  ")).toBe("R_1_3M");
  });
});
