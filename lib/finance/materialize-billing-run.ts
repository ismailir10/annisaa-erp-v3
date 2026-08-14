import { Prisma } from "@/lib/generated/prisma/client";
import { buildBillingRunRows, type BuildEnrollment, type BuiltRow, type BuildSummary } from "@/lib/finance/build-billing-run";
import type { AdjustmentInput } from "@/lib/finance/apply-adjustments";

/**
 * Shared draft-materialization path for the Billing Run wizard (Cycle B2 —
 * docs/cycles/2026-08-14-billing-run-wizard-b2.md, Task T2). Extracted
 * verbatim from the read-and-build body of `POST /api/billing-runs` so the
 * rebuild route (Task T4) can call the exact same reads +
 * `buildBillingRunRows()` invocation instead of duplicating them.
 *
 * `db` accepts either the plain `prisma` client or a transaction client —
 * Task T4 calls this from inside a `$transaction`. Typed as
 * `Prisma.TransactionClient` per the convention in
 * lib/finance/invoice-numbers.ts (`reserveInvoiceNumbers`); `prisma` itself
 * is structurally compatible for the read calls made here.
 */

export type MaterializeBillingRunScope = {
  classSectionIds: string[];
  includeStudentIds: string[];
  excludeStudentIds: string[];
};

export type MaterializeBillingRunInput = {
  tenantId: string;
  academicYearId: string;
  /** Must already be trimmed by the caller — the duplicate-invoice query
   * keys off this exact string, matching what the create route does today
   * (`trimmedLabel`). */
  periodLabel: string;
  dueDate: string;
  scope: MaterializeBillingRunScope;
};

export async function materializeBillingRun(
  db: Prisma.TransactionClient,
  input: MaterializeBillingRunInput,
): Promise<{ rows: BuiltRow[]; summary: BuildSummary }> {
  const { tenantId, academicYearId, periodLabel, dueDate, scope } = input;
  const { classSectionIds, includeStudentIds, excludeStudentIds } = scope;

  // Fetch the data buildBillingRunRows needs — same query shapes as
  // app/api/invoices/generate/batch/route.ts, scoped by class-section ∪
  // explicit-include instead of an explicit studentIds list.
  const enrollments = await db.studentEnrollment.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        classSectionIds.length > 0 ? { classSectionId: { in: classSectionIds } } : undefined,
        includeStudentIds.length > 0 ? { studentId: { in: includeStudentIds } } : undefined,
      ].filter(Boolean) as Prisma.StudentEnrollmentWhereInput[],
      classSection: { tenantId },
    },
    select: {
      studentId: true,
      classSectionId: true,
      student: { select: { id: true, name: true } },
      classSection: { select: { name: true, programId: true } },
    },
  });

  const buildEnrollments: BuildEnrollment[] = enrollments.map((e) => ({
    studentId: e.studentId,
    studentName: e.student.name,
    classLabel: e.classSection.name,
    programId: e.classSection.programId,
    classSectionId: e.classSectionId,
  }));

  const candidateStudentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const programIds = [...new Set(enrollments.map((e) => e.classSection.programId))];

  const [feeStructures, existingInvoices, primaryGuardians, candidateAdjustments] = await Promise.all([
    db.programFeeStructure.findMany({
      where: {
        programId: { in: programIds },
        academicYearId,
        feeComponent: { isEnabled: true, isRecurring: true },
      },
      include: { feeComponent: true },
    }),
    db.invoice.findMany({
      where: { tenantId, periodLabel, studentId: { in: candidateStudentIds } },
      select: { studentId: true },
    }),
    db.studentGuardian.findMany({
      where: { studentId: { in: candidateStudentIds }, isPrimary: true },
      select: { studentId: true, parentId: true },
    }),
    // Candidate keringanan grants — narrowed here for efficiency;
    // applyAdjustments() re-checks status/academicYearId/validity itself.
    db.studentFeeAdjustment.findMany({
      where: { tenantId, studentId: { in: candidateStudentIds }, academicYearId, status: "ACTIVE" },
    }),
  ]);

  const feesByProgram = new Map<string, { feeComponentId: string; label: string; amount: Prisma.Decimal }[]>();
  for (const fs of feeStructures) {
    const list = feesByProgram.get(fs.programId) ?? [];
    list.push({ feeComponentId: fs.feeComponentId, label: fs.feeComponent.label, amount: fs.amount });
    feesByProgram.set(fs.programId, list);
  }

  const alreadyInvoicedStudentIds = new Set(existingInvoices.map((i) => i.studentId));
  const parentByStudent = new Map(primaryGuardians.map((g) => [g.studentId, g.parentId]));

  const adjustmentsByStudent = new Map<string, AdjustmentInput[]>();
  for (const adj of candidateAdjustments) {
    const list = adjustmentsByStudent.get(adj.studentId) ?? [];
    list.push({
      id: adj.id,
      academicYearId: adj.academicYearId,
      feeComponentId: adj.feeComponentId,
      type: adj.type as AdjustmentInput["type"],
      mode: adj.mode as AdjustmentInput["mode"],
      value: adj.value,
      reason: adj.reason,
      status: adj.status,
      validFrom: adj.validFrom,
      validTo: adj.validTo,
    });
    adjustmentsByStudent.set(adj.studentId, list);
  }

  return buildBillingRunRows({
    enrollments: buildEnrollments,
    scope: { classSectionIds, includeStudentIds, excludeStudentIds },
    feesByProgram,
    adjustmentsByStudent,
    alreadyInvoicedStudentIds,
    parentByStudent,
    academicYearId,
    dueDate,
  });
}
