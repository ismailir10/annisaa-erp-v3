import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * backfillSessionTeacher unit tests.
 *
 * Prisma is mocked with an in-memory ClassSession store so the tests verify
 * real behaviour: the future/past cutoff, the substitute-swap guard
 * (teacherId !== defaultTeacherId rows are never touched), and the
 * homeroom-removed → NULL path. `today` is pinned via fake timers so the
 * date cutoff is deterministic.
 */

const h = vi.hoisted(() => {
  type Row = {
    id: string;
    classSectionId: string;
    date: string;
    teacherId: string | null;
    defaultTeacherId: string | null;
  };
  const sessionStore = new Map<string, Row>();

  const state: {
    section: unknown;
    homeroom: unknown;
  } = { section: null, homeroom: null };

  const classSection = {
    findFirst: vi.fn(async () => state.section),
  };

  const teachingAssignment = {
    findFirst: vi.fn(async () => state.homeroom),
  };

  const classSession = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { classSectionId: string; date?: { gte?: string } };
      }) => {
        return [...sessionStore.values()]
          .filter((r) => r.classSectionId === where.classSectionId)
          .filter((r) =>
            where.date?.gte ? r.date >= where.date.gte : true,
          )
          .map((r) => ({
            id: r.id,
            teacherId: r.teacherId,
            defaultTeacherId: r.defaultTeacherId,
          }));
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { teacherId: string | null; defaultTeacherId: string | null };
      }) => {
        let count = 0;
        for (const r of sessionStore.values()) {
          if (where.id.in.includes(r.id)) {
            r.teacherId = data.teacherId;
            r.defaultTeacherId = data.defaultTeacherId;
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  return { sessionStore, state, classSection, teachingAssignment, classSession };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: h.classSection,
    teachingAssignment: h.teachingAssignment,
    classSession: h.classSession,
  },
}));

import { backfillSessionTeacher } from "@/lib/sessions/teacher-backfill";

const SECTION_ID = "cs-1";
const TENANT_ID = "t-1";

function seedRow(
  id: string,
  date: string,
  teacherId: string | null,
  defaultTeacherId: string | null,
) {
  h.sessionStore.set(id, {
    id,
    classSectionId: SECTION_ID,
    date,
    teacherId,
    defaultTeacherId,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sessionStore.clear();
  h.state.section = { id: SECTION_ID, tenantId: TENANT_ID };
  h.state.homeroom = null;
  // Pin "today" to 2026-06-01 (Jakarta). getTodayInTimezone formats new Date()
  // in Asia/Jakarta — fake the system clock so the cutoff is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T05:00:00Z")); // 12:00 Jakarta
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backfillSessionTeacher", () => {
  it("assigns a newly-set homeroom onto future non-substituted rows", async () => {
    h.state.homeroom = { employeeId: "emp-new" };
    seedRow("s1", "2026-06-10", null, null); // future, untouched
    seedRow("s2", "2026-07-01", null, null); // future, untouched

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(2);
    expect(h.sessionStore.get("s1")).toMatchObject({
      teacherId: "emp-new",
      defaultTeacherId: "emp-new",
    });
    expect(h.sessionStore.get("s2")).toMatchObject({
      teacherId: "emp-new",
      defaultTeacherId: "emp-new",
    });
  });

  it("re-points future rows when the homeroom changes", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    // Rows currently snapshot the OLD homeroom (emp-a), not substituted.
    seedRow("s1", "2026-06-10", "emp-a", "emp-a");
    seedRow("s2", "2026-07-01", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(2);
    expect(h.sessionStore.get("s1")).toMatchObject({
      teacherId: "emp-b",
      defaultTeacherId: "emp-b",
    });
  });

  it("NULLs future non-substituted rows when no homeroom exists", async () => {
    h.state.homeroom = null;
    seedRow("s1", "2026-06-10", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(1);
    expect(h.sessionStore.get("s1")).toMatchObject({
      teacherId: null,
      defaultTeacherId: null,
    });
  });

  it("never touches substituted rows (teacherId !== defaultTeacherId)", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    // s1 was substituted: a sub (emp-sub) teaches that day; snapshot is emp-a.
    seedRow("s1", "2026-06-10", "emp-sub", "emp-a");
    // s2 is a normal future row.
    seedRow("s2", "2026-07-01", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(1); // only s2
    // Substituted row left completely untouched — both fields preserved.
    expect(h.sessionStore.get("s1")).toMatchObject({
      teacherId: "emp-sub",
      defaultTeacherId: "emp-a",
    });
    expect(h.sessionStore.get("s2")).toMatchObject({
      teacherId: "emp-b",
      defaultTeacherId: "emp-b",
    });
  });

  it("never touches past sessions (date < today Jakarta)", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    seedRow("past", "2026-05-15", "emp-a", "emp-a"); // before today
    seedRow("future", "2026-06-10", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(1);
    expect(h.sessionStore.get("past")).toMatchObject({
      teacherId: "emp-a",
      defaultTeacherId: "emp-a",
    });
    // The findMany query itself was scoped to date >= today.
    expect(h.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classSectionId: SECTION_ID,
          date: { gte: "2026-06-01" },
        }),
      }),
    );
  });

  it("includes today's sessions (date >= today is inclusive)", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    seedRow("today", "2026-06-01", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(1);
    expect(h.sessionStore.get("today")).toMatchObject({ teacherId: "emp-b" });
  });

  it("returns updated:0 and skips updateMany when there are no future rows", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    seedRow("past", "2026-05-01", "emp-a", "emp-a");

    const res = await backfillSessionTeacher(SECTION_ID, TENANT_ID);

    expect(res.updated).toBe(0);
    expect(h.classSession.updateMany).not.toHaveBeenCalled();
  });

  it("returns updated:0 when the section is not found in the tenant", async () => {
    h.state.section = null;
    const res = await backfillSessionTeacher("missing", TENANT_ID);
    expect(res).toEqual({ updated: 0 });
    expect(h.teachingAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the section lookup to { id, tenantId }", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    await backfillSessionTeacher(SECTION_ID, TENANT_ID);
    expect(h.classSection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SECTION_ID, tenantId: TENANT_ID },
      }),
    );
  });

  it("scopes the homeroom lookup through the section's tenant, oldest HOMEROOM wins", async () => {
    h.state.homeroom = { employeeId: "emp-b" };
    await backfillSessionTeacher(SECTION_ID, TENANT_ID);
    expect(h.teachingAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classSectionId: SECTION_ID,
          role: "HOMEROOM",
          classSection: { tenantId: TENANT_ID },
        }),
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});
