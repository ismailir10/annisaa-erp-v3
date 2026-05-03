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

**Scope bump (mid-cycle):** user extended scope to cover all advisor categories — ERRORS, WARN, INFO — not just the original 70 perf WARN.

**Files:**
- `prisma/migrations/20260421000000_rls_perf_cleanup/migration.sql` — 344 lines, idempotent DROP POLICY IF EXISTS + CREATE POLICY across 37 policies (34 `*_service_all` + 34 `*_select_own_tenant` + 3 User/Tenant specials). Clears `auth_rls_initplan` + `multiple_permissive_policies`.
- `prisma/migrations/20260421000001_rls_security_cleanup/migration.sql` — Enables RLS on 7 unprotected tables (`_prisma_migrations` + 6 `StudentJournal*`), adds `*_service_all` (service_role) + `*_select_own_tenant` policies on the 6 journal tables (Template/Entry/Note/Audit direct `tenantId`; Category joins via `templateId`; Indicator via `categoryId`). Drops ~37 unused indexes flagged by `unused_index` INFO.
- `prisma/migrations/20260421000002_rls_fk_indexes/migration.sql` — Corrective: recreates 22 FK-covering indexes after unused_index drops re-triggered `unindexed_foreign_keys` INFO. Advisor contradicts itself here; we side with FK coverage (real perf at scale). Non-FK drops remain.

**What changed:**
- 34 `*_service_all` policies: role `authenticated` → `service_role`. No-op (service_role bypasses RLS) but eliminates the (table, authenticated, SELECT) overlap that caused `multiple_permissive_policies`.
- 34 `*_select_own_tenant` policies: `auth.uid()` → `((SELECT auth.uid()))::text`. Planner evaluates once per query.
- `User.user_select_own`, `User.user_update_own`, `Tenant.tenant_select_own`: same wrap.
- 7 tables (`_prisma_migrations`, 6 `StudentJournal*`): `ENABLE ROW LEVEL SECURITY` + tenant-scoped policies (except `_prisma_migrations` — RLS enabled with no policy = deny-all to non-service_role, intentional; service_role bypass keeps `prisma migrate deploy` working).
- Dropped ~37 unused indexes; recreated 22 FK-covering ones.

**No code churn:** no `schema.prisma` changes, no application code touched.

## Verification

- **Supabase advisors (performance):** post-migration.
  - `auth_rls_initplan`: **0** (was 36)
  - `multiple_permissive_policies`: **0** (was 34)
  - `unindexed_foreign_keys`: **0** (was 22 after corrective)
  - `unused_index` INFO: 22 remain (FK indexes with no traffic on zero-traffic staging — clears with real use; not a blocker).
- **Supabase advisors (security):** post-migration.
  - `rls_disabled_in_public` ERROR: **0** (was 7)
  - `auth_leaked_password_protection` WARN: **1** remains — **not SQL-fixable.** Must toggle via Supabase Dashboard: Authentication → Providers → Email → "Prevent use of leaked passwords". Flagged to user.
  - `rls_enabled_no_policy` INFO: **1** on `_prisma_migrations` — intentional (deny-all to authenticated/anon; service_role bypass).
- **pg_policies sanity:** `authenticated`-scoped ALL policies = 0, `service_role`-scoped ALL policies = 40, `authenticated`-scoped SELECT policies = 40. No per-(table, role, action) overlap.
- **Between-task gate:** `npm run build && npx vitest run` — both green.
- **Playwright:** skipped per cycle spec (DDL-only).

## Ship Notes

- **Migrations (3):** all three already applied to staging (`jzhujpqaxyeeokgexerc`) via Supabase MCP. On merge, `prisma migrate deploy` finds them recorded (no-op). All idempotent.
- **Env vars:** none added.
- **Dashboard follow-up (not code):** enable `auth_leaked_password_protection` in Supabase Dashboard. Only way to clear that WARN.
- **Rollback:** policies are pure DDL; re-apply prior policy shape. FK indexes can be dropped again if needed.
- **Prod promotion:** do NOT apply directly to prod from this PR. Replay all 3 migrations on prod via `prisma migrate deploy` on staging → main promotion.
- **Worktree note:** `.env` and `.env.local` missing in worktree; symlinked from main. `setup-worktree.sh` bug to investigate.
