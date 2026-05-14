import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/db` and `@/lib/sessions/reconcile` are imported by the script at
// module load. Stub both so importing the script in tests doesn't try to
// connect Prisma. The tests inject mock dependencies into `runBackfill`
// directly — these stubs only make the import work.
vi.mock("@/lib/db", () => ({
  prisma: { $disconnect: vi.fn() },
}));

vi.mock("@/lib/sessions/reconcile", () => ({
  reconcileSessions: vi.fn(),
  SESSION_BATCH_TOO_LARGE: "session_batch_too_large",
}));

import {
  parseArgs,
  runBackfill,
  REPOINT_BATCH_SIZE,
  type BackfillArgs,
  type BackfillDeps,
  type SectionRow,
  type SessionRow,
  type AttendanceRow,
} from "../backfill-hierarchy";
import type { ReconcileResult } from "@/lib/sessions/reconcile";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Builders ────────────────────────────────────────────────────────────────

function section(over: Partial<SectionRow> = {}): SectionRow {
  return {
    id: "sec-1",
    tenantId: "tnt-1",
    campusId: "cmp-1",
    programId: "prg-1",
    classTrackId: "trk-1",
    classTrack: { tenantId: "tnt-1", campusId: "cmp-1", programId: "prg-1" },
    ...over,
  };
}

function reconcileOk(over: Partial<ReconcileResult> = {}): ReconcileResult {
  return {
    classSectionId: "sec-1",
    added: 0,
    deletedEmpty: 0,
    keptNonEmpty: 0,
    warnings: [],
    ...over,
  };
}

function makeDeps(over: Partial<BackfillDeps> = {}): BackfillDeps & {
  logs: string[];
} {
  const logs: string[] = [];
  return {
    fetchSections: vi.fn().mockResolvedValue([]),
    sectionsWithoutSemesters: vi.fn().mockResolvedValue([]),
    reconcile: vi.fn().mockResolvedValue(reconcileOk()),
    fetchSessions: vi.fn().mockResolvedValue([]),
    fetchAttendance: vi.fn().mockResolvedValue([]),
    applyRepoints: vi.fn().mockResolvedValue(undefined),
    countAttendance: vi.fn().mockResolvedValue(0),
    log: (msg: string) => logs.push(msg),
    logs,
    ...over,
  };
}

const DRY: BackfillArgs = { tenantId: null, confirm: false };
const LIVE: BackfillArgs = { tenantId: null, confirm: true };

// ── parseArgs ───────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("defaults to dry-run with no flags", () => {
    expect(parseArgs([])).toEqual({ tenantId: null, confirm: false });
  });

  it("parses --confirm", () => {
    expect(parseArgs(["--confirm"])).toEqual({ tenantId: null, confirm: true });
  });

  it("treats --apply as an alias for --confirm", () => {
    expect(parseArgs(["--apply"])).toEqual({ tenantId: null, confirm: true });
  });

  it("parses --tenant", () => {
    expect(parseArgs(["--tenant", "tnt-9"])).toEqual({
      tenantId: "tnt-9",
      confirm: false,
    });
  });

  it("parses --tenant + --confirm together", () => {
    expect(parseArgs(["--tenant", "tnt-9", "--confirm"])).toEqual({
      tenantId: "tnt-9",
      confirm: true,
    });
  });

  it("--dry-run after --confirm wins (last flag)", () => {
    expect(parseArgs(["--confirm", "--dry-run"])).toEqual({
      tenantId: null,
      confirm: false,
    });
  });
});

// ── Phase 2 — anomaly detection ─────────────────────────────────────────────

describe("Phase 2 — ClassTrack linkage verification", () => {
  it("aborts when a section has a NULL classTrackId", async () => {
    const deps = makeDeps({
      fetchSections: vi
        .fn()
        .mockResolvedValue([section({ classTrackId: null, classTrack: null })]),
    });

    const result = await runBackfill(DRY, deps);

    expect(result.mode).toBe("ABORTED");
    expect(result.exitCode).toBe(1);
    expect(result.phase2Anomalies).toHaveLength(1);
    // Aborts BEFORE Phase 3/4 — no reconcile, no session fetch.
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.fetchSessions).not.toHaveBeenCalled();
    expect(deps.logs.some((l) => l.includes("Phase 2 FAILED"))).toBe(true);
  });

  it("aborts when a section's ClassTrack tenantId/campus/program mismatch", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue([
        section({
          classTrack: { tenantId: "tnt-1", campusId: "WRONG", programId: "prg-1" },
        }),
      ]),
    });

    const result = await runBackfill(DRY, deps);

    expect(result.mode).toBe("ABORTED");
    expect(result.exitCode).toBe(1);
    expect(result.phase2Anomalies[0]).toContain("ClassTrack mismatch");
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it("passes Phase 2 when every section has a consistent ClassTrack", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue([section()]),
    });

    const result = await runBackfill(DRY, deps);

    expect(result.phase2Anomalies).toHaveLength(0);
    expect(result.mode).not.toBe("ABORTED");
    expect(deps.logs.some((l) => l.includes("Phase 2 OK"))).toBe(true);
  });
});

// ── Phase 3 — session generation ────────────────────────────────────────────

describe("Phase 3 — historical ClassSession generation", () => {
  it("calls reconcile per section and accumulates added counts in live mode", async () => {
    const deps = makeDeps({
      fetchSections: vi
        .fn()
        .mockResolvedValue([section({ id: "sec-1" }), section({ id: "sec-2" })]),
      reconcile: vi
        .fn()
        .mockResolvedValueOnce(reconcileOk({ classSectionId: "sec-1", added: 10 }))
        .mockResolvedValueOnce(reconcileOk({ classSectionId: "sec-2", added: 7 })),
    });

    const result = await runBackfill(LIVE, deps);

    expect(deps.reconcile).toHaveBeenCalledTimes(2);
    expect(result.sessionsAdded).toBe(17);
  });

  it("does NOT call reconcile in dry-run mode", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue([section()]),
    });

    await runBackfill(DRY, deps);

    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it("records sections whose academic year has no Semesters", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue([section({ id: "sec-x" })]),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue(["sec-x"]),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.noSemesterSectionIds).toEqual(["sec-x"]);
    expect(
      deps.logs.some((l) => l.includes("have NO Semester rows")),
    ).toBe(true);
  });

  it("computes the no-Semester section set in dry-run too (read-only preview)", async () => {
    // Fix 1: noSemesterSectionIds must be populated in DRY-RUN — it no longer
    // depends on reconcile being called.
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue([section({ id: "sec-x" })]),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue(["sec-x"]),
    });

    const result = await runBackfill(DRY, deps);

    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.sectionsWithoutSemesters).toHaveBeenCalledWith(["sec-x"]);
    expect(result.noSemesterSectionIds).toEqual(["sec-x"]);
  });

  it("collects a per-section reconcile failure and ABORTS after the loop", async () => {
    // Fix 3: one section throwing must be caught, collected, and the run must
    // ABORT after the loop — Phase 4 never runs.
    const deps = makeDeps({
      fetchSections: vi
        .fn()
        .mockResolvedValue([section({ id: "sec-1" }), section({ id: "sec-2" })]),
      reconcile: vi
        .fn()
        .mockResolvedValueOnce(reconcileOk({ classSectionId: "sec-1", added: 3 }))
        .mockRejectedValueOnce(new Error("session_batch_too_large")),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("ABORTED");
    expect(result.exitCode).toBe(1);
    expect(result.reconcileErrors).toEqual([
      { sectionId: "sec-2", error: "session_batch_too_large" },
    ]);
    // Both sections were attempted (loop continued past the failure).
    expect(deps.reconcile).toHaveBeenCalledTimes(2);
    // Phase 4 never ran.
    expect(deps.fetchSessions).not.toHaveBeenCalled();
    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(deps.logs.some((l) => l.includes("Phase 3 ABORTED"))).toBe(true);
  });
});

// ── Phase 4 — attendance repoint ────────────────────────────────────────────

describe("Phase 4 — StudentAttendance.sessionId repoint", () => {
  const sections = [section({ id: "sec-1" })];
  const sessions: SessionRow[] = [
    { id: "ses-1", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
  ];

  it("repoints a matching attendance row in live mode", async () => {
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(deps.applyRepoints).toHaveBeenCalledTimes(1);
    expect(deps.applyRepoints).toHaveBeenCalledWith([
      { id: "att-1", sessionId: "ses-1" },
    ]);
    expect(result.attendanceRepointed).toBe(1);
    expect(result.orphanCount).toBe(0);
  });

  it("leaves a no-match attendance row as an orphan (sessionId NULL)", async () => {
    const attendance: AttendanceRow[] = [
      {
        id: "att-2",
        studentId: "stu-2",
        classSectionId: "sec-1",
        date: "2026-99-99", // no matching session
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(result.attendanceRepointed).toBe(0);
    expect(result.orphanCount).toBe(1);
    expect(result.orphanSample[0]).toEqual({
      studentId: "stu-2",
      classSectionId: "sec-1",
      date: "2026-99-99",
    });
  });

  it("skips rows that already carry a sessionId (idempotent re-run)", async () => {
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: "ses-1", // already repointed by a prior run
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(result.attendanceRepointed).toBe(0);
    expect(result.orphanCount).toBe(0);
    expect(result.mode).toBe("SUCCESS");
  });

  it("dry-run mutates nothing — applyRepoints never called", async () => {
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(DRY, deps);

    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(result.attendanceRepointed).toBe(0);
    // The row would-be repointed (it has a match) so it's NOT an orphan.
    expect(result.orphanCount).toBe(0);
    expect(result.mode).toBe("SUCCESS");
  });

  it("batches repoints into REPOINT_BATCH_SIZE-sized transactions", async () => {
    const total = REPOINT_BATCH_SIZE + 1;
    const sess: SessionRow[] = [];
    const att: AttendanceRow[] = [];
    for (let i = 0; i < total; i++) {
      const date = `2026-01-${String((i % 28) + 1).padStart(2, "0")}`;
      sess.push({ id: `ses-${i}`, classSectionId: `sec-${i}`, date, slot: "FULL_DAY" });
      att.push({
        id: `att-${i}`,
        studentId: `stu-${i}`,
        classSectionId: `sec-${i}`,
        date,
        sessionId: null,
      });
    }
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sess),
      fetchAttendance: vi.fn().mockResolvedValue(att),
      countAttendance: vi.fn().mockResolvedValue(total),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.attendanceRepointed).toBe(total);
    // total = BATCH + 1 → two batches.
    expect(deps.applyRepoints).toHaveBeenCalledTimes(2);
  });
});

// ── DCARE multi-shift flagging ──────────────────────────────────────────────

describe("DCARE multi-shift flagging", () => {
  it("flags a section with >1 attendance row for the same (studentId, date)", async () => {
    const sections = [section({ id: "sec-dcare" })];
    const sessions: SessionRow[] = [
      { id: "ses-1", classSectionId: "sec-dcare", date: "2026-01-10", slot: "FULL_DAY" },
    ];
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-dcare",
        date: "2026-01-10",
        sessionId: null,
      },
      {
        id: "att-2",
        studentId: "stu-1", // same student, same date — multi-shift
        classSectionId: "sec-dcare",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(2),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.dcareMultiShiftSectionIds).toEqual(["sec-dcare"]);
    expect(
      deps.logs.some((l) => l.includes("slotTemplate review")),
    ).toBe(true);
  });

  it("does NOT flag a section with one row per (studentId, date)", async () => {
    const sections = [section({ id: "sec-normal" })];
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-normal",
        date: "2026-01-10",
        sessionId: "ses-1",
      },
      {
        id: "att-2",
        studentId: "stu-1",
        classSectionId: "sec-normal",
        date: "2026-01-11", // different date
        sessionId: "ses-2",
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(2),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.dcareMultiShiftSectionIds).toEqual([]);
  });
});

// ── Phase 5 — verification gate + exit modes ────────────────────────────────

describe("Phase 5 — exit modes", () => {
  const sections = [section({ id: "sec-1" })];

  it("(a) ZERO orphans → SUCCESS, exit 0", async () => {
    const sessions: SessionRow[] = [
      { id: "ses-1", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
    ];
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("SUCCESS");
    expect(result.exitCode).toBe(0);
    expect(result.orphanCount).toBe(0);
    expect(deps.logs.some((l) => l.includes("RESULT: SUCCESS"))).toBe(true);
  });

  it("(b) orphans ALL trace to no-Semester sections → SUCCESS_WITH_WARNINGS, exit 0", async () => {
    // sec-1 has no Semesters → reconcile generates nothing → its attendance
    // can't be repointed. That's an identifiable fingerprint, not a bug.
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue(["sec-1"]),
      reconcile: vi.fn().mockResolvedValue(
        reconcileOk({ classSectionId: "sec-1", warnings: ["no_semesters_for_year"] }),
      ),
      fetchSessions: vi.fn().mockResolvedValue([]), // no sessions generated
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("SUCCESS_WITH_WARNINGS");
    expect(result.exitCode).toBe(0);
    expect(result.orphanCount).toBe(1);
    expect(result.orphanSample).toHaveLength(1);
    expect(
      deps.logs.some((l) => l.includes("RESULT: SUCCESS_WITH_WARNINGS")),
    ).toBe(true);
  });

  it("(b-dry-run) dry-run whose orphans all trace to no-Semester sections → SUCCESS_WITH_WARNINGS, NOT FAILURE", async () => {
    // Fix 1 regression guard: in dry-run, reconcile is never called, but the
    // no-Semester set is still computed via sectionsWithoutSemesters, so the
    // orphan classification must reach SUCCESS_WITH_WARNINGS — not a false
    // FAILURE.
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue(["sec-1"]),
      fetchSessions: vi.fn().mockResolvedValue([]), // no sessions exist
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(DRY, deps);

    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(result.mode).toBe("SUCCESS_WITH_WARNINGS");
    expect(result.exitCode).toBe(0);
    expect(result.orphanCount).toBe(1);
  });

  it("ABORTS on a duplicate (section,date,FULL_DAY) ClassSession key before any repoint", async () => {
    // Fix 2: two ClassSession rows for the same tuple is a data-integrity
    // anomaly — abort before Phase 4 instead of silently overwriting the map.
    const sessions: SessionRow[] = [
      { id: "ses-1", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
      { id: "ses-2", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
    ];
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("ABORTED");
    expect(result.exitCode).toBe(1);
    expect(result.duplicateSessionKeys).toEqual(["sec-1|2026-01-10|FULL_DAY"]);
    // Aborts BEFORE any repoint.
    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(result.attendanceRepointed).toBe(0);
    expect(deps.logs.some((l) => l.includes("Phase 4 ABORTED"))).toBe(true);
  });

  it("(c) orphans in sections that DID get sessions → FAILURE, exit non-zero", async () => {
    // sec-1 DID generate sessions, but this attendance date has no matching
    // session — calendar / workingDays drift. Real bug → fail loud.
    const sessions: SessionRow[] = [
      { id: "ses-1", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
    ];
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-03-15", // no session for this date
        sessionId: null,
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      reconcile: vi.fn().mockResolvedValue(reconcileOk({ classSectionId: "sec-1", added: 1 })),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("FAILURE");
    expect(result.exitCode).toBe(1);
    expect(result.orphanCount).toBe(1);
    expect(deps.logs.some((l) => l.includes("RESULT: FAILURE"))).toBe(true);
    expect(deps.logs.some((l) => l.includes("Phase 5 FAILED"))).toBe(true);
  });

  it("dry-run parity log makes clear it is not a real assertion", async () => {
    // Fix 4: in dry-run nothing is written, so before===after is trivially
    // true — the log line must not imply a meaningful check ran.
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue([]),
      fetchSessions: vi.fn().mockResolvedValue([]),
      fetchAttendance: vi.fn().mockResolvedValue([]),
      countAttendance: vi.fn().mockResolvedValue(5),
    });

    await runBackfill(DRY, deps);

    expect(
      deps.logs.some((l) => l.includes("dry-run: no writes, parity trivially holds")),
    ).toBe(true);
    // The misleading "parity OK" phrasing must NOT appear in dry-run.
    expect(deps.logs.some((l) => l.includes("row-count parity OK"))).toBe(false);
  });

  it("live-run keeps the real row-count parity OK assertion", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      sectionsWithoutSemesters: vi.fn().mockResolvedValue([]),
      fetchSessions: vi.fn().mockResolvedValue([]),
      fetchAttendance: vi.fn().mockResolvedValue([]),
      countAttendance: vi.fn().mockResolvedValue(5),
    });

    await runBackfill(LIVE, deps);

    expect(deps.logs.some((l) => l.includes("row-count parity OK"))).toBe(true);
  });

  it("FAILS when StudentAttendance row count changes (parity violation)", async () => {
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      fetchSessions: vi.fn().mockResolvedValue([]),
      fetchAttendance: vi.fn().mockResolvedValue([]),
      // before = 10, after = 9 — a row vanished.
      countAttendance: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(9),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.mode).toBe("FAILURE");
    expect(result.exitCode).toBe(1);
    expect(result.rowCountBefore).toBe(10);
    expect(result.rowCountAfter).toBe(9);
    expect(
      deps.logs.some((l) => l.includes("row count changed")),
    ).toBe(true);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────────────

describe("idempotency", () => {
  it("a re-run over fully-linked data is a no-op (no repoints, SUCCESS)", async () => {
    const sections = [section({ id: "sec-1" })];
    const sessions: SessionRow[] = [
      { id: "ses-1", classSectionId: "sec-1", date: "2026-01-10", slot: "FULL_DAY" },
    ];
    // Every attendance row already carries its sessionId from a prior run.
    const attendance: AttendanceRow[] = [
      {
        id: "att-1",
        studentId: "stu-1",
        classSectionId: "sec-1",
        date: "2026-01-10",
        sessionId: "ses-1",
      },
    ];
    const deps = makeDeps({
      fetchSections: vi.fn().mockResolvedValue(sections),
      reconcile: vi.fn().mockResolvedValue(reconcileOk({ classSectionId: "sec-1", added: 0 })),
      fetchSessions: vi.fn().mockResolvedValue(sessions),
      fetchAttendance: vi.fn().mockResolvedValue(attendance),
      countAttendance: vi.fn().mockResolvedValue(1),
    });

    const result = await runBackfill(LIVE, deps);

    expect(result.sessionsAdded).toBe(0);
    expect(result.attendanceRepointed).toBe(0);
    expect(result.orphanCount).toBe(0);
    expect(deps.applyRepoints).not.toHaveBeenCalled();
    expect(result.mode).toBe("SUCCESS");
    expect(result.exitCode).toBe(0);
  });
});
