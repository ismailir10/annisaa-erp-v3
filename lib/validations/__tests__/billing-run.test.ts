import { describe, expect, it } from "vitest";
import {
  cancelBillingRunSchema,
  commitBillingRunSchema,
  createBillingRunSchema,
  updateBillingRunRowSchema,
} from "../billing-run";

const validCreate = {
  periodLabel: "April 2026",
  dueDate: "2026-04-10",
  academicYearId: "year-1",
  classSectionIds: ["class-1"],
  includeStudentIds: [],
  excludeStudentIds: [],
};

describe("createBillingRunSchema", () => {
  it("accepts a valid payload scoped by class", () => {
    const r = createBillingRunSchema.safeParse(validCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.classSectionIds).toEqual(["class-1"]);
    }
  });

  it("accepts a valid payload scoped only by includeStudentIds", () => {
    const r = createBillingRunSchema.safeParse({
      ...validCreate,
      classSectionIds: [],
      includeStudentIds: ["student-1"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty scope (no classSectionIds and no includeStudentIds)", () => {
    const r = createBillingRunSchema.safeParse({
      ...validCreate,
      classSectionIds: [],
      includeStudentIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing periodLabel", () => {
    const r = createBillingRunSchema.safeParse({ ...validCreate, periodLabel: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing academicYearId", () => {
    const r = createBillingRunSchema.safeParse({ ...validCreate, academicYearId: "" });
    expect(r.success).toBe(false);
  });

  it.each(["2026/04/10", "10-04-2026", "2026-4-10", "not-a-date"])(
    "rejects a malformed dueDate %s",
    (dueDate) => {
      const r = createBillingRunSchema.safeParse({ ...validCreate, dueDate });
      expect(r.success).toBe(false);
    }
  );

  it("accepts a payload omitting the optional array fields (defaults to [])", () => {
    const r = createBillingRunSchema.safeParse({
      periodLabel: "April 2026",
      dueDate: "2026-04-10",
      academicYearId: "year-1",
      classSectionIds: ["class-1"],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.includeStudentIds).toEqual([]);
      expect(r.data.excludeStudentIds).toEqual([]);
    }
  });
});

describe("updateBillingRunRowSchema", () => {
  it("accepts PENDING", () => {
    const r = updateBillingRunRowSchema.safeParse({ status: "PENDING" });
    expect(r.success).toBe(true);
  });

  it("accepts EXCLUDED", () => {
    const r = updateBillingRunRowSchema.safeParse({ status: "EXCLUDED" });
    expect(r.success).toBe(true);
  });

  it.each(["SKIPPED_ALREADY_INVOICED", "SKIPPED_NO_FEE_STRUCTURE", "COMMITTED", "FAILED", "BOGUS"])(
    "rejects a status not permitted this cycle: %s",
    (status) => {
      const r = updateBillingRunRowSchema.safeParse({ status });
      expect(r.success).toBe(false);
    }
  );

  it("rejects a missing status", () => {
    const r = updateBillingRunRowSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("commitBillingRunSchema", () => {
  it("accepts a single row id", () => {
    const r = commitBillingRunSchema.safeParse({ rowIds: ["row-1"] });
    expect(r.success).toBe(true);
  });

  it("accepts exactly 25 row ids (cap boundary)", () => {
    const rowIds = Array.from({ length: 25 }, (_, i) => `row-${i}`);
    const r = commitBillingRunSchema.safeParse({ rowIds });
    expect(r.success).toBe(true);
  });

  it("rejects 26 row ids (over the cap)", () => {
    const rowIds = Array.from({ length: 26 }, (_, i) => `row-${i}`);
    const r = commitBillingRunSchema.safeParse({ rowIds });
    expect(r.success).toBe(false);
  });

  it("rejects an empty rowIds array", () => {
    const r = commitBillingRunSchema.safeParse({ rowIds: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a missing rowIds field", () => {
    const r = commitBillingRunSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("cancelBillingRunSchema", () => {
  it("accepts status CANCELLED", () => {
    const r = cancelBillingRunSchema.safeParse({ status: "CANCELLED" });
    expect(r.success).toBe(true);
  });

  it("rejects any other status literal", () => {
    const r = cancelBillingRunSchema.safeParse({ status: "DRAFT" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing status", () => {
    const r = cancelBillingRunSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
