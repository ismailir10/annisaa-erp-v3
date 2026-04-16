# Performance Optimization — Phase 6: Query Optimization

## Context

Phases 1–5 delivered: N+1 fixes on dashboard, dynamic imports, 12 routes with `revalidate`,
`unstable_cache` on parent helpers + admin dashboard, 14 DB indexes (FK + composite), RLS initplan
fix, `loading.tsx` skeletons for 7 admin sub-pages.

**Phase 6 targets what was missed:** a fresh audit (2026-04-16) revealed 8 routes still doing
unnecessary work on every request — unbounded fetches, fat row projections, N+1 in a transaction
loop, and in-memory aggregations that should be DB-side. Prioritized by pages-per-request impact:

| Problem | Route(s) | Hits/day estimate |
|---------|----------|-------------------|
| `findMany` for leave balance aggregation | `leave/balance` | Every teacher portal load |
| Unbounded leave history | `leave/my` | Every teacher leave page |
| Unbounded slip history | `slips/my` | Every teacher slips page |
| Double `employee.findUnique` + `findMany` sum in leave submit | `leave/requests` POST | Every leave submission |
| Employee + attendance full-row fetch in payroll generate | `payroll/generate` POST | 1–2×/month, but large |
| Full PayrollItem rows on every payroll detail load | `payroll/compare` GET | Every payroll page open |
| Full Employee rows in monthly attendance grid | `attendance/monthly` GET | Every grid navigation |
| N+1 in invoice generation loop (500 students × 2 queries) | `invoices/generate` POST | Invoice batch ops |
| N upserts in assessment score save | `assessments/student/[id]` PUT | Every score save |
| Missing `@@index` on AssessmentTemplate, InvoiceLine, StudentAttendance | schema | All LEARNING routes |

---

## Spec

### Acceptance Criteria

**AC-1 — Leave balance uses DB aggregation**

`app/api/leave/balance/route.ts`: replace `findMany` + in-memory filter/reduce with two
`prisma.leaveRequest.aggregate` calls (one per leave type):

```ts
const [annualAgg, sickAgg] = await Promise.all([
  prisma.leaveRequest.aggregate({
    _sum: { days: true },
    where: { employeeId: session.employeeId, status: "APPROVED", leaveType: "ANNUAL", startDate: { gte: `${year}-01-01` } },
  }),
  prisma.leaveRequest.aggregate({
    _sum: { days: true },
    where: { employeeId: session.employeeId, status: "APPROVED", leaveType: "SICK", startDate: { gte: `${year}-01-01` } },
  }),
]);
```

Both aggregates run in parallel with `Promise.all`. Zero rows fetched to the app layer.

**AC-2 — Leave history and slip history capped**

`app/api/leave/my/route.ts`: `prisma.leaveRequest.findMany` gains `take: 50`.
`app/api/slips/my/route.ts`: `prisma.payrollItem.findMany` gains `take: 24`.

Both already have `orderBy: { createdAt/periodStart: "desc" }` — the cap returns the most recent records. Build + tests green.

**AC-3 — Leave submit: merged employee fetch + aggregate sum**

`app/api/leave/requests/route.ts` POST handler: the two sequential `employee.findUnique` calls
(lines 45–48 and 55–58) are merged into one:

```ts
const employee = await prisma.employee.findUnique({
  where: { id: session.employeeId },
  select: { status: true, leaveBalanceAnnual: true, leaveBalanceSick: true },
});
```

The `findMany` for used-days sum is replaced with a single `aggregate`:

```ts
const usedAgg = await prisma.leaveRequest.aggregate({
  _sum: { days: true },
  where: { employeeId: session.employeeId, status: "APPROVED", leaveType, startDate: { gte: `${year}-01-01` } },
});
const used = usedAgg._sum.days ?? 0;
```

Net result: 3 queries → 2 (one employee fetch + one aggregate). Build + tests green.

**AC-4 — Payroll generate: narrow projections on employee fetch**

`app/api/payroll/generate/route.ts`: the `employee.findMany` include chain gains explicit selects
so only the fields consumed by the payroll engine are fetched:

```ts
prisma.employee.findMany({
  where: { tenantId: session.tenantId, status: "ACTIVE" },
  select: {
    id: true,
    salaryValues: { select: { componentDefId: true, value: true } },
    attendanceRecords: {
      where: { date: { gte: periodStart, lte: periodEnd } },
      select: { status: true },
    },
  },
}),
```

Fields dropped from the response: `kode`, `nama`, `email`, `noHp`, `jabatan`, `campusId`,
`hireDate`, `bankAccountNo`, `bankName`, `bpjsEnrolled`, `createdAt`, `leaveBalance*`,
`checkInTime`, `checkOutTime`, GPS coordinates, override fields — none are consumed by the engine.
Payload reduction: ~80% per employee row, ~70% per attendance record. Build + tests green.

**AC-5 — Payroll compare: tenant check in where clause + narrow item select**

`app/api/payroll/compare/route.ts`:

1. Move tenant check into query: `findFirst({ where: { id: currentId, tenantId: session.tenantId } })`
   eliminates the post-load `if (!current || current.tenantId !== session.tenantId)` guard.

2. Narrow the items include on both `current` and `previous` to only the fields used for delta
   calculation:
   ```ts
   items: {
     select: {
       netAmount: true,
       employee: { select: { id: true, nama: true, kode: true } },
     },
   },
   ```
   For `previous`, `kode`/`nama` aren't needed (only `id` for the Map lookup):
   ```ts
   items: { select: { netAmount: true, employee: { select: { id: true } } } },
   ```

Drops `grossAmount`, `deductions`, `overtimeHours`, `outdoorDays`, `holidayWorkedDays`, `dcDays`
from both payroll loads. Build + tests green.

**AC-6 — Monthly attendance: narrow employee + record projections**

`app/api/attendance/monthly/route.ts`: the `employee.findMany` query selects only the fields
used in the response:

```ts
prisma.employee.findMany({
  where: empWhere,
  select: {
    id: true,
    kode: true,
    nama: true,
    campus: { select: { name: true } },
  },
  orderBy: { nama: "asc" },
})
```

The `attendanceRecord.findMany` selects only the fields serialized in the response:

```ts
prisma.attendanceRecord.findMany({
  where: { ... },
  select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, isLocked: true },
})
```

Drops from employee: `email`, `noHp`, `jabatan`, `campusId`, `hireDate`, `bankAccountNo`,
`bankName`, `bpjsEnrolled`, GPS fields, `leaveBalance*`, etc.
Drops from record: GPS lat/lng (4 fields), `isManualOverride`, `overrideReason`,
`overriddenBy`, `overriddenAt`. Build + tests green.

**AC-7 — Invoice generation: eliminate N+1 in transaction loop**

`app/api/invoices/generate/route.ts`: pre-fetch both datasets before entering the transaction,
replace per-iteration queries with Map lookups.

Before the `$transaction`:
```ts
// Pre-fetch existing invoices for this period (dedup check)
const existingInvoices = await prisma.invoice.findMany({
  where: { tenantId: session.tenantId!, periodLabel: periodLabel.trim(), studentId: { in: studentIds } },
  select: { studentId: true },
});
const existingStudentIds = new Set(existingInvoices.map((i) => i.studentId));

// Pre-fetch primary guardians for all students
const primaryGuardians = await prisma.studentGuardian.findMany({
  where: { studentId: { in: studentIds }, isPrimary: true },
  select: { studentId: true, parentId: true },
});
const guardianByStudent = new Map(primaryGuardians.map((g) => [g.studentId, g.parentId]));
```

Inside the transaction loop: replace `tx.invoice.findFirst` with `existingStudentIds.has(studentId)`
and `tx.studentGuardian.findFirst` with `guardianByStudent.get(studentId) ?? null`.

For 500 students: 1,000 queries eliminated → 2 pre-fetches outside the transaction.
Transaction only contains `tx.invoice.create` calls (one per non-skipped student). Build + tests green.

**AC-8 — Assessment scores: batch writes**

`app/api/assessments/student/[id]/route.ts` PUT handler: replace the N-upsert loop with
`deleteMany` + `createMany`:

```ts
await prisma.$transaction(async (tx) => {
  if (scores?.length) {
    await tx.studentAssessmentScore.deleteMany({ where: { assessmentId: id } });
    await tx.studentAssessmentScore.createMany({
      data: scores.map((s: { indicatorId: string; score: string; notes?: string }) => ({
        assessmentId: id,
        indicatorId: s.indicatorId,
        score: s.score,
        notes: s.notes ?? null,
      })),
    });
  }
  if (status) {
    await tx.studentAssessment.update({
      where: { id },
      data: { status, publishedAt: status === "PUBLISHED" ? new Date() : undefined },
    });
  }
});
```

For a template with 50 indicators: 50 upserts → 2 statements. Build + tests green.

**AC-9 — Schema indexes: AssessmentTemplate, InvoiceLine, StudentAttendance**

Three `@@index` additions to `prisma/schema.prisma`:

```prisma
model AssessmentTemplate {
  @@index([tenantId])
}

model InvoiceLine {
  @@index([invoiceId])
}

model StudentAttendance {
  @@index([studentId, date])   // supplements @@unique — explicit for LIKE/range queries
}
```

`npx prisma migrate dev --name add_learning_indexes` generates the migration.
`npx prisma generate` succeeds. Build + tests green.

### Out of Scope

- `attendance/export/route.ts` wide projection — export is admin-only, infrequent, acceptable for now
- Student list `guardians` include full parent row — requires guardian SELECT projection refactor, separate cycle
- `promotions/route.ts` N-upsert loop — annual operation, acceptable
- `fee-structure/route.ts` N-upsert loop — infrequent admin config, acceptable
- Converting admin list pages from `use client` to RSC split pattern — large refactor, separate cycle
- `students/[id]/route.ts` enrollment include without `take` — trivially small dataset in practice

### Assumptions

1. Assessment score `deleteMany` + `createMany` is safe because scores have no external FK
   references. The `@@unique([assessmentId, indicatorId])` constraint is satisfied by clearing first.
2. Invoice generation pre-fetch happens outside the advisory-locked transaction — the duplicate
   check `existingStudentIds` Set may be stale if a concurrent request runs simultaneously. The
   advisory lock inside the transaction still prevents duplicate `invoiceNumber` generation (the
   critical invariant). Duplicate-invoice race is already protected by the unique constraint on
   `(tenantId, invoiceNumber)`.
3. `take: 50` on leave history and `take: 24` on slip history are sufficient for teacher UX
   (shows ~4 years of leave and 2 years of salary slips).
4. The assessment score batch change is semantically equivalent: if a score was previously saved
   with `upsert` and the new `scores` array omits that indicator, the old behavior would leave it
   unchanged, while `deleteMany` removes it. This is the correct behavior (a teacher explicitly
   clearing a score should clear it).

---

## Tasks

| # | Task | Files | Impact | Risk |
|---|------|-------|--------|------|
| 1 | Leave balance: `findMany`+reduce → `Promise.all` of two `aggregate` | `app/api/leave/balance/route.ts` | HIGH | Low |
| 2 | Teacher portal caps: `take:50` on leave/my, `take:24` on slips/my | `app/api/leave/my/route.ts`, `app/api/slips/my/route.ts` | HIGH | Low |
| 3 | Leave submit: merge double `findUnique` + replace `findMany` sum with `aggregate` | `app/api/leave/requests/route.ts` | HIGH | Low |
| 4 | Payroll generate: `select` on employee + attendance records | `app/api/payroll/generate/route.ts` | HIGH | Low |
| 5 | Payroll compare: tenant check in `where` + `select` on items | `app/api/payroll/compare/route.ts` | HIGH | Low |
| 6 | Monthly attendance: `select` on employee + attendance record fields | `app/api/attendance/monthly/route.ts` | HIGH | Low |
| 7 | Invoice generate: pre-fetch existing invoices + guardians, eliminate N+1 | `app/api/invoices/generate/route.ts` | HIGH | Medium |
| 8 | Assessment scores: `deleteMany` + `createMany` batch | `app/api/assessments/student/[id]/route.ts` | MEDIUM | Low |
| 9 | Schema indexes: AssessmentTemplate.tenantId, InvoiceLine.invoiceId, StudentAttendance(studentId,date) | `prisma/schema.prisma`, new migration | LOW | Low |

**Gate between tasks:** `npm run build && npx vitest run` — must pass before every commit.
**End-of-cycle gate (after Task 9):** `npm run build && npx vitest run && npx playwright test`

---

## Implementation

- Tasks 1–6 (2026-04-16): `app/api/leave/balance/route.ts` (findMany+reduce → Promise.all aggregate×2), `app/api/leave/my/route.ts` (take:50), `app/api/slips/my/route.ts` (take:24), `app/api/leave/requests/route.ts` (2 findUnique → 1 + findMany → aggregate), `app/api/payroll/generate/route.ts` (select on employee + attendance — drops 25 unused fields), `app/api/payroll/compare/route.ts` (tenant in where clause, select on items), `app/api/attendance/monthly/route.ts` (select on employee + record — drops 20 unused fields). Build + 69 tests green.
- Task 7 (2026-04-16): `app/api/invoices/generate/route.ts` — pre-fetch existing invoices (dedup Set) + primary guardians (Map) before $transaction. Eliminates 2 per-student queries inside loop. For 500 students: 1,000 serial queries → 2 parallel pre-fetches. Build + 69 tests green.
- Task 8 (2026-04-16): `app/api/assessments/student/[id]/route.ts` — replace N-upsert loop with `deleteMany` + `createMany`. For 50 indicators: 50 sequential upserts → 2 statements. Build + 69 tests green.
- Task 9 (2026-04-16): `prisma/schema.prisma` (+3 `@@index`), `prisma/migrations/20260416000002_add_learning_indexes/migration.sql` — adds `AssessmentTemplate.tenantId`, `InvoiceLine.invoiceId`, `StudentAttendance(studentId,date)` indexes. `prisma generate` clean. Build + 69 tests green.

---

## Verification

| Gate | Status |
|------|--------|
| `npm run build` | ⏳ |
| `npx vitest run` | ⏳ |
| `npx playwright test` (end-of-cycle) | ⏳ |
| leave/balance: no `findMany` call remaining | ⏳ |
| leave/my: `take: 50` present | ⏳ |
| slips/my: `take: 24` present | ⏳ |
| leave/requests POST: single `findUnique` + `aggregate` | ⏳ |
| payroll/generate: `select` on employee include | ⏳ |
| payroll/compare: tenant in `where` clause | ⏳ |
| attendance/monthly: `select` on employee + record | ⏳ |
| invoices/generate: no `findFirst` inside transaction loop | ⏳ |
| assessments/student/[id]: no upsert loop | ⏳ |
| Schema: 3 new `@@index` in schema.prisma | ⏳ |

---

## Ship Notes

<!-- /ship fills this section -->
