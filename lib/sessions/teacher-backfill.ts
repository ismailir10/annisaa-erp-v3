/**
 * `backfillSessionTeacher` — targeted teacher re-derivation for a section's
 * FUTURE `ClassSession` rows. Unlike `reconcileSessions`, this never inserts or
 * deletes rows; it only re-points the teacher snapshot on already-existing
 * future sessions when the section's HOMEROOM assignment changes.
 *
 * Wired into the `teaching-assignments` mutation routes (cycle
 * 2026-05-15-academic-hierarchy-refactor, Task 4).
 *
 * Substitute-swap rule (the cleaner of the two options in the task brief):
 *   A `ClassSession` whose `teacherId !== defaultTeacherId` has been manually
 *   substituted — the effective teacher was swapped for that one day. We only
 *   ever rewrite rows where `teacherId === defaultTeacherId` (NULL === NULL
 *   counts as equal), updating BOTH fields together. Substituted rows are left
 *   completely untouched: their `teacherId` is the audit record of who actually
 *   taught, and clobbering even the `defaultTeacherId` snapshot would muddy the
 *   "who was the homeroom when this swap happened" history. Keep it simple and
 *   conservative: never touch a substituted row.
 *
 * "Future" means `date >= today` in the Jakarta timezone — past sessions are
 * historical fact and are never rewritten.
 */
import { prisma } from "@/lib/db";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { JAKARTA_TZ } from "@/lib/sessions/dates";

export type BackfillResult = { updated: number };

/**
 * Re-derive the section's current HOMEROOM teacher and push it onto the
 * section's future, non-substituted `ClassSession` rows. If no HOMEROOM
 * assignment exists, future non-substituted rows have both teacher fields
 * NULLed.
 *
 * Tenant scoping: the section is loaded with a `{ id, tenantId }` filter, so a
 * `classSectionId` that does not belong to `tenantId` is treated as not found
 * (no-op `{ updated: 0 }`). The HOMEROOM lookup is further scoped through
 * `classSection.tenantId`. Callers have already authorised the mutation; this
 * is defence in depth.
 *
 * When a data anomaly leaves two HOMEROOM assignments on one section, the
 * oldest (`createdAt asc`) wins — a stable, auditable choice.
 */
export async function backfillSessionTeacher(
  classSectionId: string,
  tenantId: string,
): Promise<BackfillResult> {
  const section = await prisma.classSection.findFirst({
    where: { id: classSectionId, tenantId },
    select: { id: true, tenantId: true },
  });
  if (!section) {
    return { updated: 0 };
  }

  // Resolve the section's current HOMEROOM — same lookup shape reconcile uses.
  const homeroom = await prisma.teachingAssignment.findFirst({
    where: {
      classSectionId,
      role: "HOMEROOM",
      classSection: { tenantId: section.tenantId },
    },
    orderBy: { createdAt: "asc" },
    select: { employeeId: true },
  });
  const homeroomTeacherId = homeroom?.employeeId ?? null;

  const todayYmd = getTodayInTimezone(JAKARTA_TZ);

  // Future, non-substituted rows: teacherId === defaultTeacherId. Prisma can't
  // express "column A equals column B" in a `where`, so load the candidate
  // future rows and filter in memory, then issue a single targeted updateMany.
  const futureRows = await prisma.classSession.findMany({
    where: { classSectionId, date: { gte: todayYmd } },
    select: { id: true, teacherId: true, defaultTeacherId: true },
  });

  const toUpdate = futureRows
    .filter((r) => r.teacherId === r.defaultTeacherId)
    .map((r) => r.id);

  if (toUpdate.length === 0) {
    return { updated: 0 };
  }

  const result = await prisma.classSession.updateMany({
    where: { id: { in: toUpdate } },
    data: { teacherId: homeroomTeacherId, defaultTeacherId: homeroomTeacherId },
  });

  return { updated: result.count };
}
