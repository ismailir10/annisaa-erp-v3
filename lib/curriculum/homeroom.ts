import { prisma } from "@/lib/db";

/**
 * Resolve the active homeroom (walas) ClassSection for an employee.
 *
 * A teacher counts as walas of a section iff they have a
 * `TeachingAssignment` with `role = "HOMEROOM"` against an ACTIVE
 * `ClassSection` belonging to the requested tenant + academic year.
 *
 * Returns null when the employee is not a homeroom teacher for any
 * eligible section. Caller short-circuits with 404 in that case — see
 * `app/api/teacher/assessment-entries/weekly/route.ts`.
 *
 * Pure read; never throws on "not found".
 */
export async function getHomeroomClassSection(
  tenantId: string,
  employeeId: string,
  academicYearId: string,
): Promise<{
  id: string;
  name: string;
  ageGroup: "A" | "B";
  programId: string;
  campusId: string;
  academicYearId: string;
} | null> {
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employeeId,
      // Defense in depth — caller already trusts session.tenantId from the
      // JWT, but tenant-scoping the employee row too closes a structural
      // gap if a cross-tenant employeeId ever collides (CUIDs make this
      // negligible but the .claude/standards/security.md Rule 3 still asks
      // for it). The classSection clause below is the primary tenant gate.
      employee: { tenantId },
      role: "HOMEROOM",
      classSection: {
        tenantId,
        academicYearId,
        status: "ACTIVE",
      },
    },
    include: {
      classSection: {
        select: {
          id: true,
          name: true,
          ageGroup: true,
          programId: true,
          campusId: true,
          academicYearId: true,
        },
      },
    },
  });
  return assignment?.classSection ?? null;
}
