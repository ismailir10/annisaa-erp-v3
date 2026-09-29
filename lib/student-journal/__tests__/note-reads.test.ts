import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  studentJournalNoteRead: { findMany: vi.fn(), findUnique: vi.fn() },
  studentJournalNote: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { countUnreadNotes, countUnreadNotesByStudent } from "../note-reads";

beforeEach(() => vi.resetAllMocks());

const d = (iso: string) => new Date(iso);

describe("countUnreadNotesByStudent", () => {
  it("filters guardian authors and tenant, then applies each child's own watermark", async () => {
    const first = d("2026-09-23T00:00:00Z");
    const second = d("2026-09-24T00:00:00Z");
    db.studentJournalNoteRead.findMany.mockResolvedValue([
      { studentId: "a", lastReadAt: first },
      { studentId: "b", lastReadAt: second },
    ]);
    db.studentJournalNote.findMany.mockResolvedValue([
      { studentId: "a", createdAt: second },
      { studentId: "b", createdAt: second },
      { studentId: "b", createdAt: d("2026-09-25T00:00:00Z") },
    ]);

    expect(
      await countUnreadNotesByStudent({
        tenantId: "tenant",
        studentIds: ["a", "b"],
        readerUserId: "teacher",
        authorRole: "GUARDIAN",
      }),
    ).toEqual({ a: 1, b: 1 });
    expect(db.studentJournalNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant",
          authorRole: "GUARDIAN",
          authorUserId: { not: "teacher" },
          OR: [{ studentId: { in: ["a", "b"] }, createdAt: { gt: first } }],
        }),
      }),
    );
  });

  it("counts every note from the other party on a thread with no read row (X-3)", async () => {
    db.studentJournalNoteRead.findMany.mockResolvedValue([]);
    db.studentJournalNote.findMany.mockResolvedValue([
      { studentId: "a", createdAt: d("2026-09-28T01:00:00Z") },
    ]);

    expect(
      await countUnreadNotesByStudent({
        tenantId: "tenant",
        studentIds: ["a"],
        readerUserId: "teacher",
        authorRole: "GUARDIAN",
      }),
    ).toEqual({ a: 1 });
    // No watermark → the query must not carry a createdAt lower bound for it.
    expect(db.studentJournalNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorUserId: { not: "teacher" },
          OR: [{ studentId: { in: ["a"] } }],
        }),
      }),
    );
  });

  it("mixes never-opened and opened threads in one roster", async () => {
    const readAt = d("2026-09-24T00:00:00Z");
    db.studentJournalNoteRead.findMany.mockResolvedValue([{ studentId: "opened", lastReadAt: readAt }]);
    db.studentJournalNote.findMany.mockResolvedValue([
      // never opened: an old note and a new one both count
      { studentId: "fresh", createdAt: d("2026-08-01T00:00:00Z") },
      { studentId: "fresh", createdAt: d("2026-09-28T00:00:00Z") },
      // opened: only the note after the watermark counts
      { studentId: "opened", createdAt: d("2026-09-25T00:00:00Z") },
      { studentId: "opened", createdAt: d("2026-09-24T00:00:00Z") },
    ]);

    expect(
      await countUnreadNotesByStudent({
        tenantId: "tenant",
        studentIds: ["fresh", "opened"],
        readerUserId: "parent",
      }),
    ).toEqual({ fresh: 2, opened: 1 });
    expect(db.studentJournalNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { studentId: { in: ["fresh"] } },
            { studentId: { in: ["opened"] }, createdAt: { gt: readAt } },
          ],
        }),
      }),
    );
  });

  it("returns an empty map without querying for an empty roster", async () => {
    expect(
      await countUnreadNotesByStudent({ tenantId: "tenant", studentIds: [], readerUserId: "teacher" }),
    ).toEqual({});
    expect(db.studentJournalNoteRead.findMany).not.toHaveBeenCalled();
  });
});

describe("countUnreadNotes", () => {
  it("with no read row counts all of the other party's active notes (no createdAt bound)", async () => {
    db.studentJournalNoteRead.findUnique.mockResolvedValue(null);
    db.studentJournalNote.count.mockResolvedValue(3);

    expect(await countUnreadNotes({ tenantId: "t", studentId: "s", readerUserId: "parent" })).toBe(3);
    const where = db.studentJournalNote.count.mock.calls[0]![0].where;
    expect(where).toMatchObject({ tenantId: "t", studentId: "s", authorUserId: { not: "parent" } });
    expect(where).not.toHaveProperty("createdAt");
  });

  it("with a read row only counts notes after the watermark", async () => {
    const readAt = d("2026-09-24T00:00:00Z");
    db.studentJournalNoteRead.findUnique.mockResolvedValue({ lastReadAt: readAt });
    db.studentJournalNote.count.mockResolvedValue(1);

    expect(await countUnreadNotes({ tenantId: "t", studentId: "s", readerUserId: "parent" })).toBe(1);
    expect(db.studentJournalNote.count.mock.calls[0]![0].where).toMatchObject({
      createdAt: { gt: readAt },
    });
  });
});
