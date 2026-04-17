---
name: ship
description: Ship a completed cycle via PR. All roles open a PR from feat/* → staging and let CI auto-merge on green. Never pushes directly to staging or main. Supports `/ship --to-main` for CTO-initiated staging → main promotion. Folds in git-workflow-and-versioning, ci-cd-and-automation, documentation-and-adrs, and shipping-and-launch from the upstream agent-skills plugin. Use after /build has completed all tasks in the current cycle doc.
disable-model-invocation: true
---

# /ship — open a PR, let CI auto-merge

You are shipping a completed cycle. `/build` has finished all tasks and filled `## Ship Notes`. This command opens a PR and enables auto-merge — GitHub merges it when required CI checks pass. No direct pushes to `staging` or `main`, ever — the `pre-push` hook would reject them and so would branch protection.

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

## Step 1: Re-run gates

Belt-and-suspenders. `/build` already ran these, but a final run on the exact commit being shipped catches drift:

```bash
npm run build && npx vitest run
```

If either fails, stop and hand back to the user.

## Step 2: Open the PR (same flow for every role)

Every role opens a PR from `feat/*` → `staging`. Auto-merge is enabled so the PR merges itself when the four required CI checks (`build`, `typecheck`, `test`, `e2e`) go green.

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

3. Open the PR to `staging`:
   ```bash
   CYCLE_FILE=$(ls -t docs/cycles/*.md | head -1)
   CYCLE_TITLE=$(head -1 "$CYCLE_FILE" | sed 's/^# *//')
   MODEL=$(grep '^model=' .claude/session-role | cut -d= -f2-)
   ROLE=$(grep '^role=' .claude/session-role | cut -d= -f2-)
   gh pr create \
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
     --label "model:$MODEL"
   ```

4. Enable auto-merge so it merges when CI is green:
   ```bash
   gh pr merge --auto --squash --delete-branch
   ```
   If `gh` reports auto-merge is not enabled on the repo, stop and tell the user to enable it in repo settings (Settings → General → Pull Requests → Allow auto-merge). Do not fall back to a direct push.

5. Return the PR URL to the user and print: *"PR opened with auto-merge. It will squash-merge when all required checks pass. Staging auto-deploys to the Vercel preview within ~60s of merge."*

## Step 3: Post-ship checklist

Print (don't execute — just remind the user):

- [ ] PR auto-merges when CI passes — watch `gh pr checks <number>` if you want live status
- [ ] Once merged, check the Vercel preview deploy on staging succeeded
- [ ] Smoke-test the feature on the preview URL (follow `## Ship Notes` instructions)
- [ ] Staging → main promotion is a separate `/ship --to-main` call, CTO-initiated

## Rules

- **No direct pushes to `staging` or `main`, ever.** The `pre-push` hook and GitHub branch protection both reject them. All shipping is PR-based.
- **Never bypass hooks** (`--no-verify`). GitHub branch protection would reject it anyway.
- **Auto-merge is the contract.** Don't manually merge the PR. Let CI gate it.
- **Single source of truth.** Don't update README.md or CLAUDE.md in `/ship` — that's `/build`'s job via the cycle doc. `/ship` only moves bits, it doesn't author docs.
