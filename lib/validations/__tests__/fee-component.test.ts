import { describe, expect, it } from "vitest";
import {
  createFeeComponentSchema,
  feeComponentFormSchema,
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

describe("feeComponentFormSchema", () => {
  it("parses the dialog's string sortOrder, and its output still passes the POST schema (round trip)", () => {
    const form = feeComponentFormSchema.safeParse({ code: "SPP", label: "SPP", category: "TUITION", isRecurring: true, sortOrder: "3" });
    expect(form.success).toBe(true);
    if (!form.success) return;
    expect(form.data.sortOrder).toBe(3);
    // The dialog POSTs the parsed values; the route re-validates them.
    const wire = createFeeComponentSchema.safeParse(JSON.parse(JSON.stringify(form.data)));
    expect(wire.success).toBe(true);
  });

  it("treats a blank sortOrder as 0", () => {
    const r = feeComponentFormSchema.safeParse({ code: "c", label: "L", sortOrder: "" });
    expect(r.success && r.data.sortOrder).toBe(0);
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
