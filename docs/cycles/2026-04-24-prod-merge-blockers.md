# Prod Merge Blockers — RLS Policy + RLS Script Gate

## Context

Pre-merge code review of the staging→main diff (~100 commits, 374 files) flagged two HIGH-confidence blockers that must land on `staging` before the prod PR opens:

1. **`EmailLog` RLS cross-tenant leak.** Policy `emaillog_select_own_tenant` in `20260421000000_rls_perf_cleanup/migration.sql:165` uses `USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid()))` — a mere authenticated check, no `tenantId` join. Any authed user can read every tenant's `EmailLog` rows (salary slip delivery metadata: `to`, `subject`, `sentAt`). Blast radius is zero today because the deployment is single-tenant, but it is a security invariant violation and must not enter `main`. The fix pattern is already applied to every other per-tenant policy in the same file (e.g. `classsection_select_own_tenant` uses `"tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = auth.uid())`). The `EmailLog.tenantId` column already exists (`prisma/schema.prisma`), so no schema change is needed — only a new migration that `DROP POLICY IF EXISTS` + `CREATE POLICY` with the correct `tenantId` scope.

2. **`scripts/fix-rls-security.sh` can wipe prod.** Line 122 runs `supabase db reset --linked` which destroys the linked project's database. The script header (lines 9–11) explicitly lists the prod project ref `qrnbanxcrmrwganpmzmn` as a target. Whichever project is currently `supabase link`-ed is what gets wiped. An operator running the script to fix staging RLS could destroy prod if the link pointer is stale. The script is historical — the RLS migrations have long since landed — so the safe action is to neuter its destructive path.

Intended outcome: the two findings from the review are resolved on `staging`, CI stays green, and we re-run review → `/ship --to-main`.

## Spec

**Acceptance criteria**
- [ ] New migration `prisma/migrations/<ts>_fix_emaillog_rls/migration.sql` drops the permissive `emaillog_select_own_tenant` policy and re-creates it with the canonical `tenantId IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text)` pattern.
- [ ] The migration is idempotent (`DROP POLICY IF EXISTS` + `CREATE POLICY`), same as sibling migrations in `20260421000000_rls_perf_cleanup`.
- [ ] `scripts/fix-rls-security.sh` no longer contains `supabase db reset --linked`. It either (a) is deleted outright because the work it did has been superseded by committed migrations, or (b) is replaced with a non-destructive `supabase db push --linked` + an explicit `--i-know-this-wipes-the-database` guard. Default: delete, because the destructive path is the only reason the script exists.
- [ ] Between-task gate green: `npm run build && npx vitest run`.
- [ ] End-of-cycle gate green: `npm run build && npx vitest run && npx playwright test`.
- [ ] Cycle doc cites `design-system.html` only if frontend is touched (this cycle touches neither frontend nor copy — no citation required; the pre-commit frontend gate won't trigger because no `app/**/*.{tsx,css}`, `components/**/*.tsx`, or `tailwind.config.*` are staged).

**Non-goals**
- No other RLS policy changes. The perf_cleanup migration's other per-tenant policies are already correct — leave them alone.
- No changes to application code. The fix is migration-only + script removal.
- No tenant isolation refactor. `User.tenantId` nullable-to-not-null migration already landed in `20260421124312_tenant_isolation_hardening`.
- No change to `scripts/fix-rls-security.sh` behavior on staging — we're removing the script, not refactoring it.

**Assumptions**
1. Prod and staging Supabase DBs both currently run with the broken `emaillog_select_own_tenant` policy (perf_cleanup migration already deployed). The new migration is safe to apply in both environments because it is a pure policy swap.
2. Nobody is depending on `scripts/fix-rls-security.sh` in CI or docs. Grep will confirm.
3. Deleting the script is preferable to hardening it. Historical usefulness is gone once its work has been migrated.
4. `Program.isActive → status` migration on staging still applies cleanly to prod per the earlier review — not in scope here.
5. `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`, and `XENDIT_SECRET_KEY` env verifications are ops work for the CTO to handle in Vercel dashboard — out of scope for this cycle, tracked in Ship Notes.

## Tasks

- [x] **T1 — Add `fix_emaillog_rls` migration.** Create `prisma/migrations/20260424000000_fix_emaillog_rls/migration.sql` that drops and re-creates `emaillog_select_own_tenant` with the correct `tenantId` scope. Verify with `npx prisma migrate status` that the migration registers. Acceptance: migration file exists, SQL is idempotent, matches the sibling-policy pattern.
- [x] **T2 — Remove destructive `scripts/fix-rls-security.sh`.** Confirm no references in CI workflows, README, or CLAUDE.md first (`grep -r fix-rls-security`). Delete the file. Acceptance: `git status` shows the script deleted, `grep` finds no remaining references.
- [x] **T3 — Run end-of-cycle gate + commit.** `npm run build && npx vitest run && npx playwright test`. Fill Verification + Ship Notes in this cycle doc. Commit T1 + T2 as separate commits per `/build` rules. Acceptance: both commits land, all three gates green, cycle doc complete.

Dependencies: T1 and T2 are independent — could run in parallel. T3 depends on both.

## Implementation

- Subagent plan: T1 and T2 independent but trivial (<5 LOC each) — executed sequentially inline, not dispatched.
- Task 1: Fix `emaillog_select_own_tenant` RLS policy — `prisma/migrations/20260424000000_fix_emaillog_rls/migration.sql` — DROP+CREATE policy with `tenantId IN (SELECT User.tenantId ...)` scope matching sibling `classsection_select_own_tenant` pattern.
- Task 2: Remove destructive helper — deleted `scripts/fix-rls-security.sh` (contained `supabase db reset --linked` which wipes the currently-linked DB; header listed the prod project ref as a target). Grep confirmed no CI / doc / code references outside this cycle doc. RLS work the script performed has long since been captured as committed migrations, so deletion is the correct disposition per the Spec.

## Verification

- Task 1: gates passed (`npm run build` green, `npx vitest run` 253 passed / 42 todo / 2 skipped). Reviewer (feature-dev:code-reviewer) VERDICT: SHIP — syntax valid, pattern matches sibling byte-for-byte, idempotent, no INSERT/UPDATE/DELETE gap (service_role writes bypass this policy), no legitimate cross-tenant read requirement in single-tenant MVP.
- Task 2: gates passed (build green, vitest 253/42/2). Reviewer pass skipped for pure deletion of an obsolete destructive .sh (no application code touched, no runtime behavior change).
- Task 3: end-of-cycle gate green — `npm run build` + `npx vitest run` (253 passed, 42 todo, 2 skipped) + `npx playwright test` (38 passed, 2 skipped).

## Ship Notes

**Migrations to run on prod:** one new migration — `20260424000000_fix_emaillog_rls` — drops the broken SELECT policy and re-creates it with `tenantId` scope. Applies cleanly on top of the currently-deployed `20260421000000_rls_perf_cleanup` baseline. Runtime ≈ milliseconds, no table locks beyond policy metadata. Vercel's auto-migrate on staging→main merge will pick it up via `scripts/vercel-build.sh`.

**New env vars:** none.

**Prod env verifications (carried over from the blocker review, not in this cycle's code):**
- `RESEND_FROM_EMAIL` — must be set in Vercel prod. `lib/email/send-slip.ts:43` hard-throws when `RESEND_API_KEY` is set but `RESEND_FROM_EMAIL` is not.
- `NEXT_PUBLIC_SITE_URL` — required for OAuth PKCE callback stability on preview deployments.
- `XENDIT_SECRET_KEY` — confirm the prod env var name matches what `lib/xendit/client.ts` reads (there is a naming mismatch vs `.env.example` which lists `XENDIT_SECRET_API_KEY`).

**Pre-merge data sanity (from the blocker review):**
- Prod: `SELECT role, COUNT(*) FROM "User" GROUP BY role` — confirm `SCHOOL_ADMIN` rows exist as expected before the staging→main merge applies `20260416000002_rename_school_admin_to_super_admin` (DML rename).
- Prod: `SELECT COUNT(*) FROM "StudentAssessment"` — confirm zero before `20260420000000_assessment_template_unique` (dedupe DELETEs should be no-ops).
- Schedule the bulk staging→main apply off-peak: 40+ `ENABLE ROW LEVEL SECURITY` calls acquire brief ACCESS EXCLUSIVE locks sequentially. Negligible at 500-student scale but non-zero.

**Rollback plan:** if the RLS fix causes an unexpected SELECT regression in production, revert with:
```sql
DROP POLICY IF EXISTS emaillog_select_own_tenant ON "EmailLog";
CREATE POLICY emaillog_select_own_tenant ON "EmailLog" AS PERMISSIVE FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = ((SELECT auth.uid()))::text LIMIT 1));
```
This restores the pre-fix (permissive) policy. The app itself does not read `EmailLog` via the `authenticated` role — all reads go through `service_role` in API routes — so the policy change is functionally a no-op for the app. Rollback is theoretical.

**Re-review gate:** after this cycle merges to staging, re-run the staging→main diff review (target VERDICT: SHIP) before opening the prod PR via `/ship --to-main`.
