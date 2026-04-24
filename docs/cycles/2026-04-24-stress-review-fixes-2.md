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

### Task 7 — infra (gating for `/ship --to-main`) — 2026-04-24

- **User confirmation obtained:** prod has no users during this cutover window ("no one is using production now"). Option A accepted: extend `vercel-build.sh` to run `prisma migrate deploy` on `main`, accepting that the first staging→main promote will apply all 13 pending migrations (2026-04-20 through 2026-04-24) in one shot. All 13 are either additive columns with defaults (e.g., `PayrollItem.emailSent Boolean @default(false)`), idempotent RLS ALTERs with `IF EXISTS`/`IF NOT EXISTS` guards, or FK onDelete changes — safe to apply as a batch.
- `scripts/vercel-build.sh`: case arm `staging)` → `staging|main)`. Comment rewritten to remove the "Phase-1 stale" caveat and state the new contract (both branches apply migrations; preview branches never do). Added a warning that `migrate deploy` failures MUST NOT be silently skipped — they indicate prod schema drift.
- `.github/workflows/ci.yml`: added explanatory comment above `npx prisma db push --force-reset` clarifying that the flag is only safe against the disposable CI Postgres service container — NEVER staging or prod.
- README prune: Environments section now documents the `vercel-build.sh` deployment contract explicitly + lists the three actual CI job names (was three-vs-four mismatch in CLAUDE.md).
- CLAUDE.md prune: Required-check block replaced four stale names (`build` / `typecheck` / `test` / `e2e`) with the three actual job names (`Lint, Typecheck & Test` / `Build` / `Playwright E2E`). Prevents silent mismatch when GitHub Pro branch-protection is enabled.

### Task 7 — infra Verification

- Between-task gate: `npm run build && npx vitest run` — pending (running before commit).
- `bash scripts/verify-rls-coverage.sh` + `bash scripts/verify-api-auth.sh` — green.
- `bash -n scripts/vercel-build.sh` — syntax OK.
- **Gating status for `/ship --to-main`: CLEAR** — prod will apply migrations on first main deploy; user acknowledged the batch and the no-users window. After merge, monitor Vercel build log for `migrate deploy` success line before declaring prod healthy.

### Task 8 — portals-ux (token drift + boundary coverage) — 2026-04-24

- `app/parent/layout.tsx`: wrapped `<ParentBottomNav />` in `<Suspense fallback={null}>`. `ParentBottomNav` calls `useSearchParams()` which opts the whole tree out of static rendering on Next 16 without the boundary; this will be a hard build error on the next Next minor.
- Added 3 `error.tsx` boundaries (in-page retry card, not full-screen) to: `app/parent/invoices/`, `app/parent/attendance/`, `app/teacher/student-journal/`. Pattern: rounded card with `border-destructive/20 bg-destructive/5`, destructive AlertTriangle icon, `Coba Lagi` button calling `reset`. Error surfaces in-place so the sticky header + bottom nav remain usable.
- Added 4 `loading.tsx` skeletons to: `app/parent/invoices/`, `app/parent/attendance/`, `app/teacher/attendance/`, `app/teacher/student-journal/`. Skeleton blocks mirror admin-portal pattern (`h-8 w-48` title, `h-10 w-full` filter row, content cards sized to page).
- `components/portal/page-header.tsx:24`: `text-2xl` → `text-h1` token. Computed size identical today; future token edits now propagate instead of being bypassed.
- `app/parent/page.tsx:287-302`: inline `style={{ background: "var(--celebration-gold-subtle)", borderColor: "var(--celebration-gold)" }}` + inline `style={{ color: "var(--celebration-gold-text)" }}` replaced with `bg-celebration-gold-subtle border-celebration-gold text-celebration-gold-text` utility classes (all registered Tailwind tokens per `app/globals.css:89-91`).
- `text-[2rem]` → `text-display` in 3 places:
  - `app/parent/page.tsx:265` (unpaid total on home)
  - `app/parent/invoices/client.tsx:130` (unpaid summary card)
  - `app/parent/invoices/invoice-detail-sheet.tsx:155` (focal amount in detail sheet)
- README prune: clean. No drift for this task.

### Task 8 — portals-ux Verification

- Between-task gate: `npm run build && npx vitest run` — pending.
- Cross-checked `.claude/standards/design-system.html` §tokens (Display / H1) + §PortalShell (loading + error contract) + §Empty State Contract. The design-system reference is the single source of truth for the replacements. Frontend gate Rule 4 satisfied.
- No scope creep: every replacement was on the task's finding list; did not hunt additional `text-[` or inline-style instances across the parent portal.
- Preview server verification: ATTEMPTED via `mcp__Claude_Preview__preview_start` but failed with sandbox `EPERM: operation not permitted, uv_cwd` against `npm run dev`. Could not run visual browser verification in this session. Compensating evidence: `npm run build` succeeds (so all token classes resolve against `app/globals.css`) + vitest 269 passed + all `text-h1` / `text-display` / `bg-celebration-gold-*` utilities are pre-existing registered tokens (grepped `app/globals.css:89-108`). End-of-cycle Playwright run at Task 10 completion will exercise the parent/teacher portals in a prod build as the definitive UI smoke.
- Code review (`feature-dev:code-reviewer`) on Task 8 diff flagged one real issue: all three `error.tsx` passed `{error.message || "Coba lagi sebentar ya."}` through to the UI, which could leak raw server error strings on edge-case messages (e.g. `"NEXT_NOT_FOUND"` or a stray Prisma connection string) despite Next.js prod sanitization. Fixed before commit — all three boundaries now render the fixed Bahasa copy unconditionally and drop `error` from the destructure (the prop is still in the type signature per Next.js convention but unused). No `error.digest` logging added — Next.js already logs the digest server-side.

## Ship Notes

*Populated end-of-cycle.*
