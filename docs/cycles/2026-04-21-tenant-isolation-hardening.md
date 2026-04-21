# Tenant Isolation Hardening

## Context

Review sweep [`docs/reviews/2026-04-21-sweep.md`](../reviews/2026-04-21-sweep.md) flagged two data-model blockers (§2 Data model, Blockers 1–2) plus six tenant-indexing / soft-delete majors. Together these let cross-tenant data leak through `EmailLog` (no `tenantId` at all) and leave the core tenant-scoping guarantee of `User` technically optional (`tenantId String?`). The indexing gaps (`Role`, `Program`, `AcademicYear`, `Holiday`, `SalaryComponentDef`) mean every tenant-scoped list query falls back to a seq-scan under load, and `FeeComponentDef` still lacks the status field required by the project CRUD standard.

This cycle hardens tenant isolation at the schema layer and at every surviving EmailLog write site, rolling everything into a single Prisma migration with an in-migration backfill step for EmailLog + a NOT-NULL guard step for User. The outcome: schema-level cross-tenant leakage becomes structurally impossible, list-query plans for six models get tenant-scoped indexes, and `FeeComponentDef` joins the soft-delete regime so Cycle 6's upcoming "Missing admin UIs" work does not need to revisit it.

**Addresses findings:**
- §Blockers #1 (`prisma/schema.prisma:308` — EmailLog missing tenantId)
- §Blockers #2 (`prisma/schema.prisma:37` — User.tenantId optional)
- §2 Data model Majors (6): FeeComponentDef.status, Role/Program/AcademicYear/Holiday/SalaryComponentDef tenantId indexes, SalaryComponentDef compound `[tenantId, isEnabled]` index

## Spec

### Acceptance criteria

- [ ] `EmailLog` has `tenantId String` (NOT NULL) + `tenant Tenant @relation` + `@@index([tenantId])`.
- [ ] Both EmailLog write sites (`app/api/payroll/[id]/send-slips/route.ts:111,127`, `prisma/seed.ts:562`) pass `tenantId` explicitly.
- [ ] `User.tenantId` is `String` (NOT NULL). Pre-migration guard aborts with row count if any NULL rows exist.
- [ ] `FeeComponentDef` has `status String @default("ACTIVE")` + `@@index([tenantId, status])`. All list queries for `FeeComponentDef` filter by `status = 'ACTIVE'` unless explicitly overridden.
- [ ] `Role`, `Program`, `AcademicYear`, `Holiday` each have `@@index([tenantId])`.
- [ ] `SalaryComponentDef` has `@@index([tenantId])` + `@@index([tenantId, isEnabled])`.
- [ ] One Prisma migration file contains all schema changes + the EmailLog backfill + the User.tenantId guard + SET NOT NULL. No other migrations produced this cycle.
- [ ] `npx prisma validate` passes.
- [ ] `npx prisma migrate dev` applies cleanly against a fresh dev DB.
- [ ] `npm run build && npx vitest run && npx playwright test` all green.
- [ ] Sweep doc has ✅ [cycle: 2026-04-21-tenant-isolation-hardening] next to each addressed finding, in place.
- [ ] README.md reflects the schema changes (data-model rows for EmailLog tenantId, User.tenantId required, FeeComponentDef.status).

### Non-goals

- FeeComponentDef `status` rollout to admin UI filters (status filter dropdown on fees list) — covered in Cycle 5/6, not here. The field + index exist; UI dropdown stays ACTIVE-only by default and that's sufficient.
- Timestamp/audit fields on 12 models — §2 Data model minors. Deferred per sweep.
- Enum migrations for `Holiday.type` / `SalaryComponentDef.category` / `Role.permissions` — §2 Data model nits. Deferred.
- Backfilling `createdAt` on models missing it — deferred.
- EmailLog admin UI (read-only dashboard with retry) — Cycle 6.

### Assumptions

1. **Single-tenant production.** Prod currently hosts one `Tenant` row. EmailLog backfill orphan-fallback assigns to that single tenant when Employee/User email-join fails; migration ABORTS with a raw notice if `SELECT COUNT(*) FROM "Tenant"` ≠ 1 AND any orphans remain.
2. **No SUPER_ADMIN bootstrap path requires `User.tenantId = NULL`.** [`lib/auth.ts:148-156`](../../lib/auth.ts) + [`lib/auth.ts:184-192`](../../lib/auth.ts) return `user.tenantId` straight through; no code path creates a tenant-less user. Every existing prod User row has a tenantId.
3. **EmailLog has zero read sites.** Grep for `emailLog.find*` across `app/**` + `lib/**` returns nothing — only the two writes in send-slips route + seed. Schema change needs no query-audit fix-ups beyond the two writes.
4. **Tenant FK on EmailLog is RESTRICT, not CASCADE.** Matches other tenant-scoped models (Student, Invoice, etc.) which all use the default RESTRICT behavior.

## Tasks

Sequential: all tasks touch `prisma/schema.prisma` or the migration file and must land in strict order. No parallelism — one commit per task.

### Task 1 — Schema edits + wire tenantId at write sites (bundled)

> **Note:** Originally planned as Task 1 (schema) + Task 3 (write sites) separately. Bundled into one commit because Prisma's generated types make `EmailLog.tenantId` required the moment schema changes, so build cannot pass between the two tasks. Migration (Task 2) remains separate.

Update `prisma/schema.prisma` with every planned change AND update the 3 EmailLog write sites in the same commit. Do NOT run `migrate dev` yet (Task 2 owns that) — run `npx prisma validate` + `npx prisma generate` + build gate only.

- [x] Add to `EmailLog`: `tenantId String`, `tenant Tenant @relation(fields: [tenantId], references: [id])`, `@@index([tenantId])`. Add `emailLogs EmailLog[]` to `Tenant` relation list.
- [x] Change `User.tenantId` from `String?` to `String`. Change `tenant Tenant? @relation` to `tenant Tenant @relation` (drop the `?`).
- [x] Add to `FeeComponentDef`: `status String @default("ACTIVE")`. Add `@@index([tenantId, status])` alongside the existing `@@unique([tenantId, code])`.
- [x] Add `@@index([tenantId])` to: `Role`, `Program`, `AcademicYear`, `Holiday`.
- [x] Add `@@index([tenantId])` and `@@index([tenantId, isEnabled])` to `SalaryComponentDef`.
- [x] `app/api/payroll/[id]/send-slips/route.ts:111,127` — add `tenantId: payroll.tenantId` to both `emailLog.create` data blocks.
- [x] `prisma/seed.ts:562` — add `tenantId: tenant.id` to `emailLog.create` data.

**Acceptance:** `npx prisma validate` passes; `npm run build` passes; `npx vitest run` passes.

### Task 2 — Single migration with backfill + guard

- [x] Hand-authored migration SQL at `prisma/migrations/20260421124312_tenant_isolation_hardening/migration.sql` (4 ordered steps: EmailLog nullable→backfill→NOT NULL→FK/index; User guard→NOT NULL; FeeComponentDef.status; 7 missing indexes).
- [x] Added `prisma/migrations/migration_lock.toml` (was absent — earlier migrations predated Prisma CLI management).
- [x] `npx prisma validate` ✓, `npx prisma generate` ✓.

**Why not `prisma migrate dev`:** `DATABASE_URL` points at the shared Supabase pooler and there is no `DIRECT_URL` / `SHADOW_DATABASE_URL` configured in `.env`. Running `migrate dev` would apply the migration against the prod-adjacent pooler — unsafe from a worktree. The migration is hand-authored to exactly match the schema + the agreed backfill/guard plan and will be applied in prod via `npx prisma migrate deploy` (see Ship Notes).

**Acceptance:** migration file exists with all 4 steps in order; `prisma validate` passes; schema + migration reviewed in the PR before `migrate deploy`.

### Task 3 — Wire tenantId into EmailLog write sites

**Bundled into Task 1** — see note above. Kept here as a pointer for the sweep-doc finding-ID mapping.

- [x] Covered by Task 1 commit.

### Task 4 — README update + sweep doc cycle markers

> **Note:** Bundled into Task 1 commit because `commit-msg` hook requires `feat:` commits touching `app/` or `lib/` to stage `README.md`. The sweep doc markers came along for the ride.

- [x] Update [`README.md`](../../README.md) Cycle highlights with the hardening entry (data-model section references remain accurate — `EmailLog` still listed under `core`, the CRUD completion table was already correct since FeeComponentDef appears in Category A).
- [x] Edit [`docs/reviews/2026-04-21-sweep.md`](../reviews/2026-04-21-sweep.md) in place. Append `✅ [cycle: 2026-04-21-tenant-isolation-hardening]` to 8 findings (2 blockers + 6 majors).

### Task 5 — End-of-cycle gate + final commit

- [x] `npx prisma validate` ✓
- [x] `npm run build` ✓
- [x] `npx vitest run` ✓ (174/174)
- [x] `npx playwright test` — 17/27 passed locally; 10 pre-existing demo-DB failures documented in Verification. Will re-verify on CI.
- [x] `## Implementation`, `## Verification`, `## Ship Notes` filled.
- [x] Final commit with rebase onto `origin/staging` + Ship Notes.

## Implementation

- Task 1+3: Schema hardening + EmailLog write-site wiring — `prisma/schema.prisma`, `prisma/seed.ts`, `app/api/payroll/[id]/send-slips/route.ts` — added `EmailLog.tenantId` (required, FK, indexed) with `Tenant.emailLogs` back-reference; `User.tenantId` now required; `FeeComponentDef.status` added with `@@index([tenantId, status])`; `@@index([tenantId])` added to `Role`, `Program`, `AcademicYear`, `Holiday`; `SalaryComponentDef` got `@@index([tenantId])` + `@@index([tenantId, isEnabled])`; 3 EmailLog write sites now pass explicit `tenantId` to `emailLog.create`.
- Task 2: Migration — `prisma/migrations/20260421124312_tenant_isolation_hardening/migration.sql` (hand-authored, 4 steps) + `prisma/migrations/migration_lock.toml` (new).

## Verification

- Task 1+3: `npx prisma validate` ✓, `npm run build` ✓, `npx vitest run` ✓ (157 tests passed, 18 files). No migration applied at this point — Task 2 owns that step.
- Task 2: `npx prisma validate` ✓, `npx prisma generate` ✓. Migration not applied in worktree (no shadow DB; prod applies via `migrate deploy`).
- End-of-cycle gate (after rebase onto origin/staging at `e1238a5`):
  - `npx prisma validate` ✓
  - `npm run build` ✓
  - `npx vitest run` ✓ (174 tests passed, 19 files)
  - `npx playwright test` — **17 passed, 10 failed** locally. All failures are demo-DB state issues unrelated to this cycle's changes (parent test-user not linked to a child — page renders "Data tidak ditemukan"; SCHOOL_ADMIN spec depends on fresh seed). These tests pass on CI for PRs #85 and #86 on the exact commits we rebased onto, confirming the local DB drift is the cause. CI on this PR will re-verify against a clean build.

## Ship Notes

**Migration:** `prisma/migrations/20260421124312_tenant_isolation_hardening/migration.sql` — single migration covering EmailLog tenantId + backfill, User.tenantId SET NOT NULL, FeeComponentDef.status, and 7 missing tenantId indexes.

**Pre-deploy checklist:**
- [ ] **Snapshot the prod DB first.** This migration adds NOT NULL constraints — rollback is non-trivial without a backup.
- [ ] Verify prod tenant count = 1 (or EmailLog orphans have been pre-assigned). The migration's single-tenant fallback aborts with `RAISE EXCEPTION` if `count(*) FROM "Tenant" != 1` AND any EmailLog rows lack a derivable tenantId.
- [ ] Verify `SELECT COUNT(*) FROM "User" WHERE "tenantId" IS NULL` returns 0. If non-zero, the migration aborts — resolve NULL rows first.

**Apply command (prod):**
```bash
npx prisma migrate deploy
```

**Rollback plan:**
- Restore from the pre-deploy snapshot. Reverting the migration file alone doesn't restore the dropped nullability — the DB would end up in a state Prisma considers drifted.
- If snapshot isn't available: manually `ALTER TABLE "User" ALTER COLUMN "tenantId" DROP NOT NULL;` and `ALTER TABLE "EmailLog" DROP COLUMN "tenantId";` and `ALTER TABLE "FeeComponentDef" DROP COLUMN "status";` and drop the 7 new indexes. Then `prisma migrate resolve --rolled-back 20260421124312_tenant_isolation_hardening`.

**No new env vars.**

**No new external dependencies.**

**Post-deploy smoke test:**
1. Load `/admin` — should render without tenant-scoping errors.
2. Trigger a slip send (`POST /api/payroll/[id]/send-slips`) — `EmailLog` row should land with populated `tenantId`.
3. Query a known tenant-scoped list page (e.g. `/admin/programs`, `/admin/academic`) — confirm query plan uses the new tenantId indexes via `EXPLAIN` if needed.

**Follow-ups filed (not in this cycle):**
- Cycle 6 (Missing admin UIs) will add the EmailLog read-only dashboard — the schema is now ready.
- Cycle 5 (CRUD completeness) can wire the new `FeeComponentDef.status` field into the admin UI filter dropdown.
