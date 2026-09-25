import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * The conflicting ACTIVE enrollment returned by `findStreamConflict`, shaped
 * with just enough to let the caller name the class in an error message.
 */
export interface StreamConflict {
  id: string;
  classSectionId: string;
  classSection: { name: string };
}

/**
 * Find an existing ACTIVE enrollment that would collide with a new one under
 * the "one ACTIVE enrollment per Program.type per academic year" rule.
 *
 * Scoped to `academicYearId` — this is the fix for the bug where a stale
 * ACTIVE row in an ARCHIVED prior year blocked all new enrollment. Only
 * ACTIVE rows in the SAME academic year, for the SAME program type, count
 * as a conflict; a SEMESTER + YEAR_ROUND pair in one year is allowed.
 *
 * Must run inside the same transaction as the write that follows it, so
 * `tx` is required (not optional like `lib/audit.ts`'s best-effort `tx`) —
 * the conflict check and the create must see a consistent snapshot.
 */
export async function findStreamConflict(
  tx: Prisma.TransactionClient,
  params: { studentId: string; academicYearId: string; programType: string }
): Promise<StreamConflict | null> {
  const { studentId, academicYearId, programType } = params;

  return tx.studentEnrollment.findFirst({
    where: {
      studentId,
      status: "ACTIVE",
      classSection: {
        academicYearId,
        program: { type: programType },
      },
    },
    select: {
      id: true,
      classSectionId: true,
      classSection: { select: { name: true } },
    },
  });
}

/**
 * Minimal shape `pickPrimaryEnrollment` needs. Deliberately structural (not
 * a Prisma-generated type) so callers can pass richer rows — with extra
 * fields the return type preserves — and so this unit-tests over plain
 * objects with no Prisma mocking.
 */
export interface PrimaryEnrollmentCandidate {
  id: string;
  enrollDate: string; // YYYY-MM-DD
  classSection: { program: { type: string } };
}

/**
 * Pick the "primary" enrollment among a student's ACTIVE enrollments —
 * drives raport, invoice headers, and any UI that can show only one class.
 *
 * Prefers the SEMESTER (sekolah) enrollment. Falls back to the earliest
 * `enrollDate` when there is no SEMESTER row (e.g. a daycare-only infant).
 * Ties break on `id` so the result is deterministic.
 *
 * Pure function over a plain array — no Prisma involved.
 */
export function pickPrimaryEnrollment<T extends PrimaryEnrollmentCandidate>(
  enrollments: readonly T[]
): T | null {
  if (enrollments.length === 0) return null;

  const semesterRows = enrollments.filter(
    (e) => e.classSection.program.type === "SEMESTER"
  );
  const pool = semesterRows.length > 0 ? semesterRows : enrollments;

  return pool.reduce((best, current) => {
    if (current.enrollDate !== best.enrollDate) {
      return current.enrollDate < best.enrollDate ? current : best;
    }
    return current.id < best.id ? current : best;
  });
}
