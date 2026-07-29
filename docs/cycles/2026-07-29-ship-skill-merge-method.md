# `/ship --to-main` Merge Method — Skill Says Squash, Rule Says Merge

## Context

`.claude/skills/ship/SKILL.md` Step 2 (`--to-main`) printed a hand-off telling the CTO to merge the staging → main promotion with `gh pr merge $PR_NUMBER --squash`. That directly contradicts the rule the project learned the hard way: PR #381 squash-promoted 22 staging commits into a single new commit on main, git could no longer match main's history to staging's individual commits, the two branches permanently diverged, and the next promotion PR (#406) came up CONFLICTING on lockfiles/docs/components and had to be closed.

Caught on 2026-07-29 while running `/ship --to-main` for the `class-picker-year-scoping` cycle. That promotion ([PR #424](https://github.com/ismailir10/annisaa-erp-v3/pull/424)) was merged correctly with `--merge` — but only because the operator cross-checked the skill against memory. Anyone (or any harness) following the skill as written would have re-triggered the incident. A workflow file that contradicts a hard-won rule is worse than one that omits it: it actively instructs the wrong thing at the exact moment the operator is trusting the process instead of thinking.

Intended outcome: the skill and the canonical manual both state the promotion merge method explicitly, with the reason attached, so the next promotion is correct by default rather than by vigilance.

## Spec

### Acceptance criteria

- [x] `.claude/skills/ship/SKILL.md` Step 2 (`--to-main`) hand-off prints `gh pr merge $PR_NUMBER --merge`, not `--squash`.
- [x] The reason is stated where the command is, not only in a distant rules block — a squashed promotion stops staging being an ancestor of main.
- [x] The `## Rules` section carries an explicit "promotions merge, feature PRs squash" entry naming the #381 → #406 incident.
- [x] `CLAUDE.md`'s `/ship --to-main` sentence states the merge method (the manual is what Codex and opencode read via the `AGENTS.md` symlink).
- [x] Every other `--squash` in the file is left untouched — those are all `feat/* → staging`, where squash is correct.

### Non-goals

- Changing the `feat/* → staging` merge method. Squash is right there: a feature branch's intermediate commits are noise on staging.
- Adding automated enforcement (a hook or CI check that rejects a squashed promotion). Worth considering, but it would have to run server-side on `main`, which is a different and larger change.
- Reconciling the existing main/staging history. That was already done on 2026-07-22 via PRs #409 + #410.

### Assumptions

1. `--delete-branch` stays off promotions — `staging` is permanent. The skill already had this right.
2. The same merge-commit rule applies to reconcile PRs (`main → staging` back-merges), per the recorded incident notes.

## Tasks

1. [x] **Fix the Step 2 hand-off + Rules block.** Change the printed command to `--merge`, attach the reason inline, and add a Rules entry distinguishing promotion from feature merges. *Accept:* no `--squash` remains in any `--to-main`/promotion context; all four `feat/* → staging` occurrences unchanged.
2. [x] **State the method in CLAUDE.md.** Amend the `/ship --to-main` sentence so the canonical manual carries it too. *Accept:* CLAUDE.md names `--merge` for promotions; the `feat/* → staging` `--squash --delete-branch` earlier in the same sentence is untouched.

## Implementation

- Task 1: `.claude/skills/ship/SKILL.md` — Step 2 item 5 now prints `gh pr merge $PR_NUMBER --merge` under a "merge commit — NOT squash" label, and its preamble names both deliberate deviations from the feature flow (`--merge`, and no `--delete-branch`) with the divergence mechanism spelled out. Added a `## Rules` entry, "Promotions merge, feature PRs squash", citing #381 → #406. `.agents/skills/ship` is a symlink to this file, so Codex picks the change up with no second edit — per CLAUDE.md, `.agents/skills/*` must never be hand-edited.
- Task 2: `CLAUDE.md` — the `/ship --to-main` clause in § Per-command responsibilities now names `--merge` and why. `AGENTS.md` is a symlink to `CLAUDE.md`, so opencode and Codex inherit it.
- Verified by inspection that the four surviving `--squash` occurrences (SKILL.md lines ~475, ~477, ~498, ~541) are all `feat/* → staging`, plus one descriptive mention in the post-ship checklist about `cleanup-merged.sh` finding squash-merged feat branches. None touched.

## Verification

- `grep -n "squash" .claude/skills/ship/SKILL.md` — remaining hits are feature-flow only; zero in a promotion context.
- Docs-only cycle: no `app/**`, `components/**`, `lib/**`, or `prisma/**` in the diff. Per CLAUDE.md, **Playwright and preview-verify are both skipped** — recorded here explicitly as the rule requires. `npm run build` / `npx vitest run` are not meaningful gates for a change to a markdown workflow file and were not run; the required CI checks still gate the merge.
- Symlink integrity confirmed before committing: `.agents/skills/ship` → `.claude/skills/ship` and `AGENTS.md` → `CLAUDE.md`, so all three harnesses read the corrected text from a single edit.

## Ship Notes

No migrations, no env vars, no runtime impact — this cycle changes only workflow documentation read by the AI harnesses.

**Rollback:** revert the commit. Nothing to undo in any database or deployment.

**Follow-up worth considering (not done here):** nothing enforces the merge method server-side. GitHub branch protection on `main` can restrict the allowed merge methods to merge-commit only, which would make a squashed promotion impossible rather than merely documented-against. That is the durable fix; this cycle only closes the instruction gap.
