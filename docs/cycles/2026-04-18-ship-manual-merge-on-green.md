# /ship — manual-merge-on-green (drop auto-merge)

## Context
This repo is private on GitHub's free plan, so branch protection and "Allow auto-merge" are unavailable — the API returns `403 Upgrade to GitHub Pro` on both. The previous cycle ([2026-04-18-workflow-audit-fixes.md](./2026-04-18-workflow-audit-fixes.md), shipped in [PR #56](https://github.com/ismailir10/annisaa-erp-v3/pull/56)) rewrote `/ship` to open a PR and call `gh pr merge --auto --squash --delete-branch`, which errors on this plan. The skill today therefore has a broken terminal step, and CLAUDE.md's workflow section still promises "auto-merged when CI passes." We need to switch `/ship` to a manual-merge-on-green flow: open the PR, hand the user two commands (watch checks, merge when green), and exit. This keeps the PR-for-all-roles contract while honoring the plan's actual capabilities. After this change, shipping has **zero server-side enforcement** — the `pre-push` hook (blocking direct pushes to `staging`/`main`) plus the CTO's discipline to wait for green CI are the only safety nets. That gap must be called out in the skill so future sessions do not assume otherwise.

## Spec
**Acceptance criteria:**
- [ ] `.claude/skills/ship/SKILL.md` contains zero `gh pr merge --auto` invocations (grep returns nothing)
- [ ] Default flow (`/ship`, feat/* → staging): after `gh pr create`, the skill prints a two-line hand-off (`gh pr checks <n> --watch` and `gh pr merge <n> --squash --delete-branch`) and stops — it does not execute either command
- [ ] `--to-main` flow (staging → main): same hand-off pattern, but the merge command omits `--delete-branch` (staging is permanent); role=cto gate stays
- [ ] Skill frontmatter `description:` no longer claims auto-merge
- [ ] Invocation header (`# /ship — …`) and intro paragraph no longer claim auto-merge
- [ ] Rules section replaces "Auto-merge is the contract" with a manual-merge rule, and adds an explicit "zero server-side enforcement" note that names the pre-push hook + CTO discipline as the only safety nets
- [ ] Step 3 post-ship checklist reflects manual merge (no "PR auto-merges when CI passes")
- [ ] `CLAUDE.md` lines that describe `/ship` auto-merge are rewritten to match (lines currently at 64, 65, 66, and 189 per grep)
- [ ] Between-task gate (`npm run build && npx vitest run`) passes on the final commit

**Non-goals:**
- Do **not** touch `/spec`, `/build`, `check-role.sh`, or any git hook
- Do **not** change the PR-for-all-roles model — both cto and product-builder still open PRs, never push direct
- Do **not** change `/ship` Step 1 (Playwright evidence check + full re-run gate) — that logic works regardless of merge model
- Do **not** delete the `origin/main..origin/staging` AHEAD check or the cycle summary in `--to-main`
- Do **not** add any CI/automation changes to compensate for lost auto-merge — out of scope
- Do **not** run Playwright for this cycle — the end-of-cycle gate is doc-only changes; vitest + build are sufficient. (See Assumptions.)

**Assumptions I'm making:**
1. The 3-step loop's end-of-cycle gate (`npm run build && npx vitest run && npx playwright test`) is still required by CLAUDE.md, but since this cycle touches only two markdown files (`.claude/skills/ship/SKILL.md` and `CLAUDE.md`) with zero runtime surface, running Playwright adds ~2 min for zero signal. I'll run the between-task gate (build + vitest) as the final gate and record the reasoning in Verification. If you want the full gate anyway, say so before `/build`.
2. The hand-off commands use `<number>` as a placeholder that `/ship` fills at runtime from `gh pr create`'s returned URL or number. I'll print them with the real number substituted so the user can copy-paste verbatim.
3. CLAUDE.md line 189 ("`/ship` auto-merge only proceeds when all CI checks pass…") lives in a paragraph about GitHub branch protection. I will rewrite the `/ship` sentence and leave the surrounding branch-protection discussion intact — branch protection is still the *aspirational* model documented for when the repo moves to Pro, it's just not active today.
4. No changes to `.github/pull_request_template.md` or `.github/workflows/*` are needed — those are orthogonal.
→ Correct me now or `/build` will proceed with these.

## Tasks

- [x] **Task 1 — Rewrite `/ship` default flow (Step 2, feat/* → staging).** Replace the `gh pr merge --auto --squash --delete-branch` block with: capture the PR number from `gh pr create` (e.g. via `--json number -q .number` or parsing the returned URL), then print a two-line hand-off:
  ```
  gh pr checks <number> --watch
  gh pr merge <number> --squash --delete-branch
  ```
  Exit after printing. Also update the success message to say "PR opened — merge manually when CI is green" instead of the current auto-merge text. *Acceptance: `grep 'pr merge --auto' .claude/skills/ship/SKILL.md` returns nothing from the default-flow section; the two hand-off lines appear with a real PR number placeholder; the skill does not invoke `gh pr merge` itself.*

- [x] **Task 2 — Rewrite `/ship --to-main` flow (Step 2 --to-main).** Same pattern as Task 1: keep the role=cto gate and the AHEAD check and the PR creation, but replace `gh pr merge --auto --squash` with the two-line hand-off (omitting `--delete-branch` since staging is permanent). Update the closing message. *Acceptance: `grep 'pr merge --auto' .claude/skills/ship/SKILL.md` returns nothing anywhere in the file; role=cto refusal text unchanged; hand-off merge command has no `--delete-branch`.*

- [x] **Task 3 — Rewrite skill description, header, intro, Step 3 checklist, and Rules.** Update the YAML frontmatter `description:` line, the `# /ship — …` heading, the opening paragraph, the Invocation modes bullets, and the Step 3 post-ship checklist so none of them reference auto-merge. In the Rules section, replace the "Auto-merge is the contract" bullet with a manual-merge rule ("Merge the PR yourself once all required checks are green — `/ship` stops after opening it"). Add a new Rules bullet that explicitly names the enforcement gap: *"Zero server-side enforcement on this plan. Branch protection and auto-merge require GitHub Pro. The `pre-push` hook (blocks direct pushes to `staging`/`main`) plus the CTO's discipline to wait for green CI before merging are the only safety nets. If the repo moves to Pro, revisit this skill."* *Acceptance: no remaining occurrence of "auto-merge" in SKILL.md; Rules section has an explicit enforcement-gap bullet.*

- [x] **Task 4 — Sync CLAUDE.md `/ship` description lines.** Rewrite the four occurrences of auto-merge language:
  - Line 64 (`**/ship**` paragraph): "…and merges manually once CI is green. Both `cto` and `product-builder` use this same flow — no direct pushes to `staging` or `main` for anyone."
  - Line 65: `` - `/ship` → PR feat/* → staging, merged manually by the author when CI passes ``
  - Line 66: `` - `/ship --to-main` → PR staging → main, merged manually by the CTO when CI passes (explicit ask only; CTO-initiated) ``
  - Line 189: rewrite the `/ship` sentence to describe manual merge; leave the surrounding paragraph about branch-protection *aspirations* intact but add a parenthetical clarifying that branch protection and auto-merge require GitHub Pro and are not active on this plan today.
  Update the "Last updated" date at the bottom of CLAUDE.md to `2026-04-18` with a short summary. *Acceptance: `grep -ni 'auto-merge\|auto-merged' CLAUDE.md` returns only lines that explicitly document the limitation (not lines that promise auto-merge behavior); "Last updated" bumped.*

- [x] **Task 5 — Final gate + commit.** Run `npm run build && npx vitest run` (Playwright skipped per Assumption 1 — doc-only changes, no runtime surface). Fill the cycle doc's Implementation + Verification sections. Commit all three files (cycle doc, SKILL.md, CLAUDE.md) in one commit — this is the last task, so one commit lands the whole cycle. *Acceptance: gate green; cycle doc sections filled; one commit on `feat/ship-manual-merge` carrying all three files with the standard Model-Trailer/Role footer appended by the prepare-commit-msg hook.*

## Implementation
- Task 1 — Rewrite default `/ship` flow — `.claude/skills/ship/SKILL.md` — captured `PR_URL` from `gh pr create` and parsed `PR_NUMBER` via `grep -oE '[0-9]+$'`; replaced the `gh pr merge --auto --squash --delete-branch` step with a print-and-stop block that shows `gh pr checks <number> --watch` and `gh pr merge <number> --squash --delete-branch` for the user to run manually.
- Task 2 — Rewrite `/ship --to-main` flow — `.claude/skills/ship/SKILL.md` — same pattern as Task 1 but merge command omits `--delete-branch` (staging permanent). Role=cto gate and AHEAD check unchanged.
- Task 3 — Skill description, header, intro, Step 3 checklist, Rules — `.claude/skills/ship/SKILL.md` — frontmatter description rewritten; `# /ship — open a PR, hand off to the user for manual merge` heading; added an explanatory blockquote about the GitHub free-plan limitation; invocation bullets updated; Step 3 checklist replaced "PR auto-merges" with the two-command user action; Rules section replaced the "Auto-merge is the contract" bullet with a "Merge manually when CI is green" bullet and added an explicit "Zero server-side enforcement on this plan" bullet naming pre-push hook + CTO discipline as the only safety nets.
- Task 4 — Sync CLAUDE.md — `CLAUDE.md` — rewrote lines 64–66 (`/ship` paragraph + two bullets) from "auto-merge" to "merged manually by the author/CTO when CI is green"; rewrote line 189 to describe manual merge and added a parenthetical noting that branch protection / auto-merge require GitHub Pro and are not active today; bumped "Last updated" to 2026-04-18 with a short summary.
- Task 5 — Final gate + commit — single commit on `feat/ship-manual-merge` carries the three files (cycle doc + SKILL.md + CLAUDE.md) with `Model-Trailer: claude-opus-4-7` and `Role: product-builder` appended by the `prepare-commit-msg` hook.

## Verification
- Acceptance greps: `grep 'pr merge --auto' .claude/skills/ship/SKILL.md` → 0 matches ✅; `grep -i 'auto-merge\|auto-merged\|--auto' .claude/skills/ship/SKILL.md` → only line 11 (explanatory blockquote) and line 184 (Rules enforcement-gap bullet) — both intentional documentation of the limitation, not promises of auto-merge behavior ✅; `grep -i 'auto-merge\|auto-merged' CLAUDE.md` → only line 189 (documenting the limitation) and line 625 ("Last updated" note) — no remaining promises ✅.
- Role gate on `/ship --to-main` preserved verbatim — visual diff check: the `if not cto, refuse` block is byte-identical.
- Step 1 (Playwright evidence check + full re-run gate) untouched — visual diff shows zero lines changed between the `## Step 1` heading and the `## Step 2` heading.
- End-of-cycle gate (per Assumption 1, Playwright skipped — changes are markdown-only with zero runtime surface): `npm run build` ✅ (build completed; full route tree printed); `npx vitest run` → **104/104 passed** in 6.88s across 12 test files ✅. Skipping Playwright saves ~2 min for a doc-only cycle; the next `/ship` call's Step 1a will reject any cycle that forgets to run Playwright when a real runtime surface changes, so this one-off skip is safely scoped to this cycle only.

## Ship Notes

**Scope:** Workflow-only. Two files changed plus this cycle doc: `.claude/skills/ship/SKILL.md` (rewrote Step 2 default + Step 2 --to-main + description/header/intro/Step 3/Rules) and `CLAUDE.md` (4 lines at 64–66 and 189, plus "Last updated" bump). No app code, no API, no schema, no migrations.

**Migrations:** None.

**New env vars:** None.

**Runtime impact:** None. Changes affect only future `/ship` invocations.

**Manual merge procedure going forward (print this in the PR description when shipping):**
1. `/ship` opens the PR and prints the two-command hand-off.
2. Run `gh pr checks <number> --watch` to follow CI live in the terminal.
3. When all four checks (`build`, `typecheck`, `test`, `e2e`) are green, run `gh pr merge <number> --squash --delete-branch` (omit `--delete-branch` for `/ship --to-main`).
4. Do **not** merge with red or pending checks — there is no server-side gate on the free plan.

**First-real-use validation:** This cycle is the first to consume the new behavior. When you `/ship` this PR, the skill should open the PR and exit with the two-command hand-off; confirm that behavior and that no `gh pr merge --auto` is attempted. If either is wrong, fix before merging.

**Rollback:** `git revert` the single commit for this cycle. SKILL.md and CLAUDE.md have no runtime coupling — revert is safe and immediate.

**Follow-up (not this cycle):** If/when the repo moves to GitHub Pro, re-enable `gh pr merge --auto --squash [--delete-branch]` in both flows, restore the "Auto-merge is the contract" rule, turn on branch protection with four required checks (`build`, `typecheck`, `test`, `e2e`) on `staging` and `main`, and update CLAUDE.md accordingly. The current `/ship` wording around "pre-push hook + CTO discipline are the only safety nets" should revert to the aspirational branch-protection language already in CLAUDE.md §4.
