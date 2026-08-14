import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  buildBillingRunRows,
  type BuildEnrollment,
  type BuildInput,
  type FeeStructureLine,
} from "../build-billing-run";
import type { AdjustmentInput } from "../apply-adjustments";

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

const YEAR = "ay-2026";
const DUE_DATE = "2026-04-10";

function enrollment(overrides: Partial<BuildEnrollment> = {}): BuildEnrollment {
  return {
    studentId: "student-1",
    studentName: "Budi",
    classLabel: "TKIT A",
    programId: "program-tkit",
    classSectionId: "class-a",
    ...overrides,
  };
}

function feeLine(overrides: Partial<FeeStructureLine> = {}): FeeStructureLine {
  return {
    feeComponentId: "fc-spp",
    label: "SPP Bulanan",
    amount: D("500000"),
    ...overrides,
  };
}

function adjustment(overrides: Partial<AdjustmentInput> = {}): AdjustmentInput {
  return {
    id: "adj-1",
    academicYearId: YEAR,
    feeComponentId: "fc-spp",
    type: "DISCOUNT",
    mode: "PERCENT",
    value: "10",
    reason: "Diskon saudara kandung",
    status: "ACTIVE",
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

/** Defaults every field of BuildInput so each test states only what it varies. */
function build(overrides: Partial<BuildInput> = {}) {
  const defaults: BuildInput = {
    enrollments: [enrollment()],
    scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: [] },
    feesByProgram: new Map([["program-tkit", [feeLine()]]]),
    adjustmentsByStudent: new Map(),
    alreadyInvoicedStudentIds: new Set(),
    parentByStudent: new Map(),
    academicYearId: YEAR,
    dueDate: DUE_DATE,
    ...overrides,
  };
  return buildBillingRunRows(defaults);
}

describe("buildBillingRunRows", () => {
  it("empty enrollments yields an empty result with a zeroed summary", () => {
    const out = build({
      enrollments: [],
      scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: [] },
    });
    expect(out.rows).toEqual([]);
    expect(out.summary).toEqual({
      total: 0,
      pending: 0,
      excluded: 0,
      skippedAlreadyInvoiced: 0,
      skippedNoFeeStructure: 0,
      withAdjustments: 0,
    });
  });

  it("rule 1: a student enrolled in an in-scope class is included", () => {
    const out = build();
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].studentId).toBe("student-1");
    expect(out.rows[0].status).toBe("PENDING");
  });

  it("rule 1: a student not enrolled in any in-scope class and not explicitly included is excluded from the result entirely", () => {
    const out = build({
      enrollments: [enrollment({ classSectionId: "class-z" })],
      scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: [] },
    });
    expect(out.rows).toHaveLength(0);
    expect(out.summary.total).toBe(0);
  });

  it("a student in includeStudentIds who is not in any selected class still gets a row", () => {
    const out = build({
      enrollments: [enrollment({ studentId: "student-2", classSectionId: "class-not-selected" })],
      scope: { classSectionIds: ["class-a"], includeStudentIds: ["student-2"], excludeStudentIds: [] },
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].studentId).toBe("student-2");
    expect(out.rows[0].status).toBe("PENDING");
  });

  it("excludeStudentIds wins over class scope", () => {
    const out = build({
      enrollments: [enrollment()],
      scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: ["student-1"] },
    });
    expect(out.rows).toHaveLength(0);
  });

  it("excludeStudentIds wins over includeStudentIds", () => {
    const out = build({
      enrollments: [enrollment()],
      scope: {
        classSectionIds: [],
        includeStudentIds: ["student-1"],
        excludeStudentIds: ["student-1"],
      },
    });
    expect(out.rows).toHaveLength(0);
  });

  it("rule 2: dedup — a student in two in-scope classes yields exactly one row", () => {
    const out = build({
      enrollments: [
        enrollment({ classSectionId: "class-a" }),
        enrollment({ classSectionId: "class-b" }),
      ],
      scope: { classSectionIds: ["class-a", "class-b"], includeStudentIds: [], excludeStudentIds: [] },
    });
    expect(out.rows).toHaveLength(1);
    expect(out.summary.total).toBe(1);
  });

  it("rule 3: an already-invoiced student is SKIPPED_ALREADY_INVOICED with no lines and zero totalDue", () => {
    const out = build({
      alreadyInvoicedStudentIds: new Set(["student-1"]),
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].status).toBe("SKIPPED_ALREADY_INVOICED");
    expect(out.rows[0].lines).toEqual([]);
    expect(out.rows[0].totalDue.toString()).toBe("0");
    expect(out.summary.skippedAlreadyInvoiced).toBe(1);
    expect(out.summary.pending).toBe(0);
  });

  it("rule 4: a program with no active recurring fee structures is SKIPPED_NO_FEE_STRUCTURE with no lines and zero totalDue", () => {
    const out = build({
      feesByProgram: new Map(),
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].status).toBe("SKIPPED_NO_FEE_STRUCTURE");
    expect(out.rows[0].lines).toEqual([]);
    expect(out.rows[0].totalDue.toString()).toBe("0");
    expect(out.summary.skippedNoFeeStructure).toBe(1);
    expect(out.summary.pending).toBe(0);
  });

  it("rule 5+6: an eligible student gets PENDING lines built by applyAdjustments, totalDue is the resolver's total", () => {
    const out = build({
      feesByProgram: new Map([
        ["program-tkit", [feeLine({ feeComponentId: "fc-spp", amount: D("500000") })]],
      ]),
      adjustmentsByStudent: new Map([
        ["student-1", [adjustment({ mode: "PERCENT", value: "10" })]],
      ]),
    });
    expect(out.rows).toHaveLength(1);
    const row = out.rows[0];
    expect(row.status).toBe("PENDING");
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0].amount.toString()).toBe("500000");
    expect(row.lines[0].adjustmentAmount.toString()).toBe("-50000");
    expect(row.lines[0].finalAmount.toString()).toBe("450000");
    expect(row.lines[0].source).toBe("BASE");
    // totalDue is the resolver's total, not a re-sum done by the builder.
    expect(row.totalDue.toString()).toBe("450000");
  });

  it("rule 5: no adjustments means lines carry the base amount verbatim", () => {
    const out = build();
    const row = out.rows[0];
    expect(row.lines[0].adjustmentAmount.toString()).toBe("0");
    expect(row.lines[0].finalAmount.toString()).toBe(row.lines[0].amount.toString());
    expect(row.totalDue.toString()).toBe("500000");
  });

  it("rule 7: summary.withAdjustments counts only rows where the resolver reported adjustmentApplied", () => {
    const out = build({
      enrollments: [
        enrollment({ studentId: "student-1" }),
        enrollment({ studentId: "student-2" }),
      ],
      scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: [] },
      adjustmentsByStudent: new Map([
        ["student-1", [adjustment({ mode: "PERCENT", value: "10" })]],
        // student-2 has no matching adjustment (different fee component).
        ["student-2", [adjustment({ feeComponentId: "fc-other" })]],
      ]),
    });
    expect(out.rows).toHaveLength(2);
    expect(out.summary.pending).toBe(2);
    expect(out.summary.withAdjustments).toBe(1);
  });

  it("keringanan lands on the right line with the right note", () => {
    const out = build({
      feesByProgram: new Map([
        [
          "program-tkit",
          [
            feeLine({ feeComponentId: "fc-spp", label: "SPP Bulanan", amount: D("500000") }),
            feeLine({ feeComponentId: "fc-uang-pangkal", label: "Uang Pangkal", amount: D("1000000") }),
          ],
        ],
      ]),
      adjustmentsByStudent: new Map([
        [
          "student-1",
          [adjustment({ feeComponentId: "fc-spp", mode: "FIXED", value: "50000", reason: "Diskon guru" })],
        ],
      ]),
    });
    const row = out.rows[0];
    const spp = row.lines.find((l) => l.feeComponentId === "fc-spp")!;
    const pangkal = row.lines.find((l) => l.feeComponentId === "fc-uang-pangkal")!;
    expect(spp.adjustmentAmount.toString()).toBe("-50000");
    expect(spp.adjustmentNote).toBe("Diskon guru");
    expect(spp.finalAmount.toString()).toBe("450000");
    // The other line is untouched.
    expect(pangkal.adjustmentAmount.toString()).toBe("0");
    expect(pangkal.adjustmentNote).toBeNull();
    expect(pangkal.finalAmount.toString()).toBe("1000000");
    expect(row.totalDue.toString()).toBe("1450000");
  });

  it("parentByStudent and classLabelSnapshot are carried onto the row", () => {
    const out = build({
      parentByStudent: new Map([["student-1", "parent-1"]]),
    });
    expect(out.rows[0].parentId).toBe("parent-1");
    expect(out.rows[0].classLabelSnapshot).toBe("TKIT A");
  });

  it("a student with no parent guardian gets parentId null, not an error", () => {
    const out = build({ parentByStudent: new Map() });
    expect(out.rows[0].parentId).toBeNull();
  });

  it("summary.total counts every row regardless of status", () => {
    const out = build({
      enrollments: [
        enrollment({ studentId: "student-1" }),
        enrollment({ studentId: "student-2" }),
        enrollment({ studentId: "student-3" }),
      ],
      scope: { classSectionIds: ["class-a"], includeStudentIds: [], excludeStudentIds: [] },
      alreadyInvoicedStudentIds: new Set(["student-2"]),
      feesByProgram: new Map(), // forces student-3 (and student-1) to SKIPPED_NO_FEE_STRUCTURE
    });
    expect(out.summary.total).toBe(3);
    expect(out.summary.skippedAlreadyInvoiced).toBe(1);
    expect(out.summary.skippedNoFeeStructure).toBe(2);
    expect(out.summary.pending).toBe(0);
  });
});
