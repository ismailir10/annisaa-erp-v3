# Business Logic Audit Phase 2 — Remaining Critical Bugs

## Context

A previous cycle (`2026-04-16-business-logic-audit.md`) fixed 17 issues: payroll guards, invoice atomic generation, enrollment capacity locks, webhook security, admission atomicity, and demo mode hardening. This follow-up audit (4 parallel agents audited API routes, lib/, frontend pages, and Prisma schema) identified **11 remaining bugs** — 5 critical (financial impact / data corruption), 4 high, 2 medium.

These bugs survived the first pass because they involve subtler business rule violations (not just missing transactions) or affect flows that weren't previously audited (parent portal cache, employee code generation, assessment authorization).

## Spec

### Acceptance Criteria

- [ ] Manual payment recording is atomic (payment create + invoice update in single `$transaction`)
- [ ] Xendit webhook payment recording is atomic (idempotency check + payment create + invoice update in single `$transaction`)
- [ ] No overpayment allowed: manual payment rejects if `amount > remaining balance`
- [ ] Enrollment rejects if student already has an ACTIVE enrollment in any class
- [ ] Attendance marking validates every `studentId` belongs to the specified `classSectionId` via an ACTIVE enrollment
- [ ] Assessment scores validated: `score >= 0` for each indicator
- [ ] Assessment route verifies teacher is assigned to the student's class section
- [ ] Leave approval is atomic (leave update + attendance records in single `$transaction`)
- [ ] Employee code generation is race-safe (wrapped in `$transaction` with advisory lock or `SELECT ... FOR UPDATE`)
- [ ] `getParentWithChildren` cache key includes `parentId` — no cross-parent cache collision
- [ ] `teaching-assignments/my` filters by `tenantId` via employee relation
- [ ] `npm run build && npx vitest run` passes after every task

### Non-goals

- Academic year overlap validation (nice-to-have, no financial/data corruption risk)
- Invoice void with existing payments check (current behavior blocks DRAFT/SENT only, which is safe)
- Overtime premium rates (business decision, already documented in code)
- Rate limiter migration to Redis (in-memory stays for MVP)
- Database schema changes (enums, partial unique indexes, cascade rules) — separate migration cycle
- Frontend UX improvements (confirmation dialogs, range validation on inputs)

### Assumptions I'm making

1. **Overpayment from webhook** — I will NOT reject overpayment in the webhook (Xendit already collected the money). The previous cycle added a warning log. I will only make it atomic.
2. **Assessment score max** — I will validate `score >= 0` but NOT validate `score <= maxScore` since the indicator's max score model may not have a `maxScore` field. I'll check the schema and add it only if the field exists.
3. **Employee code race** — I will use `$transaction` with `$queryRaw` advisory lock (same pattern as invoice numbering). Not changing the code format, just making it safe.
4. **Parent cache key** — The `unstable_cache` key array needs to be unique per parent. I'll include the `parentId` (or email fallback) in the cache key array.
5. **Leave approval atomicty** — The attendance record loop creates one record per weekday in the leave period. I'll wrap the entire operation (leave update + all attendance upserts) in a single `$transaction`.
6. **Assessment teacher auth** — I'll verify the teacher has a `TeachingAssignment` for the class that the student is enrolled in. Admin bypass is allowed.

**Correct me now or `/build` will proceed with these assumptions.**

## Tasks

Ordered by risk severity (financial > data corruption > auth bypass > cache > race).

1. **Payment: wrap manual payment in transaction** — In `app/api/invoices/[id]/payments/route.ts`, wrap payment create + invoice total recalculation + invoice status update in a single `prisma.$transaction()`. Also add overpayment guard: reject if `amount > remaining` (where `remaining = totalDue - totalPaid`). Files: `app/api/invoices/[id]/payments/route.ts`.

2. **Payment: wrap webhook payment in transaction** — In `app/api/xendit/webhook/route.ts`, wrap idempotency check + payment create + invoice update in a single `prisma.$transaction()`. Use `pg_advisory_xact_lock` on the invoice ID to prevent concurrent webhook processing. Files: `app/api/xendit/webhook/route.ts`.

3. **Enrollment: block duplicate active enrollment** — In `app/api/students/[id]/enroll/route.ts`, inside the existing transaction, add a check before creating enrollment: query for any existing `StudentEnrollment` with `studentId` + `status: 'ACTIVE'`. If found, reject with error "Siswa sudah terdaftar di kelas lain". Files: `app/api/students/[id]/enroll/route.ts`.

4. **Attendance: validate student belongs to class** — In `app/api/student-attendance/mark/route.ts`, inside the existing transaction, before the upsert loop, validate all `studentId`s in `records` have an ACTIVE enrollment in `classSectionId`. If any student is not enrolled, reject the entire batch with a clear error. Files: `app/api/student-attendance/mark/route.ts`.

5. **Assessment: add score validation + teacher authorization** — In `app/api/assessments/student/[id]/route.ts`, add: (a) validate each score >= 0, (b) for TEACHER role, verify teacher has a `TeachingAssignment` for the student's class section. Admin bypass allowed. Files: `app/api/assessments/student/[id]/route.ts`.

6. **Leave: wrap approval in transaction** — In `app/api/leave/requests/[id]/approve/route.ts`, wrap leave update + attendance record loop in `prisma.$transaction()`. Files: `app/api/leave/requests/[id]/approve/route.ts`.

7. **Employee: race-safe code generation** — In `app/api/employees/route.ts`, wrap the code generation + employee creation + user creation in a `prisma.$transaction()` with an advisory lock on tenant ID. Files: `app/api/employees/route.ts`.

8. **Parent cache: fix cache key collision** — In `lib/parent-helpers.ts`, change the `getParentWithChildren` cache key from `["parent-children"]` to include the parentId (or email as fallback). Files: `lib/parent-helpers.ts`.

9. **Teaching assignments: add tenant isolation** — In `app/api/teaching-assignments/my/route.ts`, add `tenantId` filter via employee relation: `where: { employeeId: session.employeeId, classSection: { tenantId: session.tenantId } }`. Files: `app/api/teaching-assignments/my/route.ts`.

## Implementation

- **Task 1 — Manual payment atomic + overpayment guard:** `app/api/invoices/[id]/payments/route.ts` — Wrapped payment create + invoice recalculation in `$transaction()`. Added overpayment guard: rejects if `amount > remaining`. Changed `parseFloat` to `Number` + NaN check.
- **Task 2 — Webhook payment atomic:** `app/api/xendit/webhook/route.ts` — Wrapped idempotency check + payment create + invoice update in `$transaction()` with `pg_advisory_xact_lock` on invoice ID. Re-fetches invoice inside tx for fresh status.
- **Task 3 — Duplicate enrollment guard:** `app/api/students/[id]/enroll/route.ts` — Added check inside existing transaction for any ACTIVE enrollment for the student. Rejects with clear error if student is already enrolled in another class.
- **Task 4 — Attendance student-class validation:** `app/api/student-attendance/mark/route.ts` — Added batch validation inside existing transaction that checks all studentIds have an ACTIVE enrollment in the specified classSectionId. Rejects entire batch if any student is not enrolled.

## Verification

<!-- /build will fill this in after running gates -->

## Ship Notes

<!-- /ship will fill this in -->
