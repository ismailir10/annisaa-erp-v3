import { Prisma } from "@/lib/generated/prisma/client";
import { applyAdjustments, type AdjustmentInput } from "./apply-adjustments";

/**
 * Pure classifier + materializer for the Billing Run wizard draft (Cycle B1
 * — docs/cycles/2026-08-14-billing-run-wizard.md, Task T3).
 *
 * Given already-fetched data, resolves the in-scope student set, classifies
 * each student into PENDING / already-invoiced / no-fee-structure, and
 * materializes rows + lines through `applyAdjustments` (the Cycle A resolver
 * — reused unchanged, never reimplemented). No Prisma queries happen here —
 * the route (T4) does the querying and passes plain data in, so this stays
 * unit-testable without mocking Prisma. This mirrors, and is intended to
 * eventually replace, the eligibility derivation in
 * `app/api/invoices/generate/batch/route.ts` (dedup-by-studentId, skip
 * reasons, per-program fee lookup) — behaviour matches that route.
 */

export type BuildEnrollment = {
  studentId: string;
  studentName: string;
  classLabel: string | null;
  programId: string;
  classSectionId: string;
};

export type BuildScope = {
  classSectionIds: string[];
  includeStudentIds: string[];
  excludeStudentIds: string[];
};

export type FeeStructureLine = {
  feeComponentId: string;
  label: string;
  amount: Prisma.Decimal;
};

export type BuildInput = {
  enrollments: BuildEnrollment[];
  scope: BuildScope;
  feesByProgram: Map<string, FeeStructureLine[]>;
  adjustmentsByStudent: Map<string, AdjustmentInput[]>;
  alreadyInvoicedStudentIds: Set<string>;
  parentByStudent: Map<string, string | null>;
  academicYearId: string;
  dueDate: string; // YYYY-MM-DD
};

export type BuiltRowStatus =
  | "PENDING"
  | "EXCLUDED"
  | "SKIPPED_ALREADY_INVOICED"
  | "SKIPPED_NO_FEE_STRUCTURE";

export type BuiltLine = {
  feeComponentId: string;
  labelSnapshot: string;
  amount: Prisma.Decimal;
  adjustmentAmount: Prisma.Decimal;
  adjustmentNote: string | null;
  finalAmount: Prisma.Decimal;
  source: "BASE";
};

export type BuiltRow = {
  studentId: string;
  studentNameSnapshot: string;
  classLabelSnapshot: string | null;
  parentId: string | null;
  status: BuiltRowStatus;
  totalDue: Prisma.Decimal;
  lines: BuiltLine[];
};

export type BuildSummary = {
  total: number;
  pending: number;
  excluded: number;
  skippedAlreadyInvoiced: number;
  skippedNoFeeStructure: number;
  withAdjustments: number;
};

export function buildBillingRunRows(input: BuildInput): {
  rows: BuiltRow[];
  summary: BuildSummary;
} {
  const {
    enrollments,
    scope,
    feesByProgram,
    adjustmentsByStudent,
    alreadyInvoicedStudentIds,
    parentByStudent,
    academicYearId,
    dueDate,
  } = input;

  const classSectionSet = new Set(scope.classSectionIds);
  const includeSet = new Set(scope.includeStudentIds);
  const excludeSet = new Set(scope.excludeStudentIds);

  // Resolve in-scope enrollments: class-scope match OR explicit include,
  // minus explicit exclude, deduped by studentId (first in-scope enrollment
  // wins — matches today's batch route's `enrollmentByStudent` dedup so a
  // student in two in-scope classes yields exactly one row). `exclude` is
  // checked per-candidate rather than filtered up front so it always wins
  // regardless of which scope path (class or explicit include) admitted the
  // student.
  const enrollmentByStudent = new Map<string, BuildEnrollment>();
  for (const e of enrollments) {
    if (enrollmentByStudent.has(e.studentId)) continue; // already resolved
    const inScope = classSectionSet.has(e.classSectionId) || includeSet.has(e.studentId);
    if (!inScope) continue;
    if (excludeSet.has(e.studentId)) continue; // exclude wins over class-scope and include
    enrollmentByStudent.set(e.studentId, e);
  }

  const rows: BuiltRow[] = [];
  let pending = 0;
  const excluded = 0; // never set here — draft-time exclusion happens post-creation (T5 PATCH), not at build time.
  let skippedAlreadyInvoiced = 0;
  let skippedNoFeeStructure = 0;
  let withAdjustments = 0;

  for (const enrollment of enrollmentByStudent.values()) {
    const { studentId, studentName, classLabel, programId } = enrollment;
    const parentId = parentByStudent.get(studentId) ?? null;

    if (alreadyInvoicedStudentIds.has(studentId)) {
      skippedAlreadyInvoiced++;
      rows.push({
        studentId,
        studentNameSnapshot: studentName,
        classLabelSnapshot: classLabel,
        parentId,
        status: "SKIPPED_ALREADY_INVOICED",
        totalDue: new Prisma.Decimal(0),
        lines: [],
      });
      continue;
    }

    const programFees = feesByProgram.get(programId) ?? [];
    if (programFees.length === 0) {
      skippedNoFeeStructure++;
      rows.push({
        studentId,
        studentNameSnapshot: studentName,
        classLabelSnapshot: classLabel,
        parentId,
        status: "SKIPPED_NO_FEE_STRUCTURE",
        totalDue: new Prisma.Decimal(0),
        lines: [],
      });
      continue;
    }

    // Do NOT re-sum here — `applyAdjustments` owns totalDue (rule 6: the
    // resolver's total is authoritative, never re-derived).
    const { lines, totalDue, adjustmentApplied } = applyAdjustments({
      baseLines: programFees.map((f) => ({
        feeComponentId: f.feeComponentId,
        labelSnapshot: f.label,
        amount: new Prisma.Decimal(f.amount),
      })),
      adjustments: adjustmentsByStudent.get(studentId) ?? [],
      academicYearId,
      dueDate,
    });

    if (adjustmentApplied) withAdjustments++;
    pending++;

    rows.push({
      studentId,
      studentNameSnapshot: studentName,
      classLabelSnapshot: classLabel,
      parentId,
      status: "PENDING",
      totalDue,
      lines: lines.map((l) => ({ ...l, source: "BASE" as const })),
    });
  }

  return {
    rows,
    summary: {
      total: rows.length,
      pending,
      excluded,
      skippedAlreadyInvoiced,
      skippedNoFeeStructure,
      withAdjustments,
    },
  };
}
