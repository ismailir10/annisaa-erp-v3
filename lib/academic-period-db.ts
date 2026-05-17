import { prisma } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/academic-period";

/**
 * Look up the active Semester for a tenant and format it as the
 * canonical period string `"Semester ${number} ${academicYear.name}"`.
 *
 * Falls back to `getCurrentPeriod(now)` when no active Semester matches
 * (fresh tenant, between-terms gap, etc.) so callers never see an empty
 * period label.
 *
 * Split out from `lib/academic-period.ts` to keep the pure date helper
 * free of the prisma import — tests + non-DB callers can import the
 * calendar version without resolving `@/lib/db`.
 *
 * Uses `$queryRaw` because the `Semester` table is currently authored
 * via raw migration (not in `prisma/schema.prisma` at the time of
 * writing), so `prisma.semester.findFirst` is not type-available.
 * When the schema catches up, swap for the model client call.
 */
export async function getCurrentPeriodFromDb(
  tenantId: string,
  now: Date = new Date(),
): Promise<string> {
  const ymd = now.toISOString().slice(0, 10);
  const rows = await prisma.$queryRaw<
    Array<{ number: number; academicYearName: string }>
  >`
    SELECT s.number AS number, ay.name AS "academicYearName"
    FROM public."Semester" s
    JOIN public."AcademicYear" ay ON ay.id = s."academicYearId"
    WHERE s."tenantId" = ${tenantId}
      AND s.status = 'ACTIVE'
      AND s."startDate" <= ${ymd}
      AND s."endDate" >= ${ymd}
    ORDER BY s."startDate" DESC
    LIMIT 1
  `;
  const semester = rows[0];
  if (semester) return `Semester ${semester.number} ${semester.academicYearName}`;
  return getCurrentPeriod(now);
}
