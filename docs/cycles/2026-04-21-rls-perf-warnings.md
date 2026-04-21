# RLS Performance Warnings Cleanup (Staging)

## Context

Supabase performance advisor reports 70 RLS warnings on staging DB `annisaa-erp-v3-staging` (`jzhujpqaxyeeokgexerc`):

- **36 `auth_rls_initplan`** — `auth.uid()` evaluated per-row instead of once per query. Fix: wrap as `(SELECT auth.uid())` so Postgres planner evaluates once and caches.
- **34 `multiple_permissive_policies`** — two overlapping PERMISSIVE policies per (table, role, action). Every tenant table has `<table>_service_all` (ALL, authenticated, qual=true) + `<table>_select_own_tenant` (SELECT, authenticated) which both match SELECT for authenticated users → planner runs both.

Prod untouched; staging is a parity DB so the fix can be validated here before promoting.

## Spec

**Acceptance:**
- `get_advisors(type=performance)` returns **0** warnings for both `auth_rls_initplan` and `multiple_permissive_policies` after migration.
- App-level behavior unchanged: all server-side data access continues through Prisma with service_role (which bypasses RLS), so production code paths are unaffected.
- Browser-side supabase client usage is limited to `auth.signInWithOtp` / `signInWithOAuth` (verified in `app/page.tsx`) — no `.from()` table reads from the client → tightening policies has no runtime risk.
- Single Prisma migration, DROP POLICY IF EXISTS → CREATE POLICY so it is idempotent and can be re-applied safely.
- No `schema.prisma` change — RLS lives outside the Prisma model.

**Approach (Option A — conservative, zero behavior change):**
- For each `*_service_all` policy: DROP and recreate with role `service_role` (instead of `authenticated`). Since service_role bypasses RLS entirely, the recreated policy is a documented no-op — but it no longer overlaps the `authenticated`-scoped SELECT policy on the same table, clearing the `multiple_permissive_policies` warning.
- For each `*_select_own_tenant` policy: DROP and recreate with `auth.uid()` wrapped as `(SELECT auth.uid())`.
- Same wrap for `User.user_select_own`, `User.user_update_own`, `Tenant.tenant_select_own`.

## Tasks

1. Write migration `20260421000000_rls_perf_cleanup` at `prisma/migrations/20260421000000_rls_perf_cleanup/migration.sql` — idempotent DROP IF EXISTS + CREATE for all 34 `*_service_all` (role→service_role) and 34 `*_select_own_tenant` (auth.uid() wrapped) + 3 User/Tenant specials.
2. Apply via Supabase MCP `apply_migration` to staging project `jzhujpqaxyeeokgexerc`.
3. Verify via `get_advisors(performance)` → 0 warnings for `auth_rls_initplan` and `multiple_permissive_policies`.
4. Run between-task gate: `npm run build && npx vitest run`. (Playwright skipped — DDL-only, no app code touched.)
5. Update README.md if CRUD/module surface changed (not in this cycle — pure DB change).
6. Commit.

## Implementation

**Files:**
- `prisma/migrations/20260421000000_rls_perf_cleanup/migration.sql` — 344 lines, idempotent DROP POLICY IF EXISTS + CREATE POLICY across 37 policies (34 `*_service_all` + 34 `*_select_own_tenant` + 3 User/Tenant specials). Applied to staging via Supabase MCP `apply_migration`.

**What changed:**
- 34 `*_service_all` policies: role `authenticated` → `service_role`. Functionally a no-op (service_role bypasses RLS), but eliminates the (table, authenticated, SELECT) overlap that caused `multiple_permissive_policies` warnings.
- 34 `*_select_own_tenant` policies: every `auth.uid()` wrapped as `((SELECT auth.uid()))::text` so Postgres planner evaluates once per query, not per row.
- `User.user_select_own`, `User.user_update_own`, `Tenant.tenant_select_own`: same wrap applied.

**No code churn:** no `schema.prisma` changes, no application code touched. RLS is owned by migration SQL, outside the Prisma model.

## Verification

- **Supabase advisors (performance):** re-ran `get_advisors(type=performance)` post-migration.
  - `auth_rls_initplan`: **0** (was 36)
  - `multiple_permissive_policies`: **0** (was 34)
  - Only `unused_index` INFO-level lints remain — pre-existing, out of scope for this cycle.
- **pg_policies sanity:** `authenticated`-scoped ALL policies = 0 (was 34), `service_role`-scoped ALL policies = 34, `authenticated`-scoped SELECT policies = 34. No per-(table, role, action) overlap.
- **Between-task gate:** `npm run build && npx vitest run` — both green. Build produces all routes; 9 test files / 90 tests pass.
- **Playwright:** skipped per cycle spec (DDL-only, no app-surface change).

## Ship Notes

- **Migration:** `prisma/migrations/20260421000000_rls_perf_cleanup/migration.sql`. Already applied to staging (`jzhujpqaxyeeokgexerc`) via Supabase MCP; when this branch merges and CI runs `prisma migrate deploy`, staging DB will find the migration already recorded (noop) — no double-apply risk because it is idempotent (DROP IF EXISTS).
- **Env vars:** none added.
- **Rollback:** re-create prior policies (run original `*_service_all` with `TO authenticated USING (true)` and `*_select_own_tenant` with unwrapped `auth.uid()`). No data to restore — policies are pure DDL.
- **Prod promotion:** do NOT apply this cleanup directly to prod DB from this PR. Prod has its own advisors run; same migration can be replayed on prod via `prisma migrate deploy` when staging → main promotion runs.
- **Worktree note:** `.env` and `.env.local` were missing in this worktree; symlinked from main checkout during build. `setup-worktree.sh` should have done this — if worktrees continue to miss env files, investigate the setup script.
