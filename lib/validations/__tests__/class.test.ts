import { describe, expect, it } from "vitest";
import {
  classCreateSchema,
  classFormSchema,
  classUpdateSchema,
  enrollmentAddSchema,
  teachingAssignmentAddSchema,
} from "../class";

describe("classCreateSchema", () => {
  const valid = {
    campusId: "camp-1",
    programId: "prog-1",
    academicYearId: "year-1",
    name: "TKIT A",
    capacity: 20,
    slotTemplate: "FULL_DAY" as const,
    ageGroup: "A" as const,
  };

  it("accepts a fully populated valid input", () => {
    const r = classCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("defaults slotTemplate to FULL_DAY when omitted", () => {
    const { slotTemplate: _drop, ...rest } = valid;
    const r = classCreateSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slotTemplate).toBe("FULL_DAY");
  });

  it("trims name whitespace", () => {
    const r = classCreateSchema.safeParse({ ...valid, name: "  TKIT A  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("TKIT A");
  });

  it("rejects empty name", () => {
    const r = classCreateSchema.safeParse({ ...valid, name: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects name > 120 chars", () => {
    const r = classCreateSchema.safeParse({ ...valid, name: "a".repeat(121) });
    expect(r.success).toBe(false);
  });

  it("rejects non-integer capacity", () => {
    const r = classCreateSchema.safeParse({ ...valid, capacity: 1.5 });
    expect(r.success).toBe(false);
  });

  it("rejects capacity < 1", () => {
    const r = classCreateSchema.safeParse({ ...valid, capacity: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects capacity > 200", () => {
    const r = classCreateSchema.safeParse({ ...valid, capacity: 201 });
    expect(r.success).toBe(false);
  });

  it("rejects missing campusId/programId/academicYearId", () => {
    expect(
      classCreateSchema.safeParse({ ...valid, campusId: "" }).success,
    ).toBe(false);
    expect(
      classCreateSchema.safeParse({ ...valid, programId: "" }).success,
    ).toBe(false);
    expect(
      classCreateSchema.safeParse({ ...valid, academicYearId: "" }).success,
    ).toBe(false);
  });

  it("requires ageGroup", () => {
    const { ageGroup: _drop, ...rest } = valid;
    expect(classCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects ageGroup outside A/B", () => {
    expect(
      classCreateSchema.safeParse({ ...valid, ageGroup: "C" }).success,
    ).toBe(false);
  });

  it("accepts ageGroup B", () => {
    const r = classCreateSchema.safeParse({ ...valid, ageGroup: "B" });
    expect(r.success).toBe(true);
  });

  it("rejects unknown slotTemplate", () => {
    const r = classCreateSchema.safeParse({
      ...valid,
      slotTemplate: "EVENING" as unknown as "FULL_DAY",
    });
    expect(r.success).toBe(false);
  });
});

describe("classUpdateSchema", () => {
  it("accepts a partial update with one field", () => {
    expect(classUpdateSchema.safeParse({ name: "TKIT B" }).success).toBe(true);
    expect(classUpdateSchema.safeParse({ capacity: 25 }).success).toBe(true);
    expect(
      classUpdateSchema.safeParse({ status: "INACTIVE" }).success,
    ).toBe(true);
  });

  it("accepts an empty body (caller decides what to do)", () => {
    expect(classUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(
      classUpdateSchema.safeParse({
        status: "ARCHIVED" as unknown as "ACTIVE",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid capacity", () => {
    expect(classUpdateSchema.safeParse({ capacity: -1 }).success).toBe(false);
  });
});

describe("classFormSchema", () => {
  const valid = {
    campusId: "camp-1",
    programId: "prog-1",
    name: "TKIT A",
    capacity: 20,
    slotTemplate: "FULL_DAY" as const,
    ageGroup: "A" as const,
  };

  it("has no academicYearId field — the dialog splices it in from the page's year switcher", () => {
    const r = classFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect("academicYearId" in r.data).toBe(false);
  });

  it("coerces a numeric-string capacity from the <Input type='number'>", () => {
    const r = classFormSchema.safeParse({ ...valid, capacity: "25" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.capacity).toBe(25);
  });

  it("rejects an emptied capacity with a 'wajib diisi' message, not a silent coerce to 0", () => {
    const r = classFormSchema.safeParse({ ...valid, capacity: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Kapasitas wajib diisi");
  });

  it("rejects an empty ageGroup with the Indonesian required message, not zod's default", () => {
    const r = classFormSchema.safeParse({ ...valid, ageGroup: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Kelompok usia wajib dipilih");
  });

  it("still requires campusId/programId/name", () => {
    expect(classFormSchema.safeParse({ ...valid, campusId: "" }).success).toBe(false);
    expect(classFormSchema.safeParse({ ...valid, programId: "" }).success).toBe(false);
    expect(classFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
});

describe("enrollmentAddSchema", () => {
  it("accepts a non-empty studentId", () => {
    expect(enrollmentAddSchema.safeParse({ studentId: "s-1" }).success).toBe(
      true,
    );
  });
  it("rejects empty studentId", () => {
    expect(enrollmentAddSchema.safeParse({ studentId: "" }).success).toBe(
      false,
    );
  });
});

describe("teachingAssignmentAddSchema", () => {
  it("accepts HOMEROOM and ASSISTANT roles", () => {
    expect(
      teachingAssignmentAddSchema.safeParse({
        employeeId: "e-1",
        role: "HOMEROOM",
      }).success,
    ).toBe(true);
    expect(
      teachingAssignmentAddSchema.safeParse({
        employeeId: "e-1",
        role: "ASSISTANT",
      }).success,
    ).toBe(true);
  });

  it("defaults role to HOMEROOM when omitted", () => {
    const r = teachingAssignmentAddSchema.safeParse({ employeeId: "e-1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("HOMEROOM");
  });

  it("rejects unknown role", () => {
    expect(
      teachingAssignmentAddSchema.safeParse({
        employeeId: "e-1",
        role: "PRINCIPAL" as unknown as "HOMEROOM",
      }).success,
    ).toBe(false);
  });
});
