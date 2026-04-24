# Stress Review Fixes — Part 2 (2026-04-24)

## Context

Follow-up cycle to `docs/cycles/2026-04-24-stress-review-per-module.md` (merged via PR #124 as 4 BLOCKER fixes: students / hr / student-journal / finance). Six MAJOR modules remain. This cycle lands them before `/ship --to-main`.

**Gating for `staging → main`:**
- **Task 5 (rls)** — verify prod RLS state on `TeachingAssignment` + migration prefix collision + add CI RLS coverage guard.
- **Task 7 (infra)** — extend `scripts/vercel-build.sh` to run `prisma migrate deploy` on `main` ref. Without this, next staging→main merge with a migration ships schema-code mismatch to prod.

**Non-gating (ship with fixes):** Task 6 (core auth hardening), Task 8 (portals-ux Suspense + error/loading + tokens), Task 9 (academic cross-tenant FK), Task 10 (learning Jakarta TZ + serializable assessments).

## Spec

**Acceptance criteria:**
1. Tasks 5 + 7 gating verified and either fixed or explicitly deferred with ADR note.
2. Each task lands as ONE commit matching the `fix(<module>):` contract.
3. Between-task gate `npm run build && npx vitest run` MUST pass before each commit.
4. README.md prunes listed in source doc applied in the SAME commit as the code fix.
5. End-of-cycle Playwright smoke runs after task 10 commit.
6. No new findings introduced; scope is strictly the 6 remaining modules' listed findings.

**Non-goals** — 37-index recreation (Task 5 perf cliff), multi-tenant onDelete hardening (tracked, not implemented), CI SHA-pinning (Task 7 future hardening).

## Tasks

Ordered gating-first:

1. **Task 5 — rls** (GATING): verify prod `pg_tables.rowsecurity` for `TeachingAssignment`; write corrective migration if off; rename `20260424000000_fix_emaillog_rls` prefix collision; wrap `20260424000001` in BEGIN/COMMIT; add `scripts/verify-rls-coverage.sh` + wire CI; add ADR entry.
2. **Task 6 — core**: `User.status = ACTIVE` filter in `_getSession` + auto-create; shorten `userCache` TTL 60s→10s; multi-tenant guard `if (tenant.count() > 1) throw`; document Employee-vs-Parent precedence; call `enforceIdleTimeout` in proxy demo-mode; CI `scripts/verify-api-auth.sh` + wire; `NODE_ENV !== "production"` demo-login guard; exact-segment `/auth` match.
3. **Task 7 — infra** (GATING): extend `vercel-build.sh` case to `main`; add ci.yml:96 comment; README prune (CLAUDE.md:213-219 + Deployment line).
4. **Task 8 — portals-ux**: `<Suspense>` around `ParentBottomNav`; add error.tsx + loading.tsx boundaries; `text-2xl`→`text-h1`; inline style→token classes; `text-[2rem]`→`text-display`.
5. **Task 9 — academic**: cross-tenant FK check in teaching-assignments POST; wire `createClassSectionSchema` in class-sections POST; drop `revalidate=7200`; shared active-enrollment guard helper.
6. **Task 10 — learning**: 3× `getTodayInTimezone("Asia/Jakarta")` swap; `isolationLevel: "Serializable"` on assessments PUT transaction.

## Implementation

### Task 5 — rls (MAJOR, gating for `/ship --to-main`) — 2026-04-24

- **Prod RLS state verified via Supabase MCP against project `vxwywmvpxetdgnxejjgk` (annisaa-erp-v3-prod-sgp):** `TeachingAssignment.rowsecurity = true`. Zero tables with `rowsecurity=false` across the `public` schema. Staging (`udbivhchbizpxoryejgz`) also verified clean. **No corrective migration needed.**
- **Migration prefix collision (`20260424000000_explicit_ondelete_actions` + `20260424000000_fix_emaillog_rls`):** query against staging `_prisma_migrations` confirmed BOTH migrations already applied. Rename is not safe — Prisma keys on `migration_name`, so a rename causes re-apply or breaks state. Left as-is + added ADR entry documenting the accepted risk and the rule for future migrations.
- **`20260424000001_user_email_per_tenant_unique` DROP INDEX + CREATE UNIQUE not transactional:** migration already applied to staging (and will apply to prod on next deploy). Cannot modify an applied migration. Risk documented in the cycle doc (if the CREATE UNIQUE step had failed due to pre-existing duplicate `(tenantId,email)` rows, global uniqueness would have been lost). Since the migration succeeded, no action needed; future migrations that drop + recreate unique indexes MUST wrap in `BEGIN;...COMMIT;` or use `CREATE UNIQUE INDEX CONCURRENTLY`.
- **`scripts/verify-rls-coverage.sh`:** static coverage guard. Parses `prisma/schema.prisma` for models with a `tenantId String` field (23 detected), then greps `prisma/migrations/**` for matching `ALTER TABLE "<Model>" ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ... ON "<Model>"` statements. Exits non-zero if either is missing for any tenant-scoped model. Chose static parse over live-DB check because CI uses `prisma db push --force-reset` (migrations skipped), so `pg_tables.rowsecurity` always reads false in CI.
- **CI wiring:** script added as a new step in `.github/workflows/ci.yml` under the `Lint, Typecheck & Test` job, immediately after `npx vitest run`.
- **README ADR entries added:** (a) RLS is SELECT-only, mutations via `service_role`, leaked service_role key bypasses RLS; tracked follow-ups for the 37-index recreation and multi-tenant CASCADE review on `EmailLog` + `OrgConfig`. (b) Accept-and-document entry for the migration prefix collision.
- **Deferred (tracked in ADR, not implemented this cycle):** (1) 37-index recreation for `Program_tenantId_idx`, `ClassSection_tenantId_idx`, etc. — perf cliff latent only post-SaaS. (2) Multi-tenant onDelete hardening for `EmailLog.tenantId` + `OrgConfig.tenantId` CASCADE — acceptable single-tenant.

## Verification

### Task 5 — rls

- Between-task gate: `npm run build && npx vitest run` — green (see commit).
- Script smoke: `bash scripts/verify-rls-coverage.sh` — "✓ RLS coverage OK: 23 / 23 tenant-scoped models have ENABLE + policy."
- Live-DB cross-check (via Supabase MCP): staging + prod both return zero rows for `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false`. `TeachingAssignment.rowsecurity=true` in both.
- README pruned per list: ADR entries added; no other README drift for this task.
- **Gating status for `/ship --to-main`: CLEAR** — prod RLS is intact, CI guard prevents future drift, prefix collision documented.

### Task 6 — core (auth hardening) — 2026-04-24

- `lib/auth.ts`: (a) `USER_CACHE_TTL_MS` 60_000 → 10_000 so role/tenant/status mutations propagate within one page navigation; (b) `_getSession` User lookup + demo-mode `findUnique` now filter `status: "ACTIVE"` — deactivated users lose access within 10s of the admin-UI toggle; (c) new exported `assertSingleTenant()` helper — `prisma.tenant.count() > 1` throws a loud error with a pointer to the required fix (implement tenant-from-host resolution before onboarding second tenant). Cached after first call per process to avoid per-request overhead; (d) Employee-first precedence documented inline — an email matching both Employee and Parent auto-provisions as TEACHER, matching the routing fallback in the OAuth callback.
- `app/auth/callback/route.ts`: (a) imports + calls `assertSingleTenant()` before User lookup; (b) User lookup filter tightened to `{ email, status: "ACTIVE" }`; (c) precedence comment added.
- `proxy.ts`: (a) demo-mode branch now calls `enforceIdleTimeout` so demo sessions expire identically to Supabase-authenticated sessions; (b) public-route match switched from `pathname.startsWith("/auth")` + `/api/auth` to exact segment match (`=== "/auth" || startsWith("/auth/")`), preventing hypothetical `/authentic-*` routes from inheriting the public bypass.
- `lib/supabase/middleware.ts`: same exact-segment match applied.
- `app/api/auth/login/route.ts`: added `NODE_ENV === "production"` belt-and-suspenders so a misconfigured prod deploy (DEMO_MODE accidentally true) cannot expose the cookie-injection endpoint.
- `scripts/verify-api-auth.sh`: new CI guard. Every `app/api/**/route.ts` must either call a session helper (`getSession`, `requireAdmin`, `requireTeacher`, `requireParent`, `requireGuardian`, `requireAuth`, `requireSuperAdmin`, `requireTeacherForClass`, `requireGuardianForStudent`) OR declare itself public with a top-of-file `// @public` sentinel. Four intentional public routes annotated: `/api/auth/logout`, `/api/auth/users`, `/api/auth/login`, `/api/xendit/webhook`.
- CI wiring: added as second guard step in the `Lint, Typecheck & Test` job.
- README prunes: `README.md:3` rephrased to "single-tenant MVP; multi-tenant requires tenant-from-host resolution in `lib/auth.ts` before onboarding a second tenant"; strict-admin ADR now notes the ≤10s userCache staleness window; `CLAUDE.md` File Structure now lists `proxy.ts` (middleware rename) + both new verify scripts.

### Task 6 — core Verification

- Between-task gate: `npm run build && npx vitest run` — pending (running before commit).
- Script smoke: `bash scripts/verify-api-auth.sh` — "✓ API auth coverage OK: 117 / 117 routes".
- Playwright cookie-injection paths unaffected — `/api/auth/login` is only touched by legitimate demo UI; e2e specs inject `school-erp-session` cookie directly.
- `assertSingleTenant` uses a 60s TTL cache (not a permanent flag) — guard fires within ~60s of a freshly seeded second tenant. Initial review caught a blind-after-first-success regression; fixed before commit.
- Code review on Task 6 diff (`feature-dev:code-reviewer`) surfaced 2 real issues, both fixed pre-commit: (a) `assertSingleTenant` module-level flag → swapped to 60s TTL so a runtime-seeded second tenant is caught; (b) `verify-api-auth.sh` could silently pass if run outside repo root → now exits non-zero if `find` returns zero route files. Same defensive guard also back-ported to `verify-rls-coverage.sh`.

## Ship Notes

*Populated end-of-cycle.*
