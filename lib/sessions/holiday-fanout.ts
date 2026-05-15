/**
 * `reconcileSectionsForHoliday` — the holiday-mutation fan-out used by the
 * `config/holidays` routes (cycle 2026-05-15-academic-hierarchy-refactor,
 * Task 4).
 *
 * A holiday create/update/delete changes which calendar days generate
 * ClassSession rows. Rather than reconcile every section in the tenant, this
 * scopes to sections whose academic year has at least one Semester whose date
 * range covers the holiday date — those are the only sections that could
 * possibly gain or lose a session for that day.
 *
 * `allowDestructive: true` is passed so a newly-added full-day holiday removes
 * the now-skipped empty session; reconcile only ever deletes EXPIRED rows with
 * zero attendance, so this is safe.
 *
 * Every query here is tenant-scoped. The per-section reconcile is wrapped in
 * its own try/catch so one bad section cannot abort the rest of the fan-out;
 * failures are counted and returned to the caller. The query-setup work
 * (semester/section lookups) is NOT caught here — the caller still wraps the
 * whole call so the primary holiday mutation returns 2xx.
 */
import { prisma } from "@/lib/db";
import { reconcileSessions } from "@/lib/sessions/reconcile";
import { parseJakartaYmd } from "@/lib/validations/curriculum";

/**
 * Reconcile every ClassSection in any academic year that has a Semester
 * covering `holidayDate` (a YYYY-MM-DD string). Sequential, destructive.
 * Returns the number of sections reconciled and the number that failed (a
 * failed section does not abort the rest of the loop).
 */
export async function reconcileSectionsForHoliday(
  tenantId: string,
  holidayDate: string,
): Promise<{ sectionsReconciled: number; sectionsFailed: number }> {
  // Semester.startDate / endDate are UTC-midnight DateTimes of the Jakarta
  // day; parseJakartaYmd produces the same shape, so a direct gte/lte compare
  // against the holiday date works.
  const dateAsBoundary = parseJakartaYmd(holidayDate);

  const semesters = await prisma.semester.findMany({
    where: {
      tenantId,
      startDate: { lte: dateAsBoundary },
      endDate: { gte: dateAsBoundary },
    },
    select: { academicYearId: true },
  });

  const yearIds = [...new Set(semesters.map((s) => s.academicYearId))];
  if (yearIds.length === 0) {
    return { sectionsReconciled: 0, sectionsFailed: 0 };
  }

  const sections = await prisma.classSection.findMany({
    where: { tenantId, academicYearId: { in: yearIds } },
    select: { id: true },
  });

  let sectionsReconciled = 0;
  let sectionsFailed = 0;
  for (const sec of sections) {
    try {
      await reconcileSessions(sec.id, { allowDestructive: true });
      sectionsReconciled += 1;
    } catch (err) {
      sectionsFailed += 1;
      console.error(
        `[reconcileSectionsForHoliday] reconcileSessions failed for section ${sec.id} (date ${holidayDate}):`,
        err,
      );
    }
  }

  return { sectionsReconciled, sectionsFailed };
}
