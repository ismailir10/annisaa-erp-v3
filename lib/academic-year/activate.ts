import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Allowed `AcademicYear.status` values. The column is a free-form `String`
 * (no DB enum), and activation logic branches on the exact literal "ACTIVE",
 * so routes MUST reject unknown values — a typo'd status would otherwise be
 * persisted verbatim, silently skip sibling-demotion, and could leave a tenant
 * with zero resolvable active year.
 */
export const ACADEMIC_YEAR_STATUSES = ["PLANNING", "ACTIVE", "ARCHIVED"] as const;

export function isAcademicYearStatus(v: unknown): v is (typeof ACADEMIC_YEAR_STATUSES)[number] {
  return typeof v === "string" && (ACADEMIC_YEAR_STATUSES as readonly string[]).includes(v);
}

/**
 * Enforce the single-active-year invariant: a tenant has at most one ACTIVE
 * `AcademicYear` (its current year). Demotes every *other* ACTIVE year for the
 * tenant to PLANNING and returns how many were demoted.
 *
 * Call inside the same `prisma.$transaction(...)` that activates the target
 * year so the flip is atomic. Pass `exceptId` = the year being activated via
 * PUT; omit it on create (the new row is created after this runs, so nothing
 * matches it yet).
 *
 * Background: prior to this, activating a year set `status: "ACTIVE"` without
 * demoting siblings, so multiple years could be ACTIVE at once — breaking
 * "current year" resolution (e.g. /admin/classes defaulted to an arbitrary
 * ACTIVE year). See docs/cycles/2026-06-05-staging-hygiene-active-year.md.
 */
export async function demoteOtherActiveYears(
  tx: Prisma.TransactionClient,
  tenantId: string,
  exceptId?: string,
): Promise<number> {
  const { count } = await tx.academicYear.updateMany({
    where: {
      tenantId,
      status: "ACTIVE",
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { status: "PLANNING" },
  });
  return count;
}
