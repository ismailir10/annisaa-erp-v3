# Repo Audit — Unfinished/Improper Implementation Sweep + Direct Fixes

## Context

CTO-initiated skeptical audit (2026-07-19, Claude Fable 5 driver + 7 Sonnet subagents: branch triage, deferred-backlog extraction, API security, UI unfinished-implementation scan, docs drift, schema/data layer, doc trim). Goal: one prioritized plan doc future sessions can execute, plus direct fixes for everything safely fixable now. Gates at audit start: `npm run build` green, `npx vitest run` 2149 passed / 42 todo, `verify-api-auth.sh` 184/184, `verify-rls-coverage.sh` 38/38.

**Top findings (full backlog in Tasks):**

1. **P0 — Nightly Backup has NEVER succeeded: 70/70 failures since 2026-05-10.** All six `production` environment secrets (`PROD_DB_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `BACKUP_GPG_RECIPIENT`, `BACKUP_GPG_FINGERPRINT`) are **empty** — the GitHub `Production` environment has zero secrets configured (only repo-level secret is `XENDIT_SECRET_KEY`). The prod pilot database has no backups at all. **Owner action only** — secrets must be entered by a human in GitHub → Settings → Environments → Production. Then `workflow_dispatch` the backup and confirm an object lands in R2. Also: the workflow comment claims required-reviewer gating on the environment; scheduled runs proceeded ungated, so that protection is likely not actually configured — verify while in there.
2. **P0 — Money-mutation route had no validation + float arithmetic** (`app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts`): raw `body.*` usage, `Number(x) || 0` silently coercing invalid input to 0 (the `isNaN` check after it was dead code), Decimal columns written from JS float sums, and an ownership gap (item never checked against the run → cross-run/tenant write via mismatched ids). **Fixed this cycle** (Zod + `Prisma.Decimal` end-to-end + ownership chain).
3. **P0 — At-risk work rescued to origin** (was local-only / uncommitted in stale worktrees): `feat/roster-import-2526` (5 commits, 2874 lines, never had a PR — roster import scripts for the 2026/27 intake, a pilot blocker input), `feat/fix-parent-raport-publish` (uncommitted `revalidateTag("parent-report-cards")` fix), `feat/journal-draft-audit` (uncommitted journal note-metadata feature + tests + cycle doc). All three now pushed; each needs review + its own PR.
4. **Security posture is good** — no CRITICAL/HIGH. 184/184 route auth, tenant scoping clean in sampled admin routes, enrollment-token/webhook/cron flows well-hardened. Two MEDIUMs: guardian invoice routes missing the `hasEmail` cross-family-leak guard (fixed this cycle), and `lib/auth.ts` email-based parent lookups with no tenant filter (safe today only via `assertSingleTenant()`; blocks multi-tenant rollout — leave until multi-tenant is actually planned).
5. **Known-deferred backlog is large and tracked nowhere central** — 45 items extracted from cycle docs/UAT reports, incl. two "real user harm" items open since June (T8 lost journal input, T19 anonymous journal notes) and two UAT blockers non-goal'd and dropped (48% invoices "Link Gagal", admission status advance corrupts `Sumber`).

## Spec

Two deliverables:

- **A. Direct fixes (this cycle):** payroll route validation/Decimal/ownership + schema tests; guardian invoice `hasEmail` guards; dead `components/parent/quick-link-card.tsx` deleted; `.codex/` gitignored; dependabot ignore for TypeScript majors (PR #389 closed); CLAUDE.md components count 73→65; README ADR rows >60d moved to `docs/adrs/archive.md`; orphaned pilot runbook committed + linked. Rescue pushes for the three at-risk branches. Gates green.
- **B. Prioritized plan (below)** for follow-up sessions; each P-block is sized to be one `/spec → /build → /ship` cycle (or an owner action).

Acceptance: build + vitest green; no behavior change outside the payroll adjustment route (stricter 400s on invalid input) and guardian invoice routes (flat 404 on degenerate sessions).

## Tasks

### This cycle (done — see Implementation)

- [x] T1 payroll line-adjustment route: Zod schema + Decimal arithmetic + item↔run ownership check + tests
- [x] T2 guardian invoice routes (`[id]`, `[id]/pdf`): parentId-or-nonempty-email guard (mirrors raport-PDF fix)
- [x] T3 hygiene: delete dead `quick-link-card.tsx`; `.gitignore` `.codex/`; dependabot TS-major ignore; CLAUDE.md count fix; ADR >60d archive trim; commit + link pilot runbook
- [x] T4 rescue pushes: `feat/roster-import-2526`, `feat/fix-parent-raport-publish` (+cache-fix commit), `feat/journal-draft-audit` (+WIP commit)

### P0 — before/at go-live (each its own cycle unless noted)

- [ ] **P0.1 Backups (OWNER, not a cycle):** set the 6 `Production` environment secrets, dispatch Nightly Backup, verify R2 object; confirm environment required-reviewer protection is real. Until done the pilot runs uninsured.
- [ ] **P0.2 Roster import:** review + land `feat/roster-import-2526` (now on origin; branch is 5 commits, SQL generator + merged-header fix). Prod has 0 students/0 sections — pilot blocker per 2026-07-12 pilot-readiness T1. Decide overlap vs merged `2026-07-13-roster-import-2026-2027` cycle first.
- [ ] **P0.3 Journal user-harm pair (one cycle):** T8 (teacher journal entry loses unsaved input on navigate-away; `app/teacher/student-journal/entry/page.tsx`) + T19 (journal notes have no author attribution) + admin "Simpan Perubahan" placebo button. Rescued `feat/journal-draft-audit` WIP (note-metadata lib + tests) is a head start — review, don't merge blind.
- [ ] **P0.4 Invoice "Link Gagal" (UAT D1):** 48% of invoices showed failed payment-link generation on staging (2026-06-04 UAT). Parent payment is blocked when parent phase starts. Diagnose Xendit link-generation path + retry/backfill.
- [ ] **P0.5 Admission `Sumber` corruption (UAT B2):** advancing admission status silently rewrites funnel source (WhatsApp→Datang Langsung). Data-integrity bug, cheap fix.

### P1 — correctness + robustness

- [ ] **P1.1 Silent-failure sweep (one cycle):** add try/catch + toast + loading-reset to: `app/teacher/home-client.tsx:129` (GPS check-in, worst), `app/teacher/slips/page.tsx`, `app/admin/settings/holidays/page.tsx` (3 handlers), `app/admin/(hr)/employee-attendance/monthly/page.tsx`, `app/admin/enrollments/page.tsx`, `app/admin/fees/page.tsx` write paths, `app/admin/academic-years/page.tsx` (6 handlers), `components/admin/invoices/xendit-activity-card.tsx` (swallowed catch). Unify the 3 divergent logout handlers (admin sidebar / parent header / teacher header) on the parent-profile pattern. Overlaps ui-sweep T13 tail — close both.
- [ ] **P1.2 CRUD Category A gaps:** 7 models listed in `crud.md` Category A lack `status` (OrgConfig, Holiday, TeachingAssignment, SalaryComponentDef, AssessmentTemplate, AssessmentCategory, AssessmentIndicator); `TeachingAssignment` route hard-deletes with no override comment (`app/api/admin/classes/[id]/teaching-assignments/route.ts:215`); AssessmentTemplate + SalaryComponentDef have no DELETE/deactivate route at all. Decide per-model: add status or amend crud.md + comment the exceptions.
- [ ] **P1.3 Seed coverage:** `prisma/seed.ts` never seeds AssessmentEntry, EnrollmentApplication, ReportCardEntry, StudentMeasurement, Term — fresh env shows empty raport/enrollment/assessment screens. Also wire the orphaned `adjustInvoiceLineSchema` (zero consumers) or delete it.
- [ ] **P1.4 Payroll compliance:** holiday overtime (UU §85) still unimplemented (deferred 2026-05-02); REVERSED payment status has no write path + totalPaid recompute mismatch (2026-06-13); leave-cancel/payroll-cancel APIs shipped without UI buttons (F-27/F-28).
- [ ] **P1.5 Multi-shift attendance reconciliation:** ambiguous/multi-session days still fall back to legacy `sessionId:null` path (pilot-readiness T2 note).

### P2 — deferred feature-scale UX (from ui-sweep T6–T21, grouped)

- [ ] **P2.1** Per-tap optimistic save: teacher sessions (T6), center assessments (T7), journal per-tap (T8 remainder)
- [ ] **P2.2** DataTable migration penilaian/raport/classes (T10) + EmptyState sweep (T12)
- [ ] **P2.3** Raport completion: narrative templates, walas workflow, PDF formality/letterhead (T21 + 2026-06-06 raport-MVP leftovers — July hard-cutover initiative)
- [ ] **P2.4** HR chrome (T17), academic Recipe 2 + filter bar (T18), curriculum drill-down (T20)
- [ ] **P2.5** e2e additions from T24 (skala-consistency, journal-author, optimistic-save-revert, daftar-brand); coverage for `/teacher/class-attendance` + HR detail pages
- [ ] **P2.6** `app/admin/enrollments/[id]/page.tsx`: replace native `confirm()` with `ConfirmDialog`; model the enrollment payload types (6 eslint-disable `no-explicit-any`); drop duplicated-toast `console.error`s repo-wide (9 files)

### Hygiene (cheap, any session)

- [ ] **H1 Branch/worktree cleanup** — verified squash-merged, safe to delete (keep the 3 rescued branches until PR'd): branches `feat/pilot-readiness-audit`, `feat/roster-import-2026-2027`, `feat/ui-shadcn-polish`, `feat/workflow-hardening`, `feat/crud-correctness-audit`, `feat/enrollment-application`, `feat/fix-reseed-classtrack`, `feat/module-capability-guide`, `feat/readme-staleness-sweep`, `feat/ui-sweep`, `ui-shadcn-367-rebase`, `codex/ui-shadcn-audit-build`, `claude/compassionate-hermann-120a12` + their worktrees (`git worktree remove <path> --force` then `git branch -D <name>`). Verified via `git merge-base --is-ancestor <PR-squash-sha> origin/staging` per branch.
- [ ] **H2 Dependabot PRs:** 10 open, all green (TS7 closed). Merge patch/minor dev-deps first; `shadcn 4.7→4.13` and `lucide` warrant a visual spot-check. Note `Talib-Skenario-Uji-Lintas-Peran-Pilot.docx` + `siswa-export-dialog.png` at repo root are untracked scratch — owner to delete or move (docx duplicates the committed runbook).
- [ ] **H3 Ops followups** (prod-incident runbook, still open): HSTS preload, CSP enforce, Sentry/observability, Upstash durable rate-limit for public write endpoints, branch-protection verify on GitHub Free.
- [ ] **H4 `lib/auth.ts` multi-tenant landmine:** email-based parent lookups lack tenant filter; `assertSingleTenant()` fail-closes today. Must fix before any second tenant. `getDemoSession()` path skips the assertion entirely (DEMO_MODE-gated, low).

## Implementation

- **T1** — `lib/validations/payroll.ts` (+`adjustPayrollLineSchema`), `lib/validations/__tests__/payroll.test.ts` (+4 tests), `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts` rewritten: `safeParse` → 400 with issue message; `payrollItem` fetched and checked `payrollRunId === id`; all amount math via `Prisma.Decimal` (`plus`/`minus`), Decimal values written to `adjustmentAmount`/`finalAmount`/`grossAmount`/`deductions`/`netAmount`. Client (`app/admin/(hr)/payroll/[id]/page.tsx`) already sends `{adjustmentAmount:number, adjustmentNote:string}` — no client change needed.
- **T2** — `app/api/guardian/invoices/[id]/route.ts` + `[id]/pdf/route.ts`: added `hasEmail` guard + flat 404 before `prisma.parent.findFirst`, comment mirrors the raport-PDF route.
- **T3** — deleted `components/parent/quick-link-card.tsx` (0 importers); `.gitignore` +`.codex/`; `.github/dependabot.yml` npm-entry `ignore` for typescript semver-major; CLAUDE.md File Structure count 73→65; README ADR rows dated <2026-05-20 moved to `docs/adrs/archive.md`; `docs/runbooks/pilot-cross-role-test-scenarios.md` committed + linked from README.
- **T4** — pushes recorded in Context; rescue commits carry `rescue commit by repo audit` in subject.

## Verification

- Between-task gate: `npm run build` green; `npx vitest run` green (223 files, 2153 passed / 42 todo — +4 new schema tests).
- `bash scripts/verify-api-auth.sh` 184/184; `bash scripts/verify-rls-coverage.sh` 38/38 (re-run post-change).
- Playwright: deferred to the required CI `Playwright E2E` check (audit session cannot run it locally; API-only + docs changes, existing payment/admin specs cover touched surfaces).
- Preview-verify: API-only behavior changes (stricter 400/404 paths) not exercisable anonymously; deferred to CI checks + reviewer. No visual surface changed (dead-file delete only — cross-checked design-system.html §Components that no consumer referenced QuickLinkCard).
- `/audit-docs` A-scope items addressed this cycle: ADR 60d cutoff, components count, orphaned runbook.

## Ship Notes

- **DB migrations:** none. **Env vars:** none (but see P0.1 — six GitHub *environment* secrets must be set by owner).
- **Behavior changes:** payroll line adjustment now returns 400 on invalid/non-finite amounts (was: silently coerced to 0); mismatched run/item/line ids now 404 (was: cross-run write possible); guardian invoice endpoints return 404 for sessions with neither parentId nor email (was: first-null-email-parent match).
- **Rollback:** `git revert` per commit; commits are atomic per task.
- **Merge:** CTO self-merge after 4 required checks green.
