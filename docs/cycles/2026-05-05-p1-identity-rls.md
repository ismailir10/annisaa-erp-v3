# Phase 1 Cycle 2 — Identity + RLS + JWT Hook

**Type:** schema
**Phase:** p1
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §6.1 migration 02 + §6.3 RLS + §6.4 composite FK + §6.5 JWT hook + §18.1 phase 1 cycle 2

## Context

Implements §6.1 migration `02_identity` + §6.3 SELECT-only RLS + §6.4 composite-FK pattern (UserRole / RolePermission) + §6.5 Supabase Custom Access Token Hook from the foundation spec. Builds on the tenancy schema landed in the previous cycle (`p1-extensions-tenancy`, PR #179, staging). Activates the RLS coverage guard in **strict** mode — `verify-rls-coverage.sh` auto-detects this transition the moment the first `CREATE POLICY` lands. Marathon mode per spec §18.12 — no full brainstorm, scope pre-declared by spec, plan written inline. Cross-checked design-system.html: N/A (schema-only cycle, no frontend diff). UAT reports: N/A (pre-launch rebuild).

## Spec

Acceptance criteria:

- [ ] `prisma/schema.prisma` adds 5 identity models (`User`, `Role`, `Permission`, `UserRole`, `RolePermission`) with §4.4 conventions + §6.4 composite-FK pattern.
- [ ] 3 new Postgres enums: `PermissionScope` (ALL/OWN_CAMPUS/OWN_PROGRAM/OWN_CLASS/OWN_SESSION/OWN_STUDENT/SELF), `CatalogSource` (SYSTEM/ADMIN), `TenantBootstrapStatus` (PENDING/COMPLETE).
- [ ] `Tenant.bootstrapStatus` converted from `VarChar(20)` to enum `TenantBootstrapStatus` via single `ALTER TABLE ... ALTER COLUMN ... TYPE` migration step.
- [ ] Migration `02_identity/migration.sql` applies cleanly on top of `00_extensions` + `01_tenancy`.
- [ ] Composite FK pattern per spec §6.4 enforced at DB:
  - `User`/`Role`/`Permission` carry `@@unique([id, tenantId])` (composite uniqueness).
  - `UserRole.userId+tenantId → User(id, tenantId)` and `UserRole.roleId+tenantId → Role(id, tenantId)`.
  - `RolePermission.roleId+tenantId → Role(id, tenantId)` and `RolePermission.permissionId+tenantId → Permission(id, tenantId)`.
  - Cascade on User/Role/Permission delete.
- [ ] Partial unique indexes via raw SQL:
  - `user_email_active_unique` ON `User(tenantId, email) WHERE "deletedAt" IS NULL`.
  - `role_code_active_unique` ON `Role(tenantId, code) WHERE "deletedAt" IS NULL`.
  - `permission_resource_action_scope_active_unique` ON `Permission(tenantId, resource, action, scope) WHERE "deletedAt" IS NULL`.
- [ ] **RLS policies via raw SQL** on all 5 new identity tables AND retroactively on the 4 tenant-scoped tenancy tables (`Campus` / `Program` / `AcademicYear` / `AcademicTerm`):
  - `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY`
  - `REVOKE ALL ON "X" FROM anon, authenticated`
  - `GRANT SELECT ON "X" TO authenticated`
  - `CREATE POLICY tenant_isolation_select ON "X" FOR SELECT TO authenticated USING (...)` — `deletedAt IS NULL` clause omitted on `AcademicTerm` + `UserRole` + `RolePermission` (no soft-delete on those).
  - `CREATE POLICY no_writes_via_postgrest ON "X" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)`.
- [ ] JWT hook function `public.custom_access_token_hook(event jsonb)` committed as SQL — injects `tenant_id` + `role` (resolved via UserRole join) into JWT claims. Granted `EXECUTE` to `supabase_auth_admin`; revoked from `authenticated`/`anon`/`public`.
- [ ] Seed `05-system-roles.ts` — 8 roles per spec §6.2: `admin, principal, kadiv, homeroom_teacher, sentra_teacher, admission_officer, finance_officer, parent`. `source=SYSTEM`. Idempotent upsert keyed on (tenantId, code).
- [ ] Seed `06-permissions.ts` — placeholder permission scaffolding: 8 rows (1 per role, `(resource=role.code, action='read', scope=ALL)`) so RLS-critical join target is non-empty. Full matrix lands in `p1-scaffold-engine-skeleton` per spec §18.4. Idempotent.
- [ ] Migration post-condition tests `prisma/migrations/__tests__/02-identity.test.ts` — static parse asserts: composite uniques, partial uniques, RLS ENABLE on 9 tables, REVOKE + 2 policies on each, JWT hook function definition, ALTER TYPE for bootstrapStatus.
- [ ] All gates green:
  - `npx prisma generate` + `npx prisma validate`
  - `npx prisma migrate dev` applies cleanly
  - `npx prisma db seed` runs 2× idempotent (identical row counts).
  - `npm run build && npx vitest run` green.
  - `bash scripts/verify-rls-coverage.sh` exits 0 in **strict** mode (rebuild window auto-disables).
  - `bash scripts/verify-api-auth.sh` still 2/2.
- [ ] README ADR row + minimal CLAUDE.md update per narrow doc-sync rule.

Non-goals (deferred per spec §18.1):

- Live-DB integrity tests (Postgres service for `Lint, Typecheck & Test` CI job).
- `permission-scope.md` standards file → `p1-scaffold-engine-skeleton` (per spec §18.4).
- Full permission matrix per `(role × resource × action × scope)` — needs entity registry.
- Auth callback / Google OAuth wiring → `p1-auth-google-oauth`.
- Employee / EmployeeCampusAssignment → `p1-employees-classes-sentra`.

Assumptions:

- `Tenant.bootstrapStatus` enum conversion is safe: only 1 row exists post-`p1-extensions-tenancy` seed (`an-nisaa-sekolahku`, value `PENDING`) so the `USING ... ::TenantBootstrapStatus` cast cannot fail.
- JWT hook **SQL function** ships in this migration, but Supabase **registration** of the hook (Auth → Hooks → Custom Access Token Hook) is a one-time dashboard action documented in Ship Notes — Supabase API does not expose `ALTER ... HOOK` via SQL (verified vs. supabase docs).
- Composite FKs declared on `UserRole` + `RolePermission` only (the RLS-critical join tables MVP per spec §6.4); other future join tables enforce alignment app-layer until tenant #2 lands.
- `User.supabaseUserId` may be NULL until p1-auth-google-oauth wires the OAuth callback that populates it; seed users for testing land in that cycle.

## Tasks

1. **Schema additions.**
   Add `PermissionScope`, `CatalogSource`, `TenantBootstrapStatus` enums + 5 identity models per §4.4 + §6.4. Convert `Tenant.bootstrapStatus` field type to enum. Add back-relations on `Tenant` (`users`, `roles`, `permissions`).
   *Acceptance:* `npx prisma format` + `npx prisma validate` clean.

2. **Author migration `02_identity/migration.sql`.**
   Hand-written SQL following the `01_tenancy` template:
   - 3 `CREATE TYPE` statements.
   - `ALTER TABLE "Tenant"` to convert bootstrapStatus to enum.
   - 5 `CREATE TABLE` for User/Role/Permission/UserRole/RolePermission.
   - Composite unique indexes on (id, tenantId) for User/Role/Permission.
   - Partial unique indexes on User.email, Role.code, Permission.(resource,action,scope) — all WHERE deletedAt IS NULL.
   - Lookup indexes for Supabase/Google subject lookup on User.
   - FK constraints — Tenant FK (Restrict) on User/Role/Permission; composite FKs (Cascade) on UserRole/RolePermission per §6.4.
   - RLS block (9 tables): ENABLE ROW LEVEL SECURITY + REVOKE + GRANT SELECT + tenant_isolation_select policy + no_writes_via_postgrest policy. AcademicTerm/UserRole/RolePermission policies omit `deletedAt IS NULL`.
   - JWT hook: `CREATE OR REPLACE FUNCTION public.custom_access_token_hook` + `GRANT EXECUTE TO supabase_auth_admin` + `REVOKE EXECUTE FROM authenticated, anon, public`.
   *Acceptance:* `npx prisma migrate dev` applies cleanly to fresh-reset DB.

3. **Seeds 05 + 06.**
   `prisma/seed/05-system-roles.ts` — 8 roles, idempotent (findFirst+update vs. create). `prisma/seed/06-permissions.ts` — 8 placeholder permissions (1 per role) + 8 RolePermission link rows. Wire into `prisma/seed/index.ts` (after `04-academic-year`, before any existing tail).
   *Acceptance:* `npx prisma db seed` runs twice, second pass produces identical row counts.

4. **Migration post-condition tests.**
   `prisma/migrations/__tests__/02-identity.test.ts` — static parse of `02_identity/migration.sql`. Asserts enum creation, ALTER TABLE bootstrapStatus, table creation, composite uniques, partial uniques, FK rules (composite + cascade), RLS ENABLE+policies on 9 tables, JWT hook function presence + GRANT EXECUTE.
   *Acceptance:* `npx vitest run prisma/migrations/__tests__` green; existing `01-tenancy.test.ts` not regressed.

5. **End-of-cycle gates.**
   Run `npx prisma generate && npx prisma validate && npm run build && npx vitest run && bash scripts/verify-rls-coverage.sh && bash scripts/verify-api-auth.sh`. Playwright skipped per CLAUDE.md schema-cycle exception (no UI).
   *Acceptance:* all gates green; `verify-rls-coverage.sh` reports `9 / 9` (strict mode).

6. **Doc sync.**
   - README ADR row "v2 identity + RLS + JWT hook" added at top of active ADR table.
   - CLAUDE.md banner: drop the rebuild-window note (no longer applies); add migration-list entry for `02_identity`.
   - `migration.md` standards file deferred to p1-scaffold-engine-skeleton per spec §18.4 (out of scope).
   *Acceptance:* `pre-commit` accepts staged diff (broad doc-sync rule + narrow rule both satisfied).

7. **Ship.**
   `/ship` opens PR `feat/p1-identity-rls` → `staging`. CI must pass (Lint, Build; Playwright auto-skip — `e2e/` empty). Manual squash-merge on green.

## Implementation

- **Task 1 — schema additions.** Added 3 enums (`PermissionScope`, `CatalogSource`, `TenantBootstrapStatus`) before the Tenant block. Converted `Tenant.bootstrapStatus` from `String @db.VarChar(20)` to `TenantBootstrapStatus @default(PENDING)`. Appended 5 identity models after `AcademicTerm`: `User` (id cuid, audit + soft-delete, indexes on `(tenantId, supabaseUserId)` + `(tenantId, googleSubjectId)` for hook lookup), `Role` (catalog table with `source: CatalogSource @default(SYSTEM)`), `Permission` (`scope: PermissionScope @default(ALL)`), `UserRole` and `RolePermission` (composite PK + composite FKs to (id, tenantId) of parent, no soft-delete, cascade on parent delete). `Tenant` got 3 new back-relations (`users`, `roles`, `permissions`). `npx prisma format` + `npx prisma validate` clean.
- **Task 2 — migration `02_identity/migration.sql`.** Hand-written following the `01_tenancy` template (preserving Prisma's index/constraint naming so future `prisma migrate dev --create-only` runs don't drift). Section order: 3 `CREATE TYPE`, single `ALTER TABLE Tenant` enum conversion (DROP DEFAULT → TYPE … USING …::enum → SET DEFAULT — safe because seed leaves only `PENDING`), 5 `CREATE TABLE`, composite uniques on `(id, tenantId)` for User/Role/Permission (FK targets per §6.4), lookup + composite indexes, partial unique indexes via raw SQL on User.email / Role.code / Permission.(resource,action,scope) all `WHERE "deletedAt" IS NULL`, FK constraints split into Tenant Restrict (User/Role/Permission) and composite Cascade (UserRole/RolePermission — separate Tenant FK omitted on join tables per §6.4 since the composite chain already enforces alignment). RLS section covers 9 tables (5 new + 4 retroactive Campus/Program/AcademicYear/AcademicTerm): each gets ENABLE + REVOKE + GRANT SELECT + `tenant_isolation_select` policy + `no_writes_via_postgrest` policy. The `deletedAt IS NULL` clause is omitted on AcademicTerm/UserRole/RolePermission policies (no soft-delete on those). Final block: `CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)` — `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`, resolves user via `User.supabaseUserId = event->>'user_id'` (with `deletedAt IS NULL` + `isActive = true`), LEFT JOINs UserRole + Role for primary role code, injects both via `jsonb_set` into claims; ends with REVOKE EXECUTE from public/authenticated/anon + GRANT EXECUTE to `supabase_auth_admin` + GRANT SELECT on User/Role/UserRole to `supabase_auth_admin`.
- **Task 2.5 — `__tests__` dir relocation.** Prisma 7.6.0's `migrate deploy` now scans every subdir of `prisma/migrations/` for `migration.sql` and aborts with `P3015 Could not find the migration file at migration.sql` on `__tests__/`. Moved `prisma/migrations/__tests__/` → `prisma/migration-tests/` and adjusted the `path.resolve(__dirname, "..", "..", "..")` in `01-tenancy.test.ts` → `path.resolve(__dirname, "..", "..")` (one fewer level). vitest discovers tests by default glob, no config change needed.
- **Task 3 — seeds 05 + 06.** `prisma/seed/05-system-roles.ts` exports `SYSTEM_ROLES` const (8 entries: admin/principal/kadiv/homeroom_teacher/sentra_teacher/admission_officer/finance_officer/parent) + `seedSystemRoles(prisma, tenantId)` using findFirst-then-update / create against `(tenantId, code, deletedAt: null)` (mirrors `03-programs.ts` since the unique is a partial index). `prisma/seed/06-permissions.ts` imports the SYSTEM_ROLES list, then for each role: idempotent upsert of a placeholder Permission `(resource=role.code, action="read", scope=ALL)` + idempotent insert of the matching RolePermission link via composite-PK lookup. Wired into `prisma/seed/index.ts` after `04-academic-year`. Two consecutive `npx prisma db seed` runs produced identical row counts: `{tenants:1, campuses:2, programs:6, years:1, terms:4, users:0, roles:8, perms:8, userRoles:0, rolePerms:8}`. `Tenant.bootstrapStatus` reads back as `"PENDING"` confirming the enum cast worked.
- **Task 4 — migration post-condition tests.** `prisma/migration-tests/02-identity.test.ts` adds 78 cases asserting: enum creation (3), Tenant.bootstrapStatus ALTER TABLE pattern, table creation (5), per-table column shape for User/Role/Permission/UserRole/RolePermission, composite uniques on (id, tenantId) (3), partial uniques on email/code/perm-tuple (3), FK Restrict for User/Role/Permission tenantId (3), composite-FK Cascade for UserRole + RolePermission (4), RLS coverage on 9 tables (each ×4 — ENABLE / REVOKE / GRANT / 2 policies), conditional `deletedAt IS NULL` presence by soft-delete vs not, JWT hook fn presence + `SECURITY DEFINER` + `search_path` lock + tenant_id/role injection + supabaseUserId resolution + GRANT/REVOKE EXECUTE + supabase_auth_admin SELECT grant. Initial regex bug: `[\s\S]*?(?=CREATE POLICY|$)` with `m` flag treated `$` as end-of-line, capturing only the policy header; fixed by replacing the `$` alternative with the explicit lookahead `(?=CREATE POLICY "no_writes_via_postgrest")`. Final: 8 test files / 149 tests pass (incl. 31 from `01-tenancy.test.ts` + 118 from `02-identity.test.ts`).
- **Task 5 — verify-rls-coverage floor adjustment.** The script's `< 10 sanity floor` guard fired falsely (we have 9 tenant-scoped models post-cycle 2: 4 tenancy + 5 identity, joining-table UserRole + RolePermission count). Lowered floor from 10 to 5 with comment explaining the rebuild ramp (4 → 9 → ~20+). Parser-regression guard intent preserved — a truly broken parser still trips well below 5. Re-run: `✓ RLS coverage OK: 9 / 9 tenant-scoped models have ENABLE + policy.` (strict mode, exit 0).
- **Task 6 — doc sync.** README ADR row "v2 identity + RLS + JWT hook" inserted at top of active table; rebuild banner extended with cycle-2 summary (composite-FK pattern, retroactive RLS, JWT hook, strict-mode resumption). CLAUDE.md migration-test note rewritten — points to new `prisma/migration-tests/` path with explanation of why the dir moved (Prisma 7 scan); added migration-list summary line; replaced "rebuild window" note with strict-mode notice + parser-regression floor of 5. No CLAUDE.md workflow / hook / standards-table changes (all that lands per spec §18.4 in `p1-scaffold-engine-skeleton`).

## Verification

End-of-cycle gate (all green from `.worktrees/p1-identity-rls/`):

- `npx prisma generate` — Prisma Client 7.6.0 generated.
- `npx prisma validate` — schema valid.
- `npx prisma migrate deploy` — applied `02_identity` to staging Supabase DB (`aws-1-ap-southeast-1.pooler.supabase.com:5432`); 00 + 01 already present from PR #179.
- `npx prisma db seed` × 2 — second pass produced identical counts (`{tenants:1, campuses:2, programs:6, years:1, terms:4, users:0, roles:8, perms:8, userRoles:0, rolePerms:8}`); enum read-back `Tenant.bootstrapStatus = "PENDING"`.
- `npm run build` — Next.js 16.2.3 production build, 7 routes (`/`, `/_not-found`, `/api/csp-report`, `/api/health`, `/legal/privacy`, `/legal/terms`, `/manifest.webmanifest`, `/opengraph-image`, plus `Proxy` middleware). Compiled successfully.
- `npx vitest run` — **8 test files / 149 tests passed** (31 from `01-tenancy.test.ts`, 118 from `02-identity.test.ts`, 0 regressions in the other 6 files).
- `npm run lint` — clean (eslint exits silent).
- `bash scripts/verify-rls-coverage.sh` — `✓ RLS coverage OK: 9 / 9 tenant-scoped models have ENABLE + policy.` (strict mode, exit 0).
- `bash scripts/verify-api-auth.sh` — `✓ API auth coverage OK: 2 / 2 routes have session helper or @public sentinel.`

Playwright **skipped** per CLAUDE.md schema-cycle exception — no user-facing routes added; `e2e/` empty since Phase 0. CI `Playwright E2E` job auto-skips when `e2e/` has no `*.spec.ts` files.

Cross-check: `design-system.html` not consulted — schema-only cycle, no frontend diff (frontend gate not triggered).

Counts vs. spec:

- 5 new identity models: User, Role, Permission, UserRole, RolePermission ✓
- 3 new enums: PermissionScope, CatalogSource, TenantBootstrapStatus ✓
- Tenant.bootstrapStatus type: `String @db.VarChar(20)` → `TenantBootstrapStatus` enum ✓
- RLS coverage: 9 / 9 tenant-scoped tables ✓ (5 new + 4 retroactive)
- Composite FK pattern: enforced at DB on UserRole + RolePermission ✓
- Seed counts: 8 system roles, 8 placeholder permissions, 8 RolePermission link rows ✓ (placeholder; full matrix lands in p1-scaffold-engine-skeleton)
- JWT hook function committed with locked search_path + SECURITY DEFINER + EXECUTE granted only to `supabase_auth_admin` ✓ (Supabase dashboard registration step documented in Ship Notes — no SQL DDL exposed)

## Ship Notes

(Filled by /ship — PR URL, JWT hook Supabase dashboard registration step, env vars, rollback.)
