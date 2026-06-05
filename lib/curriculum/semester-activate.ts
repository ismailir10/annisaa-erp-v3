import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Enforce the single-active-semester invariant: an `AcademicYear` has at most
 * one ACTIVE `Semester` (its current term). Demotes every *other* ACTIVE
 * semester in the same year to INACTIVE and returns how many were demoted.
 *
 * Call inside the same `prisma.$transaction(...)` that activates the target
 * semester so the flip is atomic. Pass `exceptId` = the semester being
 * activated via PUT; omit it on create (the new row is created after this runs).
 * Scoped to `academicYearId` (not tenant-wide) — different years can each keep
 * their own current term; the period resolver date-bounds across years. See
 * docs/cycles/2026-06-05-staging-hygiene-active-year.md.
 *
 * `Semester.status` is `ACTIVE | INACTIVE` (default ACTIVE) — schema.prisma.
 */
export async function demoteOtherActiveSemesters(
  tx: Prisma.TransactionClient,
  tenantId: string,
  academicYearId: string,
  exceptId?: string,
): Promise<number> {
  const { count } = await tx.semester.updateMany({
    where: {
      tenantId,
      academicYearId,
      status: "ACTIVE",
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { status: "INACTIVE" },
  });
  return count;
}
