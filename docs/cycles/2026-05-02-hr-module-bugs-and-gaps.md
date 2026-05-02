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
4. [x] Fix F-09 expanded: 4 routes now gate on `session.employeeId` + permission (`attendance.view` for `/my`; `attendance.checkin` for check-in/out; `leave.submit` for leave POST). New permission codes added to PERMISSION_GROUPS.hr; TEACHER defaults expanded; `attendanceCheckInSchema` (Zod for lat/lng with earth-coord ranges + reject strings); `derivePermissions` unions `SELF_SERVICE_ESSENTIALS` for any user with `employeeId` so a stale custom-role JSON cannot lock an employee out of clocking in. 16 new perm/route tests + permissions.test updated. **Note:** `attendance.view` is overloaded today (self-service + admin-list); follow-up cycle should split to `attendance.self`.
5. [x] Fix F-24: `findUnique` → `findFirst` with `tenantId: session.tenantId` predicate; added `!session.tenantId` 401 guard.
6. [x] Fix F-12: removed `export const revalidate = 3600`; replaced with explanatory comment.
7. [x] Fix F-25: employee-creation advisory lock now uses `pg_advisory_xact_lock(hashtext('employee_create_' || tenantId))` for parity with invoice/webhook locks. Bare `12345` namespace removed.
8. [x] Fix F-13: removed `status` from `updateEmployeeSchema` (PUT now strips status silently); removed deactivate shortcut from `app/api/employees/[id]/route.ts`; new `POST /api/employees/[id]/{deactivate,restore}` endpoints (perm `employees.edit`, rate limit, tenant ownership, idempotent on already-target-state, atomic via `$transaction` + `recordAudit`); admin list + detail pages migrated to new endpoint with `res.ok` error handling. 15 new tests.
8a. [x] Fix payroll-approve race: replaced read-then-update pattern with compare-and-swap `updateMany({where:{id, status:"DRAFT"}, ...})`. Returns 409 when count=0. Pattern parity with send-slips route. 4 unit tests.

### Group B — business-logic correctness (parallel within group)
9. [x] Fix F-07: leave POST uses `calculateWorkingDays()` w/ Holiday + OrgConfig fetch (MON-FRI fallback when missing).
10. [x] Fix F-08: leave approve loop now skips both non-working days and `Holiday` rows when creating LEAVE attendance rows. holidaySet normalized via `.slice(0,10)`.
11. [x] Fix F-10: balance/overlap/create wrapped in single `$transaction(..., { isolationLevel: "Serializable" })`. Tagged Errors map to 400; unknown errors propagate. Employee fetch inside tx now `findFirst({id, tenantId})` for tenant scoping.
12. [x] Fix F-15: `assertGajiPokokSortOrder()` exported from engine.ts; throws when any `PCT_OF_BASE` has sortOrder ≤ gaji_pokok's. Called from `calculatePayroll`. Rejects ties (sort instability).
13. [ ] ~~Fix F-17~~ **REMOVED — false positive.** Reviewer verified `lib/payroll/working-days.ts:106-108` already includes `PRESENT_NO_CHECKOUT` in the `daysPresent++` branch. No change needed.
14. [x] Fix F-14: `OrgConfig.lemburCompliant Boolean @default(false)` migration; engine `calculateAttendanceBased` `case "lembur"` branch now applies UU §78(4) tiered (1.5× first hour, 2× thereafter) when flag set; flat path preserved. Per-employee variables.lemburCompliant overrides org-level option. 8 new tests covering 0h/0.5h/1h boundary/1.5h boundary/2h/3h tiers + propagation + override. **Holiday OT (UU §85, 2× hourly + daily wage) deferred** — not in scope for light-touch flag; see Ship Notes.

### Group C — missing endpoints (sequential within group, parallel across groups)
15. [x] Fix F-27: leave cancel endpoint — extended `app/api/leave/requests/[id]/cancel/route.ts` with owner-or-admin auth, Serializable txn, balance restoration on APPROVED, generated-LEAVE-attendance-row delete (via `overrideReason: { startsWith: "Cuti:" }` since approve handler stamps `isManualOverride: true`), audit row, rate limit, optional note. PENDING still cancels (no side-effects). 7 tests. **UI button deferred to follow-up.**
16. [x] Fix F-28: payroll cancel endpoint — new `app/api/payroll/[id]/cancel/route.ts`. CAS on `status="DRAFT"` flip; explicit child-row delete (PayrollItemLine then PayrollItem); audit row; 409 on non-DRAFT or lost CAS race. 5 tests. **UI button deferred to follow-up.**

### Group D — UI & CRUD parity (parallel)
17. [x] Fix F-18: Restore (Aktifkan) action shown for INACTIVE employees on list + detail; ConfirmDialog wraps; calls `POST /api/employees/[id]/restore`; detail-page closes dialog before refetch (slow-network UX).
18. [x] Fix F-19: deactivate handler awaits `res.ok` and surfaces error toast (already landed in Task 8).
19. [x] Fix F-22: removed `EXPORTED` status filter from payroll page.
20. [x] Fix F-26: `createEmployeeSchema` accepts `role: z.enum(["TEACHER","SCHOOL_ADMIN"]).default("TEACHER")`; `POST /api/employees` reads validated role; create-form Select added (Guru / Admin Sekolah).

### Group E — minors (stretch, parallel)
21. [x] Fix F-11: attendance export validates `month`/`year` with String round-trip + range guards. Rejects `1.5`, `1abc`, `13`, `1900`.
22. [x] Fix F-20: dashboard absent-stat — past weekend/holiday returns 0 via `computeAbsentCount` helper. Today/future unchanged.
23. [x] Fix F-21: `GET /api/leave/stats` (groupBy single query); leave page refactored from 3 fetches to 1.
24. [ ] **DEFERRED to follow-up cycle** — F-29 per-employee attendance-variables UI on payroll generate is non-trivial and out of scope for this cycle. Filed as follow-up.

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
- Task 4: F-09 expanded — 4 routes gated by permission codes (`attendance.view` for /my; `attendance.checkin` for check-in/out; `leave.submit` for leave POST). New permission codes added to PERMISSION_GROUPS.hr; TEACHER defaults expanded; `attendanceCheckInSchema` Zod for lat/lng. `derivePermissions` unions SELF_SERVICE_ESSENTIALS for any user with `employeeId` so a stale custom-role JSON cannot lock an employee out. 16+ new tests.
- Task 5: F-24 leave/balance tenant scoping — `findUnique` → `findFirst({id, tenantId})`, `!session.tenantId` 401 guard.
- Task 6: F-12 — removed `revalidate=3600` from `attendance/monthly/route.ts`.
- Task 7: F-25 — advisory lock now `pg_advisory_xact_lock(hashtext('employee_create_'||tenantId))` for parity w/ invoice/webhook locks.
- Task 8: F-13 — removed `status` from `updateEmployeeSchema`; new `POST /api/employees/[id]/{deactivate,restore}` endpoints with audit, rate limit, idempotent. 15 tests.
- Task 8a: payroll approve race — read-then-update replaced with CAS `updateMany({where:{id,status:"DRAFT"}})`. 4 tests.
- Tasks 9+11: leave POST F-07 holiday-aware day count + F-10 Serializable txn — `app/api/leave/requests/route.ts`, OrgConfig MON-FRI fallback; tagged-error mapping; employee fetch tenant-scoped via `findFirst`.
- Task 10: F-08 leave approve holiday skip — `app/api/leave/requests/[id]/approve/route.ts`, holidaySet built from `Holiday.findMany`, normalized via `.slice(0,10)`, both weekends and holidays skipped.
- Task 12: F-15 engine sortOrder guard — `lib/payroll/engine.ts` exports `assertGajiPokokSortOrder`. Rejects ties to defend against `Array.sort` instability.
- Task 14: F-14 lembur compliance flag — `OrgConfig.lemburCompliant` migration; engine tiered (1.5×/2×) when set; flat default; per-employee override. 8 new tests.
- Task 15: F-27 leave cancel — owner-or-admin, Serializable txn, balance restoration, generated-LEAVE-row delete via `overrideReason.startsWith('Cuti:')` discriminator, audit. 7 tests.
- Task 16: F-28 payroll cancel — new endpoint, CAS DRAFT→CANCELLED, child-row delete, audit. 5 tests.
- Tasks 17–23 batched commit (UI + minors, file-overlap forced): F-18 Restore UI on list + detail (ConfirmDialog, refetch in place); F-19 deactivate awaits res.ok (already in Task 8); F-22 EXPORTED option removed from payroll filter; F-26 role select on creation form + role accepted in createEmployeeSchema (TEACHER/SCHOOL_ADMIN); F-11 export validates month/year via String round-trip; F-20 absent-stat ignores past weekends/holidays via `computeAbsentCount`; F-21 single `/api/leave/stats` groupBy endpoint replacing 3-fetch pattern. Reviewer flagged decimal-month bypass (added String round-trip) and detail-page restore dialog stays open during refetch (closed before fetch). 26+ new tests across leave-stats, attendance-export-validation, absent-stat, employee role enum.

## Verification

- Task 0: `npm run build` ✓; `npx vitest run lib/__tests__/audit.test.ts` ✓ (4 passed); `bash scripts/verify-rls-coverage.sh` ✓ (25/25 tenant-scoped models have ENABLE + policy).
- Task 2: `npm run build` ✓; `npx vitest run` ✓ (845→passed earlier; final 8 in payroll.test.ts).
- Task 3: `npm run build` ✓; `npx vitest run` ✓ (857 passed); 11 unit tests in attendance.test.ts. Live evidence (staging, pre-fix): override accepted '2024-02-31', 'not-a-date', '2099-12-31' → 200; post-fix logically blocks all three at Zod layer + DB CHECK constraint as defense-in-depth.
- Task 1: `npm run build` ✓; `npx vitest run` ✓ (873 passed); 16 new tests in salary scope. Live evidence (staging, pre-fix): salary PUT with garbage body → 500 empty; post-fix returns 400 with structured error.
- Tasks 4–12 (batched verifications): `npm run build` ✓; `npx vitest run` ✓ (927 passed across 109 test files). New tests: 16 self-service perms + 4 payroll approve CAS + 8 leave POST + 4 leave approve holiday + 4 engine sortOrder + 15 employee status routes. RLS coverage check ✓ (25/25).
- End-of-cycle final gates: `npm run build` ✓; `npx vitest run` ✓ (**967 passed | 42 todo across 112 files**); `bash scripts/verify-rls-coverage.sh` ✓ (26/26 incl new AuditLog).
- **Playwright e2e: CI-gated.** Local run on this worktree fails because the linked `.env` points at the staging Supabase project which is seeded with cuid user IDs (`cmodt0...`) rather than the deterministic seed IDs (`u_super_admin`) the e2e specs expect. CI runs against a freshly-seeded ephemeral DB and is the authoritative gate per CLAUDE.md. Cycle proceeds to `/ship`; the PR's CI Playwright check must be green before the author merges.

## Ship Notes

### Migrations to run (in order)

```
prisma/migrations/20260502000000_add_audit_log_table/
prisma/migrations/20260502000001_attendance_date_check_constraint/
prisma/migrations/20260502000002_orgconfig_lembur_compliant_flag/
```

The middle migration **deletes any malformed rows** in `AttendanceRecord.date` (regex + cal-day cast) before adding the CHECK constraint. Staging cleanup already happened during this cycle's investigation (see Cleanup section above, 3 known bad rows deleted manually). Prod is expected to be clean — the CHECK should attach with no DELETE side-effects on a healthy table — but if the migration logs any DELETEs at deploy time, surface to the CTO before greenlighting `/ship --to-main`.

### New permission codes added

`PERMISSION_GROUPS.hr` gained three new codes:
- `payroll.edit` — gates `PUT /api/employees/[id]/salary`
- `attendance.checkin` — gates self-service check-in/out
- `leave.submit` — gates self-service leave submit

TEACHER default permissions expanded to include `attendance.checkin` and `leave.submit`. SUPER_ADMIN gets all three via the owner short-circuit. `derivePermissions` unions `["attendance.checkin","leave.submit"]` for any user with an `employeeId` so a stale custom-role JSON cannot lock an employee out of self-service. **Custom-role administrators should consciously add these codes when designing new roles.**

### New env vars

None.

### New endpoints

- `POST /api/employees/[id]/deactivate` — replaces the prior PUT-status shortcut; audit + idempotent.
- `POST /api/employees/[id]/restore` — symmetrical to deactivate.
- `POST /api/leave/requests/[id]/cancel` — supports both PENDING and APPROVED requests; APPROVED restores balance and removes generated LEAVE attendance rows in a single Serializable transaction.
- `POST /api/payroll/[id]/cancel` — DRAFT-only; CAS flip + child-row delete.
- `GET /api/leave/stats` — single groupBy replacing 3 sequential `pageSize=1` list calls on the leave page.

### Behavior changes for callers

- `PUT /api/employees/[id]` no longer accepts `{status: ...}`. UI callers must use the new POST endpoints. The cycle migrated both admin pages; any external client still posting status will silently have it stripped (Zod `.strip()`).
- `PUT /api/employees/[id]/salary` permission moved from `payroll.view` (read) to `payroll.edit` (write). SCHOOL_ADMIN never had `payroll.view` (HR is excluded from that role's defaults), so the only callers affected are SUPER_ADMIN (owner short-circuit) and any custom role that previously listed `payroll.view`. Custom roles intending salary edits must list `payroll.edit` explicitly.
- `POST /api/payroll/[id]/approve` now returns 409 (not 400) on a lost CAS race or non-DRAFT state. Callers should refetch on 409.
- Leave POST + approve now consume `calculateWorkingDays`; days for a leave window that includes a public holiday will be 1 lower than before.

### Feature flags

- `OrgConfig.lemburCompliant Boolean @default(false)` — when true, the engine applies UU 13/2003 §78(4) tiered overtime (1.5× first hour, 2× thereafter on weekdays). Default `false` preserves the historical flat formula. **Holiday OT (UU §85, 2× hourly + daily wage) is intentionally not implemented in this light-touch flag** — when the flag is on, all overtime hours including those falling on holidays are calculated at the weekday tiered rate. A separate cycle should add holiday-OT detection + the §85 formula before any tenant uses tiered overtime in payroll runs that span holidays.

### Manual smoke after preview deploy

1. As SUPER_ADMIN, navigate to `/admin/employees`, deactivate any active employee, then click the new "Aktifkan" action — verify status flips back to ACTIVE without redirecting.
2. As SUPER_ADMIN, attempt to submit a leave request spanning a public holiday — verify `days` excludes the holiday.
3. Navigate to `/admin/payroll` filter dropdown — confirm `EXPORTED` is no longer listed.
4. Generate a payroll run for any past month — confirm it succeeds and a 45-day-too-long range returns 400.
5. The new attendance override route should reject `2024-02-31` with a structured 400.

### Rollback plan

- Revert the merge commit on staging.
- All three migrations are forward-only data-additive (audit table, CHECK constraint, default-false column). Schema rollback requires:
  - `DROP TABLE "AuditLog" CASCADE;`
  - `ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_date_format_check";`
  - `ALTER TABLE "OrgConfig" DROP COLUMN "lemburCompliant";`
- The deleted garbage `AttendanceRecord` rows (in this cycle's pre-flight DELETE) cannot be recovered without a backup restore — they were already invalid data.

### Out-of-scope follow-ups (filed separately)

- **Production Supabase outage.** Both prod projects (`qrnbanxcrmrwganpmzmn`, `vxwywmvpxetdgnxejjgk`) are INACTIVE. Production SSO is currently broken — high-priority CTO action.
- **F-30 teacher self-service UI** — endpoints + perms now exist; portal UI integration is a separate cycle.
- **F-29 per-employee attendance-variables UI** on payroll generate.
- **`AttendanceRecord.date` column type** — string-with-CHECK is good defense-in-depth, but a proper `@db.Date` migration plus updates to `lib/payroll/working-days.ts`, leave routes, and listing routes would close the type ambiguity. Separate cycle.
- **F-03 Position master table** — `/api/employees/positions` returns DISTINCT existing jabatan, creating a chicken-egg for new roles.
- **F-04 LeaveBalance per-year model** — current balance reset is approximated via `startDate >= year-01-01` rather than a proper accrual table.
- **F-01 status enums repo-wide.**
- **BPJS / PPh21 calculation review.**
- **Holiday OT (UU §85)** for `lemburCompliant` flag.
- **`attendance.view` permission code is overloaded** — used by both `/api/attendance/my` (self-service) and admin-side listing. Future cycle should split to `attendance.self` to avoid accidentally granting TEACHER admin-view access.
- **UI buttons for leave-cancel and payroll-cancel** — backend-only landed this cycle.
- **`AuditLog` retention job.**
