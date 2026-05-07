---
name: ship
description: Ship a completed cycle via PR. All roles open a PR from feat/* → staging and print a two-command hand-off so the user can watch CI and merge manually when green. Never pushes directly to staging or main. Supports `/ship --to-main` for CTO-initiated staging → main promotion. Folds in git-workflow-and-versioning, ci-cd-and-automation, documentation-and-adrs, and shipping-and-launch from the upstream agent-skills plugin. Use after /build has completed all tasks in the current cycle doc.
disable-model-invocation: true
---

# /ship — open a PR, hand off to the user for manual merge

You are shipping a completed cycle. `/build` has finished all tasks and filled `## Ship Notes`. This command opens a PR and stops — the user watches CI and merges manually when all checks are green. No direct pushes to `staging` or `main`, ever — the `pre-push` hook rejects them.

> **Why manual merge:** this repo is private on GitHub's free plan, which does not support branch protection or "Allow auto-merge" (the API returns `403 Upgrade to GitHub Pro`). Server-side enforcement is therefore unavailable — see the Rules section for the enforcement-gap note. If the repo ever moves to Pro, revisit this skill to restore auto-merge.

## Invocation modes

- `/ship` — default. Opens PR `feat/<cycle>` → `staging`, then prints a two-command hand-off. All roles.
- `/ship --to-main` — CTO-initiated staging → main promotion. Opens PR `staging` → `main`, then prints a two-command hand-off. Only runs when `role=cto`; refuse otherwise with a one-line error. Use after 2–4 cycles have accumulated on staging, or when the user explicitly says "ship to prod".

If the user's message contains `--to-main`, jump to the **Step 2 (--to-main)** section below instead of the default Step 2.

## Preflight

1. **Session role set?** Read `.claude/session-role`. Extract `role=` and `model=`. If missing, stop.
2. **Worktree isolation?** Every session MUST work in a worktree. If you are in the main checkout (git-dir == git-common-dir), stop — you should have been in a worktree since `/spec`. Ask the user whether to continue in a fresh worktree (unusual mid-cycle) or abort.
3. **Hooks installed?** Check `.githooks/.installed`.
4. **Working tree clean?** If not, abort and tell the user to commit or stash.
5. **Cycle doc complete?** Find the most recent `docs/cycles/*.md`. Verify:
   - All tasks in `## Tasks` are checked.
   - `## Implementation`, `## Verification`, `## Ship Notes` are filled.
   If not, stop and tell the user to finish `/build`.
6. **JTBD library fresh?** If this cycle added, removed, or changed user-facing capabilities (check `## Implementation` for portal pages/API changes), confirm `docs/uat/jobs/<portal>.md` was updated by `/build`. If not, warn the user — the `/uat` library may be stale.

## Step 1: Re-run the end-of-cycle gate

**1a. Confirm `/build` recorded a Playwright pass.** Grep the current cycle doc's `## Verification` section for a line mentioning `playwright` (case-insensitive). If none is found, stop:

```
/ship precondition failed: cycle doc Verification section has no Playwright
pass recorded. Run the end-of-cycle gate in /build first
(npm run build && npx vitest run && npx playwright test) and commit the
updated Verification before calling /ship again.
```

**1b. Re-run the full gate on the exact commit being shipped** (belt-and-suspenders — catches drift since `/build` last ran):

```bash
npm run build && npx vitest run && npx playwright test
```

If any of the three fails, stop and hand back to the user. Do not open a PR on a broken commit.

## Step 2: Open the PR (same flow for every role)

Every role opens a PR from `feat/*` → `staging`, then hands off to the user. The user watches CI and merges manually when all four checks (`build`, `typecheck`, `test`, `e2e`) are green.

1. Ensure you are on a feature branch. If somehow on `staging`, create one from HEAD:
   ```bash
   CURRENT=$(git branch --show-current)
   if [ "$CURRENT" = "staging" ] || [ "$CURRENT" = "main" ]; then
     SLUG=$(ls -t docs/cycles/*.md | head -1 | xargs basename | sed 's/^[0-9-]*//;s/\.md$//')
     git checkout -b "feat/$SLUG"
   fi
   FEAT_BRANCH=$(git branch --show-current)
   ```

2. Push the feature branch:
   ```bash
   git push -u origin "$FEAT_BRANCH"
   ```

3. Open the PR to `staging` and capture its number:
   ```bash
   CYCLE_FILE=$(ls -t docs/cycles/*.md | head -1)
   CYCLE_TITLE=$(head -1 "$CYCLE_FILE" | sed 's/^# *//')
   MODEL=$(grep '^model=' .claude/session-role | cut -d= -f2-)
   ROLE=$(grep '^role=' .claude/session-role | cut -d= -f2-)
   PR_URL=$(gh pr create \
     --base staging \
     --head "$FEAT_BRANCH" \
     --title "[$MODEL] $CYCLE_TITLE" \
     --body "$(cat <<BODY
## Summary
$(awk '/^## Context/{flag=1; next} /^## /{flag=0} flag' "$CYCLE_FILE")

## Ship Notes
$(awk '/^## Ship Notes/{flag=1; next} /^## /{flag=0} flag' "$CYCLE_FILE")

Cycle: $CYCLE_FILE
Role: $ROLE
Model: $MODEL
BODY
)" \
     --label "model:$MODEL")
   PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
   ```

4. **Stop and hand off to the user.** Do not invoke `gh pr merge`. Print the PR URL followed by exactly these two commands, with the real PR number substituted:
   ```
   PR opened: $PR_URL

   Watch CI live:
     gh pr checks $PR_NUMBER --watch

   Merge when all four checks (build, typecheck, test, e2e) are green:
     gh pr merge $PR_NUMBER --squash --delete-branch

   Staging auto-deploys to the Vercel preview within ~60s of merge.
   ```
   Exit after printing. The user is responsible for waiting for green and running the merge command themselves.

## Step 2 (--to-main): promote staging → main

Only runs when the user invoked `/ship --to-main`. Skip the default Step 2 entirely.

1. **Role gate.** Read `role=` from `.claude/session-role`. If not `cto`, refuse:
   ```
   /ship --to-main is CTO-only. Current role is <role>. Abort.
   ```
   Do not proceed.

2. **Staging must be ahead of main.** Otherwise there is nothing to promote:
   ```bash
   git fetch origin main staging
   AHEAD=$(git rev-list --count origin/main..origin/staging)
   if [ "$AHEAD" = "0" ]; then
     echo "staging is not ahead of main — nothing to promote."; exit 0
   fi
   ```

3. **Summarize cycles being promoted.** Collect titles of every cycle doc merged since main diverged:
   ```bash
   CYCLES=$(git log --format='%s' origin/main..origin/staging -- docs/cycles/ | grep -oE 'docs/cycles/[^ ]+\.md' | sort -u)
   ```
   Fall back to `git log --format='- %s' origin/main..origin/staging` if no cycle files are referenced.

4. **Open the PR staging → main and capture its number:**
   ```bash
   MODEL=$(grep '^model=' .claude/session-role | cut -d= -f2-)
   PR_URL=$(gh pr create \
     --base main \
     --head staging \
     --title "[$MODEL] Promote staging → main ($AHEAD commits)" \
     --body "$(cat <<BODY
## Summary
Promoting $AHEAD commits from staging to main.

## Cycles included
$(echo "$CYCLES" | sed 's/^/- /')

## Commits
$(git log --format='- %s' origin/main..origin/staging)
BODY
)" \
     --label "model:$MODEL" \
     --label "promotion")
   PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
   ```

5. **Stop and hand off to the user.** Do not invoke `gh pr merge`. Print the PR URL followed by exactly these two commands, with the real PR number substituted. Note: no `--delete-branch` — `staging` is a permanent branch.
   ```
   staging → main PR opened: $PR_URL

   Watch CI live:
     gh pr checks $PR_NUMBER --watch

   Merge when all four checks (build, typecheck, test, e2e) are green:
     gh pr merge $PR_NUMBER --squash
   ```
   Exit after printing. Do not proceed past Step 2. The CTO is responsible for waiting for green and running the merge command themselves.

## Step 3: Post-ship checklist

Print (don't execute — just remind the user):

- [ ] Wait for all four CI checks green via `gh pr checks <number> --watch`, then run `gh pr merge <number> --squash --delete-branch` yourself
- [ ] Once merged, check the Vercel preview deploy on staging succeeded
- [ ] Smoke-test the feature on the preview URL (follow `## Ship Notes` instructions)
- [ ] **Update `## 18A. Phase Status` ledger** in `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md`. Match the cycle by exact-string equality on the `Slug` column (case-sensitive, no whitespace tolerance):
  - If a row exists with `status=shipped` for this slug → no-op (already rowed). Print `"already rowed — no-op"` and skip.
  - If a row exists with `status=next` for this slug → **UPDATE that row in-place**: fill `Merged` (today's `YYYY-MM-DD`), `PR` (`#<number>` from the PR URL), `Tip Commit` (squash commit short-sha — first 7 chars of the merge commit), `Status` (`shipped`). Do NOT append a new row.
  - If no row exists for this slug → **APPEND a new shipped row** at the bottom of the table.
  - Stage in a follow-up `chore(spec): update §18A row for <slug>` commit OR fold into the next cycle's first commit. The §18A ledger is the canonical ship-state surface (per CLAUDE.md Documentation Maintenance authority split); without this update, future `/spec` ground-truth checks see a stale ledger and may draft against a stale staging tip.
- [ ] Reclaim disk + reduce next-session noise: `bash scripts/cleanup-merged.sh --yes` from the main checkout. Removes the worktree + local branch for any feat/* PR that was squash-merged. SessionStart already prints the same candidates in `--report` mode on every new session.
- [ ] Staging → main promotion is a separate `/ship --to-main` call, CTO-initiated

## Rules

- **No direct pushes to `staging` or `main`, ever.** The `pre-push` hook rejects them — that hook is the only real safety net on this plan (see next bullet). All shipping is PR-based.
- **Never bypass hooks** (`--no-verify`).
- **Merge manually when CI is green.** `/ship` opens the PR and stops. You watch `gh pr checks <number> --watch`, wait for all four checks (build, typecheck, test, e2e) to pass, then run `gh pr merge <number> --squash --delete-branch` yourself. Do not merge a PR with red or pending checks — there is no server-side gate to catch that mistake.
- **Zero server-side enforcement on this plan.** This repo is private on GitHub free, which disables branch protection, required status checks, and "Allow auto-merge" (the API returns `403 Upgrade to GitHub Pro`). That means the only things preventing a broken merge are (a) the `pre-push` hook blocking direct pushes to `staging`/`main`, and (b) the CTO's discipline to wait for green CI before clicking merge. If the repo moves to GitHub Pro, revisit this skill to restore `gh pr merge --auto` and wire up required status checks.
- **Single source of truth.** Don't update README.md or CLAUDE.md in `/ship` — that's `/build`'s job via the cycle doc. `/ship` only moves bits, it doesn't author docs.
