import { describe, expect, it } from "vitest";
import {
  ageGroupSchema,
  createClassSectionSchema,
  updateClassSectionSchema,
} from "@/lib/validations/class-section";

describe("ageGroupSchema", () => {
  it("accepts 'A'", () => {
    expect(ageGroupSchema.parse("A")).toBe("A");
  });

  it("accepts 'B'", () => {
    expect(ageGroupSchema.parse("B")).toBe("B");
  });

  it("rejects lowercase 'a'", () => {
    expect(ageGroupSchema.safeParse("a").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(ageGroupSchema.safeParse("").success).toBe(false);
  });

  it("rejects other letters", () => {
    expect(ageGroupSchema.safeParse("C").success).toBe(false);
  });

  it("rejects null", () => {
    expect(ageGroupSchema.safeParse(null).success).toBe(false);
  });
});

describe("createClassSectionSchema", () => {
  const baseValid = {
    programId: "prog_1",
    campusId: "camp_1",
    name: "TKIT A",
    ageGroup: "A" as const,
    capacity: 20,
    academicYearId: "ay_1",
  };

  it("accepts valid payload with ageGroup A", () => {
    expect(createClassSectionSchema.parse(baseValid).ageGroup).toBe("A");
  });

  it("accepts valid payload with ageGroup B", () => {
    expect(
      createClassSectionSchema.parse({ ...baseValid, ageGroup: "B" }).ageGroup,
    ).toBe("B");
  });

  it("rejects missing ageGroup", () => {
    const { ageGroup: _ignored, ...rest } = baseValid;
    void _ignored;
    expect(createClassSectionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects lowercase ageGroup", () => {
    expect(
      createClassSectionSchema.safeParse({ ...baseValid, ageGroup: "a" }).success,
    ).toBe(false);
  });
});

describe("updateClassSectionSchema", () => {
  it("accepts partial update with only ageGroup", () => {
    expect(
      updateClassSectionSchema.parse({ ageGroup: "B" }).ageGroup,
    ).toBe("B");
  });

  it("accepts partial update without ageGroup", () => {
    expect(
      updateClassSectionSchema.parse({ capacity: 25 }).capacity,
    ).toBe(25);
  });

  it("rejects invalid ageGroup on partial update", () => {
    expect(
      updateClassSectionSchema.safeParse({ ageGroup: "C" }).success,
    ).toBe(false);
  });
});
