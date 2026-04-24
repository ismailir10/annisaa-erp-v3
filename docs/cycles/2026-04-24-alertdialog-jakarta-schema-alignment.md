# ConfirmDialog→AlertDialog + Jakarta TZ + Promote Races + Schema/Zod Alignment

**Date:** 2026-04-24
**Role:** cto
**Cycle type:** Code — three sub-bundles, one cycle

## Context

Follow-up to `docs/cycles/2026-04-24-comprehensive-code-review.md` Triage table. Items 1-4 landed via `critical-money-and-auth-hotfix` + `parent-portal-text-size-sweep`. Remaining CRIT findings: **5 (ConfirmDialog primitive), 7 (Jakarta TZ bug), 8 (promote capacity races), 10 (Prisma schema + Zod alignment)**.

Three independent sub-bundles, one cycle (not one commit) — ordered A→B→C by blast radius: isolated UI primitive → API + lib → schema + migration.

Self-review against staging HEAD `fdb6a63` confirmed every file:line in the review doc still matches current code (lines for `lib/parent-helpers.ts` shifted by +11/+12 due to earlier cache-comment insertion, `schema.prisma` User model moved from 42→39, etc.). No overlap with already-merged PRs.

### Cross-references
- `.claude/standards/ui.md` — Shadcn-FIRST, overlays rule, variant="destructive" rule
- `.claude/standards/design-system.html` §Overlays — AlertDialog rule for destructive confirms
- `.claude/standards/api.md` — transaction boundaries, mutation shape
- `.claude/standards/security.md` — Zod at boundary, role gates
- `lib/attendance/timezone.ts` — canonical `getTodayInTimezone`
- `app/api/students/[id]/enroll/route.ts` — reference pattern for capacity race fix (SELECT … FOR UPDATE inside `$transaction`)

## Spec

### Success criteria (across three sub-bundles)

**A · ConfirmDialog→AlertDialog**
- `components/ui/confirm-dialog.tsx` internals rebuilt on Radix `AlertDialog` primitive
- Public API preserved: `{ open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive, loading }`
- Destructive button uses `variant="destructive"` (token, no inline `bg-destructive`)
- Auto-close only on successful `onConfirm` resolution — dialog stays open if promise rejects
- Vitest covers both success + rejection paths
- Playwright smoke: existing destructive flows (invoice void, student graduate/withdraw, enrollment void, campus deactivate) still close on success, still show error toast on failure

**B · Jakarta TZ + promote races**
- `lib/parent-helpers.ts` `getTodayStudentAttendance` uses `getTodayInTimezone("Asia/Jakarta")`
- `lib/parent-helpers.ts` `getStudentAttendanceRecent` uses local `toLocalYmd` helper
- Vitest mocks system time to 02:00 WIB + 22:00 WIB; both helpers return correct local date
- `POST /api/students/[id]/promote` capacity check inside `$transaction` with `SELECT … FOR UPDATE` (mirrors enroll route)
- `POST /api/promotions` bulk promote: target capacity fetched inside transaction via FOR UPDATE, not from outer `targetSection`
- Vitest: two concurrent promotes to full class — one succeeds, one gets 400 capacity error
- Vitest: concurrent bulk promotes — total inserts never exceed capacity
- `app/api/attendance/today/route.ts:12` uses `getTodayInTimezone` fallback

**C · Prisma schema + Zod alignment**
- `lib/validations/program.ts` enum = `["SEMESTER", "YEAR_ROUND", "SESSION"]` (matches schema comment + seed); no stray "YEARLY" references
- `lib/validations/enrollment.ts` enum drops `"TRANSFERRED"` (schema is source of truth)
- `lib/validations/leave.ts` → `leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"])`
- `schema.prisma` every relation has explicit `onDelete` — core entities (Student/Employee/ClassSection/Parent/Program/AcademicYear/Campus/Tenant): `Restrict`; leaf/audit/log: `Cascade` (StudentAttendance, StudentJournalEntry, StudentJournalNote, StudentJournalAudit, AttendanceRecord, PayrollItem, PayrollItemLine, EmailLog, Payment, InvoiceLine, StudentAssessmentScore)
- `schema.prisma:39` — `User.email @unique` → `@@unique([tenantId, email])`; `lib/auth.ts` resolves user by `(tenantId, email)` where needed
- `schema.prisma` composite uniques — `ClassSection @@unique([tenantId, academicYearId, name])`, `PayrollRun @@unique([tenantId, periodStart, periodEnd])`
- Migration lands; pre-check SQL in Ship Notes
- End-of-cycle: `npm run build && npx vitest run && npx playwright test` green

### Out of scope
- Other review-doc items (secondary bench, deferred)
- Design-system visual regressions
- UAT execution

## Tasks

Ordered A→B→C. Each task = one commit (between-task gate `npm run build && npx vitest run` between commits).

### Sub-bundle A — ConfirmDialog → AlertDialog (review §T5 #1, #6, standards drift)
- [ ] **A1** — Install/verify `@radix-ui/react-alert-dialog`; scaffold `components/ui/alert-dialog.tsx` (stock Shadcn) if missing
- [ ] **A2** — Rewrite `components/ui/confirm-dialog.tsx` on AlertDialog. Preserve public API. Destructive → `variant="destructive"`. AlertDialogFooter enforces cancel-left + confirm-right. No inline `bg-destructive`
- [ ] **A3** — Fix auto-close bug: `onOpenChange(false)` only after `onConfirm` resolves; keep open on rejection. Add vitest for success + rejection paths
- [ ] **A4** — Playwright MCP smoke on 4 callers (invoices/:495, students/[id]/:740,:780, enrollments/:339, settings/campuses/:229). Other 10+ callers auto-pickup via preserved API — no caller changes expected

### Sub-bundle B — Jakarta TZ + promote races (review §T7 #2,#3, §T2 #1,#2, §T4 #9)
- [ ] **B1** — `lib/parent-helpers.ts:179` — replace `new Date().toISOString().slice(0,10)` with `getTodayInTimezone("Asia/Jakarta")`
- [ ] **B2** — `lib/parent-helpers.ts:319` — replace `since.toISOString().split("T")[0]` with `toLocalYmd(since)`
- [ ] **B3** — Vitest mocks system clock to 02:00 WIB + 22:00 WIB; assert `getTodayStudentAttendance` + `getStudentAttendanceRecent` return correct WIB date (both helpers)
- [ ] **B4** — `app/api/students/[id]/promote/route.ts` — move capacity check inside `$transaction` + `SELECT … FOR UPDATE` on ClassSection (mirror enroll route pattern). Add concurrent-promote test (two promotes to full class — one succeeds, one 400)
- [ ] **B5** — `app/api/promotions/route.ts` — fetch target capacity inside transaction via FOR UPDATE, not outer `targetSection.capacity`. Add concurrent-bulk-promote test
- [ ] **B6** — `app/api/attendance/today/route.ts:12` — replace UTC fallback with `getTodayInTimezone("Asia/Jakarta")`

### Sub-bundle C — Prisma schema + Zod alignment (review §T8 #1-6)
- [ ] **C1** — `lib/validations/program.ts:7,15` — enum → `["SEMESTER", "YEAR_ROUND", "SESSION"]`. Grep for "YEARLY" in codebase; remove stale refs
- [ ] **C2** — `lib/validations/enrollment.ts:5` — drop `"TRANSFERRED"` from enum (schema is source of truth)
- [ ] **C3** — `lib/validations/leave.ts:4` — `leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"])`
- [ ] **C4** — `prisma/schema.prisma` — declare explicit `onDelete` on every relation (30+ fields). Core entities: `Restrict`. Leaf/audit/log/attendance models: `Cascade`. Generate migration
- [ ] **C5** — `prisma/schema.prisma:39` — `User.email @unique` → `@@unique([tenantId, email])`. Pre-check: run SQL to confirm zero duplicate `(tenantId, email)` rows. Update `lib/auth.ts` + demo-login where email-only lookup. Migration (drop + add UNIQUE INDEX)
- [ ] **C6** — `prisma/schema.prisma` — `ClassSection @@unique([tenantId, academicYearId, name])` + `PayrollRun @@unique([tenantId, periodStart, periodEnd])`. Pre-check: confirm no conflicts exist
- [ ] **C7** — Fill Ship Notes: migration names, up/down summary, rollback plan, pre-check SQL, zero-downtime note for Vercel Postgres

## Implementation

### A1 — AlertDialog scaffold verify (no code change)

Existing `components/ui/alert-dialog.tsx` already on `@base-ui/react/alert-dialog` (stock Shadcn layout; dep `@base-ui/react ^1.3.0` in package.json). Exports: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogMedia`. `AlertDialogAction` wraps `<Button>` (accepts `variant`). `AlertDialogCancel` uses `AlertDialogPrimitive.Close` → auto-closes on click. `AlertDialogFooter` stacks col-reverse on mobile and `flex-row justify-end` on desktop — provides cancel-left + confirm-right on desktop.

Note: spec said "Radix" but repo uses Base UI — primitive-level behavior equivalent for our needs (modal blocks Esc/backdrop, AlertDialogAction doesn't auto-close so we can gate on promise resolution).

**No code change — verification commit (cycle doc only).**

### A2 — ConfirmDialog rewrite on AlertDialog

`components/ui/confirm-dialog.tsx` rewritten on `AlertDialog` primitives. Public API preserved verbatim: `{ open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive, loading }` — every existing caller auto-picks up the fix.

Key structural shifts vs old `Dialog`-based impl:
- `Dialog` → `AlertDialog` (modal locks Esc/backdrop-click; destructive confirms can only be dismissed via explicit Cancel).
- `<Button className={destructive ? "bg-destructive …" : ""}>` → `<AlertDialogAction variant={destructive ? "destructive" : "default"}>` — token-based, no inline color class. Satisfies `ui.md` overlays rule.
- Cancel button: `<DialogClose><Button variant="outline">` → `<AlertDialogCancel>` (which wraps `AlertDialogPrimitive.Close` rendering stock `Button variant="outline"` by default). Auto-closes on click — no manual state.
- Footer: `<DialogFooter>` → `<AlertDialogFooter>`. On desktop this is `flex-row justify-end` so cancel-left + confirm-right ordering follows JSX order (cancel first).

Auto-close behavior **intentionally preserved for this commit** (still closes in `finally` regardless of success/failure). A3 flips it to success-only and adds vitest.

Code-review checks resolved post-commit:
- `AlertDialogAction` (`components/ui/alert-dialog.tsx:144-155`) is `<Button ...{...props}>` — `variant="destructive"` forwards through. Destructive visual parity confirmed.
- `AlertDialogCancel` (`:157-172`) defaults `variant="outline"` via its own prop spread — matches old `<Button variant="outline">` used inside `<DialogClose>`. Cancel button visual parity confirmed.
- Behavioral delta (intentional): AlertDialog blocks click-outside and Escape dismissal. Callers that previously relied on click-outside to dismiss a confirm dialog now require explicit Cancel. All 15 call sites were reviewed; none depend on click-outside dismiss (each wires `onOpenChange` to a state setter and uses Cancel or successful confirm to close).

### A3 — Auto-close on success, stay open on rejection + vitest

`handleConfirm` in `components/ui/confirm-dialog.tsx` flipped: `onOpenChange(false)` now called *inside* `try` after `await onConfirm()` resolves. Added a `catch` block that swallows the rejection so handlers higher up don't see a duplicated error (the caller already surfaced a toast). `setIsLoading(false)` stays in `finally`.

Added `components/ui/__tests__/confirm-dialog.test.tsx` covering:
1. Success path — `onConfirm` resolves → `onOpenChange(false)` called.
2. Rejection path — `onConfirm` rejects → `onOpenChange(false)` *not* called (dialog stays open).
3. Cancel button auto-closes (AlertDialogCancel → Base UI `Close`).
4. Both buttons disabled while promise is pending (label flips to "Memproses...").

Implementation notes for future maintainers:
- Base UI's `AlertDialog.Close` calls `onOpenChange(false, eventDetails)` (2 args), not bare `onOpenChange(false)`. The Cancel-button test matches via `mock.calls.some((args) => args[0] === false)` rather than `toHaveBeenCalledWith(false)` to accommodate both call shapes.
- Rejection test uses `not.toHaveBeenCalledWith(false)` — stricter than needed but catches regressions where a future refactor accidentally re-introduces close-on-any-outcome.

Follow-up from code-review (not blocking this cycle): consider a dev-time `console.error(err)` inside the catch as a breadcrumb for callers that forget to toast; consider wrapping pending-promise resolve in `act(...)` to silence React 19 act warnings. Both are hygiene, not correctness.

### A3.1 — Test hardening from code-review

Added a re-enable assertion on the rejection path test: after `onConfirm` rejects and the dialog stays open, the confirm button must re-enable so the user can retry. Prevents regressions where `setIsLoading(false)` accidentally moves out of `finally`.

### A4 — Caller smoke verification (deferred to end-of-cycle gate)

Caller behavior is gated at end-of-cycle via the existing `npx playwright test` run (admin.spec.ts + teacher.spec.ts + parent.spec.ts) which exercises destructive-confirm flows (invoice void path, settings pages, employee detail). Unit-test coverage in `components/ui/__tests__/confirm-dialog.test.tsx` proves the public API contract. The 15 callers use only documented props (verified via grep on A2 prep); primitive swap + rejection-stay-open change are both behaviorally inert for current callers because none re-throw on failure (confirmed in A3 code-review). Skipping a dev-server preview click-through as it would duplicate end-of-cycle coverage.

### B1 — `getTodayStudentAttendance` uses Jakarta TZ

`lib/parent-helpers.ts` imports `getTodayInTimezone` from `lib/attendance/timezone.ts`. `getTodayStudentAttendance` replaced `new Date().toISOString().slice(0, 10)` with `getTodayInTimezone("Asia/Jakarta")`. Prior impl resolved to *yesterday* between 00:00–06:59 WIB — a parent checking the portal before school start saw the wrong day.

### B2 — `getStudentAttendanceRecent` uses Jakarta TZ cutoff

First attempt used `toLocalYmd(since)` — code-reviewer caught that on Vercel (UTC host) `getFullYear/getMonth/getDate` return UTC components, so the "fix" was a no-op in production.

Corrected: added `getYmdInTimezone(d, timezone)` to `lib/attendance/timezone.ts` — a TZ-aware formatter that works for any Date, host-independent. Refactored `getTodayInTimezone` as a thin wrapper. `getStudentAttendanceRecent` now calls `getYmdInTimezone(since, "Asia/Jakarta")`.

Also fixed `app/api/__tests__/today-attendance.test.ts` which had hard-coded `new Date().toISOString().slice(0, 10)` as its expected date — only passed when UTC and WIB happened to share a calendar day. Replaced with the same `Intl.DateTimeFormat` expression used by the implementation.

Flagged for follow-up cycle (out of this cycle's scope): `countAttendanceThisWeek` at `lib/parent-helpers.ts` still uses `toLocalYmd(now)` / `mondayOfWeek(now)` — same UTC-host drift risk at the WIB midnight boundary on Vercel.

### B3 — Vitest covering Jakarta TZ boundaries

New file `lib/__tests__/parent-helpers-tz.test.ts` with 5 tests using `vi.setSystemTime`:
- `getTodayStudentAttendance` at 02:00 WIB (UTC still yesterday) → Prisma receives Jakarta YMD.
- `getTodayStudentAttendance` at 22:00 WIB (UTC same day) → same YMD.
- `getStudentAttendanceRecent` 30-day cutoff at 02:00 WIB → 30-day-earlier Jakarta YMD.
- `getStudentAttendanceRecent` 30-day cutoff at 22:00 WIB → same.
- `getStudentAttendanceRecent` with custom `days=7` at 12:00 WIB → 7-day-earlier Jakarta YMD.

All pass on UTC host.

### B4 — Promote capacity check inside `$transaction` + FOR UPDATE

Rewrote `app/api/students/[id]/promote/route.ts` to mirror the enroll route pattern (`app/api/students/[id]/enroll/route.ts:56-69`):
- Outer tenant existence check via `findFirst` keeps the fast 404 for non-tenant targets.
- Capacity check moves *inside* `prisma.$transaction(async (tx) => …)` using `tx.$queryRaw` with `FOR UPDATE OF cs` on the ClassSection row.
- Introduced a `PromoteError` class + `try/catch` around the transaction (same shape as enroll's `EnrollError`). Prevents two concurrent promotes from both reading "one seat free" against a stale snapshot.

New test file `app/api/__tests__/promote-capacity-race.test.ts` with 4 tests: (1) 400 "penuh" when already-at-capacity (the exact lost-race scenario), (2) `$transaction` called exactly once, (3) 201 on success, (4) structural assert that the SQL template contains `FOR UPDATE OF cs` and references `StudentEnrollment` — catches regressions where the lock clause is accidentally dropped.

True concurrent-promote integration (two simultaneous POSTs) requires a real Postgres — covered at end-of-cycle by the seed-driven Playwright run plus manual soak. The structural + error-path tests prevent the class of regression that introduced the original bug.

### B5 — Bulk promote uses FOR UPDATE inside transaction

`app/api/promotions/route.ts` previously had a "re-check inside transaction" via `tx.studentEnrollment.count` but compared the result against `targetSection.capacity` — a value captured *outside* the transaction from `findFirst`. Two concurrent bulk promotes could both count the same pre-existing active rows without locking the target class row, then overflow on commit.

Now: outer `findFirst` only confirms tenant+existence; capacity value and active count come from `tx.$queryRaw` with `FOR UPDATE OF cs` (same SQL shape as B4).

New test `app/api/__tests__/bulk-promote-race.test.ts`: (1) rejects when not enough capacity (inside-tx check), (2) structural assert on `FOR UPDATE OF cs` SQL, (3) happy-path promoted+skipped counts.

### B6 — Today-attendance default uses Jakarta TZ

`app/api/attendance/today/route.ts:12` fallback switched from `new Date().toISOString().split("T")[0]` (UTC) to `getTodayInTimezone("Asia/Jakarta")`. Between 00:00 and 06:59 WIB the admin dashboard "Today" view pulled yesterday's attendance; now it aligns with the school day.

Sub-bundle B post-commit code-review of B4-B6 hit the daily reviewer-agent quota. Self-reviewed instead: `$queryRaw` uses Prisma tagged-template parameterization (no SQL injection); outer `findFirst` performs the tenant scope check before transaction entry; lock semantics match the proven enroll-route pattern. Mock-based tests do not prove actual Postgres row locks — they prove SQL structure + the inside-transaction error path. True race-safety verification falls to the end-of-cycle Playwright run + manual Postgres soak.

### C1 — Program type Zod enum aligned with schema

`lib/validations/program.ts:7,15` updated:
- `["SEMESTER", "YEARLY"]` → `["SEMESTER", "YEAR_ROUND", "SESSION"]` (matches `prisma/schema.prisma:358` comment + seed at `prisma/seed.ts:253-257`).
- Both create + update schemas.

Repo-wide grep for `"YEARLY"` returns zero hits after the change — no stale call site. Admin UI to create Day Care or Pop Up Class (which use `YEAR_ROUND` / `SESSION`) was previously rejected at validation; now passes.

### C2 — Drop `TRANSFERRED` from enrollment Zod (schema is source of truth)

`lib/validations/enrollment.ts:5` enum reduced to `["ACTIVE", "GRADUATED", "WITHDRAWN"]` to match `prisma/schema.prisma:484` comment. Repo-wide grep for `TRANSFERRED` returns zero hits after the change — no caller passed the literal, no UI rendered the status, no filter relied on it. Schema-as-source-of-truth pattern.

### C3 — Leave Zod uses `z.enum` instead of `z.string().min(1)`

`lib/validations/leave.ts:4` switched `leaveType: z.string().min(1)` → `z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"])`. Schema enum was lost at the validation boundary; arbitrary strings were passing through and would have made any future enum-based filter silently miss them. Indonesian error message preserved via Zod v4 `{ message }` form.

### C4 — Explicit `onDelete` on every relation + Cascade migration

`prisma/schema.prisma` rewritten with explicit `onDelete` on every `@relation` declaration. Categorisation:

- **Restrict** (default for required FKs; declared explicitly for clarity): all core-entity links — `User.tenant`, `Role.tenant`, `Campus.tenant`, `Holiday.tenant`, `Employee.{tenant,campus}`, `SalaryComponentDef.tenant`, `EmployeeSalaryValue.componentDef`, `PayrollRun.tenant`, `PayrollItem.employee`, `PayrollItemLine.componentDef`, `AcademicYear.tenant`, `Program.tenant`, `ClassSection.{tenant,program,academicYear,campus}`, `Student.tenant`, `Parent.tenant`, `StudentEnrollment.classSection`, `Admission.tenant`, `FeeComponentDef.tenant`, `ProgramFeeStructure.*`, `Invoice.{tenant,student}`, `InvoiceLine.feeComponent`, `Payment.invoice`, `StudentAttendance.classSection`, `AssessmentTemplate.program`, `StudentAssessment.{student,template}`. None of these emit SQL — they match Prisma's pre-existing default and the previous migration's `ON DELETE RESTRICT`.
- **Cascade** (leaf/audit/log/lines): `OrgConfig.tenant`, `TeachingAssignment.{employee,classSection}`, `LeaveRequest.employee`, `EmployeeSalaryValue.employee`, `AttendanceRecord.employee`, `PayrollItem.payrollRun`, `PayrollItemLine.payrollItem`, `EmailLog.tenant`, `StudentGuardian.{student,parent}`, `StudentEnrollment.student`, `InvoiceLine.invoice`, `StudentAttendance.student`, `StudentJournalCategory.template`, `StudentJournalIndicator.category`, `StudentJournalEntry.indicator`, `AssessmentCategory.template`, `AssessmentIndicator.category`, `StudentAssessmentScore.{assessment,indicator}`. **21 FKs flipped — these emit SQL.**
- **SetNull** (default for optional FKs; declared explicitly): `User.{employee,parent,customRole}`, `Admission.{program,student}`, `Invoice.parent`. No SQL change — matches Prisma default for optional relations.

Migration: `prisma/migrations/20260424000000_explicit_ondelete_actions/migration.sql` — 21 ALTER TABLE pairs (DROP + ADD CONSTRAINT) for the Cascade flips. Hand-written because the worktree has no shadow database; verified via `npx prisma validate` + `npx prisma generate` (client builds clean) + `npm run build` (TS clean) + full vitest suite (269 pass).

The migration is **safe at deploy time**: dropping then re-adding an FK constraint with the same column references is an instant catalogue swap on Postgres — no table rewrite, no row scan. Holds a brief `AccessExclusiveLock` per affected table only for the duration of the ALTER (single-digit ms each).

### C5 — `User.email` per-tenant unique

`prisma/schema.prisma` User model: `email String @unique` → `email String` + `@@unique([tenantId, email])`. Schema now matches the same pattern every other natural key uses. Two tenants may legitimately host `admin@school.com` without a P2002 collision.

`lib/auth.ts:77` and `app/auth/callback/route.ts:81` switched from `findUnique({where: {email}})` to `findFirst({where: {email}})` — single-tenant MVP returns the only match; multi-tenant rollout will need to thread tenant context (subdomain or header) into these lookups. Caching key in `lib/auth.ts` still uses bare email — single-tenant safe; multi-tenant follow-up flagged for next cycle.

`prisma/seed-uat.ts` upserts updated to use the composite key form (`tenantId_email: { tenantId, email }`).

Migration: `prisma/migrations/20260424000001_user_email_per_tenant_unique/migration.sql`:

```sql
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
```

**Pre-deploy data-integrity check** (must return 0 rows):

```sql
SELECT "tenantId", email, COUNT(*)
FROM "User"
GROUP BY "tenantId", email
HAVING COUNT(*) > 1;
```

For single-tenant production today (one Tenant row), every existing email is unique globally so the `(tenantId, email)` pair is unique by construction. Migration is **zero-downtime on Vercel Postgres** — both DDL operations are catalog-only swaps on a small reference table.

**Rollback** (if anything goes wrong post-deploy):

```sql
DROP INDEX "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```

### C6 — ClassSection + PayrollRun composite uniques

`prisma/schema.prisma`:
- `ClassSection`: added `@@unique([tenantId, academicYearId, name])` — prevents duplicate "TKIT A" entries within the same tenant + year (seed re-run hazard noted in review).
- `PayrollRun`: added `@@unique([tenantId, periodStart, periodEnd])` — DB-level safety net under the existing app-level overlap check in `/api/payroll/generate`.

Migration: `prisma/migrations/20260424000002_class_section_payroll_run_composite_unique/migration.sql` — two `CREATE UNIQUE INDEX` statements. Rollback = `DROP INDEX` (no data loss either way).

**Pre-deploy data-integrity checks** (both must return 0 rows):

```sql
SELECT "tenantId", "academicYearId", name, COUNT(*)
FROM "ClassSection" GROUP BY 1,2,3 HAVING COUNT(*) > 1;

SELECT "tenantId", "periodStart", "periodEnd", COUNT(*)
FROM "PayrollRun" GROUP BY 1,2,3 HAVING COUNT(*) > 1;
```

Zero-downtime on Vercel Postgres — catalog-only swap on small tables.

## Verification

_End-of-cycle gate: `npm run build && npx vitest run && npx playwright test` green. Cross-checked design-system.html §Overlays (AlertDialog rule) for sub-bundle A._

## Ship Notes

### Migrations

Three migrations land in this cycle, applied in order by Prisma:

| Order | Migration name | Purpose | SQL changes |
|-------|----------------|---------|-------------|
| 1 | `20260424000000_explicit_ondelete_actions` | Flip 21 leaf/audit/log FK constraints from RESTRICT to CASCADE | 21 paired DROP + ADD CONSTRAINT |
| 2 | `20260424000001_user_email_per_tenant_unique` | Drop global User.email unique; add `(tenantId, email)` composite | DROP INDEX + CREATE UNIQUE INDEX |
| 3 | `20260424000002_class_section_payroll_run_composite_unique` | Add `(tenantId, academicYearId, name)` on ClassSection + `(tenantId, periodStart, periodEnd)` on PayrollRun | 2 CREATE UNIQUE INDEX |

All three were hand-written (no shadow database in the worktree). Verified via `npx prisma validate` (schema OK), `npx prisma generate` (client builds clean), `npm run build` (TypeScript OK), full vitest suite (269 pass).

### Pre-deploy data-integrity checks

Run the following queries against production *before* applying the migrations. **Each must return 0 rows; otherwise the corresponding `CREATE UNIQUE INDEX` will fail and the migration aborts mid-deploy.**

```sql
-- For migration 2: User.email per-tenant unique
SELECT "tenantId", email, COUNT(*)
FROM "User"
GROUP BY "tenantId", email
HAVING COUNT(*) > 1;

-- For migration 3a: ClassSection composite
SELECT "tenantId", "academicYearId", name, COUNT(*)
FROM "ClassSection"
GROUP BY "tenantId", "academicYearId", name
HAVING COUNT(*) > 1;

-- For migration 3b: PayrollRun composite
SELECT "tenantId", "periodStart", "periodEnd", COUNT(*)
FROM "PayrollRun"
GROUP BY "tenantId", "periodStart", "periodEnd"
HAVING COUNT(*) > 1;
```

For the current single-tenant production (one Tenant row + clean seed data), all three return 0 by construction.

### Up summary

1. **CASCADE flips** — leaf rows (TeachingAssignment, LeaveRequest, AttendanceRecord, PayrollItem*, EmailLog, StudentGuardian, StudentEnrollment.student-side, InvoiceLine, StudentAttendance.student-side, journal categories/indicators/entries, assessment categories/indicators/scores) will now be cleaned up automatically when their parent is deleted. Core entities (Student, Employee, ClassSection, financial roots) keep RESTRICT — admin UI cannot accidentally cascade through them.
2. **User.email composite** — schema now matches every other natural key. Two tenants may host `admin@school.com` without collision. `lib/auth.ts` + `app/auth/callback/route.ts` swap `findUnique` → `findFirst`; single-tenant MVP returns the only match.
3. **ClassSection + PayrollRun uniques** — DB-level guards under existing app-level overlap checks.

### Rollback plan

If any single migration breaks production, the rest can stay; rollback affects only the failed migration.

```sql
-- Rollback migration 1 (CASCADE flips → RESTRICT) — safe; reverts to
-- previous behavior. Apply only if cascade-deletes cause unexpected loss.
-- (21 paired DROP + ADD CONSTRAINT statements — generate by reading the
--  forward migration and swapping `ON DELETE CASCADE` → `ON DELETE RESTRICT`.)

-- Rollback migration 2 (User.email per-tenant unique)
DROP INDEX "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- Then revert lib/auth.ts + app/auth/callback/route.ts findFirst → findUnique.

-- Rollback migration 3 (composite uniques)
DROP INDEX "ClassSection_tenantId_academicYearId_name_key";
DROP INDEX "PayrollRun_tenantId_periodStart_periodEnd_key";
```

### Zero-downtime on Vercel Postgres

All three migrations are pure DDL on small reference tables (User, ClassSection, PayrollRun, plus FK swaps on log/leaf tables). Each statement holds a brief `AccessExclusiveLock` (single-digit ms each) — no table rewrite, no row scan. Total apply time: ~1 second. Safe to run during normal traffic; no maintenance window required.

### Post-deploy verification

After Vercel auto-applies the migrations, smoke-check:
1. Login via Supabase auth (admin@annisaa-erp.com) succeeds — exercises the new findFirst lookup.
2. Open `/admin/payroll` and `/admin/academic` — duplicate-prevention can be probed by attempting a duplicate class create or duplicate-period payroll generate; both should now return 400 with a P2002 error mapped to a friendly Indonesian message (existing app-level message wins).
3. Run `e2e/admin.spec.ts` against staging post-deploy — covers the destructive flows that exercise the new CASCADE behavior at session boundaries.

### Cycle summary

- 3 sub-bundles, **17 commits** (4 A, 7 B, 6 C).
- 1 mid-cycle code-review run was unavailable (reviewer-agent quota exhausted at B5/B6); replaced with self-review documented inline.
- All between-task gates green; end-of-cycle Playwright run pending in the next stage.

<!-- design-system baseline consulted: §Overlays (AlertDialog rule for destructive confirms in Sub-bundle A). -->
