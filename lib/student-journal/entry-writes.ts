import { prisma } from "@/lib/db";

export type JournalEntryInput = {
  studentId: string;
  indicatorId: string;
  checked: boolean;
};

type UpsertArgs = {
  tenantId: string;
  /** User id written to both `recordedByUserId` and the audit row. */
  actorUserId: string;
  /** Jakarta-tz YYYY-MM-DD, already validated by the caller. */
  date: string;
  scope: "SCHOOL" | "HOME";
  /** Set for SCHOOL writes; null for HOME (parent) writes. */
  classSectionId: string | null;
  entries: JournalEntryInput[];
};

/**
 * Upsert journal entries and write their `StudentJournalAudit` rows in a
 * single transaction.
 *
 * Both write paths — teacher `entries/batch` (SCHOOL) and parent
 * `entries/home` (HOME) — previously upserted with no audit at all, while
 * admin edits and note creation did audit. The admin Audit tab therefore
 * showed later admin corrections but never the original entry, on a record
 * parents can read. Shared here so the two paths cannot drift apart again.
 *
 * Audit semantics:
 * - no prior row              → CREATE (beforeJson null)
 * - prior row, value changed  → UPDATE (before/after checked)
 * - prior row, value the same → no audit row; a re-save that changed nothing
 *   should not pad the trail.
 *
 * Callers MUST have already validated tenant scope, indicator scope and the
 * student's enrolment/guardianship. This helper does no authorisation.
 */
export async function upsertJournalEntriesWithAudit({
  tenantId,
  actorUserId,
  date,
  scope,
  classSectionId,
  entries,
}: UpsertArgs): Promise<number> {
  if (entries.length === 0) return 0;

  const studentIds = [...new Set(entries.map((e) => e.studentId))];
  const indicatorIds = [...new Set(entries.map((e) => e.indicatorId))];
  const keyOf = (studentId: string, indicatorId: string) =>
    `${studentId}:${indicatorId}`;

  return prisma.$transaction(
    async (tx) => {
      const priorRows = await tx.studentJournalEntry.findMany({
        where: {
          tenantId,
          date,
          scope,
          studentId: { in: studentIds },
          indicatorId: { in: indicatorIds },
        },
        select: { studentId: true, indicatorId: true, checked: true },
      });
      const priorChecked = new Map(
        priorRows.map((r) => [keyOf(r.studentId, r.indicatorId), r.checked]),
      );

      let saved = 0;
      for (const entry of entries) {
        const row = await tx.studentJournalEntry.upsert({
          where: {
            studentId_indicatorId_date_scope: {
              studentId: entry.studentId,
              indicatorId: entry.indicatorId,
              date,
              scope,
            },
          },
          update: {
            checked: entry.checked,
            recordedByUserId: actorUserId,
          },
          create: {
            tenantId,
            studentId: entry.studentId,
            classSectionId,
            indicatorId: entry.indicatorId,
            date,
            scope,
            checked: entry.checked,
            recordedByUserId: actorUserId,
          },
          select: { id: true },
        });
        saved += 1;

        const before = priorChecked.get(keyOf(entry.studentId, entry.indicatorId));
        if (before === undefined) {
          await tx.studentJournalAudit.create({
            data: {
              tenantId,
              entityType: "ENTRY",
              entityId: row.id,
              action: "CREATE",
              afterJson: { checked: entry.checked },
              changedByUserId: actorUserId,
            },
          });
        } else if (before !== entry.checked) {
          await tx.studentJournalAudit.create({
            data: {
              tenantId,
              entityType: "ENTRY",
              entityId: row.id,
              action: "UPDATE",
              beforeJson: { checked: before },
              afterJson: { checked: entry.checked },
              changedByUserId: actorUserId,
            },
          });
        }
      }
      return saved;
    },
    // A "tick every indicator" save is bounded by roster × indicators, so the
    // sequential upsert+audit pairs can exceed Prisma's 5 s interactive
    // default on a cold pooler connection.
    { timeout: 20_000 },
  );
}
