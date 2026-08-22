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

## Tasks (ordered)

- [x] **T1 — Resume prod Supabase, re-verify DB state.** Resumed `vxwywmvpxetdgnxejjgk` (owner-authorized) — now `ACTIVE_HEALTHY`. Re-audit: 1 Tenant, 3 Users (1 SUPER_ADMIN + 2 "(Test Login)" rows per [[project_prod_test_logins]] — TEACHER and GUARDIAN), 1 Employee, **0 Students, 0 ClassSections**, 1 ACTIVE AcademicYear (`2026/2027`, 2026-07-01→2027-06-30 — now genuinely current). **New finding, supersedes the original T1 framing: the roster spreadsheet import still has not happened.** This — not code — is now the actual remaining pilot blocker: an admin/teacher pilot needs real students and classes to test attendance against, and the code fixes below can't manufacture that data. Owner needs to provide the school roster export.
- [x] **T2 — Reconcile dual teacher attendance write paths.** Two live, fully-built UIs wrote independently to `StudentAttendance` for the same student/date with different keys (legacy `sessionId: null` via the "Kelas" bottom-nav tab vs. session-keyed via the home "Sesi Hari Ini" card), risking double-counted attendance in the admin monthly recap (`lib/attendance/student-recap.ts:132-140`, which groups by status with no per-date dedup). Fixed in `app/api/student-attendance/mark/route.ts`: the legacy route now looks up `ClassSession` rows for `(classSectionId, date)` before writing — if exactly one exists (the common single-shift case: KB/TKIT/PopUp), it upserts into that session's `(studentId, sessionId)` row, the same row the session-based flow writes to, so both entry points converge on one row. If zero or >1 sessions exist for that date (multi-shift DCARE days), it falls back to the pre-existing `sessionId: null` behavior, unchanged — full multi-shift reconciliation is still owned by the not-yet-done "Task 7" from the 2026-05-15 academic-hierarchy-refactor cycle, out of scope here. Regression tests added in `app/api/__tests__/student-attendance-mark.test.ts` covering both the single-session-match and no-session-fallback paths.
- [x] **T3 — Promote staging→main.** Opened PR [#381](https://github.com/ismailir10/annisaa-erp-v3/pull/381) (22 real commits after fetching current refs — the initial 43-commit estimate was against a stale local `main` ref), all 4 required checks green, merged (squash) as CTO. Prod now redeploys current code, including the auto-provision fix (T4) and this cycle's T2 fix once it ships.
- [ ] **T4 (blocker, still open) — Live smoke-test teacher first login.** The 2026-06-02 auto-provision loop bug (`lib/auth.ts` `_getSession`) is fixed as of commit `6a983611` with a regression test, and is now live on `main` via T3. No e2e/browser-level login test exists — only Prisma-mocked unit tests. **Cannot be completed by this session**: needs a real Google OAuth login by a teacher account with zero pre-existing `User`/`Employee`-linked-`User` rows, which requires owner-controlled credentials. Do this once T1's roster import creates real teacher accounts.
- [ ] **T5 (minor, communicate or fix before handoff)** — three known rough edges, already self-tracked by the team in `docs/cycles/2026-06-24-ui-consistency-sweep.md` as deliberately deferred:
  - Student-journal "Simpan Perubahan" button is a placebo (`app/admin/student-journal/students/[id]/page.tsx:334-337`) — harmless (save already happened per-cell) but misleading. Tracked as T8 in the UI sweep doc.
  - Journal notes lack author attribution — tracked as T19 ("real-harm: anonymous notes") in the same doc.
  - Teacher journal entry (`app/teacher/student-journal/entry/page.tsx:113-229`) holds edits client-side until an explicit "Simpan" tap; navigating away first loses unsaved input. Flagged as "real-harm: lost journal input" in the same doc — worth fixing or explicitly warning teachers about before pilot, since this is the kind of bug that generates confusing support requests.
- [ ] **T6 (minor, optional, not blocking)** — e2e coverage gaps: no spec exercises `/teacher/class-attendance` (the Kelas tab) at all, and none cover HR payroll/salary-components/fees/invoices detail pages. Worth closing now that T2 has landed, so both attendance entry points have explicit e2e coverage.

## Implementation

- **T1:** Infra-only — `restore_project` on `vxwywmvpxetdgnxejjgk`, then read-only SQL re-audit. No code changed.
- **T2:** `app/api/student-attendance/mark/route.ts` — added a `ClassSession` lookup by `(classSectionId, date)` before the per-record write loop; single-match days upsert on `studentId_sessionId`, ambiguous/no-match days keep the prior `sessionId: null` find-then-update/create logic. `app/api/__tests__/student-attendance-mark.test.ts` — updated the existing "proceeds for TEACHER" test's `tx` mock to include `classSession.findMany` (now required by the route), and added a new test asserting the single-session path calls `upsert` with `studentId_sessionId` and never touches the legacy `findFirst`.
- **T3:** No app code — PR #381 was a clean `staging` → `main` merge (squash), no additional commits needed beyond what was already on staging.

## Verification

- `npx vitest run app/api/__tests__/student-attendance-mark.test.ts` — 6/6 passed (2 new).
- `npx vitest run` (full suite) — 220 files / 2128 tests passed, 2 skipped, 42 todo (pre-existing, not from this cycle).
- `npm run build` — passed, no type errors.
- Playwright: not run locally this cycle (no UI-visible behavior change — same endpoints, same request/response shape — and this harness defers to CI per the standing policy in [#368](https://github.com/ismailir10/annisaa-erp-v3/pull/368)). Required CI check `Playwright E2E` will gate this cycle's own `/ship`.
- T3's promote PR (#381) required CI (Docs sync, Lint/Typecheck & Test, Build, Playwright E2E) all passed before merge — verified via `gh pr checks 381`.
- T1's prod re-audit ran via read-only `execute_sql` against `vxwywmvpxetdgnxejjgk` — no writes.

## Ship Notes

No migrations in this cycle's own change (T2 is application code only, no schema change). T1 and T3 were infra/ops actions (Supabase resume, staging→main promote), not part of this cycle's `feat/pilot-readiness-audit` → `staging` PR. This cycle's PR carries: the audit doc + the T2 attendance-write-path fix. Rollback: revert the `mark/route.ts` change — it's additive-safe (old behavior is the fallback branch), no data migration needed either direction.

**Remaining before pilot handoff:** T1's real finding (roster not imported — owner action needed) and T4 (live login smoke test, blocked on T1's roster import producing real teacher accounts) are the two items this session could not close. T5/T6 are non-blocking.
