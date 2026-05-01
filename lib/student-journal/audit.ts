import { prisma } from "@/lib/db";

/**
 * Snapshot diffing utility for Student Journal audit trail.
 *
 * We store both before and after snapshots in the audit row
 * (StudentJournalAudit.beforeJson / afterJson). This helper simply
 * returns both sides so callers have a consistent shape to pass to Prisma.
 */
export function diffJson(
  before: unknown,
  after: unknown,
): { before: unknown; after: unknown } {
  return { before, after };
}

export type LastAdminEdit = { changedAt: Date; changedByName: string } | null;

/**
 * Resolves the most-recent admin override (if any) for each given entry id.
 * Implementation contract: exactly two Prisma queries (audit findMany + user findMany).
 * Used by week endpoints to surface a "Diedit admin" badge to teachers and parents.
 *
 * Returns a Map<entryId, LastAdminEdit>. Entries with no admin override are absent
 * from the map; callers should default to null.
 *
 * Caveat: if changedByUserId no longer holds an admin role at read-time
 * (e.g. demoted to TEACHER after the edit), the audit row is excluded and the
 * badge disappears. This is intentional — we filter on current role, not the
 * role-at-edit-time. To preserve historical badges across role changes, add a
 * `changedByRole` column to StudentJournalAudit and write it at edit time.
 */
export async function resolveLastAdminEditByEntryId(
  tenantId: string,
  entryIds: string[],
): Promise<Map<string, NonNullable<LastAdminEdit>>> {
  const result = new Map<string, NonNullable<LastAdminEdit>>();
  if (entryIds.length === 0) return result;

  const audits = await prisma.studentJournalAudit.findMany({
    where: {
      tenantId,
      entityType: "ENTRY",
      action: "UPDATE",
      entityId: { in: entryIds },
    },
    orderBy: { changedAt: "desc" },
    select: { entityId: true, changedAt: true, changedByUserId: true },
  });
  if (audits.length === 0) return result;

  const distinctChangerIds = [...new Set(audits.map((a) => a.changedByUserId))];
  const adminUsers = await prisma.user.findMany({
    where: {
      id: { in: distinctChangerIds },
      role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] },
    },
    select: { id: true, name: true },
  });
  const adminMap = new Map(adminUsers.map((u) => [u.id, u.name ?? "Admin"]));

  // Audits already sorted desc by changedAt; first hit per entryId wins.
  for (const a of audits) {
    if (result.has(a.entityId)) continue;
    const adminName = adminMap.get(a.changedByUserId);
    if (!adminName) continue;
    result.set(a.entityId, { changedAt: a.changedAt, changedByName: adminName });
  }
  return result;
}
