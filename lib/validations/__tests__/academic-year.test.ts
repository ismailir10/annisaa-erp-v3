import { describe, expect, it } from "vitest";
import {
  createAcademicYearSchema,
  updateAcademicYearSchema,
} from "../academic-year";

describe("createAcademicYearSchema", () => {
  const valid = {
    name: "2025/2026",
    startDate: "2025-07-01",
    endDate: "2026-06-30",
  };

  it("accepts a valid input without status", () => {
    const r = createAcademicYearSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("trims the name", () => {
    const r = createAcademicYearSchema.safeParse({ ...valid, name: "  2025/2026  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("2025/2026");
  });

  it("rejects an empty name", () => {
    const r = createAcademicYearSchema.safeParse({ ...valid, name: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed startDate", () => {
    const r = createAcademicYearSchema.safeParse({ ...valid, startDate: "01-07-2025" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing endDate", () => {
    const { endDate: _omit, ...noEnd } = valid;
    void _omit;
    const r = createAcademicYearSchema.safeParse(noEnd);
    expect(r.success).toBe(false);
  });

  it("accepts the canonical status values and rejects unknown ones", () => {
    for (const status of ["PLANNING", "ACTIVE", "ARCHIVED"]) {
      expect(createAcademicYearSchema.safeParse({ ...valid, status }).success).toBe(true);
    }
    expect(createAcademicYearSchema.safeParse({ ...valid, status: "DONE" }).success).toBe(false);
  });
});

describe("updateAcademicYearSchema", () => {
  it("accepts a partial update (status only)", () => {
    const r = updateAcademicYearSchema.safeParse({ status: "ACTIVE" });
    expect(r.success).toBe(true);
  });

  it("accepts an empty object (no-op update)", () => {
    expect(updateAcademicYearSchema.safeParse({}).success).toBe(true);
  });

  it("still validates date format when a date is supplied", () => {
    expect(updateAcademicYearSchema.safeParse({ startDate: "bad" }).success).toBe(false);
  });
});
