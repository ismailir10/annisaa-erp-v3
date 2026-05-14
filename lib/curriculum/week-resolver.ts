import { prisma } from "@/lib/db";

/**
 * Resolve the curriculum Week containing a given Jakarta-tz date.
 *
 * Storage contract: `Week.startDate` and `Week.endDate` are persisted as
 * UTC-midnight DateTimes representing Jakarta calendar days
 * (see `parseJakartaYmd` in `lib/validations/curriculum.ts`). We compare
 * against `targetUtcMidnight` — the same UTC-midnight projection of the
 * requested date — so the bracket math stays timezone-coherent.
 *
 * Returns the Week + parent SubTheme + Theme + Semester when one is found
 * with `status = ACTIVE`; null otherwise. Caller decides whether the
 * absence of an active week is a 404 (homeroom weekly UI) or a 422
 * (sentra entry on a date outside any active week).
 *
 * Overlap policy: if multiple ACTIVE weeks straddle the same date (data
 * error), `findFirst` returns whichever Postgres yields first ordered by
 * `startDate asc`. C4 does not detect or repair overlaps; the admin
 * curriculum CRUD enforces non-overlap on write.
 */
export async function getCurrentWeek(
  tenantId: string,
  targetUtcMidnight: Date,
): Promise<{
  id: string;
  number: number;
  startDate: Date;
  endDate: Date;
  subTheme: {
    id: string;
    name: string;
    theme: {
      id: string;
      name: string;
      semesterId: string;
    };
  };
} | null> {
  return prisma.week.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      startDate: { lte: targetUtcMidnight },
      endDate: { gte: targetUtcMidnight },
    },
    select: {
      id: true,
      number: true,
      startDate: true,
      endDate: true,
      subTheme: {
        select: {
          id: true,
          name: true,
          theme: {
            select: {
              id: true,
              name: true,
              semesterId: true,
            },
          },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });
}
