# Workflow + Repo Hygiene Audit

## Context

A CTO review of the 3-step loop and the repo's own housekeeping, asked for as "review our working flow, see if there is something off and something we can simplify, archive anything stale + irrelevant, and make sure local and GitHub are synced about this."

The workflow itself is sound — main↔staging has stayed a clean merge-commit ancestry since the #465 squash was reconciled, hooks are installed, the File Structure block matches the code exactly (191 routes / 41-13-8 portal pages / 65 components / 34 e2e specs). What had rotted was everything *around* it: attribution that no longer matched reality, dead files nobody deleted, a doc tree that grew directories faster than it retired them, and a dependency queue frozen by a branch-protection interaction nobody had diagnosed.

Findings, worst first:

1. **`.env.doku-probe` was one `git add -A` from committing live secrets.** The file holds `DOKU_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET` and `DATABASE_URL`. `.gitignore` listed `.env`, `.env.local`, `.env.staging`, `.env.*.local` — an allowlist that this filename matched none of.
2. **Supabase MCP defaulted to production.** `.claude/settings.json` pinned `project_ref=qrnbanxcrmrwganpmzmn` (prod), making every unqualified `execute_sql` a production write. Prod was wiped to accounts-only on 2026-07-25; the default should not make that easy to repeat.
3. **`node_modules` was tracked in git** as a symlink to the absolute path `/Users/ismailrabbanii/Documents/ai-builder/school-erp/node_modules`, committed in #31. `.gitignore` said `node_modules/` — a trailing slash never matches a symlink. Every clone on any other machine got a dangling absolute symlink where its dependencies should go.
4. **35 dangling symlinks committed** under `.claude/skills/` pointing at `.agents/skills/*`, which is gitignored. Added in `6c8f892e`; dangling everywhere including locally.
5. **Harness roster was fiction.** CLAUDE.md claimed Opus 4.8 / Sonnet 4.6 and an opencode product-builder on glm-5.2. The last 220 commits are `claude-opus-5` ×159, `gpt-5.5` ×42, `claude-sonnet-5` ×19 — and **every one is `Role: cto`**. opencode has never shipped.
6. **Doc sprawl.** `docs/` had grown six directories the maintenance contract never named — `findings`, `plans`, `proposals`, `qa`, `reports`, `reviews` — holding 11 unowned files. `docs/cycles/` was 138 flat files. README's ADR table carried two rows past its own 60-day cutoff.
7. **Eleven dependabot PRs frozen since 2026-08-13.** Branch protection requires an up-to-date head, so each merge re-stales the rest — the queue could only drain through *n* serial rebase + full-CI rounds, and nobody had 9 rounds to spare.
8. **Orphan history.** Three real cycle docs (`2026-07-23-prod-roster-reimport`, `2026-07-25-prod-data-wipe`, `2026-07-30-ui-consistency-audit` — 446 lines between them) were written but never committed.

Out of scope by explicit decision: the product-builder path stays (models corrected, staleness flagged in the manual) rather than being deleted.

## Spec

- No secret-bearing file can be committed by accident: `.gitignore` denies `.env*` by default.
- `node_modules` is untracked and stays untracked in every worktree.
- Zero dangling symlinks tracked in git.
- `.claude/` holds no harness-local scratch (`plans/`, `projects/`).
- Supabase MCP defaults to staging; production is opt-in per call.
- Roster, model IDs, session-role example and commit-attribution example in CLAUDE.md match what the git log actually shows.
- `docs/` holds exactly five directories; cycle docs older than the previous month live in `docs/cycles/archive/`.
- Every reference to a moved doc resolves — README, runbooks, ADRs, and `lib/`/`app/`/`e2e/` comments included.
- README's ADR table holds only rows inside the 60-day window; older rows move to `docs/adrs/archive.md` verbatim.
- CLAUDE.md documents a dependency cadence explaining the up-to-date-head interaction, so the queue never freezes for a week again.
- The nine green minor bumps land; the two majors are deferred with reasons.
- The three orphan cycle docs are committed.

Non-goals: deleting the product-builder path; bumping `@tanstack/react-table` to 9 (CI-red major) or `@hono/node-server` to 2 (green major, deserves its own cycle); editing archived doc bodies.

## Tasks

1. Batch the nine green minor dependency bumps into one PR — [#506](https://github.com/ismailir10/annisaa-erp-v3/pull/506)
2. Untrack `node_modules`, delete the 35 dangling skill symlinks and the `.claude/{plans,projects}` scratch
3. Archive pre-August cycle docs + the six unowned `docs/` directories, then repair every inbound link
4. Move the two out-of-window README ADR rows to `docs/adrs/archive.md`
5. Harden `.gitignore` and point Supabase MCP at staging
6. Correct CLAUDE.md's roster, model IDs and doc-maintenance contract; add the dependency cadence
7. Commit the three orphan July cycle docs

## Implementation

**Task 1 — dependency batch** (separate PR, `feat/deps-minor-batch`)

Nine minors in one commit: `@base-ui/react` 1.7.0, `@prisma/adapter-pg` 7.9.1, `@supabase/supabase-js` 2.112.2, `lucide-react` 1.31.0, `shadcn` 4.16.2, `@testing-library/jest-dom` 7.0.1, `@testing-library/user-event` 14.6.3, `eslint-config-next` 16.3.0, `tsx` 4.23.12. Installed into a real `node_modules` (symlink removed first, so the shared one in the main checkout was not written through). Held back: `@tanstack/react-table` 9.1.2 (#483 — `Build` and `Lint, Typecheck & Test` both FAILURE) and `@hono/node-server` 2.1.0 (#480 — green, but a major).

**Task 2 — dead weight**

- `git rm --cached node_modules` (mode `120000`, target `/Users/ismailrabbanii/Documents/ai-builder/school-erp/node_modules`)
- 35 `.claude/skills/*` symlinks removed from the index and disk
- `.claude/plans/crystalline-giggling-pelican-agent-*.md` (a stray agent artifact) and `.claude/projects/…/memory/` (a 3-file stale copy of the harness auto-memory that actually lives in `~/.claude` with 25) deleted

**Task 3 — archive + link repair**

115 tracked cycle docs (May, June, July 2026) `git mv`'d into `docs/cycles/archive/`, plus the 3 orphan July docs from Task 7 — `docs/cycles/` goes 138 → 22 files, `archive/` 115 → 230. The six unowned directories moved to `docs/archive/legacy-doc-dirs/{findings,plans,proposals,qa,reports,reviews}/`.

Link repair mattered more than the move: **26 live files** referenced the moved paths, and only 11 were markdown. The rest were code comments — `lib/academic-year/activate.ts`, `lib/curriculum/semester-activate.ts`, `lib/security/auth-rate-limit.ts`, `lib/validations/admission.ts`, `app/api/admissions/[id]/route.ts`, `app/api/student-attendance/mark/route.ts`, six `e2e/*.spec.ts` and two `scripts/capture-*.mjs`. Rewrote all 26, then verified every resulting target resolves on disk (55 targets, 0 missing). The two hits that came back missing were synthetic hook fixtures in `scripts/test-hooks.sh` (`2026-05-01-x.md`, `2026-06-23-x.md`) and were reverted to their original form.

Archived-doc-to-archived-doc references were deliberately left alone: an archive is frozen, and rewriting 200 historical files to keep internal links tidy costs more than it returns.

**Task 4 — ADR window**

`2026-05-20` (curriculum cutover prep) and `2026-06-05` (single-active invariant) moved verbatim to `docs/adrs/archive.md`, per that file's own "byte-equal, do not edit during the move" policy. README's table now spans 2026-06-23 → 2026-08-14, all inside the 60-day window.

**Task 5 — `.gitignore` + MCP**

`.env` allowlist → `.env*` with `!.env.example`. `node_modules/` → `node_modules` (no slash, so it matches the worktree symlinks). Added `.claude/plans/`, `.claude/projects/`, `*.docx`, `*.docx.bak-*`. `.claude/settings.json` MCP `project_ref` → `udbivhchbizpxoryejgz` (staging).

**Task 6 — CLAUDE.md**

Roster models corrected to Opus 5 / Sonnet 5 / gpt-5.5; same for the fan-out worked example, the `session-role` template and the commit-attribution example (`claude-opus-4-7` → `claude-opus-5`). Added: the opencode-has-never-shipped note with the commit census; a **Dependency cadence** subsection under branch protection explaining the up-to-date-head interaction and the batch-minors / one-major-per-cycle rule; a **Supabase MCP defaults to staging** mechanism (Multi-LLM Safety goes five → six); a one-way-symlink rule; the five-directory `docs/` contract and the cycle archive rule with its link-check command.

## Verification

- `npm run build` — green
- `npx vitest run` — **2963 passed / 42 todo / 306 files**, 0 failed
- `bash scripts/test-hooks.sh` — all scenarios pass
- Playwright deferred to the required CI `Playwright E2E` check (this harness cannot run it locally)
- Link integrity: 55 rewritten `docs/cycles/archive/…` + `docs/archive/legacy-doc-dirs/…` targets checked against disk, 0 missing
- Dangling-symlink sweep: `git ls-files` cross-checked against disk, 0 tracked paths missing
- No frontend diff in this cycle (`app/**/*.{tsx,css}`, `components/**/*.tsx`, `tailwind.config.*` untouched), so the `design-system` frontend gate does not apply and preview-verify is skipped — docs, config and comment-only changes
- Secret check: `.env.doku-probe` confirmed still untracked, and now ignored by pattern

## Ship Notes

- **No migrations, no env vars, no schema change.** Docs, config and comments only.
- **Behavioural change for future sessions:** Supabase MCP now resolves to staging. Anyone doing production work must name the prod ref (`qrnbanxcrmrwganpmzmn`) explicitly in the call. This is the point of the change, but it will surprise a session that assumed the old default.
- **`node_modules` untracked:** existing worktrees keep their symlink on disk; new ones get it from `setup-worktree.sh` as before. Nothing to do.
- **Rollback:** `git revert` the commit. The archive moves are pure renames and revert cleanly; the untracked `node_modules` re-appears in the index, which is the state we were trying to leave.
- **Follow-ups, not in this cycle:**
  - `@tanstack/react-table` 8 → 9 ([#483](https://github.com/ismailir10/annisaa-erp-v3/pull/483)) — CI-red major, needs a real cycle
  - `@hono/node-server` 1 → 2 ([#480](https://github.com/ismailir10/annisaa-erp-v3/pull/480)) — green major, own cycle
  - 5 open dependabot security alerts on the default branch (2 high, 2 moderate, 1 low) — surfaced by the push, not yet triaged
  - `Panduan-Penggunaan-Talib.docx` (3 MB) and its two `.bak-` rotations exist only on one laptop; now gitignored, so decide deliberately whether the user manual belongs in `artifacts/`, in Drive, or tracked
  - `next-env.d.ts` is permanently dirty in the main checkout (Next 16 moved `.next/types` → `.next/dev/types`) — commit the regenerated file or ignore it, but stop letting it block `sync-staging.sh`
  - opencode/product-builder is specified but has never run; delete the path at the next roster review if it is still idle
