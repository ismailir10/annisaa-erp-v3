import { describe, it, expect } from "vitest";
import { createAdmissionSchema, updateAdmissionSchema } from "./admission";

const VALID = {
  childName: "Aisyah",
  parentName: "Ibu Fatimah",
};

describe("createAdmissionSchema — optionalEnum on childGender", () => {
  it("accepts an empty-string childGender (form default) and coerces to undefined", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, childGender: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.childGender).toBeUndefined();
  });

  it("accepts null childGender and coerces to undefined", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, childGender: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.childGender).toBeUndefined();
  });

  it("accepts a valid childGender enum value", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, childGender: "P" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.childGender).toBe("P");
  });

  it("rejects an unknown childGender value", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, childGender: "X" });
    expect(result.success).toBe(false);
  });
});

describe("createAdmissionSchema — optionalTrimmed on string fields", () => {
  it("coerces empty parentEmail to undefined (cycle 2026-05-11 regression)", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, parentEmail: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parentEmail).toBeUndefined();
  });

  it("rejects malformed parentEmail", () => {
    const result = createAdmissionSchema.safeParse({ ...VALID, parentEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("strips whitespace on optional strings", () => {
    const result = createAdmissionSchema.safeParse({
      ...VALID,
      parentPhone: "  081234567890  ",
      notes: "  hello  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentPhone).toBe("081234567890");
      expect(result.data.notes).toBe("hello");
    }
  });
});

describe("updateAdmissionSchema — partial + status enum", () => {
  it("accepts empty-string childGender on partial update", () => {
    const result = updateAdmissionSchema.safeParse({ childGender: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.childGender).toBeUndefined();
  });

  it("accepts a valid status transition target", () => {
    const result = updateAdmissionSchema.safeParse({ status: "VISIT_SCHEDULED" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("VISIT_SCHEDULED");
  });

  it("rejects an unknown status", () => {
    const result = updateAdmissionSchema.safeParse({ status: "BOGUS" });
    expect(result.success).toBe(false);
  });

  it("accepts a fully blank payload (every field optional)", () => {
    const result = updateAdmissionSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
