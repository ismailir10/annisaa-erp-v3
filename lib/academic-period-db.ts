import { prisma } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/academic-period";
import { getYmdInTimezone } from "@/lib/attendance/timezone";
import { JAKARTA_TZ } from "@/lib/sessions/dates";

/**
 * Look up the Semester covering `now` for a tenant and format it as the
 * canonical period string `"Semester ${number} ${academicYear.name}"`.
 *
 * Falls back to `getCurrentPeriod(now)` when nothing matches (fresh tenant,
 * between-terms gap, etc.) so callers never see an empty period label.
 *
 * **Both filters matter.** `Semester.status` defaults to `"ACTIVE"` and
 * `demoteOtherActiveSemesters` only enforces one ACTIVE row *per academic
 * year*, so status alone can match several rows across years — staging has
 * two ACTIVE semesters right now. The date window is what makes the answer
 * single-valued, and it is why this helper exists rather than the calendar
 * heuristic in `getCurrentPeriod` (a tenant whose Semester 1 ran May–Dec
 * breaks the month rule outright).
 *
 * `Semester.startDate`/`endDate` are UTC midnight of the **Jakarta** day, so
 * today is resolved in `Asia/Jakarta` — comparing against a UTC day is off by
 * one for the seven hours after Jakarta midnight, exactly at a term boundary.
 *
 * Split out from `lib/academic-period.ts` to keep the pure date helper free of
 * the prisma import — tests and non-DB callers import the calendar version
 * without resolving `@/lib/db`.
 */
export async function getCurrentPeriodFromDb(
  tenantId: string,
  now: Date = new Date(),
): Promise<string> {
  const today = new Date(`${getYmdInTimezone(now, JAKARTA_TZ)}T00:00:00.000Z`);

  const semester = await prisma.semester.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      startDate: { lte: today },
      endDate: { gte: today },
    },
    orderBy: { startDate: "desc" },
    select: { number: true, academicYear: { select: { name: true } } },
  });

  if (semester) {
    return `Semester ${semester.number} ${semester.academicYear.name}`;
  }
  return getCurrentPeriod(now);
}
