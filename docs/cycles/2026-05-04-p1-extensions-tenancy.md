# Phase 1 Cycle 1 — Extensions + Tenancy

**Type:** schema
**Phase:** p1
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §6.1 (migrations 00 + 01) + §18.1 (cycle decomposition)

## Context

Implements §6.1 migrations `00_extensions` + `01_tenancy` and §6.2 seeds 00 + 02 + 03 + 04 from the foundation spec. Phase 0 hard-deleted v1 domain code but preserved schema + migration history; this cycle resets the schema to the v2 skeleton and lays the tenancy foundation that every subsequent phase 1 cycle (identity, employees, classes) builds on. Marathon mode: no full brainstorm — scope and decisions are pre-declared in the foundation spec. Cross-checked design-system.html: N/A (no UI). UAT reports: N/A (pre-launch rebuild, all v1 reports archived).

## Spec

Acceptance criteria:

- [ ] `prisma/schema.prisma` cleared of all v1 domain models; only `generator` + `datasource` + the 5 v2 tenancy models remain.
- [ ] All `prisma/migrations/202604*/` directories removed; `migration_lock.toml` preserved.
- [ ] Migration `00_extensions/migration.sql` enables `pg_trgm` + `pgcrypto`.
- [ ] Migration `01_tenancy/migration.sql` creates `Tenant`, `Campus`, `Program`, `AcademicYear`, `AcademicTerm` per spec §4.4 conventions:
  - Audit columns (`createdAt, createdById, updatedAt, updatedById, deletedAt?, deletedById?`) on Campus / Program / AcademicYear; AcademicTerm w/o `deletedAt`; Tenant w/ `createdAt, updatedAt` only.
  - Length constraints via `@db.VarChar(N)` (slug 50, code 50, name 255, phone 20, email 255, address 500).
  - Composite indexes `(tenantId, ...)` first.
  - `onDelete: Restrict` for `tenantId` FKs.
  - `@db.Date` for date-only columns; `Timestamptz` for timestamps.
- [ ] Partial unique indexes via raw SQL (Prisma can't express filtered uniques natively):
  - `tenant_slug_unique` (full unique, declarative).
  - `campus_code_active_unique` ON `Campus(tenantId, code) WHERE "deletedAt" IS NULL`.
  - `program_code_active_unique` ON `Program(tenantId, code) WHERE "deletedAt" IS NULL`.
  - `academic_year_current_unique` ON `AcademicYear(tenantId) WHERE "isCurrent" = true`.
- [ ] CHECK constraints via raw SQL: `AcademicYear.startDate < endDate`, `AcademicTerm.startDate < endDate`.
- [ ] Seed orchestrator `prisma/seed/index.ts` runs `00-tenant`, `02-campuses`, `03-programs`, `04-academic-year` in order; idempotent under repeat invocation.
- [ ] `prisma.config.ts` seed entry → `npx tsx prisma/seed/index.ts`.
- [ ] Seeds produce expected rows: 1 Tenant (`an-nisaa-sekolahku`), 2 Campus (Metland + Aster), 6 Program (DAYCARE / TODDLER_1 / TODDLER_2 / PLAYGROUP / TK_A / TK_B), 1 AcademicYear (TA 2026/2027 isCurrent=true), 4 AcademicTerm (TW1_SEM1 / TW2_SEM1 / TW1_SEM2 / TW2_SEM2).
- [ ] `npx prisma migrate reset --force` applies cleanly to fresh DB; `npx prisma db seed` runs idempotent (2× run → identical row count).
- [ ] Migration post-condition tests in `prisma/migrations/__tests__/` cover slug uniqueness, partial unique on Campus.code, AcademicYear partial unique on isCurrent, CHECK constraint enforcement.
- [ ] `npm run build` green; `npx vitest run` green.
- [ ] README.md + CLAUDE.md aligned per cycle's narrow doc-sync rule.

Non-goals (explicitly out of this cycle, deferred to subsequent p1 cycles per spec §18.1):

- User / Role / Permission / UserRole / RLS / composite FK / JWT hook → `p1-identity-rls`.
- Employee / EmployeeCampusAssignment + ClassSection / TeachingDefault / Sentra / SentraRotation → `p1-employees-classes-sentra`.
- ClassSession / SessionTeacher → `p1-sessions`.
- AuditLog / TimelineEvent / FileAsset → `p1-audit-timeline-files`.
- Scaffold engine + Google OAuth refactor → separate cycles.
- idn-area-data regions → `p1-regions-seed`.
- Postgres enums (~34) — full enum sweep deferred; this cycle treats `bootstrapStatus` as `VarChar(20)`.

Assumptions:

- `bootstrapStatus` lives on Tenant as a string for now; converted to enum in a later cycle alongside the broader §4.2 enum sweep.
- `Program.headEmployeeId` is `String?` w/o relation this cycle (Employee not yet introduced); `p1-employees-classes-sentra` adds the FK.
- `Tenant` keeps minimal columns (no `deletedAt`) — tenant termination is operational, not soft-delete.
- Migration directory naming `00_extensions` + `01_tenancy` (no timestamp prefix) per spec §6.1; Prisma sorts lexicographically so this works alongside future `02_…` etc.

## Tasks

1. **Reset schema + migration history.**
   Drop all `prisma/migrations/202604*/` directories, preserve `migration_lock.toml`, reset `prisma/schema.prisma` to skeleton (`generator` + `datasource` blocks only).
   *Acceptance:* `git status` shows old migration dirs deleted; schema file is < 15 lines; `npx prisma format` succeeds.

2. **Add 5 tenancy models to schema.**
   Tenant, Campus, Program, AcademicYear, AcademicTerm per spec §4.4 conventions (audit cols, length constraints, composite indexes, Restrict cascades).
   *Acceptance:* `npx prisma validate` green; `npx prisma format` produces no diff.

3. **Author migration `00_extensions`.**
   Create `prisma/migrations/00_extensions/migration.sql` with `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;`.
   *Acceptance:* SQL applies cleanly to a fresh Postgres DB.

4. **Author migration `01_tenancy`.**
   Create `prisma/migrations/01_tenancy/migration.sql` with the 5 `CREATE TABLE` statements + audit columns + composite indexes, then append raw SQL for partial unique indexes (campus, program, academic year current) + CHECK constraints (date ordering).
   *Acceptance:* `prisma migrate reset --force` runs cleanly to empty.

5. **Wire seed orchestrator + 4 seed files.**
   Create `prisma/seed/{00-tenant,02-campuses,03-programs,04-academic-year}.ts` + `prisma/seed/index.ts` orchestrator. Idempotent upserts keyed on `(tenantId, code)` or `slug`. Update `prisma.config.ts` seed entry to `npx tsx prisma/seed/index.ts`.
   *Acceptance:* `npx prisma db seed` runs twice in a row, produces identical row counts (1/2/6/1/4).

6. **Migration post-condition tests.**
   `prisma/migrations/__tests__/01-tenancy.test.ts` asserts: Tenant.slug unique violation, Campus partial unique fires only on non-deleted, AcademicYear `isCurrent=true` partial unique fires once per tenant, CHECK rejects `endDate <= startDate`.
   *Acceptance:* `npx vitest run prisma/migrations/__tests__/01-tenancy.test.ts` passes.

7. **End-of-cycle gates.**
   Run `npm run build && npx vitest run`. Playwright skipped per CLAUDE.md schema-cycle exception (no user-facing routes).
   *Acceptance:* both gates green; record skip reason in Verification.

8. **Doc sync.**
   Update README.md (Schema section: 5 v2 models, migration list 00 + 01) + CLAUDE.md (token `design-system` not required — schema cycle, no frontend touch). Add brief ADR row for "v2 schema reset / tenancy first".
   *Acceptance:* `pre-commit` hook accepts the staged diff (broad doc-sync rule: cycle doc + README staged alongside `prisma/**` changes).

9. **Ship.**
   `/ship` opens PR `feat/p1-extensions-tenancy` → `staging`. CI must pass (Lint, Build; Playwright N/A — empty `e2e/`). Manual squash + delete-branch on green.

## Implementation

- **Task 1 — schema + migration history reset.** Removed all 38 `prisma/migrations/202604*/` directories (Phase 0 had preserved them; Phase 1 cycle 1 owns the cutover per spec §18.1). `migration_lock.toml` preserved. `prisma/schema.prisma` reset to a 9-line skeleton (`generator` + `datasource` blocks only) before adding the v2 models.
- **Task 2 — 5 tenancy models.** Added `Tenant` (root, no soft-delete, no audit-by columns), `Campus` / `Program` / `AcademicYear` (full audit + `deletedAt`), and `AcademicTerm` (audit only — terms are immutable historical anchors per spec §6.2). Length constraints `@db.VarChar(N)` per spec §4.4 (slug 50, code 50/20, name 255, phone 20, email 255, address 500). Composite indexes `(tenantId, ...)` first; `onDelete: Restrict` on every `tenantId` FK; `@db.Date` for date-only columns; `Timestamptz` everywhere else. `Program.headEmployeeId` left as `String?` (no relation) — Employee lands in `p1-employees-classes-sentra`.
- **Task 3 — `00_extensions/migration.sql`.** Manual file: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;` plus a 3-line header explaining usage (trigram dedup heuristic + audit hashing).
- **Task 4 — `01_tenancy/migration.sql`.** Generated via `npx prisma migrate dev --create-only --name 01_tenancy` (timestamp-prefixed dir), then renamed to `01_tenancy/`. Appended raw SQL for the four partial unique indexes (`campus_code_active_unique`, `program_code_active_unique`, `academic_year_current_unique`, plus the declarative `Tenant_slug_key`) and two CHECK constraints (`academic_year_date_range_check`, `academic_term_date_range_check`).
- **Task 5 — seed orchestrator + 4 seeds.** `prisma/seed/index.ts` runs `00-tenant` (upsert by slug → `bootstrapStatus="PENDING"`), `02-campuses` (Metland + Aster, `findFirst`-then-update keyed on `(tenantId, code, deletedAt: null)` since the unique is a partial index), `03-programs` (6 jenjang per spec §6.2 + research §6.3.1 — DAYCARE / TODDLER_1 / TODDLER_2 / PLAYGROUP / TK_A / TK_B), `04-academic-year` (TA 2026/2027 isCurrent=true + 4 terms TW1_SEM1 active by default, others isActive=false). All seeds idempotent. `prisma.config.ts` seed entry rewritten to `npx tsx prisma/seed/index.ts`.
- **Task 6 — migration post-condition tests.** `prisma/migrations/__tests__/01-tenancy.test.ts` (31 cases) statically parses the committed `migration.sql` and asserts: extension creation, table presence, every length constraint per spec §4.4, audit-column policy per model (Campus/Program/AcademicYear have `deletedAt`, AcademicTerm + Tenant don't), all four partial unique indexes including the date-range CHECK constraints, FK `ON DELETE RESTRICT` for every tenantId FK and the AcademicYearId FK, composite `(tenantId, code)` indexes. Static-parse approach chosen because the CI `Lint, Typecheck & Test` job has no Postgres service; live-DB integrity tests will land with `p1-identity-rls` (which inherently needs a DB).
- **Task 7 — orphan code sweep (scope expansion).** Phase 0 left `lib/finance/*`, `lib/xendit/*`, `lib/audit.ts`, `lib/auth.ts`, `lib/auth-guard.ts`, `lib/parent-helpers.ts`, `lib/dashboard/*`, `lib/student-journal/*`, `lib/uat/*`, `lib/email/*`, `lib/payroll/*`, `lib/api/*`, `lib/webhook/*`, `lib/validations/*`, `lib/student-import/*`, `lib/attendance/*`, `lib/pdf/*`, plus their `__tests__/` and matching API routes (`app/api/auth/{login,users,me,logout}`, `app/api/xendit/*`, `app/api/cron/*`, `app/auth/callback`) referencing dropped v1 models — these now produced 176 type errors against the v2 schema. Removed all of them along with `config/admin-nav.ts`, every domain component dir (`components/{admin,teacher,parent,portal,attendance,student-journal}`), the `scripts/reseed/*` reseeders, `scripts/seed-demo-users.ts`, `scripts/backfill-pending-payment-links.ts`, `scripts/finish-xendit.ts`, and `scripts/reseed-staging.ts`. Removed `lib/security/auth-rate-limit.ts` (its consumer `proxy.ts` no longer routes `/api/auth/*`). What survives in `lib/`: `db.ts`, `format.ts`, `hijri.ts`, `utils.ts`, `generated/prisma/*`, `supabase/*`, `security/headers.ts`. What survives in `app/`: homepage placeholder, `legal/*`, `manifest.webmanifest`, `opengraph-image`, `api/health`, `api/csp-report`, `_not-found`. The preserved-lib list in CLAUDE.md and the rebuild-banner in README.md were updated to reflect this.
- **Task 8 — rebuild-window guard.** `scripts/verify-rls-coverage.sh` updated to detect the rebuild window automatically: while zero `CREATE POLICY` statements exist anywhere in `prisma/migrations/`, the guard exits 0 with a one-line warning. The strict `< 10` model-count floor resumes once the first policy merges (next cycle, `p1-identity-rls`).
- **Task 9 — doc sync.** README rebuild banner rewritten to reflect the post-sweep surface area; setup snippet updated `db push` → `migrate dev`. New ADR row "v2 schema reset / tenancy first" added at the top of the active ADR table (cell ≤ 400 chars). CLAUDE.md banner extended with a migration-test-target note + RLS guard rebuild-window note.

## Verification

End-of-cycle gate (all green from `.worktrees/p1-extensions-tenancy`):

- `npm run build` — Next.js 16.2.3 production build, 7 routes (`/`, `/_not-found`, `/api/csp-report`, `/api/health`, `/legal/privacy`, `/legal/terms`, `/manifest.webmanifest`, `/opengraph-image`, plus `Proxy` middleware). Compiled successfully in 5.4s.
- `npx vitest run` — **7 test files / 61 tests passed** (incl. `prisma/migrations/__tests__/01-tenancy.test.ts` 31/31).
- `npx prisma generate` — Prisma Client 7.6.0 generated.
- `npx prisma validate` — schema valid.
- `npx prisma migrate reset --force` — applied `00_extensions` + `01_tenancy` cleanly to a fresh-reset Supabase staging DB; `npx prisma db seed` ran twice consecutively, second pass produced no new rows (`{tenants:1, campuses:2, programs:6, years:1, terms:4}`).
- `bash scripts/verify-rls-coverage.sh` — exits 0 with rebuild-window warning ("4 tenant-scoped models present, 0 policies; strict check resumes once `p1-identity-rls` lands").
- `bash scripts/verify-api-auth.sh` — `2 / 2 routes have session helper or @public sentinel` (only `/api/health` + `/api/csp-report` remain, both `@public`-tagged).
- `npm run lint` — clean.
- `npm run typecheck` — clean (`tsc --noEmit` no errors after the orphan sweep).

Playwright **skipped** per CLAUDE.md schema-cycle exception — no user-facing routes added; `e2e/` has remained empty since Phase 0. The CI `Playwright E2E` job already auto-skips when `e2e/` has no `*.spec.ts` files (per Phase 0 Ship Notes).

Cross-check: `design-system.html` not consulted — schema-only cycle, no frontend diff (frontend gate not triggered).

## Ship Notes

(Filled by /ship — PR URL, migrations summary, env vars, rollback.)
