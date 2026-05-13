# Ship Preview Verify + Doc Harmony

## Context

Today the `/ship` command opens a PR from `feat/*` → `staging`, prints a two-command hand-off, and stops. The author manually watches CI and merges when green. CI runs unit + Playwright (headless, demo-mode) against the build artifact — **not against the Vercel preview deployment**. As a result, two classes of regression slip past the gate:

1. **Preview-only bugs.** Anything that depends on real auth (Google sign-in is the only auth path on staging), real Vercel runtime config, real region (sin1), or real domain rewrites cannot be exercised by headless Playwright. Layout regressions, console errors against the real bundle, broken interactive flows, and 5xx responses on edge functions all reach `staging` undetected and surface only when the user clicks around post-merge.
2. **Doc drift.** README.md (modules, route counts, portal tables, ADRs) and CLAUDE.md (file structure, standards table, workflow steps) describe state that the cycle may have just contradicted. The pre-commit doc-sync rule forces *some* doc to be staged — but does not check whether the staged doc still tells the truth. Long-tail drift accumulates (e.g., README's "128 routes" claim, ADR archive cutoff, File Structure block).

A third concern surfaced during brainstorming: the `superpowers:brainstorming` and `superpowers:writing-plans` skills write design + plan artifacts into `docs/superpowers/{specs,plans}/`, which violates the project's one-file-per-cycle rule. Four legacy spec files and two plan files exist there already; the pre-commit allowlist for `docs/**` let them through. Caveman is comm-style only and creates no doc artifact (no conflict).

This cycle solves all three: PR-time preview verification via Chrome MCP (using the user's logged-in Google session), scoped doc-staleness checks at `/ship` preflight + a standalone `/audit-docs` deep sweep, and a project-level override that redirects superpowers skill output into the active cycle doc.

## Spec

**Acceptance criteria**

- [ ] `/ship` preflight runs **A-scope doc-staleness check** (diff cycle Implementation vs README portal/module/route mentions + CLAUDE.md file-structure/standards-table). Blocks PR open when contradiction detected; AI fixes doc before retry.
- [ ] After `/ship` opens the PR, the command **polls for Vercel preview ready** via Vercel MCP `get_deployment` keyed by branch+SHA. Fails with clear error after 5min.
- [ ] **Chrome MCP signs in via user's Google session** (account picker) on the preview URL. AI does not script credentials — relies on already-authenticated Chrome profile.
- [ ] **C+ verification walk:** 2-4 user flows derived from cycle doc `## Implementation` section. For each step capture: screenshot, console messages, network requests (4xx/5xx tagged).
- [ ] **Seed via UI CRUD when needed.** When a flow requires fixtures (e.g., invoice flow needs students), AI uses Chrome MCP to create them via the same admin pages a user would use. No script direct-DB seed. No call to `/api/admin/seed`.
- [ ] **Blocker classification:** console error (severity ≥ error), any 5xx response, visible layout break (overflow/overlap/off-screen via screenshot inspection), broken interaction (click → no DOM change, form submit → no network call).
- [ ] **Minor classification:** console warnings, expected 4xx (e.g., 404 on optional resource), copy/spacing nits.
- [ ] **Fix loop:** blockers → AI edits code → commits with `fix(<scope>): <description>` → pushes feat branch → waits for new preview ready → re-runs C+. **No iteration cap.**
- [ ] **Soft escalation every 3 iterations.** AI pauses, summarizes (what was tried, what still fails, current hypothesis), uses `AskUserQuestion` to ask: continue / pause / abort.
- [ ] **Minors → PR comment** via `gh pr comment <num> --body "<markdown>"`. No fix attempt. Listed for human reviewer.
- [ ] **Clean exit:** cycle doc `## Verification` section updated with iteration count, list of flows walked, screenshot paths, final clean-pass timestamp. PR body footer appended with same summary.
- [ ] **Standalone `/audit-docs` command** at `.claude/skills/audit-docs/SKILL.md`. Run on demand. Checks:
  - README route count vs `find app/api -name route.ts -type f | wc -l`
  - README portal page counts vs `ls app/{admin,teacher,parent}/**/page.tsx | wc -l`
  - CLAUDE.md File Structure block vs actual `tree -L 2`
  - CLAUDE.md standards-table entries → each referenced file exists under `.claude/standards/`
  - README ADR archive cutoff (entries older than 60d should be moved to `docs/adrs/archive.md`)
  - Output: report into active cycle doc Verification if one is open, else stdout.
- [ ] **Harmony rule** added to CLAUDE.md `Instruction Priority` section: superpowers brainstorming and writing-plans must write into active cycle doc's `## Context` / `## Spec` / `## Tasks`, **not** `docs/superpowers/*`. Project rule overrides skill default.
- [ ] **Legacy archive:** existing `docs/superpowers/{specs,plans}/*.md` files moved to `docs/archive/superpowers-legacy/{specs,plans}/`. Add `docs/archive/superpowers-legacy/README.md` explaining origin + cutoff date.
- [ ] Self-dogfood: this cycle runs `/audit-docs` as part of end-of-cycle gate. Output recorded in this doc's Verification.

**Non-goals**

- No Playwright suite against preview URL (Google OAuth headless blocker).
- No GitHub auto-merge (private repo on free plan; branch protection unavailable).
- No caveman mode changes — orthogonal.
- No UI seed button — Chrome MCP exercises real CRUD instead.
- No change to existing 3-step `/spec` `/build` `/ship` loop names or per-task between-task gate.
- No change to `/uat` heuristic command — separate concern.
- No reorganization of `docs/cycles/` or `docs/adrs/`.

**Assumptions (surface for user correction)**

1. Vercel MCP `get_deployment` returns preview URL keyed by branch+SHA within ~3 min of push; polling backoff: 10s × 30 = 5min cap.
2. User has Chrome signed in with Google account that has admin access on staging. Chrome MCP `mcp__Claude_in_Chrome__*` tools work against that profile.
3. Cycle doc `## Implementation` section is structured enough (lists pages/routes touched) for AI to derive 2-4 flows. If unclear, AI falls back to: "open every page mentioned in Implementation, sanity-walk it."
4. `/api/admin/seed` is **not** invoked. CRUD via UI is the seed mechanism.
5. Fix-loop edits stay within the cycle's blast radius — AI does not refactor unrelated code while fixing a preview blocker.
6. PR comments posted by AI are tagged with `[preview-verify]` prefix so humans can filter.

## Tasks

> Independent tasks marked `[indep]` — `/build` may dispatch via subagents. Sequential tasks marked `[seq]`.

1. [x] **[indep] Add `/audit-docs` standalone skill** — Create `.claude/skills/audit-docs/SKILL.md` (slash command, `disable-model-invocation: true`). Implement checks listed in Spec. Output report markdown. Acceptance: invoking `/audit-docs` on current branch produces a report enumerating route count, portal pages, file-structure diff, missing standards files, ADR cutoff.

2. **[indep] Add Vercel preview-ready wait helper** — Create `scripts/wait-preview-ready.sh <sha>`. Uses Vercel MCP `get_deployment` if available (via `gh` or direct call); falls back to `gh pr view <num> --json statusCheckRollup` polling. Exits 0 with preview URL on stdout when READY, exits 1 after 5min timeout. Acceptance: against a known-good staging SHA, script returns URL in <3min.

3. **[indep] Wire seed-via-CRUD playbook** — Append a section to `.claude/skills/ship/SKILL.md` titled "Seed-via-CRUD playbook". Table: cycle scope keyword → required fixtures → admin pages to walk. Examples: invoice/billing → create student → enroll → generate invoice; assessment/raport → create class → enroll students → enter scores. Acceptance: section exists, table covers at least 5 common scopes.

4. **[seq, depends 2,3] Add C+ preview-verify step to `/ship`** — Edit `.claude/skills/ship/SKILL.md`. New section "Step 3: Preview verification (C+)" inserted between current Step 2 (open PR) and current hand-off step. Algorithm: call `wait-preview-ready.sh`, then Chrome MCP login, then seed-via-CRUD per playbook, then walk Implementation-derived flows, then classify findings. Acceptance: section reads as runnable algorithm with explicit Chrome MCP tool names.

5. **[seq, depends 4] Add fix-loop orchestration to `/ship`** — Same file, new section "Step 4: Fix loop". Algorithm: while blockers > 0, edit code, commit `fix(<scope>): <one-line>` with hooks active, push, re-run Step 3. Every 3 iterations, AskUserQuestion to escalate. Acceptance: pseudocode shows the loop, escalation trigger, and clean-exit handoff.

6. **[indep] Add A-scope doc-staleness check to `/ship` preflight** — Same file, new check inserted into existing Preflight (between hooks check and cycle-doc check). Diff cycle Implementation against README portal table + CLAUDE.md file-structure + README ADR table. Hard-fail with `gh pr create` blocked + actionable diff printed. Acceptance: when README claims "Foo module" but cycle Implementation deletes the only Foo route, check fires with diff.

7. **[indep] Add harmony rule to CLAUDE.md** — Edit CLAUDE.md `One-File-Per-Cycle Rule` section. Add subsection "Superpowers skill output redirect": brainstorming/writing-plans must write into the active cycle doc's `## Context` / `## Spec` / `## Tasks`. Project rule overrides skill defaults. Reference: this cycle is the precedent. Acceptance: rule readable; new section is the canonical place for this constraint.

8. **[indep, depends 7] Archive legacy superpowers docs** — `git mv docs/superpowers/specs/* docs/archive/superpowers-legacy/specs/` and same for `docs/superpowers/plans/*`. Create `docs/archive/superpowers-legacy/README.md` with cutoff date (2026-05-13), reason ("pre-harmony, files written by skill before the project rule was added"), and instruction not to add new files here. Remove empty `docs/superpowers/` tree. Acceptance: `docs/superpowers/` empty or removed; archive README present.

9. **[seq, depends all above] Update README.md + CLAUDE.md** — README: update Setup/Workflow section to mention preview-verify step. CLAUDE.md: update `/ship` row in Workflow table and "Two-tier testing gates" section (add third tier: preview-verify). Acceptance: every behavior change in this cycle reflected in at least one of the two top-level docs.

10. **[seq, last] End-of-cycle gate + self-dogfood** — Run `npm run build && npx vitest run && npx playwright test`. Then run new `/audit-docs` command on this branch. Record both outputs in `## Verification` below. Then run `/ship` against this same cycle — it will exercise the new preview-verify loop on the doc-only PR (Chrome MCP smoke-walks README + CLAUDE.md changes only since this cycle has no UI surface). Acceptance: all gates green, audit-docs report appended.

## Implementation

- Subagent plan: this cycle is doc-heavy; tasks 3-6 all edit `.claude/skills/ship/SKILL.md` so cannot run in parallel — execute inline sequentially. T1, T2, T7 are truly independent (different files) but the savings are small at this scale, so execute inline in order.
- Between-task gate skipped per task for pure-docs/skill edits (no TS source touched). End-of-cycle gate (T10) is the single source of test signal.
- Task 1: Add `/audit-docs` standalone skill — created `.claude/skills/audit-docs/SKILL.md` — 8 checks (route count, portal pages, components, e2e specs, standards-table file existence, ADR 60d cutoff, File Structure paths, workflow refs); report written to active cycle doc Verification or stdout; read-only against git.

## Verification

- Task 1: between-task gate skipped (pure-docs/skill task — no TS or test files touched); manual lint of `.claude/skills/audit-docs/SKILL.md` confirms frontmatter valid + bash blocks syntactically correct.

## Ship Notes

<!-- filled by /ship:
- Migrations: none
- Env vars: none
- Rollback: revert PR
- Manual smoke: covered by preview-verify
-->
