# Pilot Readiness Audit — Admin + Teacher (Staff-First Handoff)

## Context

Owner wants to hand the app off to the school admin for a staff-only pilot (admin + teacher users, real students/classes, no parents yet), with attendance as the priority flow to validate. Parent portal is explicitly deferred to a later cycle per the staff-first rollout plan ([[project_pilot_rollout]]).

This is an audit cycle, not a build cycle — five parallel subagents assessed current state: prod Supabase DB, the 2026-06-02 teacher auto-provision bug, admin portal (44 pages), teacher portal (14 pages), and the staging→main commit gap (43 commits). Findings below drive the Tasks list for the next `/build` cycle before handoff can happen.

Payment gateway migration (Xendit → Midtrans/Doku) was raised by the owner in the same request but explicitly parked — no work done this cycle, tracked as a separate future initiative only.

## Spec — What "Ready for Pilot Handoff" Means

Acceptance criteria for handing the app to the admin:

1. Prod app is reachable and functional (DB not paused).
2. Prod runs current staging code (staging→main promoted), so the admin isn't testing stale/already-fixed bugs.
3. Attendance — the flow the owner cares about most — produces trustworthy numbers: no dual/conflicting write paths that can double-count a student's attendance.
4. A teacher's first login (fresh Google account, no pre-existing `User` row) succeeds without a silent bounce loop.
5. No nav-linked page is a stub or obviously broken for a non-technical admin/teacher user.

Non-goals for this cycle: parent portal, payment gateway migration, fixing every minor UI rough edge found (tracked separately, not blocking).

## Tasks (ordered, for next `/build` cycle)

- [ ] **T1 (blocker) — Resume prod Supabase, re-verify DB state.** All 4 Supabase projects (prod-sgp `vxwywmvpxetdgnxejjgk`, staging-sgp, staging, legacy) currently show `status: INACTIVE` (paused). Prod app is non-functional right now — any request touching Supabase will time out. Needs owner authorization to call `restore_project` (state-changing infra action, potential billing implications — not done automatically by the audit). After resume, re-run row-count checks: Tenant, User by role, Student, ClassSection, Employee, ACTIVE AcademicYear + dates, and confirm whether the roster spreadsheet import has happened yet (it hadn't as of 2026-06-01 per [[project_pilot_rollout]]).
- [ ] **T2 (blocker) — Reconcile dual teacher attendance write paths.** Two live, fully-built UIs write independently to `StudentAttendance` for the same student/date with different keys:
  - `app/teacher/class-attendance/page.tsx` (bottom-nav "Kelas" tab) → `POST /api/student-attendance/mark` → row keyed `(studentId, date, sessionId: null)` — the legacy session-agnostic path.
  - `app/teacher/sessions/[id]/page.tsx` (home "Sesi Hari Ini" card) → `POST /api/teacher/sessions/[id]/attendance` → row keyed `(studentId, sessionId: <id>)`.
  - The partial unique index (`prisma/schema.prisma:881-888`) only dedupes within the legacy path. Nothing stops both paths firing for the same day. The admin monthly recap (`lib/attendance/student-recap.ts:132-140`) groups session-agnostically, so a student attendance-marked via both entry points gets double-counted in the report the owner will actually look at.
  - Recommended fix: keep the session-based flow (has e2e coverage, richer data — pickup relation, check-in/out times) and hide/remove the legacy "Kelas" bottom-nav entry point, or add a same-day cross-path guard if both need to stay. This is an architectural leftover from the "Academic Hierarchy Refactor" (commit `16bc6eb7`) that was never closed out.
- [ ] **T3 (blocker) — Promote staging→main (`/ship --to-main`).** Staging is 43 commits ahead of main with zero divergence (main is a clean subset). Audited safe to promote: all 3 Prisma migrations are additive or self-healing (`20260520000000_classsection_age_group` has an `ELSE 'A'` default backfill, already proven against a prior P3009 failure on staging), no destructive schema changes, no breaking API changes. Prod DB is near-empty pre-pilot, so blast radius is negligible. One non-blocking sanity check: confirm prod `ClassSection` names before merge so the `ageGroup` backfill default doesn't silently misclassify a real class needing `B`. Must happen before handoff — otherwise the admin tests stale code, including the now-fixed auto-provision bug in its old broken form.
- [ ] **T4 (blocker) — Live smoke-test teacher first login.** The 2026-06-02 auto-provision loop bug (`lib/auth.ts` `_getSession`, teacher bounces `/teacher → /` on first login) is fixed as of commit `6a983611` — reconcile-by-`employeeId` instead of blind `create`, plus a regression test (`lib/__tests__/auth-teacher-autoprovision.test.ts`). However, no e2e/browser-level login test exists — only Prisma-mocked unit tests. Do one real Google OAuth login for a teacher with zero pre-existing `User`/`Employee`-linked-`User` rows, on promoted main, before final go-live sign-off.
- [ ] **T5 (minor, communicate or fix before handoff)** — three known rough edges, already self-tracked by the team in `docs/cycles/2026-06-24-ui-consistency-sweep.md` as deliberately deferred:
  - Student-journal "Simpan Perubahan" button is a placebo (`app/admin/student-journal/students/[id]/page.tsx:334-337`) — harmless (save already happened per-cell) but misleading. Tracked as T8 in the UI sweep doc.
  - Journal notes lack author attribution — tracked as T19 ("real-harm: anonymous notes") in the same doc.
  - Teacher journal entry (`app/teacher/student-journal/entry/page.tsx:113-229`) holds edits client-side until an explicit "Simpan" tap; navigating away first loses unsaved input. Flagged as "real-harm: lost journal input" in the same doc — worth fixing or explicitly warning teachers about before pilot, since this is the kind of bug that generates confusing support requests.
- [ ] **T6 (minor, optional, not blocking)** — e2e coverage gaps: no spec exercises `/teacher/class-attendance` (the Kelas tab) at all, and none cover HR payroll/salary-components/fees/invoices detail pages. Not attendance-critical for T2's decision, but worth closing after T2 lands so the winning attendance path has explicit e2e coverage.

## Implementation

Not started — this cycle is audit-only. T1–T4 are blockers for the next `/build` cycle before pilot handoff; T5–T6 are follow-ups.

## Verification

Audit-only cycle — no code changed, so the between-task/end-of-cycle test gates and Playwright do not apply. Findings gathered via 5 parallel subagents (Supabase MCP read-only queries, codebase grep/read, git log analysis) rather than direct investigation, per the mandatory subagent fan-out rule.

## Ship Notes

No code changes in this cycle. Do not run `/ship` on this doc alone unless the owner wants the audit findings merged to staging as a standalone doc commit — otherwise fold this doc's Tasks into the next `/build` cycle that actually implements T1–T4.
