import { describe, it, expect } from "vitest";
import {
  classTrackCreateSchema,
  classTrackUpdateSchema,
  type ClassTrackCreateInput,
} from "@/lib/validations/class-track";

describe("classTrackCreateSchema", () => {
  const valid: ClassTrackCreateInput = {
    campusId: "campus_1",
    programId: "program_1",
    name: "TKIT A",
  };

  it("accepts a well-formed body", () => {
    expect(classTrackCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("trims whitespace on name", () => {
    const parsed = classTrackCreateSchema.parse({ ...valid, name: "  KB Aster  " });
    expect(parsed.name).toBe("KB Aster");
  });

  it("rejects empty campusId", () => {
    expect(
      classTrackCreateSchema.safeParse({ ...valid, campusId: "" }).success,
    ).toBe(false);
  });

  it("rejects empty programId", () => {
    expect(
      classTrackCreateSchema.safeParse({ ...valid, programId: "" }).success,
    ).toBe(false);
  });

  it("rejects empty name after trim", () => {
    expect(
      classTrackCreateSchema.safeParse({ ...valid, name: "   " }).success,
    ).toBe(false);
  });

  it("rejects name > 120 chars", () => {
    expect(
      classTrackCreateSchema.safeParse({ ...valid, name: "a".repeat(121) })
        .success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(classTrackCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("classTrackUpdateSchema", () => {
  it("accepts a name-only patch", () => {
    expect(
      classTrackUpdateSchema.safeParse({ name: "TKIT B" }).success,
    ).toBe(true);
  });

  it("accepts a status-only deactivate patch", () => {
    expect(
      classTrackUpdateSchema.safeParse({ status: "INACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts a status-only reactivate patch", () => {
    expect(
      classTrackUpdateSchema.safeParse({ status: "ACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts a combined name + status patch", () => {
    expect(
      classTrackUpdateSchema.safeParse({ name: "TKIT B", status: "ACTIVE" })
        .success,
    ).toBe(true);
  });

  it("accepts an empty patch (no-op — route layer rejects)", () => {
    expect(classTrackUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("trims whitespace on name", () => {
    const parsed = classTrackUpdateSchema.parse({ name: "  TKIT B  " });
    expect(parsed.name).toBe("TKIT B");
  });

  it("rejects blank name after trim", () => {
    expect(
      classTrackUpdateSchema.safeParse({ name: "   " }).success,
    ).toBe(false);
  });

  it("rejects name > 120 chars", () => {
    expect(
      classTrackUpdateSchema.safeParse({ name: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("rejects an invalid status enum value", () => {
    expect(
      classTrackUpdateSchema.safeParse({ status: "ARCHIVED" }).success,
    ).toBe(false);
  });

  it("ignores campusId / programId — identity fields are not editable", () => {
    const parsed = classTrackUpdateSchema.parse({
      name: "TKIT B",
      campusId: "campus_2",
      programId: "program_2",
    });
    expect(parsed).toEqual({ name: "TKIT B" });
  });
});
