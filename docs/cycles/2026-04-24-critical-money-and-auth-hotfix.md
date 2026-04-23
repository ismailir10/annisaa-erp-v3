# Critical Money + Auth Hotfix

## Context

The comprehensive code review in `docs/cycles/2026-04-24-comprehensive-code-review.md` surfaced five **Critical** findings that affect real money flow and tenant-level data isolation in production:

1. **Xendit webhook advisory-lock cast is broken** — the concurrency guard at `app/api/xendit/webhook/route.ts:69` uses `('x' || ${invoice.id}::text)::bit(64)::bigint`, which fails on UUID input and throws inside the transaction. Net effect: **no Xendit payment ever marks an invoice PAID in production**.
2. **Cache-key poisoning in `getStudentInvoices`** — `lib/parent-helpers.ts:128-157` passes the constant `["student-invoices"]` as cache-key parts and omits `tenantId` from the Prisma `where`. Parent-to-parent invoice leakage is possible under cache pressure.
3. **PII enumeration on collection GETs** — `app/api/students/route.ts:11-12` and `app/api/employees/route.ts:12-13` only check `session.tenantId`, so any TEACHER or GUARDIAN with a session can list every student and staff record in the tenant.
4. **`student-attendance/mark` missing role gate + Zod + tenant-scoped assignment lookup** — `app/api/student-attendance/mark/route.ts` writes attendance without role check, without Zod validation on `status`, and the `TeachingAssignment.findFirst` omits `classSection.tenantId`.
5. **Payroll variables non-atomic write** — `app/api/payroll/[id]/items/[itemId]/variables/route.ts:82-105` performs an update → `deleteMany` → N× `create` loop → second `update` sequence outside any transaction; a mid-sequence failure leaves `PayrollItem` totals desynced from its `PayrollItemLine` rows.

Intended outcome: ship a small, targeted hotfix cycle that closes all five in one PR. Zero schema migrations, zero UI changes, one commit per task.

## Spec

**Acceptance criteria:**
- [ ] Xendit webhook advisory-lock uses `pg_advisory_xact_lock(hashtext(${invoice.id}))`; regression test simulates a live webhook call end-to-end and asserts the invoice reaches `PAID`.
- [ ] `getStudentInvoices` cache key includes `studentId`; Prisma `where` includes `tenantId`; signature accepts `tenantId`; vitest covers two sibling parents in different tenants and confirms no cross-call leak.
- [ ] `GET /api/students` and `GET /api/employees` return 403 for non-admin sessions; vitest covers a TEACHER session hitting each and receiving 403.
- [ ] New `GET /api/teacher/students?classId=<id>` returns the enrolled roster for a class the caller teaches, backed by `requireTeacherForClass`.
- [ ] `student-attendance/mark` rejects non-TEACHER/non-admin with 403; body validated by a Zod schema with `status` enum `["PRESENT","ABSENT","SICK","PERMISSION"]`; `TeachingAssignment.findFirst` filters `classSection.tenantId = session.tenantId`.
- [ ] Payroll variables PUT wraps update + `deleteMany` + lines insert + final update in a single `prisma.$transaction`; per-line `create` loop replaced with `createMany`.
- [ ] Build, vitest, and Playwright all pass at end of cycle.

**Non-goals:**
- No schema changes. No Prisma migrations.
- No UI changes. Admin pages keep calling `/api/students` and `/api/employees` unchanged (callers are already admin).
- No revamp of `student-attendance/route.ts` (finding #1 in the review is out of scope — only `mark` is in this cycle).
- No fix for the UTC `toISOString()` bugs in `getTodayStudentAttendance` / `getStudentAttendanceRecent` (separate cycle).
- No fix for `parseSort` allowlist (separate cycle).

**Assumptions:**
1. `tx.payrollLine` in the user's spec = `tx.payrollItemLine` (actual Prisma model name). Using the correct model name.
2. No existing teacher UI calls `/api/students`. `grep` confirms only `app/admin/**` fetches `/api/students` — the role gate will not break teacher UX.
3. `prisma.$queryRaw\`SELECT pg_advisory_xact_lock(hashtext(${invoice.id}))\`` is the right replacement — `hashtext(text) → int4` (stable, not reversible) and `pg_advisory_xact_lock(int4)` is a valid overload.
4. Cache-key change needs the helper signature to take `tenantId` because the cache-key tuple must encode tenant identity — otherwise same `studentId` across tenants (theoretically possible under reseeding) still collides.
5. Existing Playwright tests remain green without edits — all five fixes tighten authorization/atomicity and shouldn't affect the demo-mode flows covered by `e2e/`.

## Tasks

Each task gets its own commit. Between-task gate (`npm run build && npx vitest run`) must pass before moving on. After the last task the end-of-cycle gate (`+ npx playwright test`) runs. For every task, spawn the `feature-dev:code-reviewer` subagent on the resulting diff before committing.

1. [x] **Fix Xendit webhook advisory-lock cast** — `app/api/xendit/webhook/route.ts:69`. Replace the UUID→bigint bit-cast with `hashtext(${invoice.id})`. Add a vitest regression under `app/api/__tests__/xendit-webhook.test.ts` that invokes the POST handler with a seeded unpaid invoice + signed payload and asserts the invoice reaches `PAID`. *Acceptance:* new test passes; manual run of `$queryRaw\`SELECT pg_advisory_xact_lock(hashtext('test-uuid-value'))\`` succeeds.

2. [x] **Harden `getStudentInvoices` cache + Prisma filter** — `lib/parent-helpers.ts:128-157`. Change the signature to `(studentId: string, tenantId: string)`. Add `tenantId` to the Prisma `where`. Pass `[studentId, tenantId]` (or equivalent composite) into the `unstable_cache` key parts. Update all callers in `lib/parent-helpers.ts` / `app/parent/**` that use this helper so the tenantId flows through. Add a vitest covering two sibling parents in different tenants, confirming each only sees their own invoice. *Acceptance:* new test passes; all existing callers typecheck.

3. [x] **Add admin role gate to collection GETs + new teacher-students route** — `app/api/students/route.ts:11-12` and `app/api/employees/route.ts:12-13`: add `if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })` to each GET. Create `app/api/teacher/students/route.ts` exposing `GET ?classId=<id>` that uses `requireTeacherForClass(classId)` then returns active enrollments for that class. Add a vitest that asserts 403 for TEACHER + GUARDIAN on `/api/students`, 403 on `/api/employees`, and 200 with the right roster on `/api/teacher/students?classId=<id>` for an assigned teacher. *Acceptance:* vitest green; no admin UI page regresses (admin callers still admin-gated).

4. [ ] **Harden `student-attendance/mark`** — `app/api/student-attendance/mark/route.ts`. Add an explicit role gate: allow only `session.role === "TEACHER"` or `isAdminRole(session.role)` with a non-null `employeeId` for teachers. Introduce a Zod schema `markAttendanceSchema` covering `classSectionId` (cuid/uuid), `date` (YYYY-MM-DD), `records[]` with `status` enum `["PRESENT","ABSENT","SICK","PERMISSION"]`. Wire through `validateBody`. Extend the `TeachingAssignment.findFirst` filter with `classSection: { tenantId: session.tenantId }`. *Acceptance:* TEACHER assigned to class can still mark; GUARDIAN blocked with 403; cross-tenant TEACHER spoofing `classSectionId` blocked; invalid `status` string rejected pre-transaction.

5. [ ] **Wrap payroll variables PUT in a transaction + `createMany`** — `app/api/payroll/[id]/items/[itemId]/variables/route.ts:82-105`. Wrap the sequence `PayrollItem.update` + `PayrollItemLine.deleteMany` + lines insert + final `PayrollItem.update` in a single `prisma.$transaction` callback. Replace the `for (const line of result.lines)` `create` loop with `tx.payrollItemLine.createMany({ data: result.lines.map(...) })`. *Acceptance:* build green; a vitest that forces a mid-transaction error leaves `PayrollItem` totals untouched (rollback verified).

**Dependencies:** All five tasks are independent. Task 2's signature change has no callers outside `app/parent/**` so it fans in cleanly. Subagent dispatch is per-task sequential (one commit per task), not parallel — `/build` serializes.

## Implementation

- Task 1: Fix Xendit webhook advisory-lock cast — `app/api/xendit/webhook/route.ts`, `app/api/__tests__/xendit-webhook.test.ts` — replaced broken `('x' || id::text)::bit(64)::bigint` with `hashtext(id)`; added end-to-end regression test asserting rendered SQL contains `hashtext`, not `bit(64)`, and invoice reaches PAID. Reviewer noted pre-existing `revalidateTag("student-invoices", {})` arity drift — out of scope for this cycle (not introduced by diff; build still green). Cross-checked design-system.html not applicable (API-only). Compliant with api.md + security.md.
- Task 2: Harden `getStudentInvoices` cache + Prisma filter — `lib/parent-helpers.ts`, `lib/__tests__/parent-helpers.test.ts` — signature now `(studentId, tenantId)`; cache wrapper hoisted to module-level `_cachedGetStudentInvoices` (runtime args serialise into cache key; matches `_cachedGetParentWithChildren` pattern already in the same file); Prisma `where` includes `tenantId` defense-in-depth. Added sibling-parents test covering cross-tenant isolation. Reviewer flagged initial per-call wrapper as breaking caching — corrected before commit.
- Task 3: Admin role gate + new teacher-students route — `app/api/students/route.ts`, `app/api/employees/route.ts`, `app/api/teacher/students/route.ts` (new), `app/api/__tests__/students-employees-authz.test.ts` (new). Added `if (!isAdminRole(session.role)) 403` to both collection GETs. New `/api/teacher/students?classId=<id>` uses `requireTeacherForClass` (already tenant-scoped via `classSection.tenantId`). 10 tests covering TEACHER+GUARDIAN 403, SUPER_ADMIN 200, teacher-for-class path. Grep confirmed only `app/admin/**` calls `/api/students` and `/api/employees` — no teacher UI regression. Compliant with security.md new-route checklist.

## Verification

- Task 1: `npm run build` green; `npx vitest run` 235 passed / 42 todo / 2 skipped (35 files).
- Task 2: `npm run build` green; `npx vitest run` 236 passed / 42 todo / 2 skipped (35 files) — new sibling-parents test included.
- Task 3: `npm run build` green; `npx vitest run` 246 passed / 42 todo / 2 skipped (36 files) — 10 new authz tests.

## Ship Notes

<!-- filled by /ship -->
