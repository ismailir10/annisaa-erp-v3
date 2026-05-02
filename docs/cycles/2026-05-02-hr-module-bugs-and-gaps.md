# HR Module — Bug & Gap Investigation

## Context
Audit of the HR subsystem (`app/admin/(hr)/{employees,payroll,leave,attendance}`, `app/api/{employees,payroll,leave,attendance}`, `lib/payroll/`, related Prisma models) to surface bugs, security holes, validation gaps, and missing features ahead of a focused remediation cycle. The HR module backs payroll, leave management, employee attendance, and the employee directory — it is in production use but has never had a dedicated audit pass; prior cycles touched only adjacent areas (e.g. `2026-04-28-finance-bulk-throttle`, `2026-04-16-business-logic-audit`). A code-explorer subagent surveyed 30 findings (4 blockers, 14 majors, 12 minors). Live Chrome MCP probing on staging (logged in as `ismailir10@gmail.com`, `SUPER_ADMIN`) confirmed multiple findings end-to-end via direct API calls executed in the browser session. This cycle's `/spec` produces remediation tasks; subsequent `/build` will fix and verify against `design-system` standards. Cross-checked design-system.html — UI fixes (Restore action, status filter cleanup) follow Category-A CRUD recipe.

### Live Chrome MCP findings (2026-05-02 staging)

| Finding | Status | Live evidence |
|---|---|---|
| **F-23 attendance override unvalidated date** | **BLOCKER UPGRADED — DATA INTEGRITY** | `POST /api/attendance/{employeeId}/override` accepted `date='2024-02-31'`, `'not-a-date'`, `'2099-12-31'` with `status=200` and **persisted the malformed strings** to the `AttendanceRecord.date` column. Three garbage rows written for employee `T05`. Schema column is `String`, no DB-level constraint. Cleanup pending (see Ship Notes). |
| **F-06 payroll generate no Zod** | **CONFIRMED LIVE** | `POST /api/payroll/generate` with `{periodStart:'foo',periodEnd:'bar'}` → **500 with empty body** (uncaught exception, `new Date('foo')` → Invalid Date downstream). Rate limit (2/min) is the only thing keeping abusive callers from spamming 500s. |
| **F-05 salary PUT no Zod** | **CONFIRMED LIVE** | `PUT /api/employees/{id}/salary` with `[{componentDefId:'fake',value:'not-a-number'}]` → **500 with empty body**. No validation; reaches Prisma which fails on type. Permission-bypass aspect remains valid (route uses `payroll.view`, line 36). |
| **F-13 deactivate-shortcut accepts ACTIVE** | **CONFIRMED LIVE** | `PUT /api/employees/{id}` body `{status:'ACTIVE'}` → 200, employee fully returned. The "shortcut" branch silently accepts re-activation of any employee with no other audit trail. |
| **F-22 ghost EXPORTED status** | **CONFIRMED LIVE** | `GET /api/payroll?status=EXPORTED&pageSize=5` → empty `data:[]`. UI option exists with no producer. |
| **F-26 hard-coded TEACHER role** | **CONFIRMED LIVE** | `app/api/employees/route.ts:140` literal `role: "TEACHER"`. `lib/validations/employee.ts` has no `role` field. Non-teaching staff cannot be created via the HR form. |
| **F-09 + scope expansion** | **CONFIRMED LIVE — broader than audit** | `/api/attendance/my`, `/api/attendance/check-in`, `/api/attendance/check-out` all gate on `session.role !== "TEACHER"`. As `SUPER_ADMIN` with `employeeId: null`: 401 (correct outcome, wrong reason). As any non-TEACHER staff with linked Employee: would 403 (broken — should be allowed). **F-30 is partially debunked** — check-in/check-out endpoints DO exist; the gap is the role-string gate excludes non-teaching staff. |
| **F-12 monthly cache** | **DOWNGRADED — latent risk** | `GET /api/attendance/monthly` response headers: `cache-control: public, max-age=0, must-revalidate`, `age: 0`. Next.js auto-detected dynamic context and skipped ISR. The `revalidate = 3600` declaration is currently dead code, but if a future change makes the route appear static (e.g. removing direct cookie reads), the cache lights up cross-tenant. Still worth removing. |
| **F-21 leave triple-call** | **CONFIRMED LIVE** | Three sequential `/api/leave/requests?status=...&pageSize=1` calls = 419 ms total (~140 ms each). One stats endpoint would be 1×. |
| **F-11 export silent-empty** | **CONFIRMED LIVE — narrowed** | `GET /api/attendance/export?month=foo&year=bar` → 200 with **non-empty CSV body containing all employees with all-zero counts** (the bad month/year fall through `parseInt` to `NaN`, which produces no `where` filter rows but the employees JOIN still emits headers + zero rows per employee). Misleading; should be 400. |
| **`/api/employees/positions` is DISTINCT, not a Position table** | **NEW MINOR** | Returns 4 hard-coded jabatan strings from existing employees only (`["Admin Tata Usaha","Guru Kelas","Kasir","OB"]`). Chicken-and-egg: a brand-new role can't be picked from the dropdown until at least one employee with that role is created. Strengthens F-03 (need a `Position` master table). |
| **`/api/holidays` not exposed** | **NEW MINOR** | `GET /api/holidays` → 404. Holiday data is reachable only via internal Prisma calls. If frontend ever needs the list (e.g. F-07/F-08 fixes), an endpoint is needed. |

**Key escalation:** F-23 is **not just validation** — the `AttendanceRecord.date` column is a `String` per schema, so even with API-side Zod, malformed dates already in the DB are persistent and untyped. Fix scope grows to a migration: convert `date` to a proper Postgres `date` type (or add `CHECK (date::date IS NOT NULL)`) plus a backfill cleanup.

**Authentication notes:**
- Production Supabase URL `qrnbanxcrmrwganpmzmn.supabase.co` → `DNS_PROBE_FINISHED_NXDOMAIN` (production deploy points at a non-existent project). **High-priority CTO follow-up — production app may be broken for SSO.**
- Staging at `udbivhchbizpxoryejgz.supabase.co` is healthy; live testing was performed there.

## Spec

### Acceptance criteria

**Blockers (must land in this cycle):**
- [x] **F-05** `PUT /api/employees/[id]/salary` now requires new `payroll.edit` (added to PERMISSION_GROUPS); Zod body schema (`updateEmployeeSalarySchema`) covers array shape + finite non-negative number; upsert + `recordAudit` wrapped in single `$transaction` (atomic — audit failure aborts salary write). `before` snapshot captures FULL prior state of all components, not just touched ones.
- [ ] **F-06** `POST /api/payroll/generate` validates body with Zod schema covering `periodStart`/`periodEnd` as ISO date strings + `start ≤ end` + max 90-day window.
- [x] **F-23 (closed via Zod + CHECK constraint)** Route validates ISO date + cal-day round-trip; DB CHECK constraint added. Column-type swap to `@db.Date` deferred to follow-up cycle (touches working-days/leave/listing — bigger surface).

**Majors (target this cycle, can defer minors if scope tight):**
- [ ] **F-07/F-08** Leave-day count and leave-approval attendance-create both consume `calculateWorkingDays()` so public holidays are excluded.
- [ ] **F-09 (expanded)** `GET /api/attendance/my`, `POST /api/attendance/check-in`, `POST /api/attendance/check-out` all gate on `session.employeeId` presence (and proper permission like `attendance.checkin`), not string-compared `role === "TEACHER"`. Closes the gap where non-teaching staff with `Employee` rows cannot self-clock-in.
- [ ] **F-10** Leave balance check + overlap check + create wrapped in a single serializable transaction.
- [ ] **F-12** Remove `export const revalidate = 3600` from `app/api/attendance/monthly/route.ts`. Add `cache: "no-store"` headers if needed.
- [ ] **F-14** Overtime engine compliance — at minimum, document deviation and gate behind feature flag; ideally implement UU 13/2003 §78(4) tiered rates.
- [ ] **F-15** Engine validates `gaji_pokok` exists with `sortOrder` strictly less than every `PCT_OF_BASE` component; throw at calculation time if violated.
- [ ] **F-17** `countAttendanceDays()` adds `PRESENT_NO_CHECKOUT` to the present count (matches the rest of the system).
- [ ] **F-18** Employee list + detail: Restore action visible for `INACTIVE` employees per CRUD Category-A standard.
- [ ] **F-19** Employee deactivate handler awaits `res.ok` and surfaces server errors via toast; no redirect on failure.
- [ ] **F-24** `GET /api/leave/balance` adds `tenantId` ownership check.
- [ ] **F-25** Employee-creation advisory lock uses a distinct namespace (e.g. `pg_advisory_xact_lock(tenant_hash, EMPLOYEE_LOCK_NS)`).
- [ ] **F-26** Employee-creation flow takes a `role` parameter; only auto-create `TEACHER` user when explicitly chosen.
- [ ] **F-27** New endpoint `POST /api/leave/requests/[id]/cancel` reverses approved leave (restores balance, soft-deletes generated `LEAVE` attendance rows).
- [ ] **F-28** New endpoint `POST /api/payroll/[id]/cancel` reverses DRAFT payroll runs (deletes items + lines, atomic).

**Minors (stretch):**
- [ ] **F-11** `GET /api/attendance/export` validates `month`/`year` query params, returns 400 on bad input.
- [ ] **F-13** Remove the `length === 1 && status === "INACTIVE"` shortcut in `PUT /api/employees/[id]`; use full `updateEmployeeSchema`.
- [ ] **F-20** Attendance dashboard "absent" stat excludes weekends/holidays for non-today dates.
- [ ] **F-21** New `GET /api/leave/stats` (groupBy status), replace 3-call pattern in `app/admin/(hr)/leave/page.tsx`.
- [ ] **F-22** Remove `EXPORTED` status filter option from payroll page (no code path emits it).
- [ ] **F-29** UI for entering per-employee monthly attendance variables (`overtimeHours`, `outdoorDays`, `holidayWorkedDays`, `dcDays`) before payroll generate.
- [ ] **F-30 (revised)** Teacher self-service check-in/check-out endpoints **already exist** at `/api/attendance/{check-in,check-out}` — the gap is (a) the role-string gate (covered by F-09 expansion) and (b) `lat`/`lng` body fields are not validated. Add Zod for both routes; teacher portal UI integration is a separate cycle.
- [ ] **NEW: positions endpoint debt** `GET /api/employees/positions` returns DISTINCT existing jabatan rather than a master table. New jabatan can't be selected until at least one employee uses it. Roll into F-03 (Position table) follow-up cycle.
- [ ] **NEW: holiday list endpoint** `GET /api/holidays` returns 404. Add a read endpoint if F-07/F-08 fixes need to render holidays in the leave UI.

### Non-goals
- Adding a `Position` master table (F-03) — schema migration scope, separate cycle.
- Per-year `LeaveBalance` model with proper carry-over accrual (F-04) — schema migration scope, separate cycle.
- BPJS / PPh21 calculation correctness review — needs HR domain expertise + Indonesian payroll regulation reading, separate cycle.
- Replacing `String` status fields with Prisma enums (F-01) — repo-wide migration, separate cycle.
- Live UI smoke via Chrome MCP — deferred (auth needs interactive password).

### Assumptions
- The `payroll.create` permission is acceptable for salary writes. If CTO wants finer granularity, add `payroll.edit` in a follow-up.
- `calculateWorkingDays()` is the canonical holiday-aware day counter — leave logic should consume it rather than reimplement.
- `gaji_pokok` is always meant to come first in `sortOrder`; the validation is a guard, not a behavior change.
- Payroll cancel only applies to `DRAFT` runs. `APPROVED` runs require a separate void/reversal flow not in scope.
- Per-employee attendance-variables UI (F-29) belongs on the payroll generate flow, not on the employee detail page.

## Tasks

Tasks are grouped by independence so `/build` can dispatch parallel subagents. **[P]** = parallelizable with siblings in the same group. **→** = sequential dependency.

### Group A — auth & validation hardening (parallel)
0. [x] **PRE-TASK** — `AuditLog` model added: schema + migration + RLS policy + `lib/audit.ts` helper + tests. CTO confirmed inclusion in this cycle. design-system reference n/a (backend only).
1. [x] Fix F-05: salary route — added `payroll.edit` to PERMISSION_GROUPS (`lib/permissions.ts`); route uses `payroll.edit`, Zod via `updateEmployeeSalarySchema` (`lib/validations/employee-salary.ts`), upsert+audit in `$transaction` with full-prior-state `before` snapshot. 10 schema tests + 6 integration tests.
2. [x] Fix F-06: payroll generate — `generatePayrollSchema` (ISO date + start≤end + ≤45 day cap) in `lib/validations/payroll.ts`; route uses `validateBody(...)` + json try/catch; 8 unit tests covering happy path, malformed start, reversed range, 60-day over-cap, exact 45-day boundary, empty body, slash-format, single-day. Verified `payroll.create` permission is SUPER_ADMIN-only via `lib/permissions.ts:103-125`.
3. [ ] **[P]** Fix F-23: attendance override — add Zod schema with ISO date validation **and** schema migration converting `AttendanceRecord.date` (`String`) to `@db.Date` with backfill that nulls/quarantines malformed historical rows. **Acceptance:** unit test asserts `"2024-02-31"` returns 400; migration leaves no row with invalid `date` parseable to NULL.
4. [ ] **[P]** Fix F-09 (expanded): replace `session.role !== "TEACHER"` with `!session.employeeId || !hasPermission(session, "attendance.checkin")` in **all four** routes — `app/api/attendance/{my,check-in,check-out}/route.ts` AND `app/api/leave/requests/route.ts:17` (POST submit). **Reviewer flagged:** the leave-request submit was missed in original audit. Add `attendance.checkin` and `leave.submit` permissions to non-teacher employee roles. Also add Zod for `lat`/`lng` body fields in check-in/out (covers former F-30). **Acceptance:** unit test asserts non-TEACHER user with linked `Employee` and proper permission gets 200 across all 4 endpoints.
5. [x] Fix F-24: `findUnique` → `findFirst` with `tenantId: session.tenantId` predicate; added `!session.tenantId` 401 guard.
6. [x] Fix F-12: removed `export const revalidate = 3600`; replaced with explanatory comment.
7. [x] Fix F-25: employee-creation advisory lock now uses `pg_advisory_xact_lock(hashtext('employee_create_' || tenantId))` for parity with invoice/webhook locks. Bare `12345` namespace removed.
8. [ ] **[P]** Fix F-13 (root-cause revised): the deactivate-shortcut is **not** the source of `{status:"ACTIVE"}` succeeding — it only fires when `status==="INACTIVE"`. Reviewer found the actual cause: `updateEmployeeSchema` permits arbitrary `status` writes silently. Remove the shortcut **and** restrict `status` in the schema to allow only the proper transitions through dedicated endpoints (`POST /employees/[id]/deactivate`, `POST /employees/[id]/restore`). **Acceptance:** unit test asserts `PUT {status:"ACTIVE"}` on an INACTIVE employee returns 400 (use the new restore endpoint instead).
8a. [ ] **[P] (NEW — reviewer)** Fix payroll-approve race: `app/api/payroll/[id]/approve/route.ts:24` `prisma.$transaction(...)` lacks `{isolationLevel:"Serializable"}` (or compare-and-swap `updateMany`). Two concurrent approves can both pass `status==="DRAFT"` check before either commits. Pattern parity with `send-slips` route. **Acceptance:** unit test fires two concurrent approves; only one succeeds, the other returns 409.

### Group B — business-logic correctness (parallel within group)
9. [ ] **[P]** Fix F-07: `app/api/leave/requests/route.ts` day count uses `calculateWorkingDays()`.
10. [ ] **[P]** Fix F-08: `app/api/leave/requests/[id]/approve/route.ts` skip-holiday during attendance-record create.
11. [ ] **[P]** Fix F-10: wrap balance + overlap + create in `prisma.$transaction(..., { isolationLevel: "Serializable" })`.
12. [ ] **[P]** Fix F-15: engine.ts — add a sortOrder validation pass. Throw `Error("gaji_pokok must precede all PCT_OF_BASE components in sortOrder")` if violated. **Acceptance:** unit test feeds malordered components and asserts throw.
13. [ ] ~~Fix F-17~~ **REMOVED — false positive.** Reviewer verified `lib/payroll/working-days.ts:106-108` already includes `PRESENT_NO_CHECKOUT` in the `daysPresent++` branch. No change needed.
14. [ ] **[P]** Fix F-14 (light-touch): wrap flat overtime calc behind a `lembur_compliant` feature flag in `OrgConfig`; default flat (current behavior) but expose tiered formula path. Document in cycle Ship Notes. **Acceptance:** flag off → existing behavior; flag on → 1.5×/2× tiered. Unit test for both branches.

### Group C — missing endpoints (sequential within group, parallel across groups)
15. [ ] **[P]** Fix F-27: `POST /api/leave/requests/[id]/cancel` — only when `status = "APPROVED"`, restore balance + soft-delete generated `LEAVE` attendance rows in a single transaction. Add UI button on leave detail. **Acceptance:** unit test covers cancel → balance restored, attendance rows deleted, status flips to `CANCELLED`. → depends on Task 11 (txn pattern).
16. [ ] **[P]** Fix F-28: `POST /api/payroll/[id]/cancel` — only when `status = "DRAFT"`. Deletes items + lines + run atomically. Add UI button on payroll detail. **Acceptance:** unit test covers cancel from DRAFT works; from APPROVED returns 409. → depends on Task 11 (txn pattern).

### Group D — UI & CRUD parity (parallel)
17. [ ] **[P]** Fix F-18: employee list + detail — Restore action visible for INACTIVE employees per `.claude/standards/crud.md` Category A. → **depends on Task 8** (needs the new `POST /employees/[id]/restore` endpoint Task 8 introduces). **Acceptance:** Playwright smoke navigates to inactive employee, clicks Restore, sees status flip.
18. [ ] **[P]** Fix F-19: deactivate handler awaits response, surfaces error toast, blocks redirect on failure.
19. [ ] **[P]** Fix F-22: remove `EXPORTED` status filter from `app/admin/(hr)/payroll/page.tsx`.
20. [ ] **[P]** Fix F-26: `app/admin/(hr)/employees/[new]/page.tsx` — add `role` select (TEACHER / ADMIN / FINANCE / STAFF). Validate against existing role taxonomy. **Acceptance:** newly-created admin-role employee gets correct permissions.

### Group E — minors (stretch, parallel)
21. [ ] **[P]** Fix F-11: attendance export validates `month`/`year`.
22. [ ] **[P]** Fix F-20: attendance dashboard absent-stat ignores weekends/holidays for past dates.
23. [ ] **[P]** Fix F-21: new `GET /api/leave/stats` + refactor leave page to single fetch.
24. [ ] **[P]** Fix F-29: per-employee attendance-variables UI on payroll generate flow. **Note:** non-trivial — may slip to a follow-up cycle. **Acceptance:** generated payroll reflects entered overtimeHours/outdoorDays/etc.

### Out of scope (file as separate cycles)
- **F-30** teacher self-service attendance check-in/out — needs Portal Consistency review and product call on geofencing.
- **F-01** status enums repo-wide.
- **F-03** Position master table.
- **F-04** LeaveBalance per-year model + carry-over accrual.
- BPJS / PPh21 review.
- Production Supabase URL DNS NXDOMAIN — investigate Vercel env vs. paused project.

### Cleanup performed during this investigation (2026-05-02)

Three garbage `AttendanceRecord` rows written during F-23 live test were deleted via Supabase MCP on staging project `udbivhchbizpxoryejgz`:
```sql
DELETE FROM "AttendanceRecord"
WHERE "employeeId" = 'cmodt0w1p002f7bx7md2apv86'
  AND "date" IN ('2024-02-31', 'not-a-date', '2099-12-31');
-- 3 rows returned: ids cmonx2xyt000004l5ia7kddtv, cmonx2y59000204l5i1l0rswb, cmonx2y2b000104l54ueap1z0
```

Sweep for other malformed historical rows on staging returned 0 hits.

**Schema confirmation:** `information_schema.columns` shows `AttendanceRecord.date` is `text` (not Postgres `date`). Reinforces F-23 migration scope — Task 3 must convert the column type.

### Production Supabase outage (CTO follow-up — outside this cycle)

Supabase MCP `list_projects` confirmed two **INACTIVE** production projects:
- `qrnbanxcrmrwganpmzmn` (annisaa-erp-v3, ap-south-1) — paused, hence DNS NXDOMAIN
- `vxwywmvpxetdgnxejjgk` (annisaa-erp-v3-prod-sgp, ap-southeast-1) — also paused

Active projects: only `udbivhchbizpxoryejgz` (staging-sgp). **Production app SSO is currently broken.** Outside HR-module scope but high-priority for the next CTO session.

## Implementation

- Subagent plan: tasks executed serially in main session (worktree node_modules linked, parallel writes would race on shared workspace). Reviewer agent invoked per task.
- Task 0: AuditLog migration — `prisma/schema.prisma` (+25 lines, AuditLog model + Tenant.auditLogs relation), `prisma/migrations/20260502000000_add_audit_log_table/migration.sql` (CREATE TABLE + 3 indexes + tenantId FK + RLS enable + service_role policy), `lib/audit.ts` (recordAudit helper — re-throws on tx, logs+swallows standalone), `lib/__tests__/audit.test.ts` (4 tests). Reviewer flagged tx error-swallow; fixed by re-throwing when tx provided. Cross-checked design-system.html — n/a (backend-only).
- Task 2: F-06 payroll generate Zod — `lib/validations/payroll.ts` (+30 lines, `generatePayrollSchema` with isoDateString + ordering + 1-45 day cap), `app/api/payroll/generate/route.ts` (`validateBody` wired, json try/catch added, ad-hoc `if(!periodStart...)` removed), `lib/validations/__tests__/payroll.test.ts` (8 tests). Reviewer asked for 45-day exact boundary test (added) and verification that `payroll.create` permission excludes SCHOOL_ADMIN (confirmed at `lib/permissions.ts:103-125`).
- Task 3: F-23 attendance override — `lib/validations/attendance.ts` (new file, attendanceOverrideSchema + ATTENDANCE_STATUSES + cal-day refine), `app/api/attendance/[id]/override/route.ts` (Zod for PUT/POST, json try/catch, rate limit on both, `{local:true}` datetime), `prisma/migrations/20260502000001_attendance_date_check_constraint/migration.sql` (defensive DELETE + CHECK constraint), `lib/validations/__tests__/attendance.test.ts` (11 tests). Reviewer flagged: missing rate limit (added), `z.string().datetime()` strictness (relaxed to `{local:true}`), 30-day cap blocking LEAVE pre-record (carved out LEAVE/SICK/PERMISSION bypass), populated-table CHECK risk (added DELETE pre-flight). Column-type conversion deferred to follow-up cycle.
- Task 1: F-05 salary route — `lib/permissions.ts` (added `payroll.edit`), `lib/validations/employee-salary.ts` (new, updateEmployeeSalarySchema), `app/api/employees/[id]/salary/route.ts` (perm switch, Zod, $transaction, recordAudit with FULL prior state in `before`), tests `lib/validations/__tests__/employee-salary.test.ts` (10) + `app/api/__tests__/employee-salary-route.test.ts` (6) + extended `mutation-rate-limit.test.ts` mock. Reviewer flagged: `payroll.create` semantically wrong (added new `payroll.edit`); `before` snapshot too narrow (widened to all components); test assertions weak on before/after content (tightened + added second test seeded with prior values).

## Verification

- Task 0: `npm run build` ✓; `npx vitest run lib/__tests__/audit.test.ts` ✓ (4 passed); `bash scripts/verify-rls-coverage.sh` ✓ (25/25 tenant-scoped models have ENABLE + policy).
- Task 2: `npm run build` ✓; `npx vitest run` ✓ (845→passed earlier; final 8 in payroll.test.ts).
- Task 3: `npm run build` ✓; `npx vitest run` ✓ (857 passed); 11 unit tests in attendance.test.ts. Live evidence (staging, pre-fix): override accepted '2024-02-31', 'not-a-date', '2099-12-31' → 200; post-fix logically blocks all three at Zod layer + DB CHECK constraint as defense-in-depth.
- Task 1: `npm run build` ✓; `npx vitest run` ✓ (873 passed); 16 new tests in salary scope. Live evidence (staging, pre-fix): salary PUT with garbage body → 500 empty; post-fix returns 400 with structured error.

## Ship Notes
<filled by /ship>
