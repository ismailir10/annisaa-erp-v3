import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * reconcileSessions unit tests.
 *
 * Prisma is fully mocked. The mock models an in-memory `ClassSession` table so
 * the tests verify *real behaviour* — idempotency, additive vs destructive
 * semantics, slot fan-out — not just call counts. `$transaction` runs its
 * callback with a `tx` whose `classSession` mutations go through the same
 * in-memory store, so a second `reconcileSessions` run genuinely sees the rows
 * the first run inserted.
 */

const h = vi.hoisted(() => {
  // In-memory ClassSession store, keyed by `${classSectionId}|${date}|${slot}`.
  type Row = {
    id: string;
    classSectionId: string;
    semesterId: string;
    date: string;
    slot: string;
    teacherId: string | null;
    defaultTeacherId: string | null;
    isBackfilled: boolean;
    attendanceCount: number;
  };
  const sessionStore = new Map<string, Row>();
  let idCounter = 0;

  // Configurable fixtures the tests rewrite per-case.
  const state: {
    section: unknown;
    semesters: unknown[];
    holidays: unknown[];
    homeroom: unknown;
  } = { section: null, semesters: [], holidays: [], homeroom: null };

  const key = (r: { classSectionId: string; date: string; slot: string }) =>
    `${r.classSectionId}|${r.date}|${r.slot}`;

  const classSession = {
    createMany: vi.fn(
      async ({
        data,
        skipDuplicates,
      }: {
        data: Omit<Row, "id" | "attendanceCount">[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const d of data) {
          const k = key(d);
          if (sessionStore.has(k)) {
            if (skipDuplicates) continue;
            throw new Error("unique constraint violation");
          }
          sessionStore.set(k, {
            id: `sess-${++idCounter}`,
            ...d,
            attendanceCount: 0,
          });
          count += 1;
        }
        return { count };
      },
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { classSectionId: string };
      }) => {
        return [...sessionStore.values()]
          .filter((r) => r.classSectionId === where.classSectionId)
          .map((r) => ({
            id: r.id,
            date: r.date,
            slot: r.slot,
            _count: { attendances: r.attendanceCount },
          }));
      },
    ),
    deleteMany: vi.fn(
      async ({ where }: { where: { id: { in: string[] } } }) => {
        let count = 0;
        for (const [k, r] of sessionStore.entries()) {
          if (where.id.in.includes(r.id)) {
            sessionStore.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  const tx = {
    $executeRaw: vi.fn(async () => 1),
    classSession,
  };

  const prisma = {
    classSection: {
      findUnique: vi.fn(async () => state.section),
    },
    semester: {
      findMany: vi.fn(async () => state.semesters),
    },
    holiday: {
      findMany: vi.fn(async () => state.holidays),
    },
    teachingAssignment: {
      findFirst: vi.fn(async () => state.homeroom),
    },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };

  return { prisma, tx, sessionStore, state, key };
});

vi.mock("@/lib/db", () => ({ prisma: h.prisma }));

import { reconcileSessions, SESSION_BATCH_TOO_LARGE } from "@/lib/sessions/reconcile";

// UTC-midnight DateTime for a Jakarta calendar day (Semester-boundary convention).
const utcMidnight = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const WORKING_DAYS_MON_FRI = JSON.stringify(["MON", "TUE", "WED", "THU", "FRI"]);

function setSection(over: Record<string, unknown> = {}) {
  h.state.section = {
    id: "cs1",
    status: "ACTIVE",
    slotTemplate: "FULL_DAY",
    tenantId: "t1",
    academicYearId: "ay1",
    tenant: { orgConfig: { workingDays: WORKING_DAYS_MON_FRI } },
    ...over,
  };
}

function setSemester(startYmd: string, endYmd: string, id = "sem1") {
  h.state.semesters = [
    { id, startDate: utcMidnight(startYmd), endDate: utcMidnight(endYmd) },
  ];
}

/** Seed a pre-existing ClassSession row into the in-memory store. */
function seedSession(
  date: string,
  slot: string,
  opts: { attendanceCount?: number; semesterId?: string } = {},
) {
  const k = `cs1|${date}|${slot}`;
  h.sessionStore.set(k, {
    id: `seed-${k}`,
    classSectionId: "cs1",
    semesterId: opts.semesterId ?? "sem1",
    date,
    slot,
    teacherId: null,
    defaultTeacherId: null,
    isBackfilled: true,
    attendanceCount: opts.attendanceCount ?? 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sessionStore.clear();
  h.state.section = null;
  h.state.semesters = [];
  h.state.holidays = [];
  h.state.homeroom = null;
  // Pin "today" to 2027-01-01 (Jakarta) so `isBackfilled` (date < today) is
  // deterministic. Most fixtures use 2026 dates (→ backfilled); the
  // backfill-specific test below straddles this pinned clock.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reconcileSessions", () => {
  it("reconcile-creates-sessions-for-working-days", async () => {
    // Mon 2026-06-01 .. Sun 2026-06-07 — 5 working days, weekend skipped.
    setSection();
    setSemester("2026-06-01", "2026-06-07");

    const res = await reconcileSessions("cs1");

    expect(res.added).toBe(5);
    const dates = [...h.sessionStore.values()].map((r) => r.date).sort();
    expect(dates).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    // No Saturday (06-06) or Sunday (06-07).
    expect(dates).not.toContain("2026-06-06");
    expect(dates).not.toContain("2026-06-07");
    // All FULL_DAY for the FULL_DAY template.
    expect(
      [...h.sessionStore.values()].every((r) => r.slot === "FULL_DAY"),
    ).toBe(true);
  });

  it("reconcile-skips-holidays", async () => {
    // Wed 2026-06-03 is a full holiday → not generated.
    setSection();
    setSemester("2026-06-01", "2026-06-05");
    h.state.holidays = [
      { date: "2026-06-03", isHalfDay: false },
    ];

    const res = await reconcileSessions("cs1");

    expect(res.added).toBe(4);
    const dates = [...h.sessionStore.values()].map((r) => r.date).sort();
    expect(dates).not.toContain("2026-06-03");
    expect(dates).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-04",
      "2026-06-05",
    ]);
  });

  it("reconcile-half-day-holiday-generates-morning-only", async () => {
    // Wed 2026-06-03 is a half-day holiday → one MORNING session, no FULL_DAY.
    setSection();
    setSemester("2026-06-03", "2026-06-03");
    h.state.holidays = [
      { date: "2026-06-03", isHalfDay: true },
    ];

    const res = await reconcileSessions("cs1");

    expect(res.added).toBe(1);
    const rows = [...h.sessionStore.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-06-03");
    expect(rows[0].slot).toBe("MORNING");
    expect(rows.some((r) => r.slot === "FULL_DAY")).toBe(false);
    expect(rows.some((r) => r.slot === "AFTERNOON")).toBe(false);
  });

  it("reconcile-idempotent", async () => {
    setSection();
    setSemester("2026-06-01", "2026-06-05");

    const first = await reconcileSessions("cs1");
    expect(first.added).toBe(5);

    // Second run sees the rows the first run inserted (shared in-memory store).
    const second = await reconcileSessions("cs1");
    expect(second.added).toBe(0);
    expect(h.sessionStore.size).toBe(5);
  });

  it("reconcile-additive-does-not-delete", async () => {
    // An out-of-range session exists; without allowDestructive it survives.
    setSection();
    setSemester("2026-06-01", "2026-06-05");
    seedSession("2026-05-20", "FULL_DAY"); // outside the semester range

    const res = await reconcileSessions("cs1");

    expect(res.deletedEmpty).toBe(0);
    expect(res.keptNonEmpty).toBe(0);
    // The orphan row is still present alongside the 5 new ones.
    expect(h.sessionStore.has("cs1|2026-05-20|FULL_DAY")).toBe(true);
    expect(h.sessionStore.size).toBe(6);
  });

  it("reconcile-destructive-deletes-empty", async () => {
    // Out-of-range session with NO attendance → deleted under allowDestructive.
    setSection();
    setSemester("2026-06-01", "2026-06-05");
    seedSession("2026-05-20", "FULL_DAY", { attendanceCount: 0 });

    const res = await reconcileSessions("cs1", { allowDestructive: true });

    expect(res.deletedEmpty).toBe(1);
    expect(res.keptNonEmpty).toBe(0);
    expect(h.sessionStore.has("cs1|2026-05-20|FULL_DAY")).toBe(false);
    expect(h.sessionStore.size).toBe(5);
  });

  it("reconcile-destructive-preserves-non-empty", async () => {
    // Out-of-range session WITH attendance → kept, counted in keptNonEmpty.
    setSection();
    setSemester("2026-06-01", "2026-06-05");
    seedSession("2026-05-20", "FULL_DAY", { attendanceCount: 3 });

    const res = await reconcileSessions("cs1", { allowDestructive: true });

    expect(res.deletedEmpty).toBe(0);
    expect(res.keptNonEmpty).toBe(1);
    expect(h.sessionStore.has("cs1|2026-05-20|FULL_DAY")).toBe(true);
    expect(h.sessionStore.size).toBe(6);
  });

  it("reconcile-MORNING_AND_AFTERNOON-fans-out-two-slots", async () => {
    // MORNING_AND_AFTERNOON template → 2 sessions per working day.
    setSection({ slotTemplate: "MORNING_AND_AFTERNOON" });
    setSemester("2026-06-01", "2026-06-02"); // Mon + Tue

    const res = await reconcileSessions("cs1");

    expect(res.added).toBe(4);
    const slots = [...h.sessionStore.values()].map((r) => r.slot).sort();
    expect(slots).toEqual(["AFTERNOON", "AFTERNOON", "MORNING", "MORNING"]);
    // Each working day has exactly one MORNING and one AFTERNOON.
    for (const d of ["2026-06-01", "2026-06-02"]) {
      expect(h.sessionStore.has(`cs1|${d}|MORNING`)).toBe(true);
      expect(h.sessionStore.has(`cs1|${d}|AFTERNOON`)).toBe(true);
    }
  });

  it("reconcile-batch-cap-throws", async () => {
    // A ~70-year semester (every day of the week working) blows past 10000
    // rows → throws session_batch_too_large and inserts nothing.
    setSection({
      tenant: {
        orgConfig: {
          workingDays: JSON.stringify([
            "MON",
            "TUE",
            "WED",
            "THU",
            "FRI",
            "SAT",
            "SUN",
          ]),
        },
      },
    });
    setSemester("2026-01-01", "2096-01-01"); // > 10000 days

    await expect(reconcileSessions("cs1")).rejects.toThrow(
      SESSION_BATCH_TOO_LARGE,
    );
    // Nothing inserted — the cap fires before the transaction.
    expect(h.sessionStore.size).toBe(0);
    expect(h.tx.classSession.createMany).not.toHaveBeenCalled();
  });

  it("reconcile-INACTIVE-section-generates-nothing", async () => {
    setSection({ status: "INACTIVE" });
    setSemester("2026-06-01", "2026-06-05");
    // Pre-existing rows must be left untouched even though the section is
    // inactive — reconcile does not enter the transaction at all.
    seedSession("2026-05-20", "FULL_DAY");

    const res = await reconcileSessions("cs1", { allowDestructive: true });

    expect(res.added).toBe(0);
    expect(res.deletedEmpty).toBe(0);
    expect(h.sessionStore.size).toBe(1); // the seeded row survives
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reconcile-no-semesters-returns-warning", async () => {
    setSection();
    h.state.semesters = []; // academic year with zero Semesters

    const res = await reconcileSessions("cs1");

    expect(res.added).toBe(0);
    expect(res.warnings).toContain("no_semesters_for_year");
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sets teacherId + defaultTeacherId to the HOMEROOM employee when one exists", async () => {
    setSection();
    setSemester("2026-06-01", "2026-06-01");
    h.state.homeroom = { employeeId: "emp-homeroom" };

    await reconcileSessions("cs1");

    const row = h.sessionStore.get("cs1|2026-06-01|FULL_DAY");
    expect(row?.teacherId).toBe("emp-homeroom");
    expect(row?.defaultTeacherId).toBe("emp-homeroom");
  });

  it("marks past-dated sessions isBackfilled and future-dated ones not", async () => {
    // Clock is pinned to 2027-01-01. A semester straddling that date yields
    // both backfilled (before today) and non-backfilled (today/after) rows.
    // 2026-12-30 (Wed) .. 2027-01-04 (Mon): working days Mon-Fri →
    //   2026-12-30 Wed, 2026-12-31 Thu  → past   → isBackfilled true
    //   2027-01-01 Fri, 2027-01-04 Mon  → today+ → isBackfilled false
    setSection();
    setSemester("2026-12-30", "2027-01-04");

    await reconcileSessions("cs1");

    const past = h.sessionStore.get("cs1|2026-12-31|FULL_DAY");
    const future = h.sessionStore.get("cs1|2027-01-04|FULL_DAY");
    expect(past?.isBackfilled).toBe(true);
    expect(future?.isBackfilled).toBe(false);
    // The pinned "today" itself is not before today → not backfilled.
    expect(h.sessionStore.get("cs1|2027-01-01|FULL_DAY")?.isBackfilled).toBe(
      false,
    );
  });

  it("surfaces a warning when workingDays has unrecognized weekday codes", async () => {
    // A typo like "MONDAY" instead of "MON" must not be silently dropped.
    setSection({
      tenant: {
        orgConfig: {
          workingDays: JSON.stringify(["MONDAY", "TUE", "WED", "THU", "FRI"]),
        },
      },
    });
    setSemester("2026-06-01", "2026-06-07");

    const res = await reconcileSessions("cs1");

    expect(res.warnings).toContain("org_config_unknown_weekday_codes:MONDAY");
    // "MONDAY" is unrecognized → Monday is not a working day; only Tue-Fri
    // generate (4 days), Monday 06-01 + the weekend are skipped.
    expect(res.added).toBe(4);
    expect(h.sessionStore.has("cs1|2026-06-01|FULL_DAY")).toBe(false);
  });
});
