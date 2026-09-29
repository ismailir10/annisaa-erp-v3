import { describe, it, expect } from "vitest";
import { GuardianPrimaryError, pickReplacementPrimary } from "../primary";

describe("pickReplacementPrimary (CORE-4)", () => {
  const cands = [
    { id: "c", relationship: "WALI" },
    { id: "b", relationship: "IBU" },
    { id: "a", relationship: "OTHER" },
  ];

  it("prefers AYAH, then IBU, then WALI, then OTHER when the admin does not choose", () => {
    expect(pickReplacementPrimary(cands)?.id).toBe("b");
    expect(pickReplacementPrimary([{ id: "x", relationship: "AYAH" }, ...cands])?.id).toBe("x");
  });

  it("honours the admin's choice", () => {
    expect(pickReplacementPrimary(cands, "a")?.id).toBe("a");
  });

  it("refuses a chosen guardian who is not a remaining active guardian", () => {
    expect(() => pickReplacementPrimary(cands, "zzz")).toThrow(GuardianPrimaryError);
  });

  it("returns null when nobody is left", () => {
    expect(pickReplacementPrimary([])).toBeNull();
  });
});
