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
  programId: string;
  campusId: string;
  academicYearId: string;
} | null> {
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employeeId,
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
          programId: true,
          campusId: true,
          academicYearId: true,
        },
      },
    },
  });
  return assignment?.classSection ?? null;
}
