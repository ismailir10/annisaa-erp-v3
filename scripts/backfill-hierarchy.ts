/**
 * One-time data migration: backfill the academic-hierarchy refactor
 * (cycle 2026-05-15-academic-hierarchy-refactor, Task 8).
 *
 * Runs in idempotent, re-runnable phases:
 *
 *   Phase 2 — ClassTrack linkage VERIFICATION (verify-only, no mutation).
 *     Task 1's SQL migration already backfilled `ClassTrack` rows and set
 *     `ClassSection.classTrackId`. This phase only confirms every section has
 *     a non-null `classTrackId` whose `ClassTrack` shares its
 *     tenantId/campusId/programId. Any anomaly aborts the run before any
 *     mutation — there should be none.
 *
 *   Phase 3 — historical ClassSession generation.
 *     FIRST, in BOTH dry-run and live mode, runs a read-only query to find the
 *     sections whose academic year has no `Semester` rows — surfaced
 *     prominently and used by Phase 5's orphan classification. THEN, in live
 *     mode only, calls `reconcileSessions(section.id)` per section (idempotent;
 *     FULL_DAY fan-out, HOMEROOM teacher snapshot, isBackfilled for past
 *     dates). Each `reconcile` call is wrapped in try/catch; if any section
 *     fails, the failures are collected and the run ABORTS after the loop
 *     (Phase 4 never runs against a partially-reconciled dataset).
 *
 *   Phase 4 — StudentAttendance.sessionId repoint.
 *     Builds a `(classSectionId, date, slot)` → sessionId index. A duplicate
 *     key (two ClassSession rows for the same tuple) is a data-integrity
 *     anomaly — detected up front, and the run ABORTS before any repoint.
 *     Otherwise, for every `StudentAttendance` row with `sessionId IS NULL`
 *     (in scope), finds the matching `ClassSession` by `(classSectionId, date,
 *     slot)` with slot = "FULL_DAY" (historical attendance is
 *     session-agnostic). Exactly one match → set `sessionId`. No match →
 *     ORPHAN (left NULL, collected). Batched inside transactions. Idempotent:
 *     rows that already carry a `sessionId` are skipped.
 *
 *   Phase 5 — verification gate + orphan report.
 *     Asserts the `StudentAttendance` total row count is UNCHANGED. Counts
 *     rows still `sessionId IS NULL` and picks an exit mode:
 *       (a) ZERO orphans                        → SUCCESS, exit 0.
 *       (b) orphans ALL trace to no-Semester     → SUCCESS-WITH-WARNINGS,
 *           sections (identifiable fingerprint)    exit 0, prints sample.
 *       (c) orphans in sections that DID get     → FAILURE, exit non-zero,
 *           sessions generated (real bug)          prints sample, tells the
 *                                                  operator to investigate.
 *
 *   DCARE multi-shift flagging — sections with >1 `StudentAttendance` row for
 *   the same `(studentId, date)` are flagged for MORNING/AFTERNOON
 *   slotTemplate review. NOT auto-split.
 *
 * Modes:
 *   - Dry-run by default: Phases 2 + 3-preview + 4-preview + 5-preview.
 *     Counts what WOULD happen, mutates nothing.
 *   - `--confirm` actually runs the Phase 3 + Phase 4 mutations.
 *   - `--tenant <id>` scopes every phase to one tenant.
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-hierarchy.ts
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-hierarchy.ts --tenant <id>
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-hierarchy.ts --tenant <id> --confirm
 *
 * Without `--confirm` (or with the explicit `--dry-run` alias) the script runs
 * every phase in preview mode and exits without touching the database. If both
 * `--confirm` and `--dry-run` are passed, the last flag wins.
 */

import { prisma } from "@/lib/db";
import {
  reconcileSessions,
  SESSION_BATCH_TOO_LARGE,
  type ReconcileResult,
} from "@/lib/sessions/reconcile";

/** Attendance rows are repointed in chunks of this size, one tx per chunk. */
export const REPOINT_BATCH_SIZE = 500;

// ── Args ────────────────────────────────────────────────────────────────────

export interface BackfillArgs {
  tenantId: string | null;
  confirm: boolean;
}

export function parseArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = { tenantId: null, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant") {
      args.tenantId = argv[++i] ?? null;
    } else if (a === "--confirm" || a === "--apply") {
      args.confirm = true;
    } else if (a === "--dry-run") {
      args.confirm = false;
    }
  }
  return args;
}

// ── Injectable shapes (kept structural so tests can hand in plain objects) ───

export interface SectionRow {
  id: string;
  tenantId: string;
  campusId: string;
  programId: string;
  classTrackId: string | null;
  classTrack: {
    tenantId: string;
    campusId: string;
    programId: string;
  } | null;
}

export interface SessionRow {
  id: string;
  classSectionId: string;
  date: string;
  slot: string;
}

export interface AttendanceRow {
  id: string;
  studentId: string;
  classSectionId: string;
  date: string;
  sessionId: string | null;
}

export interface BackfillDeps {
  /** All ClassSections in scope, with their ClassTrack joined for Phase 2. */
  fetchSections: (tenantId: string | null) => Promise<SectionRow[]>;
  /**
   * Read-only Phase 3 preview: given a set of section ids, returns the subset
   * whose academic year has NO `Semester` rows. Runs in BOTH dry-run and live
   * mode so the Phase 5 orphan classification is mode-independent.
   */
  sectionsWithoutSemesters: (sectionIds: string[]) => Promise<string[]>;
  /** Idempotent session generation for one section (real impl: reconcileSessions). */
  reconcile: (classSectionId: string) => Promise<ReconcileResult>;
  /** Every ClassSession in scope — used to build the (section,date,slot) match index. */
  fetchSessions: (tenantId: string | null) => Promise<SessionRow[]>;
  /** Every StudentAttendance row in scope (any sessionId state). */
  fetchAttendance: (tenantId: string | null) => Promise<AttendanceRow[]>;
  /** Persist a batch of sessionId repoints. No-op in dry-run (caller gates this). */
  applyRepoints: (updates: { id: string; sessionId: string }[]) => Promise<void>;
  /** Total StudentAttendance row count in scope — the parity invariant. */
  countAttendance: (tenantId: string | null) => Promise<number>;
  log: (msg: string) => void;
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface OrphanSample {
  studentId: string;
  classSectionId: string;
  date: string;
}

export type ExitMode =
  | "SUCCESS"
  | "SUCCESS_WITH_WARNINGS"
  | "FAILURE";

export interface ReconcileError {
  sectionId: string;
  error: string;
}

export interface BackfillResult {
  exitCode: number;
  mode: ExitMode | "ABORTED";
  phase2Anomalies: string[];
  sectionsScanned: number;
  sessionsAdded: number;
  noSemesterSectionIds: string[];
  reconcileErrors: ReconcileError[];
  duplicateSessionKeys: string[];
  attendanceRepointed: number;
  orphanCount: number;
  orphanSample: OrphanSample[];
  rowCountBefore: number;
  rowCountAfter: number;
  dcareMultiShiftSectionIds: string[];
}

const PREFIX = "[HIERARCHY BACKFILL]";

/**
 * Pure orchestrator — all I/O goes through `deps` so tests inject mocks and
 * never touch Prisma. The CLI wrapper at the bottom of this file injects the
 * real implementations.
 */
export async function runBackfill(
  args: BackfillArgs,
  deps: BackfillDeps,
): Promise<BackfillResult> {
  const { log } = deps;
  const mode = args.confirm ? "live" : "dry-run";
  log(`${PREFIX} tenant=${args.tenantId ?? "<all>"} mode=${mode}`);

  const result: BackfillResult = {
    exitCode: 0,
    mode: "SUCCESS",
    phase2Anomalies: [],
    sectionsScanned: 0,
    sessionsAdded: 0,
    noSemesterSectionIds: [],
    reconcileErrors: [],
    duplicateSessionKeys: [],
    attendanceRepointed: 0,
    orphanCount: 0,
    orphanSample: [],
    rowCountBefore: 0,
    rowCountAfter: 0,
    dcareMultiShiftSectionIds: [],
  };

  // ── Parity baseline — captured BEFORE any mutation ───────────────────────
  result.rowCountBefore = await deps.countAttendance(args.tenantId);

  // ════ Phase 2 — ClassTrack linkage verification (no mutation) ════════════
  log(`${PREFIX} Phase 2 — verifying ClassTrack linkage…`);
  const sections = await deps.fetchSections(args.tenantId);
  result.sectionsScanned = sections.length;

  for (const s of sections) {
    if (!s.classTrackId || !s.classTrack) {
      result.phase2Anomalies.push(
        `section ${s.id}: classTrackId is ${s.classTrackId === null ? "NULL" : "set but ClassTrack row missing"}`,
      );
      continue;
    }
    const t = s.classTrack;
    if (
      t.tenantId !== s.tenantId ||
      t.campusId !== s.campusId ||
      t.programId !== s.programId
    ) {
      result.phase2Anomalies.push(
        `section ${s.id}: ClassTrack mismatch — section(${s.tenantId}/${s.campusId}/${s.programId}) vs track(${t.tenantId}/${t.campusId}/${t.programId})`,
      );
    }
  }

  if (result.phase2Anomalies.length > 0) {
    log(
      `${PREFIX} Phase 2 FAILED — ${result.phase2Anomalies.length} ClassTrack linkage anomaly(ies). Aborting before any mutation.`,
    );
    for (const a of result.phase2Anomalies) log(`${PREFIX}   - ${a}`);
    log(
      `${PREFIX} Task 1's migration should have backfilled these. Investigate the migration before retrying.`,
    );
    result.mode = "ABORTED";
    result.exitCode = 1;
    return result;
  }
  log(
    `${PREFIX} Phase 2 OK — ${sections.length} section(s), every classTrackId present + consistent.`,
  );

  // ════ Phase 3 — historical ClassSession generation ══════════════════════
  log(
    `${PREFIX} Phase 3 — ${args.confirm ? "generating" : "previewing"} historical ClassSessions…`,
  );

  // Compute the no-Semester section set FIRST, via a read-only query, in BOTH
  // dry-run and live mode. This is a simple "does the section's academic year
  // have any Semester rows" lookup — it does not need reconcileSessions to tell
  // us. Doing it unconditionally makes Phase 5's orphan classification
  // mode-independent (dry-run no longer mistakes legitimate no-Semester
  // orphans for unexplained ones).
  result.noSemesterSectionIds = await deps.sectionsWithoutSemesters(
    sections.map((s) => s.id),
  );

  if (args.confirm) {
    for (const s of sections) {
      try {
        const r = await deps.reconcile(s.id);
        result.sessionsAdded += r.added;
        if (r.warnings.length > 0) {
          log(`${PREFIX}   section ${s.id}: added=${r.added} warnings=${r.warnings.join(",")}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.reconcileErrors.push({ sectionId: s.id, error: msg });
        log(`${PREFIX}   section ${s.id}: reconcile FAILED — ${msg}`);
      }
    }

    // If ANY section's reconcile threw, the dataset is only partially
    // reconciled. Proceeding to Phase 4 would repoint attendance against an
    // incomplete session set, so abort here and report which sections failed.
    if (result.reconcileErrors.length > 0) {
      log(
        `${PREFIX} Phase 3 ABORTED — ${result.reconcileErrors.length} section(s) failed reconciliation. Dataset is partially reconciled; not proceeding to Phase 4.`,
      );
      for (const re of result.reconcileErrors) {
        log(`${PREFIX}   - section ${re.sectionId}: ${re.error}`);
      }
      log(
        `${PREFIX} Fix the underlying failures (e.g. ${SESSION_BATCH_TOO_LARGE}, DB timeout) and re-run.`,
      );
      result.mode = "ABORTED";
      result.exitCode = 1;
      return result;
    }

    log(
      `${PREFIX} Phase 3 done — ${result.sessionsAdded} ClassSession row(s) added across ${sections.length} section(s).`,
    );
  } else {
    log(
      `${PREFIX} Phase 3 SKIPPED (dry-run) — would call reconcileSessions() for ${sections.length} section(s). Re-run with --confirm to generate.`,
    );
  }
  if (result.noSemesterSectionIds.length > 0) {
    log(
      `${PREFIX} ⚠ ${result.noSemesterSectionIds.length} section(s) have NO Semester rows for their academic year — they generate no sessions. Those tenants must create Semesters first. IDs: ${result.noSemesterSectionIds.join(", ")}`,
    );
  }

  // ════ Phase 4 — StudentAttendance.sessionId repoint ═════════════════════
  log(
    `${PREFIX} Phase 4 — ${args.confirm ? "repointing" : "previewing"} StudentAttendance.sessionId…`,
  );

  // Build the (classSectionId|date|slot) → sessionId match index. Historical
  // attendance is session-agnostic, so Phase 4 matches on slot = "FULL_DAY".
  // A duplicate key means two ClassSession rows share the same
  // (classSectionId, date, slot) — itself a data-integrity anomaly. Silently
  // overwriting would repoint attendance to an arbitrary session, so detect
  // duplicates and ABORT before any Phase 4 repoint.
  const sessions = await deps.fetchSessions(args.tenantId);
  const sessionByKey = new Map<string, string>();
  const duplicateSessionKeys = new Set<string>();
  for (const s of sessions) {
    const key = `${s.classSectionId}|${s.date}|${s.slot}`;
    if (sessionByKey.has(key)) {
      duplicateSessionKeys.add(key);
    } else {
      sessionByKey.set(key, s.id);
    }
  }
  if (duplicateSessionKeys.size > 0) {
    result.duplicateSessionKeys = [...duplicateSessionKeys];
    log(
      `${PREFIX} Phase 4 ABORTED — ${duplicateSessionKeys.size} duplicate ClassSession key(s) (classSectionId|date|slot). A duplicate session would repoint attendance to an arbitrary row. Investigate before retrying.`,
    );
    for (const k of result.duplicateSessionKeys) {
      log(`${PREFIX}   - duplicate key: ${k}`);
    }
    result.mode = "ABORTED";
    result.exitCode = 1;
    return result;
  }

  const attendance = await deps.fetchAttendance(args.tenantId);

  // DCARE multi-shift detection — any section with >1 attendance row for the
  // same (studentId, date). The legacy unique was dropped to allow this, but
  // historical data shouldn't carry it unless multi-shift happened via some
  // other path. We FLAG, never auto-split.
  const seenStudentDate = new Map<string, Set<string>>(); // sectionId -> "studentId|date"
  const multiShiftSections = new Set<string>();
  for (const a of attendance) {
    let seen = seenStudentDate.get(a.classSectionId);
    if (!seen) {
      seen = new Set<string>();
      seenStudentDate.set(a.classSectionId, seen);
    }
    const key = `${a.studentId}|${a.date}`;
    if (seen.has(key)) {
      multiShiftSections.add(a.classSectionId);
    } else {
      seen.add(key);
    }
  }
  result.dcareMultiShiftSectionIds = [...multiShiftSections];

  // Repoint pass — collect updates + orphans.
  const updates: { id: string; sessionId: string }[] = [];
  const orphans: OrphanSample[] = [];
  let alreadyLinked = 0;
  for (const a of attendance) {
    if (a.sessionId !== null) {
      alreadyLinked += 1; // idempotent: already repointed, skip
      continue;
    }
    const match = sessionByKey.get(`${a.classSectionId}|${a.date}|FULL_DAY`);
    if (match) {
      updates.push({ id: a.id, sessionId: match });
    } else {
      orphans.push({
        studentId: a.studentId,
        classSectionId: a.classSectionId,
        date: a.date,
      });
    }
  }

  if (args.confirm) {
    for (let i = 0; i < updates.length; i += REPOINT_BATCH_SIZE) {
      const batch = updates.slice(i, i + REPOINT_BATCH_SIZE);
      await deps.applyRepoints(batch);
    }
    result.attendanceRepointed = updates.length;
    log(
      `${PREFIX} Phase 4 done — repointed ${updates.length} row(s), ${alreadyLinked} already linked (skipped), ${orphans.length} orphan(s).`,
    );
  } else {
    result.attendanceRepointed = 0;
    log(
      `${PREFIX} Phase 4 SKIPPED (dry-run) — would repoint ${updates.length} row(s); ${alreadyLinked} already linked; ${orphans.length} would be orphan(s).`,
    );
  }

  if (multiShiftSections.size > 0) {
    log(
      `${PREFIX} ⚠ ${multiShiftSections.size} section(s) have multiple attendance rows for the same (studentId, date) — may need MORNING/AFTERNOON slotTemplate review (NOT auto-split). IDs: ${result.dcareMultiShiftSectionIds.join(", ")}`,
    );
  }

  // ════ Phase 5 — verification gate + orphan report ═══════════════════════
  log(`${PREFIX} Phase 5 — verification gate…`);
  result.rowCountAfter = await deps.countAttendance(args.tenantId);

  // Invariant 1: the migration must never lose or create attendance rows.
  if (result.rowCountAfter !== result.rowCountBefore) {
    log(
      `${PREFIX} Phase 5 FAILED — StudentAttendance row count changed: before=${result.rowCountBefore} after=${result.rowCountAfter}. The migration must NEVER add or drop attendance rows. Investigate immediately.`,
    );
    result.mode = "FAILURE";
    result.exitCode = 1;
    return result;
  }
  if (args.confirm) {
    log(
      `${PREFIX} Phase 5 — row-count parity OK (before=after=${result.rowCountBefore}).`,
    );
  } else {
    log(
      `${PREFIX} Phase 5 — row-count parity (dry-run: no writes, parity trivially holds; count=${result.rowCountBefore}).`,
    );
  }

  // Invariant 2: orphan classification.
  // In dry-run nothing was written, so the "still NULL" count is every row
  // that was NULL going in: orphans + the updates we WOULD have made. In live
  // mode the updates landed, so only true orphans remain NULL. Either way the
  // ORPHAN set (the rows with no matching session) is what we classify.
  result.orphanCount = orphans.length;
  result.orphanSample = orphans.slice(0, 10);

  // Fingerprint: an orphan is "explained" if its section had no Semesters
  // (Phase 3 already surfaced that — those sections legitimately generated no
  // sessions, so their attendance can't be repointed until Semesters exist).
  const noSemesterSet = new Set(result.noSemesterSectionIds);
  const unexplainedOrphans = orphans.filter(
    (o) => !noSemesterSet.has(o.classSectionId),
  );

  if (orphans.length === 0) {
    // (a) ZERO orphans — clean migration.
    log(`${PREFIX} Phase 5 — 0 orphans. Every attendance row is mapped.`);
    log(`${PREFIX} RESULT: SUCCESS`);
    result.mode = "SUCCESS";
    result.exitCode = 0;
    return result;
  }

  if (unexplainedOrphans.length === 0) {
    // (b) SMALL / explained — every orphan traces to a no-Semester section.
    // That's identifiable bad data, already surfaced in Phase 3. Operator
    // action is clear (create Semesters, re-run) so this is a soft pass.
    log(
      `${PREFIX} Phase 5 — ${orphans.length} orphan(s), ALL trace to sections whose academic year has no Semester rows (surfaced in Phase 3).`,
    );
    log(`${PREFIX} Likely reason: no_semesters_for_year — create Semesters for those tenants, then re-run.`);
    log(`${PREFIX} Orphan sample (up to 10):`);
    for (const o of result.orphanSample) {
      log(`${PREFIX}   studentId=${o.studentId} classSectionId=${o.classSectionId} date=${o.date}`);
    }
    log(`${PREFIX} RESULT: SUCCESS_WITH_WARNINGS`);
    result.mode = "SUCCESS_WITH_WARNINGS";
    result.exitCode = 0;
    return result;
  }

  // (c) SUBSTANTIVE — orphans in sections that DID generate sessions. A
  // session existed for the section but not for this (date, FULL_DAY) tuple:
  // calendar / workingDays / Semester-range drift. That's a real bug — fail
  // loud so the operator investigates before retrying.
  log(
    `${PREFIX} Phase 5 FAILED — ${orphans.length} orphan(s); ${unexplainedOrphans.length} of them are in sections that DID get sessions generated (no clear bad-data fingerprint).`,
  );
  log(
    `${PREFIX} This means a ClassSession exists for the section but not for the attendance's (date, FULL_DAY) tuple — investigate calendar / OrgConfig.workingDays / Semester date-range drift before retrying.`,
  );
  log(`${PREFIX} Orphan sample (up to 10):`);
  for (const o of result.orphanSample) {
    log(`${PREFIX}   studentId=${o.studentId} classSectionId=${o.classSectionId} date=${o.date}`);
  }
  log(`${PREFIX} RESULT: FAILURE`);
  result.mode = "FAILURE";
  result.exitCode = 1;
  return result;
}

// ── Real dependency wiring ──────────────────────────────────────────────────

function realDeps(): BackfillDeps {
  return {
    fetchSections: async (tenantId) =>
      prisma.classSection.findMany({
        where: tenantId ? { tenantId } : {},
        select: {
          id: true,
          tenantId: true,
          campusId: true,
          programId: true,
          classTrackId: true,
          classTrack: {
            select: { tenantId: true, campusId: true, programId: true },
          },
        },
      }),
    sectionsWithoutSemesters: async (sectionIds) => {
      if (sectionIds.length === 0) return [];
      // Read-only: a section has "no Semesters" if its academic year carries
      // zero Semester rows. One query, joined through academicYear.
      const rows = await prisma.classSection.findMany({
        where: { id: { in: sectionIds } },
        select: {
          id: true,
          academicYear: { select: { _count: { select: { semesters: true } } } },
        },
      });
      return rows
        .filter((r) => r.academicYear._count.semesters === 0)
        .map((r) => r.id);
    },
    reconcile: (classSectionId) => reconcileSessions(classSectionId),
    fetchSessions: async (tenantId) =>
      prisma.classSession.findMany({
        where: tenantId ? { classSection: { tenantId } } : {},
        select: { id: true, classSectionId: true, date: true, slot: true },
      }),
    fetchAttendance: async (tenantId) =>
      prisma.studentAttendance.findMany({
        where: tenantId ? { classSection: { tenantId } } : {},
        select: {
          id: true,
          studentId: true,
          classSectionId: true,
          date: true,
          sessionId: true,
        },
      }),
    applyRepoints: async (batch) => {
      await prisma.$transaction(
        batch.map((u) =>
          prisma.studentAttendance.update({
            where: { id: u.id },
            data: { sessionId: u.sessionId },
          }),
        ),
      );
    },
    countAttendance: (tenantId) =>
      prisma.studentAttendance.count({
        where: tenantId ? { classSection: { tenantId } } : {},
      }),
    log: (msg) => console.log(msg),
  };
}

// CLI entry point — only runs when executed directly via tsx, not on import.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /backfill-hierarchy\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  void (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      const result = await runBackfill(args, realDeps());
      await prisma.$disconnect();
      process.exit(result.exitCode);
    } catch (e) {
      console.error(`${PREFIX} fatal error`, e);
      try {
        await prisma.$disconnect();
      } catch {
        // best-effort
      }
      process.exit(1);
    }
  })();
}
