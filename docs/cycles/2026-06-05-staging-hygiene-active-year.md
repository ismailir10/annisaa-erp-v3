# Staging Hygiene + Single-Active-Year Integrity

## Context

The 2026-06-04 admin+teacher UAT ([report](../uat/reports/2026-06-04-admin-teacher-full.md)) surfaced two coupled **Major** integrity problems. (1) **Multiple `AcademicYear`s and `Semester`s are `ACTIVE` at once** — activating a year/semester never demotes its siblings, so "current" is not uniquely resolvable. Its concrete user-facing break: `/admin/classes` defaults its year filter to the *first* `ACTIVE` year the API returns (an arbitrary E2E test year dated 2030) and renders "Tidak ada data" — an admin opening Kelas sees **no classes** until they manually switch to `2025/2026`. (2) **Staging is swamped with un-torn-down E2E fixtures** — 18/21 years, 9/10 active semesters, ~75 admissions (many duplicate `Rate Limit Test`), E2E classes, and 56 E2E invoices, because several Playwright specs create data with no teardown. Together these make staging un-demoable and mask real data. Intended outcome: enforce at most one ACTIVE year per tenant + one ACTIVE semester per year at the API layer, make Kelas resolve the *true* current year date-wise, stop E2E specs from leaking, and reseed staging to clear the backlog.

## Spec

**Acceptance criteria**
- [ ] Activating an `AcademicYear` (PUT/POST `status: "ACTIVE"`) demotes every other `ACTIVE` year for the same tenant to `PLANNING` in a single transaction — afterwards at most one ACTIVE year exists per tenant.
- [ ] Activating a `Semester` (create or PUT `status: "ACTIVE"`) demotes every other `ACTIVE` semester **in the same `AcademicYear`** to `INACTIVE` in one transaction — at most one ACTIVE semester per year. (`Semester.status` enum = `ACTIVE | INACTIVE`, default `ACTIVE` — schema.prisma:1110.)
- [ ] `/admin/classes` default year = the `ACTIVE` year whose `[startDate, endDate]` covers today; fallback to the most-recently-started `ACTIVE` year, then `list[0]`. Opening Kelas with seed data lands on the year that actually has classes, never an empty default.
- [ ] The five leaking E2E specs (`daftar-public`, `admin`, `admin-admission-convert-parity`, `sibling-detect`, `curriculum-promes-import`) clean up every entity they create (years, semesters, admissions, classes, invoices) in `afterAll`/`afterEach`, OR scope creation to a disposable tenant that is deleted after — no `E2E …`-prefixed rows survive a full `npx playwright test` run.
- [ ] Staging reseeded via `npm run reseed:staging` (ops step, recorded in Ship Notes) so the existing backlog is gone; post-reseed there is exactly one ACTIVE year + one ACTIVE current-term semester.
- [ ] `npm run build && npx vitest run` green; new unit tests cover the year + semester single-active invariants and the Kelas date-bounded year pick.

**Non-goals**
- Invoice "Link Gagal" / Xendit link-generation failures (UAT D1) — separate cycle.
- Admission "Konversi ke Siswa" offer-then-reject at non-ADMITTED (B1) and Sumber WhatsApp→Datang Langsung mutation (B2) — separate cycle.
- Teacher assessment empty-state UX + adding tema/pekan to Semester 2 (T1/T2/T3) — separate cycle.
- No schema/enum changes to `AcademicYear.status` / `Semester.status` (reuse `PLANNING|ACTIVE|ARCHIVED`).

**Assumptions**
1. A tenant has exactly one current `AcademicYear` (`ACTIVE`); planning years sit at `PLANNING`, past years at `ARCHIVED`. Demotion target on activate = `PLANNING`.
2. A year has at most one `ACTIVE` semester (the current term); other terms in the same year move to `INACTIVE` on activate. The period resolver (`getCurrentPeriodFromDb`) already date-bounds (`status='ACTIVE' AND startDate<=today<=endDate`), so this is about picker/integrity cleanliness, not the resolver.
3. Reseeding staging is acceptable and the right cleanup (vs a one-shot demote script). A manual Supabase snapshot is taken first per the runbook. **CTO will NOT auto-run the destructive reseed** — it is handed off / explicitly confirmed at build time.
4. Demoting siblings on activate is silent (no extra confirm dialog) — the activate confirm already exists.
5. Pollution source is **specs run against preview deployments (which use the staging DB)** — CI itself runs E2E vs ephemeral `localhost:5432`, so CI is not the leak. `afterAll` teardown keyed on each spec's `Date.now()` suffix is the right durable fix.

## Tasks

1. [x] **`setActiveAcademicYear` transaction helper + wire into year API.** Add `lib/academic-year/activate.ts` exporting a helper that, in a `prisma.$transaction`, demotes all other `tenantId` years with `status=ACTIVE` to `PLANNING` then sets the target `ACTIVE`. Call it from `app/api/academic-years/[id]/route.ts` PUT and `route.ts` POST when `status==="ACTIVE"`. *Accept: PUT activate leaves exactly one ACTIVE year for the tenant.*
2. [x] **Single-active Semester per year.** Routes use the `prisma.semester` model client (schema caught up — `model Semester` schema.prisma:1103). In `app/api/admin/curriculum/semesters/route.ts` (`create`, L82) + `[id]/route.ts` (PUT, L81), when the resulting status is `ACTIVE`, wrap in `prisma.$transaction` and `updateMany` sibling `ACTIVE` semesters in the same `academicYearId` to `INACTIVE`. *Accept: activating/creating an ACTIVE semester leaves ≤1 ACTIVE semester in that year.* (independent of 1; same txn pattern.)
3. [x] **Kelas date-bounded default year.** API already returns full rows incl. `startDate/endDate` (`/api/academic-years` GET, `orderBy startDate desc`). (a) Extend the client `AcademicYear` type + `setYears` mapping in `app/admin/classes/client.tsx` to carry `startDate`/`endDate`. (b) Replace `list.find(y => y.status === "ACTIVE")` (~L124-127) with a pure `pickDefaultYear(years, today)`: ACTIVE year covering today (`startDate<=today<=endDate`), else most-recent-`startDate` ACTIVE, else `list[0]`. *Accept: with multiple ACTIVE years, Kelas selects the date-covering one, never an empty default.* (independent of 1/2.)
4. [x] **Unit tests for invariants.** Vitest: `setActiveAcademicYear` demotes sibling years to PLANNING; semester activate demotes in-year siblings to INACTIVE; `pickDefaultYear` date logic (covering / fallback-recent / list[0] / empty). *Accept: tests fail on the pre-fix behavior, pass after.* (depends on 1,2,3.)
5. [x] **Stop e2e specs polluting staging (DATABASE_URL guard).** **Root cause corrected during build:** the demo-cookie specs only auth against `localhost` (cookie `domain:"localhost"`), so the leak was NOT preview runs — it was local `npx playwright test`: `lib/db.ts` always connects to `process.env.DATABASE_URL` (DEMO_MODE switches only auth, never the DB), and the repo `.env` points at staging Supabase, so every local e2e run wrote `E2E …` rows into staging. Per-spec `afterAll` teardown is also unworkable — there is no hard-delete API (year DELETE soft-archives; no admission delete). Fix: a guard in `playwright.config.ts` that resolves DATABASE_URL (process.env > .env.local > .env) and throws unless the host is local, with `E2E_ALLOW_REMOTE_DB=1` opt-in; pins the validated URL into `webServer.env`. *Accept: `playwright test` against a non-local DATABASE_URL aborts before any spec; CI (ephemeral localhost) runs all 27 specs.* (independent.)
6. [x] **README ADR + invariant note.** Add a short ADR-table row in README.md recording the single-active-year/semester invariant + Kelas date-bounded default (also satisfies the `commit-msg` hook requiring README on `feat` commits touching `app/**`/`lib/**`). *Accept: README ADR row present; pre-commit/commit-msg pass.* (depends on 1,2,3.)
7. [x] **Reseed staging + Ship Notes (ops, hand-off).** ⏳ **OPS HAND-OFF — not run by CTO** (destructive, needs prior Supabase snapshot + staging creds). Runbook + command in Ship Notes. *Accept: staging shows 1 ACTIVE year + 1 ACTIVE current-term semester, no E2E backlog.* Run after the PR merges (so code enforcing the invariant is live before reseed).

## Implementation
- Subagent plan: tasks 1/2/3/5 are independent (different files) but executed **inline sequentially** in one worktree to avoid write conflicts; each task's unit test folded into its own commit (TDD), superseding the standalone task-4.
- Task 1: single-active AcademicYear — `lib/academic-year/activate.ts` (`demoteOtherActiveYears` txn helper + `ACADEMIC_YEAR_STATUSES`/`isAcademicYearStatus` allowlist), wired into `app/api/academic-years/route.ts` POST + `[id]/route.ts` PUT (demote siblings→PLANNING inside `$transaction` when status=ACTIVE; capture narrowed `tenantId` before closure). Review fix (superpowers:code-reviewer): added status allowlist validation (400 on unknown) to both handlers — activation branches on the free-form string, so a typo'd status would silently skip demotion. `feature-dev:code-reviewer` unavailable (glm-5 infra error); superpowers pass cleared post-fix.
- Task 2: single-active Semester per year — `lib/curriculum/semester-activate.ts` (`demoteOtherActiveSemesters` txn helper, scoped to `tenantId`+`academicYearId`, ACTIVE→INACTIVE), wired into `app/api/admin/curriculum/semesters/route.ts` POST (create defaults ACTIVE → demote-then-create in `$transaction`) + `[id]/route.ts` PUT (added `academicYearId` to `before` select; demote-then-update when status=ACTIVE). Updated `app/api/__tests__/curriculum-routes.test.ts` mock (`$transaction` + `semester.updateMany`). Status zod-validated (`semesterUpdateSchema` enum) — no allowlist gap. superpowers:code-reviewer: PASS, no findings (tenant+year scoping airtight, 409 P2002 path preserved through the transaction).

## Verification
- Task 1: gates passed — `npm run build` (compiled + typecheck) green; `npx vitest run` 1889 passed; new `lib/academic-year/__tests__/activate.test.ts` (4 tests: demote where-clause PUT/create paths + status allowlist) green.
- Task 2: gates passed — `npm run build` green; `npx vitest run` 1894 passed; new `lib/curriculum/__tests__/semester-activate.test.ts` (3 tests: PUT/create where-clause + year-scoping). Fixed 2 pre-existing `curriculum-routes.test.ts` failures caused by create moving inside `$transaction` (mock now provides `$transaction`+`updateMany`).
- Task 5: e2e staging-pollution guard — `playwright.config.ts` resolves DATABASE_URL (process.env > .env.local > .env) and throws at config-load if the host is non-local unless `E2E_ALLOW_REMOTE_DB=1`; pins the validated URL into `webServer.env.DATABASE_URL`. Corrects the cycle's original (wrong) premise: leak source was local e2e against the staging `.env`, not preview runs; per-spec teardown is infeasible (no hard-delete APIs). superpowers:code-reviewer: ship-it, no issues (URL host-parse robust across credential/port/query shapes; CI localhost unaffected; pin closes check-vs-run drift). Empirically verified: throws on staging `.env`, lists 128 tests with DATABASE_URL=localhost + with opt-in.
- Task 3+4 (UI): Kelas date-bounded default year — `app/admin/classes/pick-default-year.ts` (pure `pickDefaultYear(years, today)`: covering-ACTIVE → most-recent-ACTIVE → list[0]), wired into `client.tsx` (AcademicYear type gains `startDate/endDate`; replaced `find(status==="ACTIVE")`). Logic-only, **no visual/layout change** — design-system.html not re-consulted (no UI diff). Mirrors the tz convention of `lib/academic-period-db.ts`. superpowers:code-reviewer: Approve, no blockers (the UTC-vs-Jakarta ~7h boundary edge is a pre-existing accepted tradeoff shared with the canonical resolver). 6 tests in `__tests__/pick-default-year.test.ts`; gates green, `npx vitest run` 1900 passed.

- Task 6: README ADR row (2026-06-05) recording the single-active invariant + Kelas date-default + e2e DB guard (Decision 352 / Why 281 chars, both < 400). Docs-only.
- Post-build fix: the Task 2 test-mock update (`app/api/__tests__/curriculum-routes.test.ts`) was accidentally left unstaged in the Task 2 commit (which staged only `app/api/admin/curriculum`); committed separately so CI runs the new mock against the new route. No code-behavior change.
- End-of-cycle gate: `npm run build` (compiled + typecheck) green; `npx vitest run` 1900 passed | 42 todo. **Playwright (local) intentionally skipped** — the new `playwright.config` guard correctly refuses the staging `.env` and there is no local Postgres in this worktree; the required CI `Playwright E2E` job (ephemeral localhost) validates all 27 specs on the PR.

- `/ship` preflight `/audit-docs` (A-scope): all checks **ok** — routes 164=164, portal pages 40/14/8 match, components/ui 69=69, e2e specs 27=27, all 10 standards files present. Zero `fail`. Playwright **not run locally** — the Task-5 guard refuses the staging `.env` and no local Postgres is available (no docker); the PR's required CI `Playwright E2E` job (ephemeral localhost) is the Playwright gate before merge.

- Preview-verify converged iteration 1 (clean) — PR #318 preview `annisaa-erp-v3-git-feat-stagin-963d3d…vercel.app` (staging DB, still polluted pre-reseed), admin Google session. **Flow 1 — `/admin/classes` (the headline fix):** now defaults to **`2025/2026 · Aktif`** (date-covering) and renders the 6 real classes — on the *exact* polluted DB where pre-fix it defaulted to an E2E 2030 year and showed "Tidak ada data". `GET /api/admin/classes?yearId=cmpasbfsg…&status=ACTIVE` 200, all reference APIs 200, no console errors. **Flow 2 — `/admin/academic-years`:** renders clean (programs + year list + activate menus), APIs 200, no console errors. **0 blockers, 1 minor** (pre-existing report-only `POST /api/csp-report → 204`, same as UAT 2026-06-04, not introduced by this cycle). 0 fix commits.

## Ship Notes

**Migrations:** none. Reuses existing `AcademicYear.status` (`PLANNING|ACTIVE|ARCHIVED`) and `Semester.status` (`ACTIVE|INACTIVE`) — no schema change.

**Env vars:** none required. New optional `E2E_ALLOW_REMOTE_DB=1` is a *local-only* opt-in to run e2e against a non-local DB — never set it in CI or prod.

**Behavioral note:** the single-active invariant is enforced **going forward** (on the next create/activate per year and per year-semester). Pre-existing multi-active rows are **not** auto-healed; the reseed below clears the staging backlog, and in any tenant the next activate collapses siblings.

**Manual step — reseed staging (Task 7, DESTRUCTIVE, ops hand-off):**
1. Take a manual Supabase **snapshot** of the staging project via the dashboard first (only rollback for the data wipe).
2. Run **after this PR merges** (so the invariant-enforcing code is live), with staging creds:
   ```
   STAGING_CONFIRM=yes \
   STAGING_SUPABASE_REF=<staging-ref> \
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
   DATABASE_URL=<staging-postgres-url> \
   SUPABASE_SERVICE_ROLE_KEY=<...> \
   XENDIT_SECRET_KEY=xnd_development_<...> \
   npm run reseed:staging
   ```
   (Script refuses to run if any env var is missing, the ref looks like prod, the URL host mismatches the ref, or the Xendit key is not a sandbox key — see `scripts/reseed-staging.ts`.)
3. Verify post-reseed: exactly **1 ACTIVE `AcademicYear`** + **1 ACTIVE current-term `Semester`**, and no `E2E …` / `Rate Limit Test` / `E2E Combobox` rows in admissions/years/semesters/classes/invoices. Record the snapshot id + counts back here.

**Rollback:** revert commits `4b3c4994..ebb946f5` (code is additive, no data migration to undo). The reseed is the only irreversible op — covered by the pre-reseed snapshot.
