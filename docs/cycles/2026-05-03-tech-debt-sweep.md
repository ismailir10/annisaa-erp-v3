# Tech Debt Sweep — Phase 0 + Phase 1

## Context

A repo-wide tech-debt audit on 2026-05-03 surfaced 16 items across 6 categories. Five items scored ≥ 18 on the (Impact + Risk) × (6 − Effort) framework after dropping the worktree-cleanup item (parallel sessions still using those branches) — two are zero-risk hygiene plays bleeding daily (7 untracked docs creating audit gaps, missing `typecheck` npm script that makes schema drift only catchable on red CI), one is a moderate-severity supply-chain CVE chain (`resend` → `svix` → `uuid <14`, buffer bounds bug), one is doc bloat (127 cycle docs in `docs/cycles/` taxing every `/spec` context-load), and one is the largest correctness gap before the Talib production launch — only 53 of 132 API routes have unit tests, with revenue-path coverage (salary/payroll/leave/promotion bulk/tenant-scope) thin. This cycle bundles those five plus a small ADR refresh into one sweep so the repo enters Talib launch with supply chain pinned, doc bloat trimmed, schema-drift catchable locally, and revenue routes covered. No product features; no frontend changes; worktree cleanup deferred until parallel sessions land.

## Spec

**Acceptance criteria**

- [ ] Seven items committed: `.gitignore` (adds `.vercel`) + 6 UAT reports (`docs/uat/reports/2026-04-{18,24,25-parent,25-teacher}*.md`, `docs/uat/reports/2026-05-{01-cross-actor,02-admin}.md`). Note: the talib production-launch spec was already committed in `origin/staging` (PR #169); only main-checkout was stale.
- [ ] `npm run typecheck` script added to `package.json` — runs `prisma generate && tsc --noEmit`. CI workflow updated to call `npm run typecheck` instead of inline `tsc --noEmit`
- [ ] All seven stray `console.log` calls in non-test source removed (or converted to deliberate `console.warn`/`console.error` if they were intentional)
- [ ] Cycle docs older than 60 days (created before 2026-03-04) moved to `docs/cycles/archive/`. `ls docs/cycles/*.md | wc -l` ≤ 25
- [ ] `resend` pinned at exact `6.10.x` in `package.json` (no caret) with explanatory comment in cycle Ship Notes; `npm audit` shows the chain still flagged but documented as a known-accepted upstream issue tracked for resolution
- [ ] At least 8 new API unit tests added covering revenue paths: salary, payroll bulk, leave bulk, promotion bulk, tenant-scope edges. After this cycle: `find app/api/__tests__ tests __tests__ -name '*.test.ts' | wc -l` ≥ 61
- [ ] At least 3 active ADR markdown files exist under `docs/adrs/` (separate from `archive.md`) covering current load-bearing decisions: SSR + Supabase auth, role split (SUPER_ADMIN vs SCHOOL_ADMIN), query-optimization Phase 6 patterns
- [ ] `docs/cycles/2026-05-03-tech-debt-sweep.md` ship-notes section records: items completed, items deferred, audit baseline → after numbers
- [ ] All gates green: `npm run build && npm run typecheck && npx vitest run`. Playwright skipped (pure-infra cycle, no UI surface) — explicit skip recorded in Verification
- [ ] README.md updated to reference new `npm run typecheck` script in the standards table or scripts section
- [ ] CI workflow `.github/workflows/ci.yml` references `npm run typecheck` instead of inline `npx tsc --noEmit`

**Non-goals**

- No work on items #8 (`any` decay), #11 (page splits), #14 (DAL extraction), #13 (eslint-disable audit), #10/#12 (seed unification) — those are Phase 2, ratchet-in-flight
- No bumping `resend` major (still on 6.10) — breaking change deferred to its own cycle
- No frontend / UI / `app/**/page.tsx` edits → frontend-gate not triggered
- No `prisma/schema.prisma` edits → seed-drift hook not triggered
- No new product features; no UAT runs
- No staging → main promotion (separate `/ship --to-main` cycle)

**Assumptions**

1. Cycle docs older than 2026-03-04 are safely archive-only (linked from ADR archive if load-bearing, otherwise grep-discoverable). User confirms 60-day cutoff is the right line.
2. `resend@6.10` pin is acceptable as interim — alternative is the breaking `npm audit fix --force` downgrade, which we defer to a dedicated cycle so this sweep stays low-risk.
3. The 8-test target prioritizes revenue paths; explicit list selected during /build Step 1 by re-grepping `app/api/__tests__/` against `app/api/**/route.ts` for routes touching `Invoice`/`PayrollItem`/`SalaryComponent`/`LeaveRequest`/`Promotion`. User does not need to pre-approve the exact route list.
4. Three ADRs are minimum-viable; user prefers thin-slice ADRs over comprehensive ones. Each ADR follows the `engineering:architecture` skill's MADR-lite format.
5. README change ≤ 3 lines (just typecheck script row) — narrow doc-sync `^feat|perf` rule does not apply because all task subjects use `chore:`/`test:`/`docs:`.
6. Worktree cleanup (originally Phase 0 item #2) deferred — parallel sessions still working on those branches.

## Tasks

> Order matters where marked **[seq]**. Tasks marked **[par]** can run as subagent dispatch in `/build`.

- [x] **T1 [par]** — `chore: commit untracked .gitignore + 6 UAT reports`. Stage `.gitignore` (adds `.vercel`) + 6 UAT reports. One commit, `chore:` prefix. (The talib spec listed in the original audit was already in `origin/staging` PR #169; main-checkout was stale.)
  *Acceptance:* `git status` clean. Files visible in `git log -1 --stat`.

- [x] **T2 [par]** — `chore: add npm run typecheck script`. Edit `package.json` `scripts`: add `"typecheck": "prisma generate && tsc --noEmit"`. Edit `.github/workflows/ci.yml`: replace the inline `npx tsc --noEmit` step with `npm run typecheck` (drop the now-redundant explicit `prisma generate` step in `lint-typecheck-test` job since typecheck already runs it). Edit README.md to mention the script in the scripts/standards row.
  *Acceptance:* `npm run typecheck` exits 0 locally. CI workflow diff shown. README diff shown.

- [x] **T3 [par]** — `chore: remove stray console.log calls`. All 7 hits classified as deliberate operational signals; converted to `console.info` (6 hits — Xendit webhook duplicate/PROCESSED/soft-revert, retry attempt log, opt-in `XENDIT_DEBUG` session-response, simulated-email marker) or `console.warn` (1 hit — CSP violation reports, distinct grep token for weekly security review). Test spies updated in 2 specs.
  *Acceptance:* The grep above returns 0 lines.

- [ ] **T4 [par]** — `docs: archive cycle docs older than 60 days`. Create `docs/cycles/archive/`. Move all `docs/cycles/YYYY-MM-DD-*.md` where `YYYY-MM-DD < 2026-03-04`. Update one-file-per-cycle hook expectations if any check on `docs/cycles/` depth — verify `scripts/test-hooks.sh` still passes (the allowlist already permits `docs/**` so subdir is fine). Add a one-line note in README pointing to the archive.
  *Acceptance:* `find docs/cycles -maxdepth 1 -name '*.md' | wc -l` ≤ 25. `find docs/cycles/archive -name '*.md' | wc -l` ≥ 100. `bash scripts/test-hooks.sh` passes.

- [ ] **T5 [seq, after T2]** — `chore(deps): pin resend to 6.10.x and document CVE chain`. Edit `package.json`: change `"resend": "^6.10.0"` → `"resend": "6.10.x"` (pinned). Run `npm install` to refresh lockfile. Run `npm audit --json` and capture the `svix`/`uuid` chain in a new `docs/adrs/2026-05-03-resend-cve-deferred.md` MADR-lite ADR documenting decision: pin now, breaking-bump in dedicated cycle when upstream patches `svix`. Wired to T7.
  *Acceptance:* `npm audit --audit-level=high` exits 0 (moderates documented, not high+). `package-lock.json` regenerated. ADR file present.

- [ ] **T6 [par, can run alongside T5]** — `test(api): add 8 unit specs for revenue routes`. In `/build` Step 1, list every `app/api/**/route.ts` whose handlers touch `Invoice`, `PayrollItem`, `PayrollRun`, `SalaryComponentDef`, `LeaveRequest`, or `Promotion`, cross-ref against existing tests under `app/api/__tests__/`, and pick the top 8 untested by route count × business risk. Use `feature-dev:code-explorer` agent if list-derivation needs deep code reading. Each spec follows existing test conventions (vitest, prisma mocking, demo-mode `getSession` stub). One commit `test(api): add specs for <area>`.
  *Acceptance:* `npx vitest run` adds 8+ passing tests. `find app/api/__tests__ tests __tests__ -name '*.test.ts' | wc -l` strictly increased by ≥ 8.

- [ ] **T7 [par, can run alongside T6]** — `docs(adrs): refresh active ADR registry with 3 load-bearing decisions`. Create `docs/adrs/2026-05-03-supabase-ssr-auth.md`, `docs/adrs/2026-05-03-role-split-super-admin-school-admin.md`, `docs/adrs/2026-05-03-query-optimization-phase-6.md`. Each MADR-lite (~ 50–100 lines): Status, Context, Decision, Consequences. Use `engineering:architecture` skill. Update README's ADR table to point at these three plus the resend CVE one from T5.
  *Acceptance:* `ls docs/adrs/*.md` shows 5 files (4 new + existing `archive.md`). README ADR table lists 4 active. Each ADR < 200 lines.

- [ ] **T8 [seq, last]** — `chore: end-of-cycle gate + ship notes`. Run `npm run build && npm run typecheck && npx vitest run`. Skip Playwright (record skip in Verification with reason: pure-infra, no UI). Fill `## Implementation`, `## Verification`, `## Ship Notes` in this cycle doc. Single commit `chore(cycle): close 2026-05-03-tech-debt-sweep`.
  *Acceptance:* All three gates pass. Cycle doc Ship Notes lists: tasks completed, tasks deferred (worktree cleanup), and before/after numbers (untracked docs: 7→0, cycle-doc count: 127→≤25, audit moderate vulns: documented, API test count: 53→≥61).

## Implementation

- Subagent plan: all 8 tasks executed sequentially inline. README is touched by T2 + T7 and `package.json` by T2 + T5; sequential ordering avoids merge churn. Each task remains atomic with its own commit + per-task gate + per-task code-reviewer pass.
- Task 1: `chore: commit untracked .gitignore + 6 UAT reports` — `.gitignore` (+1: `.vercel`), 6 UAT reports under `docs/uat/reports/2026-04-{18,24,25-parent,25-teacher}*.md` + `docs/uat/reports/2026-05-{01-cross-actor,02-admin}.md`, plus the cycle doc itself. Reviewer pass clean (one description-drift fix applied: T1 line "7 docs" → "6 UAT reports").

## Verification

- Task 1: gate green — `npm run build` ✓, `npx vitest run` ✓ (1002 tests / 118 files passing, 2 skipped, 42 todo). 8 files / 766 insertions staged.
- Task 2: gate green — `npm run typecheck` ✓ (exit 0, zero TS errors), `npm run build` ✓, `npx vitest run` ✓ (1002 passing). Files: `package.json` (+1 typecheck script), `.github/workflows/ci.yml` (collapsed redundant `prisma generate` steps in both `lint-typecheck-test` and `build` jobs since `npm run typecheck` and `npm run build` both run `prisma generate` internally), `README.md` (+1 sentence under Tests). Reviewer flagged a pre-existing standalone `prisma generate` in the Build job — fixed inline since the same simplification rationale applies.
- Task 3: gate green — `npx vitest run` ✓ (1002 passing after fixing 7 broken specs). Files: `app/api/xendit/webhook/route.ts`, `app/api/csp-report/route.ts`, `lib/xendit/with-retry.ts`, `lib/xendit/client.ts`, `lib/email/send-slip.ts` (5 source files); `lib/__tests__/with-retry.test.ts`, `app/api/__tests__/csp-report.test.ts` (2 test spies updated to match new severity).

## Ship Notes

<!-- filled by /ship -->
