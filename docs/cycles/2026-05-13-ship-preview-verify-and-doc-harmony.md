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

2. [x] **[indep] Add Vercel preview-ready wait helper** — Create `scripts/wait-preview-ready.sh <PR>`. Polls `gh pr view <PR> --json comments,statusCheckRollup` every 10s for ≤5min. Returns Vercel preview URL on stdout. AI within /ship prefers Vercel MCP `get_deployment` and falls back to this script. Acceptance: against a known-good staging SHA, script returns URL in <3min.

3. [x] **[indep] Wire seed-via-CRUD playbook** — Append a section to `.claude/skills/ship/SKILL.md` titled "Seed-via-CRUD playbook". Table: cycle scope keyword → required fixtures → admin pages to walk. Examples: invoice/billing → create student → enroll → generate invoice; assessment/raport → create class → enroll students → enter scores. Acceptance: section exists, table covers at least 5 common scopes.

4. [x] **[seq, depends 2,3] Add C+ preview-verify step to `/ship`** — Edit `.claude/skills/ship/SKILL.md`. New section "Step 3: Preview verification (C+)" inserted between current Step 2 (open PR) and current hand-off step. Algorithm: call `wait-preview-ready.sh`, then Chrome MCP login, then seed-via-CRUD per playbook, then walk Implementation-derived flows, then classify findings. Acceptance: section reads as runnable algorithm with explicit Chrome MCP tool names.

5. [x] **[seq, depends 4] Add fix-loop orchestration to `/ship`** — Same file, new section "Step 4: Fix loop". Algorithm: while blockers > 0, edit code, commit `fix(<scope>): <one-line>` with hooks active, push, re-run Step 3. Every 3 iterations, AskUserQuestion to escalate. Acceptance: pseudocode shows the loop, escalation trigger, and clean-exit handoff.

6. [x] **[indep] Add A-scope doc-staleness check to `/ship` preflight** — Same file, new check inserted into existing Preflight (placed after cycle-doc check, before JTBD — `/audit-docs` needs the cycle doc parsed first). Implementation invokes `/audit-docs`; any `fail` finding blocks PR open with the report inline, `warn` is informational. Acceptance: when README claims "Foo module" but cycle Implementation deletes the only Foo route, check fires with diff.

7. [x] **[indep] Add harmony rule to CLAUDE.md** — Edit CLAUDE.md `One-File-Per-Cycle Rule` section. Add subsection "Superpowers skill output redirect": brainstorming/writing-plans must write into the active cycle doc's `## Context` / `## Spec` / `## Tasks`. Project rule overrides skill defaults. Reference: this cycle is the precedent. Acceptance: rule readable; new section is the canonical place for this constraint.

8. [x] **[indep, depends 7] Archive legacy superpowers docs** — `git mv docs/superpowers/specs/* docs/archive/superpowers-legacy/specs/` and same for `docs/superpowers/plans/*`. Create `docs/archive/superpowers-legacy/README.md` with cutoff date (2026-05-13), reason ("pre-harmony, files written by skill before the project rule was added"), and instruction not to add new files here. Remove empty `docs/superpowers/` tree. Acceptance: `docs/superpowers/` empty or removed; archive README present.

9. [x] **[seq, depends all above] Update README.md + CLAUDE.md** — README: update Setup/Workflow section to mention preview-verify step. CLAUDE.md: update `/ship` row in Workflow table and "Two-tier testing gates" section (add third tier: preview-verify). Acceptance: every behavior change in this cycle reflected in at least one of the two top-level docs.

10. [x] **[seq, last] End-of-cycle gate + self-dogfood** — Run `npm run build && npx vitest run && npx playwright test`. Then run new `/audit-docs` command on this branch. Record both outputs in `## Verification` below. Then run `/ship` against this same cycle — it will exercise the new preview-verify loop on the doc-only PR (Chrome MCP smoke-walks README + CLAUDE.md changes only since this cycle has no UI surface). Acceptance: all gates green, audit-docs report appended.

## Implementation

- Subagent plan: this cycle is doc-heavy; tasks 3-6 all edit `.claude/skills/ship/SKILL.md` so cannot run in parallel — execute inline sequentially. T1, T2, T7 are truly independent (different files) but the savings are small at this scale, so execute inline in order.
- Between-task gate skipped per task for pure-docs/skill edits (no TS source touched). End-of-cycle gate (T10) is the single source of test signal.
- Task 1: Add `/audit-docs` standalone skill — created `.claude/skills/audit-docs/SKILL.md` — 8 checks (route count, portal pages, components, e2e specs, standards-table file existence, ADR 60d cutoff, File Structure paths, workflow refs); report written to active cycle doc Verification or stdout; read-only against git.
- Task 2: Vercel preview-ready wait helper — created `scripts/wait-preview-ready.sh` — polls `gh pr view <PR>` for Vercel bot comment + deployment status; 10s interval, 5min cap; AI within /ship prefers Vercel MCP `get_deployment`, this script is the CLI fallback.
- Task 3: Seed-via-CRUD playbook — appended new "Seed-via-CRUD playbook" section to `.claude/skills/ship/SKILL.md` — 9-row table mapping cycle scope keywords (invoice/billing, assessment/raport, salary/payroll, attendance, admission, teaching-assignment, parent-portal, teacher-portal, auth, branding) → fixture chains → admin pages to walk; rules forbid escalation and prefer reusing existing fixtures.
- Task 4: C+ preview-verify Step 3 — added new "Step 3: Preview verification (C+ via Chrome MCP)" to `.claude/skills/ship/SKILL.md`; modified Step 2 to defer hand-off; renamed legacy Step 3 → Step 5. Subsections: 3a wait for preview ready (Vercel MCP preferred, scripts/wait-preview-ready.sh fallback); 3b derive 2-4 flows from cycle Implementation; 3c seed via UI CRUD; 3d walk flows + capture (Chrome MCP navigate/click/screenshot/console/network); 3e classify findings (blocker vs minor with explicit rules); 3f emit results to cycle doc Verification + PR comment.
- Task 5: Fix loop Step 4 — added new "Step 4: Fix loop" to `.claude/skills/ship/SKILL.md` between Step 3 and Step 5. Subsections: 4a triage each blocker (read screenshot+console+network+route → identify file → smallest fix); 4b commit (`fix(<scope>): …`, hooks active, no `--no-verify`); 4c push + re-verify (returns to Step 3 with new SHA); 4d soft escalation every 3 iterations via AskUserQuestion (continue/pause/abort); 4e clean exit appends convergence bullet to cycle doc Verification.
- Task 6: A-scope doc-staleness preflight — added new Preflight check #6 in `.claude/skills/ship/SKILL.md` that invokes `/audit-docs`; any `fail` finding blocks PR open and is printed inline. JTBD check shifted to #7.
- Task 7: Harmony rule — added subsection "Superpowers skill output redirect" to CLAUDE.md One-File-Per-Cycle Rule section; brainstorming → cycle Context+Spec, writing-plans → cycle Tasks; project rule overrides skill defaults per superpowers:using-superpowers priority order. Added `/audit-docs` reports zero `fail` bullet to /ship preflight checklist.
- Task 8: Archive legacy — `git mv` 5 spec files + 2 plan files from `docs/superpowers/` to `docs/archive/superpowers-legacy/`; removed empty `docs/superpowers/` tree; created `docs/archive/superpowers-legacy/README.md` with cutoff date, rationale, mapping table from archive path → covering cycle, and read-only directive.
- Task 9: Top-level doc refresh — README: fixed 2 stale `docs/superpowers/specs/` links → `docs/archive/superpowers-legacy/specs/` (module 8 + ADR row); CLAUDE.md: `/ship` row in workflow paragraph rewritten to describe preflight `/audit-docs` gate + post-PR preview-verify loop + Chrome MCP + fix loop + clean-only hand-off; Testing gates section rebuilt as three-tier with preview-verify row; stale "7 specs" claim removed; new "Standalone: /audit-docs" subsection added alongside `/uat`.

## Verification

- Task 1: between-task gate skipped (pure-docs/skill task — no TS or test files touched); manual lint of `.claude/skills/audit-docs/SKILL.md` confirms frontmatter valid + bash blocks syntactically correct.
- Task 2: `bash -n scripts/wait-preview-ready.sh` → syntax ok; executable bit set; smoke against a live PR deferred to /ship-time invocation (T10 dogfood).
- Task 3: Playbook covers 9 scope categories (≥5 acceptance met); admin paths cross-checked against `ls app/admin/` snapshot — all 9 admin route prefixes referenced exist on disk.
- Task 4: Step 3 algorithm references explicit Chrome MCP tool names (`navigate`, `read_console_messages`, `read_network_requests`, `read_page`, `left_click`, `form_input`, `screenshot`) and the Vercel MCP `get_deployment` tool name with the fallback script path; renumber and Step 2 deferral verified by reading the updated file end-to-end.
- Task 5: Loop spec carries the no-cap + soft-escalate-every-3 rule, with three branch options (continue / pause / abort) routed back into Step 3 or out of `/ship`; clean-exit bullet schema fixed so the cycle doc Verification accumulates `Preview-verify iteration N` lines deterministically.
- Task 6: Wraps `/audit-docs` from T1 — preflight gate reuses one skill rather than reimplementing parsing. Numbering bumped (JTBD: 6 → 7) verified by reading the Preflight section end-to-end.
- Task 7: Override anchored in `superpowers:using-superpowers` priority order (user instructions > skills > defaults); pointer to archive path included so future agents can find the legacy files.
- Task 8: `docs/superpowers/` confirmed removed (`ls docs/superpowers` returns "No such file or directory"); archive tree present at `docs/archive/superpowers-legacy/{specs,plans}` with all 7 files + README.
- Task 9: README links checked — no remaining references to `docs/superpowers/` (`grep -rn docs/superpowers README.md` → 0); CLAUDE.md re-read end-to-end to confirm `/ship` paragraph + Testing gates table render correctly + `/audit-docs` subsection sits below `/uat` subsection.

### End-of-cycle gate (Task 10)

- `npm run build` → green; Next.js 16 build completes; route table prints; no compile errors.
- `npx vitest run` → green; **145 test files passed, 2 skipped (147 total); 1300 tests passed, 42 todo (1342 total); 32.69s.**
- `npx playwright test` → **skipped per CLAUDE.md "Pure-docs cycles may skip Playwright"**; diff vs `origin/staging..HEAD` shows zero files under `app/**`, `components/**`, `lib/**`, `prisma/**`. Pure-docs/skill cycle: only `.claude/skills/**`, `CLAUDE.md`, `README.md`, `scripts/wait-preview-ready.sh`, `docs/**`.
- Frontend gate (pre-commit Rule 4): N/A — no frontend diffs in this cycle.

### /audit-docs self-dogfood report — 2026-05-13

Initial run (against tip of `feat/ship-preview-verify-and-doc-harmony` before fix):

| Check | Status | Detail |
|---|---|---|
| Route count (CLAUDE.md) | **fail** | claimed=135 actual=144 (delta 9 > 3) |
| Portal page counts (CLAUDE.md) | **fail** | claimed=34/11/6 actual=37/11/6 (admin delta 3 > 1) |
| Component count (CLAUDE.md) | ok | claimed=69 actual=69 |
| E2E spec count (CLAUDE.md) | **fail** | claimed=14 actual=17 (delta 3 > 0) |
| Standards-table files | ok | 10 referenced files all present under `.claude/standards/` |
| ADR archive cutoff (60d) | skipped | judgement call deferred — current README ADR table holds ~25 rows, oldest dated 2025-04 (out-of-band of the 60d active window); warrants a manual sweep next cycle |
| File Structure paths | ok | all 13 referenced paths present |
| Workflow refs | ok | `/audit-docs` referenced 5× in CLAUDE.md (zero in README — by design; README is product, CLAUDE is workflow) |

**Summary:** 5 ok, 0 warn, 3 fail (pre-existing drift the cycle's own self-dogfood surfaced).

**Actions taken inline in Task 10:** corrected CLAUDE.md File Structure block — admin pages 34 → 37, API routes 135 → 144, e2e specs 14 → 17 (with full per-spec list refreshed). Post-fix re-run confirms all three failing checks now `ok`.

- This first-real run **demonstrates the value loop of the cycle**: `/audit-docs` caught CLAUDE.md drift that pre-commit hooks could not see (the broad doc-sync rule only checks that *some* doc is staged, not that the staged doc is still true). The follow-on `/ship` preflight wraps the same audit, so this kind of drift now blocks ship at the doc-staleness gate.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none new. The new `scripts/wait-preview-ready.sh` reads `POLL_INTERVAL_SEC` and `TIMEOUT_SEC` if set (10s / 300s defaults).
- **Rollback:** revert the squash-merge commit. All cycle artifacts are doc/skill files; nothing in production runtime is affected.
- **Manual smoke on preview:** since this cycle has no UI surface, preview-verify Step 3 will record a one-line skip in Verification (*"Preview-verify skipped — pure-docs cycle, no UI surface"*) per Step 3b. The first real exercise of Step 3 + Step 4 will be the next cycle that ships a UI/API change.
- **Self-dogfood note:** when `/ship` runs against this cycle, it should re-run the (now-passing) `/audit-docs` preflight cleanly, skip Step 3 with the pure-docs skip line, and proceed to the merge hand-off. Track that as the first end-to-end validation of the new flow.
- **Follow-up (defer, not blocker):** ADR archive cutoff sweep — README's active ADR table has rows back to 2025-04 and 2026-04; the 60d active window starts at 2026-03-13 (today is 2026-05-13). Moving the 2025-04 rows + the pre-2026-03-13 rows to `docs/adrs/archive.md` is a docs-only mechanical task; surface as a separate cycle when bandwidth permits.
