import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Audit contract for the shared journal entry writer.
 *
 * The cross-role QA pass on 2026-08-04 found that teacher `entries/batch` and
 * parent `entries/home` upserted with NO `StudentJournalAudit` rows, while
 * admin edits and note creation did — so the admin Audit tab showed later
 * admin corrections but never the original entry, on a record parents read.
 *
 * These pin the three cases the writer must distinguish:
 *   no prior row              → CREATE, beforeJson absent
 *   prior row, value changed  → UPDATE, before/after checked
 *   prior row, value the same → no audit row (a re-save that changed nothing)
 */

type PriorRow = { studentId: string; indicatorId: string; checked: boolean };

const priorRows: PriorRow[] = [];

// Each mock declares its argument type so `.mock.calls[0][0]` stays typed —
// an argless `vi.fn()` infers a zero-length tuple and `tsc --noEmit` (the CI
// typecheck, which covers test files) rejects indexing into it.
type AuditCreateArgs = { data: Record<string, unknown> };
type FindManyArgs = { where: Record<string, unknown> };
type UpsertArgs = { where: Record<string, unknown> };

const tx = {
  studentJournalEntry: {
    findMany: vi.fn(async (_args: FindManyArgs) => priorRows),
    upsert: vi.fn(async ({ where }: UpsertArgs) => ({
      id: `entry-${JSON.stringify(where).length}`,
    })),
  },
  studentJournalAudit: {
    create: vi.fn(async (_args: AuditCreateArgs) => ({ id: "audit-1" })),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  },
}));

import { upsertJournalEntriesWithAudit } from "@/lib/student-journal/entry-writes";

const BASE = {
  tenantId: "t-1",
  actorUserId: "u-teacher",
  date: "2026-08-04",
  scope: "SCHOOL" as const,
  classSectionId: "cs-1",
};

function auditPayloads() {
  return tx.studentJournalAudit.create.mock.calls.map((c) => c[0].data);
}

describe("upsertJournalEntriesWithAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    priorRows.length = 0;
  });

  it("writes a CREATE audit row when no prior entry exists", async () => {
    const saved = await upsertJournalEntriesWithAudit({
      ...BASE,
      entries: [{ studentId: "s-1", indicatorId: "i-1", checked: true }],
    });

    expect(saved).toBe(1);
    const audits = auditPayloads();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      tenantId: "t-1",
      entityType: "ENTRY",
      action: "CREATE",
      afterJson: { checked: true },
      changedByUserId: "u-teacher",
    });
    expect(audits[0].beforeJson).toBeUndefined();
  });

  it("writes an UPDATE audit row carrying before/after when the value flips", async () => {
    priorRows.push({ studentId: "s-1", indicatorId: "i-1", checked: false });

    await upsertJournalEntriesWithAudit({
      ...BASE,
      entries: [{ studentId: "s-1", indicatorId: "i-1", checked: true }],
    });

    const audits = auditPayloads();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "UPDATE",
      beforeJson: { checked: false },
      afterJson: { checked: true },
    });
  });

  it("writes no audit row when the value is unchanged", async () => {
    priorRows.push({ studentId: "s-1", indicatorId: "i-1", checked: true });

    const saved = await upsertJournalEntriesWithAudit({
      ...BASE,
      entries: [{ studentId: "s-1", indicatorId: "i-1", checked: true }],
    });

    // The row is still upserted (recordedByUserId / updatedAt move) — only the
    // audit trail stays quiet.
    expect(saved).toBe(1);
    expect(tx.studentJournalEntry.upsert).toHaveBeenCalledTimes(1);
    expect(tx.studentJournalAudit.create).not.toHaveBeenCalled();
  });

  it("audits each entry independently in a mixed batch", async () => {
    priorRows.push(
      { studentId: "s-1", indicatorId: "i-1", checked: false }, // → UPDATE
      { studentId: "s-2", indicatorId: "i-1", checked: true }, // → unchanged
    );

    const saved = await upsertJournalEntriesWithAudit({
      ...BASE,
      entries: [
        { studentId: "s-1", indicatorId: "i-1", checked: true },
        { studentId: "s-2", indicatorId: "i-1", checked: true },
        { studentId: "s-3", indicatorId: "i-1", checked: true }, // → CREATE
      ],
    });

    expect(saved).toBe(3);
    const actions = auditPayloads().map((a) => a.action);
    expect(actions).toEqual(["UPDATE", "CREATE"]);
  });

  it("short-circuits on an empty batch without opening a transaction", async () => {
    const saved = await upsertJournalEntriesWithAudit({ ...BASE, entries: [] });

    expect(saved).toBe(0);
    expect(tx.studentJournalEntry.upsert).not.toHaveBeenCalled();
    expect(tx.studentJournalAudit.create).not.toHaveBeenCalled();
  });

  it("scopes the prior-state lookup to the tenant, date and scope", async () => {
    await upsertJournalEntriesWithAudit({
      ...BASE,
      scope: "HOME",
      classSectionId: null,
      entries: [{ studentId: "s-1", indicatorId: "i-1", checked: true }],
    });

    const where = tx.studentJournalEntry.findMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({
      tenantId: "t-1",
      date: "2026-08-04",
      scope: "HOME",
    });
  });
});
