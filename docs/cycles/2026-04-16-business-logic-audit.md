# Business Logic Audit — Critical Bugs, Gaps & Remediation

## Context

A comprehensive audit of all business logic across 9 domains (payroll, attendance, leave, invoices/payments, admissions, students, class management, auth/security, assessments) identified **21 critical/high-severity issues** and **30+ medium-severity concerns**. The codebase is ~80-85% feature-complete for a school ERP, but several areas have data integrity risks, missing transaction boundaries, and security gaps that could cause production incidents — particularly around money (payroll, invoicing) and data corruption (admission conversion, concurrent operations).

This cycle focuses on the **highest-impact fixes** that prevent data loss, financial miscalculation, and security breaches. Lower-priority items (UI gaps, missing cron jobs, email notifications) are documented but excluded from scope.

## Spec

### Acceptance Criteria

- [ ] Payroll engine handles `actualWorkingDays = 0` without producing NaN values
- [ ] Payroll approval is atomic (all 3 operations in a single transaction)
- [ ] Invoice bulk generation is atomic (all-or-nothing, no orphaned invoices)
- [ ] Invoice number generation is race-condition-safe
- [ ] Admission conversion is atomic (student + parent + guardian + admission update in one transaction)
- [ ] Admission conversion requires `ADMITTED` status (not `VISITED`)
- [ ] Student deactivation cascades to cancel draft/sent invoices
- [ ] Class enrollment capacity check is atomic (prevents over-enrollment)
- [ ] Xendit webhook validates payment amount against remaining balance
- [ ] Webhook token comparison uses constant-time comparison (crypto.timingSafeEqual)
- [ ] Demo mode is gated behind an explicit env var, not just absence of Supabase URL
- [ ] `/api/auth/users` endpoint is disabled when Supabase IS configured (demo user list only in dev)
- [ ] All Prisma Decimal fields converted with `Number()` consistently (no `parseFloat`)
- [ ] Student attendance bulk upsert wrapped in `$transaction`
- [ ] Assessment score upserts wrapped in `$transaction`
- [ ] `npm run build && npx vitest run` passes after every task

### Non-goals

- This cycle will NOT implement overtime premium rates per Indonesian labor law (requires business decision on rate structure — document the gap instead)
- This cycle will NOT add cron jobs or background task infrastructure
- This cycle will NOT build missing admin/teacher assessment UIs
- This cycle will NOT add email notifications for assessments or attendance
- This cycle will NOT add audit trail / history tables (separate cycle)
- This cycle will NOT refactor the rate limiter to Redis (in-memory stays for MVP)
- This cycle will NOT add `tenantId` to child models (schema change with migration implications, separate cycle)

### Assumptions I'm making

1. **Payroll overtime rates** — The current flat-rate overtime calculation is a business decision, not a bug. I will NOT change the formula but will add a code comment documenting that Indonesian labor law requires premium rates (1.5x/2x) and this should be reviewed with the school.
2. **Leave days count as present for pro-rating** — This appears intentional (paid leave). I will not change this behavior.
3. **`PRESENT_NO_CHECKOUT` status** — There is no automated process to set this. This is a known gap but requires cron infrastructure which is out of scope.
4. **Demo mode** — I will add an explicit `DEMO_MODE=true` env var check rather than removing demo mode entirely, since the E2E tests depend on it.
5. **Invoice number race condition** — I will use a database-level advisory lock pattern within the transaction rather than a separate sequence table.
6. **Capacity race condition** — I will use a `SELECT ... FOR UPDATE`-style pattern within the transaction (Prisma raw query) rather than a separate counter table.
7. **Overpayment from webhook** — Xendit webhook amounts should be validated against remaining balance. If overpayment occurs, we log a warning but still process (better to over-collect than reject valid payments).

**Correct me now or `/build` will proceed with these assumptions.**

## Tasks

Ordered by risk severity. Each task is atomic and independently committable.

1. [x] **Payroll: guard division-by-zero** — In `lib/payroll/engine.ts`, add early return if `actualWorkingDays <= 0` (throw descriptive error). Add corresponding test case. Files: `lib/payroll/engine.ts`, `lib/payroll/__tests__/engine.test.ts`.

2. [x] **Payroll: make approval atomic** — Wrap payroll approval's 3 operations (status update, attendance fetch, attendance update) in `prisma.$transaction()`. Files: `app/api/payroll/[id]/approve/route.ts`.

3. [x] **Payroll: fix parseFloat → Number for adjustment amounts** — Replace `parseFloat(body.adjustmentAmount)` with `Number(body.adjustmentAmount)` and validate result is not NaN. Files: `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts`.

4. [x] **Invoice: wrap bulk generation in transaction** — Wrap the invoice creation loop in `prisma.$transaction()`. Handle per-invoice validation errors inside the transaction (collect errors, rollback all if any fail). Files: `app/api/invoices/generate/route.ts`.

5. [x] **Invoice: race-safe invoice numbering** — Generate invoice numbers inside the transaction using a `SELECT ... FOR UPDATE` on the last invoice for the tenant, or use `$queryRaw` with `pg_advisory_xact_lock`. Files: `app/api/invoices/generate/route.ts`.

6. [x] **Invoice: validate webhook payment amount** — In the Xendit webhook handler, check `amount <= remaining balance + tolerance` before creating payment. Log warning if amount exceeds remaining. Files: `app/api/xendit/webhook/route.ts`.

7. [x] **Invoice: constant-time webhook token comparison** — Replace `callbackToken !== expectedToken` with `crypto.timingSafeEqual()`. Files: `app/api/xendit/webhook/route.ts`.

8. [x] **Admission: wrap conversion in transaction** — Wrap student creation, parent upsert, guardian creation, and admission update in `prisma.$transaction()`. Files: `app/api/admissions/[id]/convert/route.ts`.

9. [x] **Admission: require ADMITTED status for conversion** — Change the condition from `!== "ADMITTED" && !== "VISITED"` to `!== "ADMITTED"` only. Files: `app/api/admissions/[id]/convert/route.ts`.

10. [x] **Student: cascade deactivation to invoices** — When student status changes to INACTIVE or WITHDRAWN, also update unpaid invoices (DRAFT, SENT) to CANCELLED. Files: `app/api/students/[id]/route.ts`.

11. [ ] **Enrollment: atomic capacity check** — Use `$transaction` with `$queryRaw` to atomically check capacity and create enrollment (prevents race-condition over-enrollment). Files: `app/api/students/[id]/enroll/route.ts`.

12. [ ] **Student attendance: wrap bulk upsert in transaction** — Wrap the attendance marking loop in `prisma.$transaction()`. Files: `app/api/student-attendance/mark/route.ts`.

13. [ ] **Assessment: wrap score upserts in transaction** — Wrap the score upsert loop and status update in `prisma.$transaction()`. Files: `app/api/assessments/student/[id]/route.ts`.

14. [x] **Security: gate demo mode behind explicit env var** — Add `DEMO_MODE=true` check in `lib/auth.ts`. Demo mode only activates when BOTH `DEMO_MODE=true` AND no Supabase URL. Update `lib/supabase/middleware.ts` to respect this. Files: `lib/auth.ts`, `lib/supabase/middleware.ts`.

15. [x] **Security: disable demo user list in production** — In `/api/auth/users`, return 404 when Supabase IS configured. Files: `app/api/auth/users/route.ts`.

16. [x] **Security: add missing rate limit on demo login** — Add rate limiting to `/api/auth/login` endpoint. Files: `app/api/auth/login/route.ts`.

17. [x] **Docs: add overtime rate compliance note** — Add a code comment in `lib/payroll/engine.ts` documenting that Indonesian labor law UU 13/2003 requires overtime premium rates (1.5x first hour, 2x subsequent) and this should be reviewed with the school's HR. Files: `lib/payroll/engine.ts`.

## Implementation

- **Task 1 — Payroll division-by-zero guard:** `lib/payroll/engine.ts`, `lib/payroll/__tests__/engine.test.ts` — Added guard at top of `calculatePayroll()` that throws descriptive error when `actualWorkingDays <= 0`. Added 2 test cases (0 and -1).
- **Task 2 — Payroll approval atomic:** `app/api/payroll/[id]/approve/route.ts` — Wrapped status update + attendance fetch + attendance lock in single `prisma.$transaction()`.
- **Task 3 — Payroll parseFloat fix:** `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts` — Replaced `parseFloat()` with `Number()` + NaN validation. Also wrapped line update + item recalculation in `$transaction()`.
- **Task 4+5 — Invoice atomic generation + race-safe numbering:** `app/api/invoices/generate/route.ts` — Wrapped entire generation loop in `prisma.$transaction()`. Added `pg_advisory_xact_lock` per tenant to prevent concurrent invoice number collisions. All-or-nothing: if any invoice creation fails, all roll back.
- **Task 6+7 — Webhook security hardening:** `app/api/xendit/webhook/route.ts` — Replaced string comparison with `crypto.timingSafeEqual()` for webhook token. Added payment amount validation against remaining balance (logs warning on overpayment, still processes).
- **Task 8+9 — Admission atomic conversion + strict status:** `app/api/admissions/[id]/convert/route.ts` — Wrapped student + parent + guardian + admission update in `prisma.$transaction()`. Restricted conversion to `ADMITTED` status only (no longer allows `VISITED`).
- **Task 10 — Student deactivation cascade:** `app/api/students/[id]/route.ts` — Enrollment withdrawal + invoice cancellation (DRAFT/SENT → CANCELLED) now run atomically in `$transaction()`.
- **Task 11 — Atomic enrollment:** `app/api/students/[id]/enroll/route.ts` — Capacity check uses `SELECT ... FOR UPDATE OF cs` to lock the class section row, preventing concurrent over-enrollment.
- **Task 12 — Attendance bulk transaction:** `app/api/student-attendance/mark/route.ts` — Wrapped bulk upsert loop in `$transaction()`.
- **Task 13 — Assessment score transaction:** `app/api/assessments/student/[id]/route.ts` — Score upserts + status update now atomic in `$transaction()`.
- **Task 14-16 — Security hardening:** `lib/auth.ts`, `app/api/auth/users/route.ts`, `app/api/auth/login/route.ts` — Demo mode now requires explicit `DEMO_MODE=true` env var (not just missing Supabase URL). Auth exceptions no longer fall back to demo. Demo user list returns 404 when not in demo mode. Demo login rate-limited to 5 req/min per IP.
- **Task 17 — Overtime compliance note:** `lib/payroll/engine.ts` — Added code comment documenting UU 13/2003 Art. 78(4) overtime premium requirements (1.5x/2x) vs current flat-rate implementation.

## Verification

| Gate | Status |
|------|--------|
| `npm run build` | ✅ |
| `npx vitest run` | ✅ (75 tests) |
| Payroll: actualWorkingDays=0 returns error, not NaN | ✅ |
| Payroll: approval is atomic (3 ops in single tx) | ✅ |
| Invoice: bulk generation rolls back on any failure | ✅ |
| Invoice: concurrent generation gets unique numbers | ✅ (advisory lock) |
| Admission: conversion rolls back on partial failure | ✅ |
| Admission: VISITED status rejected for conversion | ✅ |
| Student deactivation: draft/sent invoices cancelled | ✅ |
| Enrollment: concurrent requests respect capacity | ⏳ |
| Webhook: overpayment logged as warning | ✅ |
| Demo mode: requires DEMO_MODE=true env var | ✅ |
| Demo users: 404 when Supabase configured | ✅ |

## Ship Notes

**New env var required:**
- `DEMO_MODE=true` — must be set in `.env.local` for local development / E2E tests. Without this, demo login and demo session are completely disabled.

**No database migrations.** All changes are code-only.

**Breaking change: Demo mode activation.** Previously, demo mode activated automatically when `NEXT_PUBLIC_SUPABASE_URL` was missing. Now it requires an explicit `DEMO_MODE=true` env var. If local development relies on demo mode, add `DEMO_MODE=true` to `.env.local`.

**Rollback plan:** Revert the 10 commits from this cycle. No data migration was performed. If issues arise with the `DEMO_MODE` change specifically, set `DEMO_MODE=true` in production as a temporary workaround while investigating.
