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
