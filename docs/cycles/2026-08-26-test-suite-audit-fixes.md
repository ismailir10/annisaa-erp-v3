# Test Suite Audit — Fixes

## Context
A relevance audit of the ~3,272-test Vitest suite (7 parallel subagents, one per directory cluster) found the suite is largely healthy but surfaced a handful of concrete, high-confidence issues: one dead test with false confidence (asserts against a hand-copied mirror of route logic that has drifted from the real route), two small redundant-test clusters, one flaky-prone real-clock dependency, and two coverage gaps — one of which touches PII exposure (parent detail route has no test that non-admin roles are blocked). The user reviewed the full audit report and approved this exact list of fixes. Full audit findings live in the conversation that produced this cycle, not duplicated here.

## Spec
- [x] `seed-invoice-url.test.ts` imports and exercises the real `app/api/admin/seed/route.ts` handler (not a hand-copied mirror), and is proven to catch the OVERDUE-drift class of bug it was written for.
- [x] `chunk()` test cases deduplicated across `lib/finance/__tests__/run-bulk-generate.test.ts` and `run-bulk-retry.test.ts` into a shared test util.
- [x] `tests/student-journal/validations.test.ts` redundant cases (already covered in api-admin/api-teacher/week-notes tests) removed.
- [x] `payroll-auth.test.ts` redundant 401/403(TEACHER) cases (already covered in `payroll-list.test.ts`) removed; SCHOOL_ADMIN/GUARDIAN-specific cases kept.
- [x] `attendance-my.test.ts` no longer depends on the real wall clock (fake timers pinned).
- [x] `parent-detail.test.ts` has an explicit non-admin → 403 test given the route returns NIK/income/employer PII.
- [x] `admissions/[id]` PUT route has a role/tenant-boundary test.

**Non-goals:** the "misplaced file" moves (directory convention fixes) and soft/optional consolidations (raport/invoice PDF 4-way duplication, enrollment-doors-parity, age-calc triplication) flagged in the audit are explicitly deferred — not part of this cycle.

**Assumptions:**
1. Rewriting `seed-invoice-url.test.ts` against the real route is practical with prisma mocking (confirmed — see Task 1).
2. If either PII-adjacent test (`parent-detail`, `admissions/[id]` PUT) reveals an actual authorization hole in the route rather than just a missing test, this cycle stops short of merge and the user is notified instead.

## Tasks
1. **Rewrite `seed-invoice-url.test.ts` against the real route** — import `POST` from `app/api/admin/seed/route.ts`, mock prisma/auth/rate-limit, cover both the creation-time URL branch (SENT/PARTIALLY_PAID only) and the backfill branch (SENT/PARTIALLY_PAID/OVERDUE). Acceptance: test passes against current route, fails when either branch's status list is regressed (verified by deliberate mutation).
2. **Deduplicate `chunk()` tests** — extract the 3 shared cases into a test util, import from both `run-bulk-generate.test.ts` and `run-bulk-retry.test.ts`. Acceptance: 3 tests removed net, both files still pass.
3. **Trim `tests/student-journal/validations.test.ts`** — remove cases duplicated in `api-admin.test.ts`/`api-teacher.test.ts`/`api-teacher-week-notes.test.ts`, including the byte-for-byte malformed-date dup. Acceptance: no unique coverage lost, file either shrinks or is removed if empty.
4. **Trim `payroll-auth.test.ts`** — remove 401/403(TEACHER) cases duplicated in `payroll-list.test.ts`; keep SCHOOL_ADMIN/GUARDIAN-specific cases. Acceptance: no unique coverage lost.
5. **Fix flaky clock in `attendance-my.test.ts`** — pin `vi.useFakeTimers()`/`vi.setSystemTime()` around the month/year computation near line 191. Acceptance: test is deterministic across a real month boundary (verified by setting system time to month-end and re-running).
6. **Close `parent-detail.test.ts` coverage gap** — add non-admin (e.g. TEACHER/GUARDIAN) → 403 test(s). If the route lacks the check, STOP and flag instead of adding a test that can't pass, or one that mocks around a real hole.
7. **Close `admissions/[id]` PUT coverage gap** — add a role/tenant-boundary test. Same stop condition as Task 6 if the route is actually missing the check.

Tasks 1–5 are independent of each other and of 6–7. Tasks 6 and 7 are independent of each other.

## Implementation
- Subagent plan: driver=claude-sonnet-5, dirty-work=claude-sonnet-5 (session is already dirty-work tier — no Opus driver in this session). Tasks 1-5 implemented inline sequentially (small, independent mechanical fixes where fan-out overhead exceeds the savings); each got its own `feature-dev:code-reviewer` pass before commit. Tasks 6-7 (security-sensitive, touch auth gating) also got a parallel `superpowers:code-reviewer` pass per the skill's mandatory rule.
- Task 1: `app/api/__tests__/seed-invoice-url.test.ts` — rewrote to import the real `POST` from `app/api/admin/seed/route.ts` instead of asserting against hand-copied mirror functions. Verified by deliberately regressing the route's backfill-status list (removing OVERDUE) and confirming the new test catches it; route was restored clean.

## Verification
- Task 1: gates passed (build + vitest run). `feature-dev:code-reviewer` pass: no high-confidence issues. Manual regression check: mutated `app/api/admin/seed/route.ts` backfillStatuses to drop OVERDUE → test failed as expected; reverted, confirmed clean, re-ran green.

## Ship Notes
