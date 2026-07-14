import { describe, expect, it } from "vitest";
import {
  createFeeComponentSchema,
  updateFeeComponentSchema,
} from "../fee-component";

describe("createFeeComponentSchema", () => {
  it("accepts a minimal valid input and applies defaults", () => {
    const r = createFeeComponentSchema.safeParse({ code: "SPP", label: "SPP Bulanan" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe("spp"); // lowercased
      expect(r.data.category).toBe("TUITION");
      expect(r.data.isRecurring).toBe(true);
      expect(r.data.sortOrder).toBe(0);
    }
  });

  it("rejects an unknown category", () => {
    const r = createFeeComponentSchema.safeParse({ code: "x", label: "X", category: "TUTION" });
    expect(r.success).toBe(false);
  });

  it("accepts every canonical category", () => {
    for (const category of ["TUITION", "REGISTRATION", "ACTIVITY", "MATERIAL", "OTHER"]) {
      expect(createFeeComponentSchema.safeParse({ code: "c", label: "L", category }).success).toBe(true);
    }
  });

  it("rejects empty code or label", () => {
    expect(createFeeComponentSchema.safeParse({ code: "  ", label: "L" }).success).toBe(false);
    expect(createFeeComponentSchema.safeParse({ code: "c", label: "  " }).success).toBe(false);
  });

  it("coerces a string sortOrder to int", () => {
    const r = createFeeComponentSchema.safeParse({ code: "c", label: "L", sortOrder: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sortOrder).toBe(3);
  });
});

describe("updateFeeComponentSchema", () => {
  it("accepts an isEnabled-only toggle body", () => {
    const r = updateFeeComponentSchema.safeParse({ isEnabled: false });
    expect(r.success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(updateFeeComponentSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown category on update", () => {
    expect(updateFeeComponentSchema.safeParse({ category: "BOGUS" }).success).toBe(false);
  });
});
