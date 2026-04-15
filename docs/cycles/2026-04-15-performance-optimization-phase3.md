# Performance Optimization — Phase 3: Indexes, Query Fixes & Payroll

## Context

Phases 1 & 2 delivered: parent dashboard N+1 fix, admin weekly-trend parallelization,
static caching on 5 reference routes, bundle baseline, and InvoiceDetailSheet dynamic import.
Measured gains: ~60% faster parent and admin dashboards.

This cycle targets the remaining slow paths found in a fresh audit of the actual source files:

**Missing Prisma indexes (4 confirmed, seq scans in production):**
- `User` — no index on `tenantId`; every user-list and auth-lookup does a full table scan
- `PayrollItem` — no `@@index` at all; payroll detail page JOINs on `payrollRunId` without an index
- `Admission` — no `@@index`; admission list filters `WHERE tenantId = ? AND status = ?` with a seq scan
- `ClassSection` — no `@@index([tenantId])`; class-section list and teacher portal filters seq scan

**Query inefficiencies (3, from reading actual route files):**
- `app/api/attendance/today/route.ts:19-31` — two separate DB round trips (employees query then attendance query); can be one query with `include`
- `app/api/payroll/generate/route.ts:54-98` — 5 sequential setup queries (orgConfig → holidays → componentDefs → employees); only the duplicate-check pair needs to be sequential, the other 4 can be parallelised with `Promise.all`
- `app/api/payroll/generate/route.ts:115-143` — nested `create` loop generates 1 + N + N×M individual INSERT statements (1 PayrollRun + 40 PayrollItems + ~320 PayrollItemLines for 40 teachers × 8 components); should be 3 bulk statements via `createMany` in a transaction

**Uncached reference routes (4, all have GET + mutation handlers):**
- `app/api/class-sections/route.ts` — changes ~once/semester
- `app/api/teaching-assignments/route.ts` — changes when teachers are reassigned
- `app/api/fee-structure/route.ts` — changes ~once/year
- `app/api/assessments/templates/route.ts` — changes when templates are created

Role: `product-builder` | Worktree: `.worktrees/perf-opt` | Branch: `feat/perf-opt`

---

## Spec

### Acceptance Criteria

**AC-1 — 4 missing Prisma indexes**

`prisma/schema.prisma` gains:
```prisma
model User {
  @@index([tenantId, status])
}
model PayrollItem {
  @@index([payrollRunId, employeeId])
}
model Admission {
  @@index([tenantId, status])
}
model ClassSection {
  @@index([tenantId])
}
```
Migration generated and applied (`npx prisma migrate dev`). Build + tests green.

**AC-2 — attendance/today: 2 round trips → 1**

`app/api/attendance/today/route.ts` before:
```ts
// Query 1 (line 19): prisma.employee.findMany(...)
// Query 2 (line 26): prisma.attendanceRecord.findMany({ where: { date, employeeId: { in: [...] } } })
```

After: single query using `include`:
```ts
prisma.employee.findMany({
  where: empWhere,
  include: {
    campus: { select: { name: true } },
    attendanceRecords: { where: { date }, select: { id: true, status: true, checkInTime: true, checkOutTime: true, isManualOverride: true, isLocked: true } },
  },
  orderBy: { nama: "asc" },
})
```
Response shape unchanged. Build + tests green.

**AC-3 — payroll generate: sequential setup → parallel**

`app/api/payroll/generate/route.ts` before (6 sequential awaits, lines 28-98):
```ts
const existingRun  = await prisma.payrollRun.findFirst(...)   // line 28
const overlapping  = await prisma.payrollRun.findFirst(...)   // line 38
const orgConfig    = await prisma.orgConfig.findUnique(...)   // line 54
const holidays     = await prisma.holiday.findMany(...)       // line 64
const componentDefs = await prisma.salaryComponentDef.findMany(...) // line 74
const employees    = await prisma.employee.findMany(...)      // line 90
```

After: duplicate-check pair stays sequential (they can each return 400 early), then the
independent 4 run in parallel:
```ts
// sequential — each may return early
const existingRun = await prisma.payrollRun.findFirst(...)
if (existingRun) return 409
const overlapping = await prisma.payrollRun.findFirst(...)
if (overlapping) return 400

// parallel — none depend on each other
const [orgConfig, holidays, componentDefs, employees] = await Promise.all([
  prisma.orgConfig.findUnique(...),
  prisma.holiday.findMany(...),
  prisma.salaryComponentDef.findMany(...),
  prisma.employee.findMany({ include: { salaryValues: true, attendanceRecords: { where: ... } } }),
])
```
Response unchanged. Build + tests green.

**AC-4 — payroll generate: nested create loop → createMany in transaction**

Before (lines 115-143): single nested `prisma.payrollRun.create` that Prisma expands to
1 + N + N×M individual INSERTs (≈361 statements for 40 teachers × 8 salary components).

After: `prisma.$transaction` with 3 bulk statements:
```ts
// Step 1: create the run (1 INSERT)
const run = await prisma.payrollRun.create({ data: { tenantId, periodStart, ... } })

// Step 2: bulk-insert all items (1 INSERT ... VALUES (...), (...), ...)
// Use crypto.randomUUID() to pre-generate item IDs so lines can reference them
const itemData = employees.map((emp) => ({
  id: crypto.randomUUID(),
  payrollRunId: run.id,
  employeeId: emp.id,
  grossAmount: results.get(emp.id)!.grossAmount,
  deductions:  results.get(emp.id)!.deductions,
  netAmount:   results.get(emp.id)!.netAmount,
}))
await prisma.payrollItem.createMany({ data: itemData })

// Step 3: bulk-insert all lines (1 INSERT ... VALUES ...)
const lineData = employees.flatMap((emp, i) =>
  results.get(emp.id)!.lines.map((line) => ({
    payrollItemId:    itemData[i].id,
    componentDefId:   line.componentDefId,
    labelSnapshot:    line.labelSnapshot,
    categorySnapshot: line.categorySnapshot,
    calculatedAmount: line.calculatedAmount,
    finalAmount:      line.finalAmount,
  }))
)
await prisma.payrollItemLine.createMany({ data: lineData })
```
Wrapped in `prisma.$transaction([...])` for atomicity. Payroll math unchanged. Response
unchanged (`{ id: run.id }`). Build + tests green.

**AC-5 — 4 cached reference routes**

Each GET handler gets `export const revalidate = <TTL>`. Each POST/PUT mutation handler
gets `revalidatePath('/api/<route>')` so the cache invalidates immediately on write:
- `app/api/class-sections/route.ts` → `revalidate = 7200` (2h)
- `app/api/teaching-assignments/route.ts` → `revalidate = 3600` (1h)
- `app/api/fee-structure/route.ts` → `revalidate = 86400` (1d)
- `app/api/assessments/templates/route.ts` → `revalidate = 7200` (2h)

Build + tests green.

### Out of Scope

- UI changes
- `unstable_cache` in parent server components (TTL/invalidation design needed — Phase 4)
- recharts / `@react-pdf/renderer` bundle optimization
- Performance monitoring dashboard
- Employee code-gen double query (POST-only path, not a hotpath; correctness fix deferred)

---

## Tasks

| # | Task | Files | Risk | Queries saved |
|---|------|-------|------|---------------|
| 1 | Add 4 missing Prisma indexes + migrate | `prisma/schema.prisma` + migration | Low | Every list scan on User, PayrollItem, Admission, ClassSection |
| 2 | attendance/today: 2 queries → 1 | `app/api/attendance/today/route.ts` | Low | 1 round trip per request |
| 3 | payroll setup: 4 sequential → Promise.all | `app/api/payroll/generate/route.ts` | Low | ~3× faster setup phase |
| 4 | payroll writes: nested create → createMany | `app/api/payroll/generate/route.ts` | Medium | ≈361 → 3 INSERTs per run |
| 5 | Cache 4 reference routes + invalidate on write | 4 API route files | Low | Near-zero latency on repeat GETs |

**Gate between tasks:** `npm run build && npx vitest run` must pass. One commit per task.

---

## Implementation

### Task 1 — 4 missing Prisma indexes (commit 3a22b38)
- `prisma/schema.prisma`: added `@@index([tenantId, status])` to `User`, `@@index([payrollRunId, employeeId])` to `PayrollItem`, `@@index([tenantId, status])` to `Admission`, `@@index([tenantId])` to `ClassSection`
- `prisma/migrations/20260415000000_add_perf_indexes/migration.sql`: 4 `CREATE INDEX` statements
- `vitest.config.ts` + `vitest.setup.ts`: applied stash fix (jsdom env + react plugin) so component tests run

### Task 2 — attendance/today: 2 round trips → 1 (commit b29ab0e)
- `app/api/attendance/today/route.ts`: replaced separate `prisma.attendanceRecord.findMany` with `include: { attendanceRecords: { where: { date }, select: {...} } }` on the employee query. Response shape unchanged.

### Task 3 — payroll setup: 4 sequential → Promise.all (commit 3b9e539)
- `app/api/payroll/generate/route.ts`: wrapped `orgConfig`, `holidays`, `componentDefs`, `employees` fetches in a single `Promise.all`. The two duplicate-check `findFirst` calls remain sequential (each can return 400/409 early). `orgConfig` null check moved after the parallel block.

### Task 4 — payroll writes: nested create → createMany in transaction (commit pending)
- `app/api/payroll/generate/route.ts`: replaced `prisma.payrollRun.create` with nested `items.create` loop (1 + N + N×M INSERTs) with `prisma.$transaction` interactive transaction: creates the run, then `payrollItem.createMany` and `payrollItemLine.createMany` as two bulk INSERTs. Item IDs pre-generated with `crypto.randomUUID()` so lines can reference them without a round trip. For 40 employees × 8 components: ≈361 → 3 statements. Added `tenantId!` non-null assertion (guarded by auth check at line 16).

---

## Verification

_To be filled by `/build`_

| Gate | Status |
|------|--------|
| `npm run build` | ⏳ |
| `npx vitest run` | ⏳ |
| Payroll generate: manual smoke (create a run, verify PayrollRun + items + lines exist) | ⏳ |
| attendance/today: single query confirmed (read code) | ⏳ |
| Prisma migration applied cleanly | ⏳ |

---

## Ship Notes

_To be filled by `/ship`_

- **Migrations:** Yes — Task 1 adds 4 indexes. No data changes, no downtime risk.
- **Env vars:** None
- **Rollback:** `git revert <commits> && git push origin staging`
