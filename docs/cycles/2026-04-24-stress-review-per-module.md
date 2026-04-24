# Stress Review — Per Module (2026-04-24)

## Context

**VERDICT (worst across 14 reviewers): BLOCK.**

Staging is 109 commits ahead of `main` spanning ~2 months — design-system foundations + retrofit, parent portal cycles 3/4, admin polish, CRUD sweep, student-journal, tenant isolation, auth/OAuth fixes, 17 migrations, money+auth hotfix #118, RLS policy fix #120, schema alignment + Jakarta TZ + promote races #121. CI green. Prior review (BLOCK) was resolved by #120; this higher-rigor pass before `staging → main` promotion dispatched 14 reviewers across 7 domain modules + 3 cross-cutting areas. 4 security-sensitive modules (core, hr, finance, rls) got a second-opinion reviewer.

**Findings totals** — 3 BLOCKER modules, 7 MAJOR modules, 0 MINOR-only modules, 0 clean modules. Every module has at least one finding above "minor" — no module qualifies for the clean list.

**BLOCKERs** (must fix pre-merge):
- **students** — `GET /api/students/[id]` missing `isAdminRole` + query not tenant-scoped (NIK/PII leak to TEACHER/GUARDIAN sessions)
- **hr** — leave `leaveType` unvalidated, payroll TOCTOU on generate, `EXPORTED → SLIPS_SENT` status regression, send-slips serverless timeout + non-idempotent retry, locked-attendance overwrite on leave approval
- **student-journal** — teacher note POST performs cross-tenant enrollment lookup (IDOR: any teacher can attempt notes on foreign students)

**SHIP WITH MONITORING** modules: core, academic, finance, learning, rls, portals-ux, infra.

**Pre-merge data sanity** (carry-forward from prior review — do not task):
- `User.role` distribution verified reasonable after tenant isolation landings
- `StudentAssessment` row count reconciled against enrollments post schema alignment #121

**README drift summary** — **8 stale claims across 7 modules**. Core (3: `README.md:3` "multi-tenant foundation" overstates; `README.md:107` cache-staleness undocumented; `proxy.ts` rename undocumented). HR (1: `README.md:86` payroll flow missing `EXPORTED`/`CANCELLED`). Finance (2: `README.md:178` `XENDIT_CALLBACK_TOKEN` is wrong name — code uses `XENDIT_WEBHOOK_TOKEN`; no void/cancel state-machine doc). Student-journal (1: `README.md:84` Teacher Portal missing Buku Penghubung). RLS (1: no ADR on service_role-only mutation RLS model). Infra (2: `CLAUDE.md:213-219` lists wrong required-check names — actual jobs are `Lint, Typecheck & Test` / `Build` / `Playwright E2E`; `scripts/vercel-build.sh` undocumented in README Deployment). Clean README: academic, students, learning, portals-ux.

## Spec

**Acceptance criteria:**
1. Every BLOCKER finding across modules **students**, **hr**, **student-journal** is fixed (code) before `/ship --to-main`.
2. Every follow-up `/build` cycle derived from this doc **MUST also update `README.md`** to prune the exact stale claims flagged for that module. No cycle ships without its README prune commit — the narrow `commit-msg` hook already enforces README.md staging for `feat:`/`perf:` commits; this spec extends that contract to `fix:` commits derived from this stress review when they touch `app/**` or `lib/**`.
3. MAJOR findings in SHIP-WITH-MONITORING modules either:
   - (a) ship fixed, or
   - (b) ship with an explicit Ship Notes monitoring line in the cycle doc that created them + a dated follow-up ticket reference in README ADR table.
4. MINOR findings bundled into the relevant module cycle opportunistically; not gating.
5. No new code is written in this stress-review cycle. This cycle only produces the review doc; follow-up cycles land the fixes.

**Non-goals** — env var naming (`RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`, `XENDIT_SECRET_KEY` naming), already in prior Ship Notes. Pre-merge data sanity (User.role distribution, StudentAssessment count) carried forward, not re-tasked.

## Tasks

> One task per module with findings above "minor". **Order: BLOCKERs first, then MAJORs.** Findings described as WHAT + WHERE, not HOW — implementation belongs to the follow-up `/build` cycle.

---

### Task 1 — students (BLOCKER — flagged by feature-dev:code-reviewer)

**Severity:** BLOCKER

**Findings:**
- `app/api/students/[id]/route.ts:7-38` — GET handler missing `isAdminRole(session.role)` guard; `GUARDIAN` or `TEACHER` session can fetch any student record with NIK/KK/guardian PII. README ADR claims `/api/students` is "strict-admin" — code contradicts claim. Add admin-role gate.
- `app/api/students/[id]/route.ts:15-32` — GET uses `findUnique({ where: { id } })` (not tenant-scoped); query executes on cross-tenant IDs before the post-fetch tenant check runs. Invert to `findFirst({ where: { id, tenantId: session.tenantId }, include: {...} })` matching every other student route.
- `app/api/students/[id]/guardians/[guardianId]/route.ts:29-46` — nested guardian PUT reads `body` without Zod validation; standalone guardian route correctly uses `updateGuardianSchema`. Apply same schema here.
- `app/api/students/route.ts:38-43` — list response includes `parent.phone` PII on every paginated page; decide deliberately (acceptable if intentional, must be documented).

**README prune list:** README: clean (no drift found for this module).

---

### Task 2 — hr (BLOCKER — flagged by feature-dev:code-reviewer + superpowers:code-reviewer)

**Severity:** BLOCKER

**Findings:**
- `app/api/leave/requests/route.ts:18-74` — POST bypasses `createLeaveRequestSchema`; `leaveType` accepted as raw body string; invalid enum values persist and skip balance deduction.
- `app/api/payroll/generate/route.ts:28-35` — overlap check + run create not atomic; concurrent POSTs can both pass and insert duplicate runs (`@@unique([tenantId, periodStart, periodEnd])` only blocks exact period equality, not overlap).
- `app/api/payroll/[id]/export/bsi/route.ts:50-54` — unconditionally writes `status: "EXPORTED"` over `SLIPS_SENT`, regressing run state + hiding it from `stats/route.ts` counters.
- `app/api/payroll/[id]/send-slips/route.ts:47,57-139` — state gate only rejects `DRAFT`; `SLIPS_SENT` runs re-send. Also sequential email loop (~40 employees × PDF + Resend + 600ms sleep) exceeds Vercel 60s timeout; partial success + retry re-emails. Add per-`PayrollItem` `emailSent` flag or move to queue; use compare-and-swap on status.
- `app/api/leave/requests/[id]/approve/route.ts:47-58` — approval upserts `AttendanceRecord` without checking `isLocked`; overwrites attendance already locked by approved payroll.
- `app/api/payroll/[id]/route.ts:109` — PUT overlap guard races concurrent DRAFT edits; wrap in `$transaction` with `Serializable` isolation.
- `app/api/payroll/[id]/items/[itemId]/variables/route.ts:32` — no `status === "DRAFT"` gate; variable edits on APPROVED runs silently desync from already-generated BSI export.
- `lib/payroll/engine.ts:88-92` — `gajiPokokAmount` captured post-rounding; `PCT_OF_BASE` components compound rounding error.

**README prune list:**
- `README.md:86` — payroll flow documented as `draft → variables → review → approve → BSI CSV → PDF slips → email`; actual state machine includes `EXPORTED` and `CANCELLED` states not mentioned. Either expand the flow description to include all 4+ states or document the full state machine in a small ADR table.

---

### Task 3 — student-journal (BLOCKER — flagged by feature-dev:code-reviewer)

**Severity:** BLOCKER

**Findings:**
- `app/api/student-journal/notes/route.ts:47-63` — TEACHER branch's `studentEnrollment.findFirst` has no `classSection: { tenantId: session.tenantId }` scope; cross-tenant IDOR (teacher in Tenant A can probe/write notes for Tenant B students whose IDs they discover). The adjacent `students/[id]/week/route.ts:39` already uses the correct scoped pattern — apply same filter here.
- `app/api/student-journal/notes/[id]/route.ts:104` vs `app/api/student-journal/admin/notes/[id]/route.ts:48` — user path soft-deletes to `status: "DELETED"`, admin path to `status: "INACTIVE"`; schema comment documents only `"ACTIVE"` default. Standardize to `"INACTIVE"` to keep audit diffs consistent and prevent future undelete-feature leaks.
- `app/api/student-journal/entries/home/route.ts:50-62` — HOME indicator validation omits `status: "ACTIVE"` filter, so parents can submit entries against soft-deleted indicators. Teacher batch endpoint at `entries/batch/route.ts:61-71` already gates correctly — match.

**README prune list:**
- `README.md:84` — Teacher Portal feature summary reads "Check-in/out, Attendance Calendar, Nilai Siswa, Salary Slips, Profile" but omits **Buku Penghubung** (student journal teacher pages live at `app/teacher/student-journal/**`). Parent Portal entry correctly lists it. Add "Buku Penghubung" to the Teacher Portal feature line.

---

### Task 4 — core (MAJOR — flagged by feature-dev:code-reviewer + superpowers:code-reviewer)

**Severity:** MAJOR (both reviewers converged; primary initially said BLOCK on `proxy.ts` rename until confirmed this is the deliberate Next.js 16 rename)

**Findings:**
- `lib/auth.ts:130-143` — `_getSession` does not filter `User.status === "ACTIVE"`; deactivating a user in admin UI does not revoke portal access. Add status filter to all `findFirst`/`findUnique` in session resolver + auto-create path.
- `lib/auth.ts:13` — module-level 60s `userCache` serves stale `role`/`tenantId`/`status` after demotion or deactivation. Either key by `(email, tenantId)` with shorter TTL or invalidate on User mutation.
- `lib/auth.ts:81-85` + `app/auth/callback/route.ts:83-99` — `findFirst({ where: { email } })` resolves user without tenant context; safe single-tenant today, but silent cross-tenant collapse the moment a second tenant is seeded (schema has `@@unique([tenantId, email])`). Add explicit `prisma.tenant.count() > 1 → throw` guard before multi-tenant cutover.
- `app/auth/callback/route.ts:87-99` vs `lib/auth.ts:89-105` — precedence order differs (Employee-first in one path, Prisma-User-first in other); email that matches both Employee and Parent becomes `TEACHER` via auto-create. Document precedence or add admin-override.
- `proxy.ts:85-90` — demo-mode bypass does not call `enforceIdleTimeout`; asymmetric with Supabase-authenticated path.
- `proxy.ts:93-95` — blanket `/api/*` bypasses session middleware, relying on per-route `getSession()` calls; hotfix #118 already found one leaking route. Add CI grep gate: every `app/api/**/route.ts` must reference `getSession` or an explicit public-allowlist tag.
- `app/api/auth/login/route.ts:27-33` — demo login gated only on `DEMO_MODE=true`. Add `NODE_ENV !== "production"` belt-and-suspenders.
- `lib/supabase/middleware.ts:36-45` — public-route prefix match on `/auth` could match hypothetical `/authentic-*` routes; switch to exact segment match.

**README prune list:**
- `README.md:3` — "SaaS-ready architecture (single tenant MVP, multi-tenant foundation)" overstates readiness; session resolver is not tenant-scoped. Rephrase to "single-tenant MVP; multi-tenant requires tenant-from-host resolution in `lib/auth.ts` before onboarding second tenant."
- `README.md:107` — ADR claims `/api/students` and `/api/employees` are strict-admin post-hotfix; true for route guards, but the 60s `userCache` staleness partially undermines the guarantee. Add one-line caveat to the ADR or remove the absoluteness.
- File-structure section — no mention of Next.js 16 `middleware.ts → proxy.ts` rename; contributors searching "middleware" miss the file. Add one-liner.

---

### Task 5 — rls (MAJOR — flagged by general-purpose + superpowers:code-reviewer)

**Severity:** MAJOR

**Findings:**
- `prisma/migrations/20260415_enable_rls_production/migration.sql` — `TeachingAssignment` RLS `ENABLE` appears only in the staging-wide migration `20260415_enable_rls`, not the production-only variant. If production was seeded from the production-only file, RLS may be OFF on `TeachingAssignment` in prod. **Verify with Supabase advisor output + `pg_tables.rowsecurity` query before merge.** If confirmed off, add a corrective migration.
- Two migrations share prefix `20260424000000` (`explicit_ondelete_actions` and `fix_emaillog_rls`). Deterministic today (lex ordering of suffix works), but latent shadow-ordering risk if a third migration collides. Rename one (e.g. `20260424000003_fix_emaillog_rls`) before it lands on main.
- `prisma/migrations/20260424000001_user_email_per_tenant_unique/migration.sql:21-23` — `DROP INDEX "User_email_key"` before `CREATE UNIQUE` is not wrapped in a transaction; if composite creation fails (pre-existing duplicate `(tenantId,email)`), global uniqueness is already gone. Add `BEGIN;...COMMIT;` or `CREATE UNIQUE INDEX CONCURRENTLY`.
- `prisma/migrations/20260421000001_rls_security_cleanup/migration.sql:79-115` — drops 37 indexes including tenantId indexes referenced by RLS `USING` clauses (`Program_tenantId_idx`, `ClassSection_tenantId_idx`, `Campus_tenantId_idx`, `AcademicYear_tenantId_idx`, `SalaryComponentDef_tenantId_isEnabled_idx`, `FeeComponentDef_tenantId_status_idx`). Safe at current row counts; latent perf cliff post-SaaS. Recreate once justified.
- `20260424000000_explicit_ondelete_actions` — `EmailLog.tenantId → Tenant` and `OrgConfig.tenantId → Tenant` FKs flipped to CASCADE; a tenant deletion wipes audit trail with no soft-delete. Acceptable single-tenant, flag before multi-tenant onboarding.
- **Architectural observation (not a fix):** authenticated role has only SELECT policies; INSERT/UPDATE/DELETE go through `service_role` (Prisma bypass). RLS provides zero defense-in-depth against leaked service_role key or buggy Prisma `where` clause. Document explicitly in README ADR.
- Add CI guard (not a one-off fix): fail build if any tenant-scoped table has `rowsecurity = false` or any `*_select_own_tenant` policy lacks `tenantId` in USING clause.

**README prune list:**
- README ADR section — add one ADR entry documenting that "RLS enforces tenant-scoped SELECT only; mutations rely on app-layer `tenantId` filtering via `service_role`. A leaked service_role key bypasses RLS entirely." This is load-bearing for any future security audit.

---

### Task 6 — finance (MAJOR — flagged by feature-dev:code-reviewer + superpowers:code-reviewer)

**Severity:** MAJOR

**Findings:**
- `app/api/xendit/webhook/route.ts:108` — `revalidateTag("student-invoices", {})` passes two args; `revalidateTag` takes one. Runtime `TypeError` after successful payment write → Vercel returns non-2xx → Xendit retries every real payment. Transaction already committed, so no double-credit (idempotency guard catches retries), but the retry spam pollutes logs and invoice UI stays stale to other users for up to CDN TTL. Single-char fix.
- `app/api/invoices/[id]/payments/route.ts:33-38,41-55` — manual payment route reads `invoice.totalPaid` outside transaction for overpayment guard; concurrent manual tabs (or manual + webhook) both pass guard, both commit, totalPaid exceeds totalDue. Also no advisory lock (webhook uses `pg_advisory_xact_lock`). Add same lock + idempotency key (e.g. `(invoiceId, reference)` unique).
- `app/api/xendit/webhook/route.ts:82` — idempotency key `reference: paymentId ?? data.payment_session_id`. If Xendit retries a webhook where `payment_id` populated late, earlier delivery keyed by session_id and later by payment_id — idempotency `findFirst` misses → double credit. Key on stable `payment_session_id` only.
- `app/api/invoices/[id]/route.ts` (PUT) — no state-machine guard; admin can PUT `status: "SENT"` from `PAID` or `CANCELLED`, silently creating a fresh Xendit session on a voided invoice.
- `app/api/invoices/[id]/void/route.ts:32` — void not transactional with payment state; webhook can credit payment between status check and void write.
- `app/api/xendit/webhook/route.ts:35` — `paymentAmount = amount ?? Number(invoice.totalDue)` only warns when exceeds remaining; defense-in-depth, clamp `Math.min(amount, remaining)`.
- `Number()` coercion on Prisma `Decimal` throughout (`webhook:57,60,94`, `payments:37,53`, helpers). Low-risk at IDR integer scale but compounding rounding on multi-payment invoices. Use `Prisma.Decimal` accumulator.

**README prune list:**
- `README.md:178` — env var row names `XENDIT_CALLBACK_TOKEN`; actual code reads `process.env.XENDIT_WEBHOOK_TOKEN` and `.env.example` uses `XENDIT_WEBHOOK_TOKEN`. **This is an active deployment trap** — new deployer following README gets 401 on every webhook, silently disabling online payments. Rename the README row to `XENDIT_WEBHOOK_TOKEN`.
- Finance module row — no mention of `/void` endpoint or the `DRAFT → SENT → PAID/CANCELLED` state machine. Add either a bullet or small ADR.

---

### Task 7 — portals-ux (MAJOR — flagged by feature-dev:code-reviewer)

**Severity:** MAJOR

**Findings:**
- `components/parent/bottom-nav.tsx:22` + `app/parent/layout.tsx:14` — `useSearchParams()` called without wrapping `<Suspense>`; entire parent portal opts out of static rendering today and is a hard build error on the next Next.js minor. Wrap `<ParentBottomNav />` in Suspense in the layout.
- `app/parent/invoices/`, `app/parent/attendance/`, `app/teacher/student-journal/` — no sub-route `error.tsx`; errors bubble to top portal boundary which renders full-screen error over the sticky header + bottom nav, destroying navigation. Add in-page retry boundaries.
- `app/parent/invoices/`, `app/parent/attendance/`, `app/teacher/attendance/`, `app/teacher/student-journal/` — no sub-route `loading.tsx`; slow-4G users see blank content area on navigation. Admin portal has per-module `loading.tsx`; match the pattern.
- `components/portal/page-header.tsx:24` — `text-2xl` instead of design-system `text-h1` token. Same computed size today, but raw Tailwind scale bypasses future token changes.
- `app/parent/page.tsx:289-301` — inline `style={{ background: "var(--celebration-gold-subtle)", ... }}` bypasses registered Tailwind tokens (`bg-celebration-gold-subtle` etc. are available via `app/globals.css:89-91`). Use token classes.
- `app/parent/page.tsx:265`, `app/parent/invoices/invoice-detail-sheet.tsx:155`, `app/parent/invoices/client.tsx:130` — `text-[2rem]` arbitrary value; `text-display` token exists for exactly this (dashboard hero / stat-card primary). Replace all three.

**README prune list:** README: clean. (design-system & portal cycle claims verified accurate.)

> Note on CLAUDE.md frontend gate (Rule 4): the follow-up `/build` cycle for this task touches `app/**/*.tsx` + `components/**/*.tsx`, so its cycle doc body must contain the literal token `design-system` (e.g. in Verification section: "Cross-checked `.claude/standards/design-system.html` §tokens + §PortalShell"). Soft gate — plan for it.

---

### Task 8 — academic (MAJOR — flagged by feature-dev:code-reviewer)

**Severity:** MAJOR

**Findings:**
- `app/api/teaching-assignments/route.ts:56` — POST writes `employeeId` + `classSectionId` from body without cross-tenant ownership check; unique constraint only prevents within-tenant duplicates, not cross-tenant linking. Admin in Tenant A can create a TeachingAssignment for Tenant B's employee + class. Verify both FKs belong to `session.tenantId` before create.
- `app/api/class-sections/route.ts:40-53` — POST has no validation (no Zod, no rate limit); missing required fields produce raw Prisma 500s instead of clean 400s. Peer PUT handler and `/api/programs` POST have neither — systematic gap.
- `app/api/class-sections/route.ts:7,52` + `[id]/route.ts` — GET declares `revalidate = 7200`; POST calls `revalidatePath`, PUT and DELETE do not. Stale list for up to 2h after edit/soft-delete. Either drop `revalidate` (match academic-years) or add `revalidatePath` to PUT/DELETE.
- `app/api/academic-years/[id]/route.ts:61` — DELETE soft-deletes to `ARCHIVED` without the active-enrollment guard PUT-to-ARCHIVED applies. DELETE bypasses the guard. Move check to shared helper.

**README prune list:** README: clean. (promote-races fix #121 verified; all claims match code.)

---

### Task 9 — learning (MAJOR — flagged by feature-dev:code-reviewer)

**Severity:** MAJOR

**Findings:**
- `app/api/student-attendance/mark/route.ts:32` — uses `new Date().toISOString().split("T")[0]` as today-sentinel (UTC). Between 00:00–06:59 WIB returns yesterday; teachers marking attendance early morning get false 400. Jakarta TZ fix #121 applied the `getTodayInTimezone("Asia/Jakarta")` helper to employee-attendance routes but missed the three student-attendance entry points. Switch to the helper (already imported in adjacent routes).
- `app/api/student-attendance/route.ts:77` — same UTC drift on default date for GET list; admin dashboard shows yesterday's data 00:00–06:59 WIB with no error.
- `app/api/student-attendance/stats/route.ts:18` — same UTC drift on stats widget default date.
- `app/api/assessments/student/[id]/route.ts:97-104` — PUT does delete-all + `createMany` inside `$transaction` without `isolationLevel: "Serializable"`. Concurrent autosave calls (1.2s debounce × multiple tabs) can interleave delete and insert, producing brief empty-scores window. Low probability at 40-teacher scale; add serializable hint or switch to upsert-per-indicator.

**README prune list:** README: clean. (Admin Portal attendance claim at line 84 matches code; `StudentAttendance` model in module table at line 55 matches schema.)

---

### Task 10 — infra (MAJOR — flagged by general-purpose)

**Severity:** MAJOR

**Findings:**
- `scripts/vercel-build.sh:13-18` — gates `prisma migrate deploy` on `VERCEL_GIT_COMMIT_REF == staging`; **production (`main`) deploys never run migrations.** The script comment acknowledges "production DB is still Phase-1 stale." Before next `/ship --to-main`, either add `main` to the case whitelist or explicitly pre-apply migrations — otherwise the first staging→main merge containing a migration silently ships schema-code mismatch to prod.
- `.github/workflows/ci.yml:96` — `npx prisma db push --force-reset` against the CI Postgres service container; safe (disposable), but add a code comment so future readers don't panic.
- `.github/workflows/ci.yml` — third-party actions pinned to major tag (`actions/checkout@v4` etc.), not SHA. First-party, generally acceptable; SHA-pin is hardened default. Track for future hardening.
- `scripts/vercel-build.sh` — new file, executable bit preserved. OK.

**README prune list:**
- `CLAUDE.md:213-219` — lists required CI check names as `build`, `typecheck`, `test`, `e2e`. Actual workflow jobs are `Lint, Typecheck & Test`, `Build`, `Playwright E2E` (three, not four). When GitHub Pro is enabled, required-check config will mismatch silently. Update the four names to the three actual job names.
- `README.md` Deployment section — `scripts/vercel-build.sh` is undocumented. Add one-line note: "Vercel build uses `scripts/vercel-build.sh`; `prisma migrate deploy` runs only on `staging` ref — extend to `main` before running migrations in prod."

---

## Implementation

### Task 1 — students (BLOCKER) — fixed 2026-04-24

- `app/api/students/[id]/route.ts` — GET now calls `isAdminRole(session.role)` before any DB work (returns 403 for non-admin); query inverted to `findFirst({ where: { id, tenantId: session.tenantId }, include: {...} })` so cross-tenant IDs never hit the DB with include.
- `app/api/students/[id]/guardians/[guardianId]/route.ts` — PUT now runs body through `updateGuardianSchema` via `validateBody`; typed `body` replaces raw `any`.
- `app/api/students/route.ts` — list response keeps `parent.phone` intentionally (admin-only route, used for quick-contact in student list); added inline comment documenting the decision.
- `README.md` — no prune (cycle doc Verification note: "README: clean").

### Task 2 — student-journal (BLOCKER) — fixed 2026-04-24

- `app/api/student-journal/notes/route.ts` — teacher branch's `studentEnrollment.findFirst` now filters `classSection: { tenantId: session.tenantId }`, closing the cross-tenant IDOR (teacher could probe notes on Tenant B student IDs). Mirrors the scoped pattern at `students/[id]/week/route.ts:30`.
- `app/api/student-journal/notes/[id]/route.ts` — DELETE soft-delete status standardized to `"INACTIVE"` (was `"DELETED"`) to match admin path + `status: "ACTIVE"` default enum.
- `app/api/student-journal/entries/home/route.ts` — indicator validation now requires `status: "ACTIVE"`, preventing parents from submitting HOME entries against soft-deleted indicators. Matches teacher batch at `entries/batch/route.ts`.
- `README.md:84` — Teacher Portal line now includes Buku Penghubung.

### Task 3 — hr (BLOCKER) — fixed 2026-04-24

- `app/api/leave/requests/route.ts` — POST now runs body through `createLeaveRequestSchema` via `validateBody`. Invalid `leaveType` enum values rejected with 400 before persistence.
- `app/api/payroll/generate/route.ts` — duplicate check + overlap check + run create now execute inside a single `$transaction` with `Serializable` isolation. Concurrent POSTs can no longer both pass the guard and insert duplicate runs.
- `app/api/payroll/[id]/export/bsi/route.ts` — status guard tightened from `!== "DRAFT"` to `=== "APPROVED"` only; prevents overwriting `SLIPS_SENT` with `EXPORTED`.
- `app/api/payroll/[id]/send-slips/route.ts` — (a) status guard tightened to `APPROVED` only; (b) per-`PayrollItem` `emailSent` flag now gates the loop so retried runs after a Vercel 60s timeout skip already-sent employees; (c) final status promotion uses `updateMany({ where: { id, status: "APPROVED" } })` compare-and-swap, returning a warning if another process already promoted the run.
- `prisma/schema.prisma` + `prisma/migrations/20260424000003_add_emailsent_to_payrollitem/migration.sql` — new `PayrollItem.emailSent Boolean @default(false)` column. Additive-only migration; no data backfill needed.
- `app/api/leave/requests/[id]/approve/route.ts` — approval now reads `AttendanceRecord.isLocked` before upserting `LEAVE` status; locked days are skipped silently so approved-payroll attendance is never overwritten.
- `app/api/payroll/[id]/route.ts` — PUT fetch + DRAFT guard + overlap check + update now execute inside a `Serializable` `$transaction`. Concurrent DRAFT edits cannot both pass the overlap guard and both write.
- `app/api/payroll/[id]/items/[itemId]/variables/route.ts` — DRAFT status guard was already present at line 25; status code changed from 400 to 409 to match peer payroll conflict responses.
- `lib/payroll/engine.ts` — `gajiPokokAmount` capture now explicitly precedes `Math.round` via a distinct `finalAmount` variable. Semantics identical to prior code but structurally guarded against future reorder.
- `README.md:86` — payroll flow narrative replaced with the full state machine (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT | CANCELLED`) and a pointer to the new `emailSent` idempotency field.

### Task 4 — finance (MAJOR deploy-critical) — fixed 2026-04-24

- `app/api/xendit/webhook/route.ts` — (a) review claimed `revalidateTag("student-invoices", {})` is a one-arg signature and the empty object was a bug; Next.js 16 actually requires the two-arg form `revalidateTag(tag: string, profile: string | CacheLifeConfig)`, and `{}` satisfies `CacheLifeConfig` (all fields optional). Finding is stale against Next 16 — left the two-arg form in place (matches peer usage in `app/api/employees/*`). Documented in verification. (b) idempotency key is now `payment_session_id` only (was `paymentId ?? payment_session_id`, which let a late-populated `payment_id` bypass dedupe and double-credit); (c) overpayment clamped via `Prisma.Decimal.min(amount, remaining)` defence-in-depth; (d) `Number()` accumulation replaced with `Prisma.Decimal` accumulator on the totalPaid sum.
- `app/api/invoices/[id]/payments/route.ts` — added `pg_advisory_xact_lock(hashtext(invoiceId))` (same key as webhook) + moved overpayment + status guards inside the transaction + added idempotent `Prisma.Decimal` accumulator. A manual-payment tab + concurrent webhook can no longer both pass the overpayment guard.
- `app/api/invoices/[id]/route.ts` — PUT now rejects `status: "SENT"` when the existing invoice is `PAID`, `CANCELLED`, or `PARTIALLY_PAID` (409). Previously a stale admin tab could force a voided invoice back into a fresh Xendit session.
- `app/api/invoices/[id]/void/route.ts` — void flow now runs inside `$transaction` with the same advisory lock as the webhook and manual payments. A payment can no longer be credited between the status check and the void write.
- `README.md:178` — `XENDIT_CALLBACK_TOKEN` renamed to `XENDIT_WEBHOOK_TOKEN` to match actual `process.env` reads in `app/api/xendit/webhook/route.ts:14` and `.env.example`. Prevents new-deployer 401-on-every-webhook deployment trap.
- `README.md:54` — finance module row now documents the Invoice state machine + advisory-lock void/manual-payment contract.

## Verification

### Task 1 — students

- Between-task gate: `npm run build && npx vitest run` — green.
- Manual review: peer `PUT /api/students/[id]` uses same `findFirst({ where: { id, tenantId } })` + `isAdminRole` pattern — now matches.
- README: clean — no prune needed.

### Task 2 — student-journal

- Between-task gate: `npm run build && npx vitest run` — green.
- Manual review: teacher notes POST enrollment lookup now mirrors the scoped pattern at `students/[id]/week/route.ts:30`. Admin + user soft-delete both write `"INACTIVE"`. HOME indicator validation now matches the `status: "ACTIVE"` guard used by `entries/batch/route.ts`.
- README: prune applied — Teacher Portal line at `README.md:84` now lists Buku Penghubung.

### Task 3 — hr

- Between-task gate: `npm run build && npx vitest run` — green (see commit for numbers).
- Playwright smoke: Task 3 touches only API routes + lib/payroll/engine.ts; no admin UI page changed, so Playwright is not invoked here. End-of-cycle smoke will run at task 4 commit.
- Schema change: `PayrollItem.emailSent` additive column + migration `20260424000003_add_emailsent_to_payrollitem`. Migration is `ADD COLUMN ... NOT NULL DEFAULT false` — zero-downtime, no backfill. Prisma client regenerated via `npx prisma generate`. `prisma migrate dev` was NOT run against the shared staging DB; staging will pick the migration up via `scripts/vercel-build.sh` on next deploy.
- README prune: `README.md:86` replaced with the full payroll state machine and a reference to `PayrollItem.emailSent`.

### Task 4 — finance

- Between-task gate: `npm run build && npx vitest run` — green (40 test files, 269 passed, 42 todo, 2 skipped).
- End-of-cycle gate: `DEMO_MODE=true npx playwright test` — 38 passed, 2 skipped (chromium only). Dev server log showed P2022 ColumnNotFound on `PayrollItem.emailSent` because local dev DB has not yet applied the Task 3 migration (no `prisma migrate dev` run against shared DB per hard rules). No Playwright spec exercises `/api/payroll/*/send-slips`, so tests pass cleanly. Staging + prod DBs get the column via `scripts/vercel-build.sh` on next deploy.
- Manual review: advisory-lock key (`hashtext(invoice.id)`) is identical across webhook, manual payments, and void routes — all three flows serialize against each other. Prisma.Decimal accumulator produces identical totals for integer IDR amounts and does not regress rounding.
- README prunes: `README.md:178` env var renamed (deployment trap closed); `README.md:54` finance module row now documents Invoice state machine + advisory-lock contract.
- Test update: `app/api/__tests__/xendit-webhook.test.ts` now sends `payment_session_id` in payload (was relying on `payment_id` fallback, which the idempotency fix dropped).

## Ship Notes

*empty — this is a review-only cycle; Ship Notes for each follow-up cycle captured in that cycle's own doc.*
