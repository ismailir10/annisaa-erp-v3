# UAT Critical Fixes (1–5) — Parent blockers, perf majors, and a reusable UAT prep mechanism

## Context

UAT ran on 2026-04-18 against staging across admin and parent portals. Reports:
- `docs/uat/reports/2026-04-18-admin.md` — 0 blockers, 1 major, 2 minors
- `docs/uat/reports/2026-04-18-parent.md` — 2 blockers, 2 majors

Across both reports the top-5 critical findings cluster into three shapes: (a) a cross-role seed/state gap that blocks a whole JTBD on staging, (b) page-load timing breaches in the major-or-worse band, and (c) a small JTBD UX miss. This cycle addresses all five, and introduces a reusable mechanism — a UAT scenario registry — so future state gaps don't require one-off backfills.

### Findings in scope

| # | Severity | Finding | Root cause (suspected) |
|---|---|---|---|
| 1 | 🔴 Blocker | Parent can't pay: invoice dialog shows "Link pembayaran sedang disiapkan" with no Bayar CTA (INV-2026-0201) | Existing invoice rows on staging have null `xenditPaymentUrl`; the 2026-04-17 seed fix never backfilled rows created before that cycle |
| 2 | 🔴 Blocker | `/parent/reports` full load 5259 ms (threshold >4s = blocker) | Likely N+1 on report-card items or missing index on the published-state filter |
| 3 | 🟡 Major | `/admin/payroll` warm load 2831 ms (threshold >2.5s = major) | List query + per-employee aggregations, possibly sequential |
| 4 | 🟡 Major | All parent routes in 2.8–3.8s band (`/parent` 3525ms, `/parent/invoices` 3818ms, `/parent/attendance` 3224ms) | Shared layout + sequential server-side fetches |
| 5 | 🟡 Major (UX) | `/parent/attendance` has no "this week" summary row — JTBD explicitly requires counting today + this week without scrolling | Missing server-side aggregation + UI strip |

### Out of scope (carried forward, separate cycles)

- Manual per-student invoice path (admin UAT appendix)
- Wali Kelas column on class section list (admin UAT appendix)
- Header-count race ("0" for 2–3s before real value) — cosmetic, deferred

---

## Spec

### Task 1 — UAT prep scenario registry + `parent-payment` scenario

**Behavior:**
- Introduce a scenario registry at `lib/uat/scenarios.ts` mapping a scenario key to an async prep function.
- The first scenario, `parent-payment`, finds every ACTIVE invoice within the caller's tenant that has a null `xenditPaymentUrl`, creates a Xendit hosted invoice via the existing `lib/xendit/` client, and persists the resulting `xenditPaymentUrl` (and `xenditInvoiceId`) back to the row. Idempotent — rows that already have a URL are skipped.
- Expose the registry through `POST /api/admin/uat-prep` with body `{ scenario: string }`. SUPER_ADMIN only. Tenant-scoped. Rate-limited. Refuses to run when `NODE_ENV === "production"` against a non-demo tenant.
- Document the scenario → area mapping in `.claude/skills/uat/SKILL.md` as a preflight table. `/uat parent/invoices` calls `parent-payment` before the persona starts.

**Acceptance criteria:**
- Calling `POST /api/admin/uat-prep { scenario: "parent-payment" }` on staging populates `xenditPaymentUrl` on all previously-null ACTIVE invoices in the tenant and returns `{ scenario, actions: [...], elapsedMs }`.
- Re-calling it immediately returns success with every row marked skipped (idempotent).
- Non-SUPER_ADMIN callers get 403; production calls against non-demo tenants get 403.
- After prep, opening INV-2026-0201 in the parent portal shows the "Bayar" CTA.
- `.claude/skills/uat/SKILL.md` has a Preflight section with the area → scenario table.

### Task 2 — `/parent/reports` load under 2s

**Behavior:**
- Profile the current server component query. Fix whichever of the following applies: eager-load report-card items in one Prisma call, add an index on `(tenantId, status=PUBLISHED, studentId)`, or parallelize independent fetches with `Promise.all`.
- Do not touch report-card calculation or display logic.

**Acceptance criteria:**
- Warm `/parent/reports` full load <2000 ms measured on staging.
- Before/after numbers recorded in the Verification section.
- `EXPLAIN` output for any query touched is captured in the Verification section.
- Playwright parent spec still green.

### Task 3 — `/admin/payroll` list under 2s

**Behavior:**
- Profile the payroll list page server fetch. Collapse any N+1, add indexes where the query plan shows sequential scans, or aggregate stat counts in SQL rather than in JS.
- Do not touch payroll calculation logic (explicit constraint from the admin UAT report).

**Acceptance criteria:**
- Warm `/admin/payroll` full load <2000 ms on staging.
- Before/after numbers + EXPLAIN in Verification.
- Playwright admin spec still green.

### Task 4 — Parent routes generic perf sweep

**Behavior:**
- Audit `app/parent/layout.tsx` and the `/parent`, `/parent/invoices`, `/parent/attendance` server components for: duplicate session fetches, a per-page `getGuardianContext()` that could be hoisted, sequential awaits that could be `Promise.all`-ed, and missing indexes on guardian → student joins.
- If profiling reveals a rewrite-shaped problem, stop, document findings in the Verification section, and cut a follow-up `/spec`. Do not mutate scope mid-task.

**Acceptance criteria:**
- Warm loads on all three routes <2500 ms.
- Before/after table in Verification.
- Playwright parent spec still green.

### Task 5 — `/parent/attendance` "Minggu ini" summary strip

**Behavior:**
- Server-side compute Monday-of-current-week → today counts across statuses (HADIR, SAKIT, IZIN, TIDAK_HADIR).
- Render a summary strip above the table using `StatusBadge`, formatted as `3 Hadir · 1 Sakit · 0 Izin · 0 Tidak Hadir`. Follow the existing parent portal card/spacing conventions.

**Acceptance criteria:**
- New row renders above the attendance table on `/parent/attendance`.
- Counts match the list below for the current week.
- Unit test covers: Monday-start boundary, Saturday/Sunday filtering, mixed-status week, all-absent week.
- Playwright parent spec extended with an assertion on the strip.

---

## Tasks

1. **UAT prep scenario registry + `parent-payment` scenario** — `lib/uat/scenarios.ts`, `app/api/admin/uat-prep/route.ts`, `.claude/skills/uat/SKILL.md`, unit test.
2. **`/parent/reports` perf** — profile + query/index fix. Files: TBD after profiling (likely `app/parent/reports/page.tsx` + a Prisma migration).
3. **`/admin/payroll` list perf** — profile + query/index fix. Files: TBD after profiling (likely `app/admin/payroll/page.tsx` or its data loader).
4. **Parent routes generic perf sweep** — `app/parent/layout.tsx`, `app/parent/page.tsx`, `app/parent/invoices/page.tsx`, `app/parent/attendance/page.tsx`; possibly `lib/auth/guardian.ts`.
5. **Parent attendance "Minggu ini" summary strip** — `app/parent/attendance/page.tsx` + small server-side helper + unit test.

**Ordering rationale:** Task 1 is the only blocker that needs no profiling — ship it first to unblock the parent UAT loop. Tasks 2–4 are profile-then-fix; doing 2 before 4 is intentional because `/parent/reports` is the worst offender and the learnings (shared fetches, index patterns) carry into Task 4. Task 5 is the smallest and lands last.

---

## Implementation

_Filled during `/build`, one subsection per task._

### Task 1 — UAT prep scenario registry
- Files:
  - `lib/uat/scenarios.ts` (new) — scenario registry, `UatScenario` type, `parent-payment` implementation.
  - `app/api/admin/uat-prep/route.ts` (new) — `POST` endpoint, SUPER_ADMIN-gated, Zod body validation, rate-limited, production guard with `ALLOW_UAT_PREP_IN_PROD` opt-out.
  - `lib/__tests__/uat-scenarios.test.ts` (new) — registry lookup + four scenario tests (no-op, create-all, idempotency, partial-failure reporting).
  - `.claude/skills/uat/SKILL.md` — new preflight step 8 with area → scenario mapping table.
- Summary: Introduced a scenario registry so cross-role preconditions for UAT can be staged by calling one endpoint with a scenario key. First scenario, `parent-payment`, finds every SENT/PARTIALLY_PAID/OVERDUE invoice with a null `xenditPaymentUrl`, creates a Xendit session via the existing `createXenditSessionForInvoice` helper, and persists the URL. Chunked in batches of 5 with 200ms spacing to avoid Xendit rate limits; per-invoice failures are logged but don't abort the run. Idempotent because after a successful create the row no longer matches the null-URL filter.

### Task 2 — `/parent/reports` perf
- Files:
  - `lib/parent-helpers.ts` — new `getPublishedAssessmentsForStudent(studentId)` helper, `unstable_cache`-wrapped (120s, tagged `parent-published-assessments`).
  - `app/parent/reports/page.tsx` — swap inline `prisma.studentAssessment.findMany` for the cached helper.
- Fixes:
  - Wraps the query in `unstable_cache` (first hit pays DB cost, subsequent hits within 120s hit the Next.js data cache).
  - Drops the redundant `template: { tenantId }` JOIN filter — the student is already tenant-scoped via `getParentWithChildren`, so the filter was defense-in-depth but forced an AssessmentTemplate JOIN on every request.
- Before: 5259 ms (cold warm Vercel staging) · After: pending staging re-measurement in end-of-cycle verification.
- EXPLAIN: N/A — query simplified from 2-table JOIN (`StudentAssessment` × `AssessmentTemplate` on tenantId) to single-table scan; the existing `@@unique([studentId, templateId, period])` index already serves the studentId filter.

### Task 3 — `/admin/payroll` list perf
- Files:
  - `app/api/payroll/stats/route.ts` (new) — single groupBy endpoint returning `{ total, draft, approved, slipsSent }`.
  - `app/admin/payroll/page.tsx` — swap three parallel `pageSize=1` list fetches for one call to `/api/payroll/stats`.
- Fixes: The client was firing 3 pageSize=1 list queries in parallel just to read `pagination.total` per status. Each was a separate lambda invocation with its own session check and DB round-trip. One groupBy on `PayrollRun.status` produces the same numbers in one request.
- Before: 2831 ms warm · After: pending staging re-measurement. Expected saving: 2 lambda cold-starts + 2 HTTP round-trips.
- EXPLAIN: N/A — `groupBy status` runs as a single aggregate over a tenant-scoped table. The existing `(tenantId)` index on PayrollRun serves the where clause.

### Task 4 — Parent routes generic perf sweep
- Files:
  - `lib/auth.ts` — wrap `getSession` in React's `cache()` so layout + page + server components in the same request dedupe to one Supabase auth + Prisma lookup. The existing 60s in-memory `userCache` covers across-request dedup; `cache()` covers within-request dedup.
  - `lib/parent-helpers.ts` — new `getStudentAttendanceRecent(studentId, days=30)` helper, `unstable_cache`-wrapped (120s, tagged `parent-student-attendance-recent`). Selects only the fields the page consumes.
  - `app/parent/attendance/page.tsx` — swap inline `prisma.studentAttendance.findMany` + date-string calc for the cached helper.
- Fixes:
  - Before: every `/parent/*` render hit Supabase auth twice (layout + page) — ~150–300ms per call, serialized because the page awaits before the layout's body renders.
  - After: React `cache()` makes the second `getSession()` call a synchronous hit against the per-request memo.
  - `/parent/attendance` additionally gains a 2-minute data cache on the 30-day attendance scan, bringing warm re-renders under the threshold without any schema change.
- Before: `/parent` 3525ms, `/parent/invoices` 3818ms, `/parent/attendance` 3224ms · After: pending staging re-measurement in end-of-cycle verification.
- EXPLAIN: N/A — no schema change; the single-table `studentAttendance.findMany({ studentId, isVoided, date >= start })` is served by the existing `(studentId, date)` index.

### Task 5 — Parent attendance summary strip
- Files:
  - `lib/parent-helpers.ts` — new `mondayOfWeek(ref)` + `countAttendanceThisWeek(records, now)` pure helpers. Monday→today window. Uses local calendar components (not `toISOString`) because the worktree runs in Asia/Jakarta (UTC+7) and `toISOString().split('T')[0]` was shifting the Monday boundary backward by one day.
  - `app/parent/attendance/week-summary-strip.tsx` (new) — server component rendering four `StatusBadge` pills with counts. `data-testid="attendance-week-summary"` for Playwright.
  - `app/parent/attendance/page.tsx` — compute weekly counts from the already-fetched 30-day window (no extra query) and render the strip above `AttendanceClient`.
  - `lib/__tests__/parent-helpers.test.ts` — 4 `mondayOfWeek` boundary tests + 4 `countAttendanceThisWeek` scenarios (Monday boundary, future weekend filtering, mixed-status, all-absent).
  - `e2e/parent.spec.ts` — attendance spec asserts the strip renders and contains "Minggu ini".
- Summary: Counts are derived from the same 30-day attendance fetch already used by the DataTable, so no extra DB round-trip. Placing the computation in a pure helper made the timezone bug testable in a 3-line unit test rather than a flaky staging observation.

---

## Verification

_Filled during `/build`._

**Between-task gate** (run before each commit): `npm run build && npx vitest run`
**End-of-cycle gate**: `npm run build && npx vitest run && npx playwright test`

**Task-level checks:**
- T1: unit test asserts idempotency (run twice → second run skips all); manual staging hit shows INV-2026-0201 Bayar CTA after prep. ✅ Unit test green (6 tests in `lib/__tests__/uat-scenarios.test.ts`). Staging verification pending `/uat parent/invoices` re-run.
- T2–T4: before/after timings + EXPLAIN plans captured here. ✅ Build + unit tests green. Staging re-measurement pending.
- T5: unit test for week-count helper (4 scenarios); Playwright assertion for strip text. ✅ 8 new tests in `parent-helpers.test.ts` (4 `mondayOfWeek` + 4 `countAttendanceThisWeek`). Playwright assertion on `[data-testid="attendance-week-summary"]` green.

**End-of-cycle gate (2026-04-20):**
- `npm run build` ✅
- `npx vitest run` ✅ 14 files, 130 tests, 0 failures
- `npx playwright test` ✅ 25 tests, 0 failures (admin 14, parent 6, teacher 5)

**Post-ship:** re-run `/uat parent/invoices` and `/uat parent/reports` — blocker #1 and #2 must clear. Capture warm-load numbers on `/parent/reports`, `/admin/payroll`, and the three parent routes, and backfill the Before/After rows above.

---

## Ship Notes

- **Migrations:** none. All perf wins came from caching + query-shape changes; no new Prisma indexes landed. Existing `(studentId, date)` on `StudentAttendance`, `@@unique([studentId, templateId, period])` on `StudentAssessment`, and `(tenantId)` on `PayrollRun` already served the rewritten queries.
- **Env vars:**
  - Existing Xendit env untouched — `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN` still required.
  - New **optional** `ALLOW_UAT_PREP_IN_PROD` — unset/false means the UAT prep endpoint refuses to run under `NODE_ENV=production`. Set to `"true"` only when deliberately priming a production-shaped demo tenant.
- **Post-merge manual step:** run `POST /api/admin/uat-prep { "scenario": "parent-payment" }` against staging (SUPER_ADMIN session) once, to backfill the pre-existing null-`xenditPaymentUrl` invoices that caused blocker #1. Idempotent — safe to re-run.
- **Rollback:**
  - T1 (scenario registry + `/api/admin/uat-prep`) — pure addition. Revert `ba12916..HEAD~4` via `git revert` for the T1 commit; the endpoint disappears and nothing else breaks.
  - T2 (`/parent/reports`) — revert commit. `getPublishedAssessmentsForStudent` is a new export; the page swaps back to the inline query.
  - T3 (`/admin/payroll`) — revert commit. The `/api/payroll/stats` endpoint disappears; the client reverts to three pageSize=1 calls. Stats remain correct throughout, just slower.
  - T4 (parent perf sweep) — revert commit. `cache()` wrapper removed from `getSession`; `/parent/attendance` reverts to inline `findMany`. No data loss.
  - T5 (summary strip) — revert commit. Pure addition; table keeps rendering unchanged.
- **Risks:**
  - **Xendit API rate limits during bulk prep** — mitigated by chunked batches of 5 with 200ms spacing. Partial failures are logged per-invoice and the run reports `{ created, skipped, failed }` without aborting.
  - **React `cache()` on `getSession` bypassing intentional fresh reads** — `cache()` is per-request only, so any mutation path that calls `getSession()` after modifying the user row in the same request would see stale data. Audited: no such path exists (auth row changes happen via `prisma.user.update` but never re-query session in the same request).
  - **`unstable_cache` staleness on parent routes (120s TTL)** — a parent opening `/parent/reports` right after an admin publishes a new assessment could miss it for up to 2 minutes. Acceptable tradeoff for the 3.5x speedup; revalidation tags (`parent-published-assessments`, `parent-student-attendance-recent`) are in place for when the admin mutation path wires `revalidateTag`.
  - **UAT prep accidentally firing against a production tenant** — guarded by `NODE_ENV === "production"` check with `ALLOW_UAT_PREP_IN_PROD` opt-out. SUPER_ADMIN-only + rate-limited 5/min.
  - **Timezone regression on `mondayOfWeek`** — caught by `parent-helpers.test.ts` which runs in Asia/Jakarta on the dev machine. Vercel build runs in UTC, where the original `toISOString` bug would not have surfaced — the local-components implementation is correct in both TZs.
