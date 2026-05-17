# Fix ClassTrack + ClassSession RLS service_all role (pre-promotion blocker)

## Context

CTO promote staging→main review (2026-05-17) found a tenant-isolation bypass introduced in `20260515000000_academic_hierarchy_refactor`. The new `classtrack_service_all` and `classsession_service_all` policies were created with `TO authenticated USING (true)` instead of `TO service_role USING (true)`.

Postgres PERMISSIVE policies OR together at evaluation time. Combining `classtrack_select_own_tenant` (authenticated, tenant-scoped) with `classtrack_service_all` (authenticated, true) collapses to "any authenticated JWT can SELECT/INSERT/UPDATE/DELETE any row across tenants" via direct PostgREST calls. Same for `ClassSession`.

Every other `_service_all` policy in the repo uses `TO service_role` — see `20260421000000_rls_perf_cleanup` which explicitly migrated existing tables off the same broken pattern. The Cycle 8 refactor regressed back to the bad shape for the two new tables.

Discovered by `feature-dev:code-reviewer` against the aggregate `origin/main..origin/staging` diff. Promotion held pending this fix.

## Spec

**Acceptance criteria:**
- `classtrack_service_all` policy on `ClassTrack` is `FOR ALL TO service_role USING (true)`.
- `classsession_service_all` policy on `ClassSession` is `FOR ALL TO service_role USING (true)`.
- Existing `classtrack_select_own_tenant` and `classsession_select_own_tenant` policies are untouched (tenant-scoped reads continue to work).
- `pg_policies` post-migration shows the corrected `roles` array for both rows.
- No other policies in either migration are touched.
- Migration is idempotent (DROP IF EXISTS + CREATE).

**Non-goals:**
- Auditing the entire RLS surface — that lives in `scripts/verify-rls-coverage.sh` (already passing on staging tip; this is a policy-content regression, not coverage).
- Adding application-layer guards — RLS is defense-in-depth; the app paths already use Prisma with service_role (which bypasses RLS), so this fix closes the PostgREST bypass without changing app behaviour.

## Tasks

- [x] T1 — Author migration `20260517000000_fix_classtrack_classsession_rls_role/migration.sql` that drops + recreates both policies with `TO service_role`.
- [x] T2 — End-of-cycle gate: `npm run build && npx vitest run && npx playwright test`.

## Implementation

### T1 — Migration

`prisma/migrations/20260517000000_fix_classtrack_classsession_rls_role/migration.sql` — eight executable statements:

```sql
DROP POLICY IF EXISTS "classtrack_service_all" ON "ClassTrack";
CREATE POLICY "classtrack_service_all" ON "ClassTrack"
  AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "classsession_service_all" ON "ClassSession";
CREATE POLICY "classsession_service_all" ON "ClassSession"
  AS PERMISSIVE FOR ALL TO service_role USING (true);
```

Mirrors the pattern in `20260421000000_rls_perf_cleanup` exactly. No schema model changes; `prisma/schema.prisma` does not represent RLS policies, so this migration is hand-rolled SQL only.

## Verification

End-of-cycle gate ran 2026-05-17 against this commit:

- `npm run build` — ✓ green, full Next.js production build succeeded (all routes compiled, both proxy + dynamic surfaces enumerated in output).
- `npx vitest run` — ✓ green, verbatim: `Test Files  175 passed | 2 skipped (177)`, `Tests  1663 passed | 42 todo (1705)`, duration 74.47s.
- `npx playwright test` — ✓ exit 0, verbatim summary lines: `10 skipped`, `3 did not run`, `26 passed (43.2m)`. The terminal tail also enumerated 37 test rows above the summary (passed-with-retry + slowest); zero `failed`/`unexpected`. `did not run` here is the Playwright behaviour for tests that follow a runtime `test.skip()` cascade in DEMO_MODE — no test reported a failure. Exit-0 is the gate.

Post-deploy sanity (manual, on staging Supabase after merge):

```sql
SELECT polname, roles
  FROM pg_policy
 WHERE polrelid IN ('"ClassTrack"'::regclass, '"ClassSession"'::regclass)
   AND polname LIKE '%_service_all';
```

Expected: two rows, both with `roles = {service_role}`.

Cross-checked design-system.html §none — no UI surface touched (pure-DB migration).

## Ship Notes

**Migration:** one new file, `prisma/migrations/20260517000000_fix_classtrack_classsession_rls_role/migration.sql`. Run `prisma migrate deploy` on staging at merge; production gets it on the next `/ship --to-main` promotion.

**Env vars:** none.

**Rollback:** if the corrected policies somehow break a code path (they should not — service_role bypasses RLS regardless), revert by re-running the previous policy bodies from `20260515000000_academic_hierarchy_refactor` lines 170-173 and 188-191. Document any rollback inline before executing.

**Follow-up:** after staging deploy, CTO re-runs `/ship --to-main` to promote the 66th commit (this fix) alongside the original 65.
