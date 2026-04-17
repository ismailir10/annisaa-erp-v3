---
name: ship
description: Push a completed cycle to staging. For cto (Opus) sessions, pushes directly to staging. For product-builder (non-Opus) sessions, creates a feature branch and opens a PR to staging. Never touches main. Folds in git-workflow-and-versioning, ci-cd-and-automation, documentation-and-adrs, and shipping-and-launch from the upstream agent-skills plugin. Use after /build has completed all tasks in the current cycle doc.
disable-model-invocation: true
---

# /ship — push (direct or via PR)

You are shipping a completed cycle. `/build` has finished all tasks and filled `## Ship Notes`. This command pushes the code and stops — it **never** touches `main`.

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

## Step 2: Branch decision based on role

### Role = `cto` (Opus)

Push directly to `staging`:

```bash
# If on a feature branch, merge it into staging first (fast-forward only)
git checkout staging
git merge --ff-only <feature-branch>   # only if you were on a feature branch
git push origin staging
```

If you were already on `staging`, just:
```bash
git push origin staging
```

Print the Vercel preview URL reminder: staging auto-deploys to the project's preview URL within ~60s.

### Role = `product-builder` (non-Opus)

Open a PR instead. Never push to `staging` directly.

1. If current branch is `staging`, create a feature branch from HEAD and reset staging to its upstream:
   ```bash
   SLUG=$(basename docs/cycles/*.md | tail -1 | sed 's/^[0-9-]*//;s/\.md$//')
   FEAT_BRANCH="feat/$SLUG"
   git checkout -b "$FEAT_BRANCH"
   ```
   (If you were already on a feature branch, skip this step.)

2. Push the feature branch:
   ```bash
   git push -u origin "$FEAT_BRANCH"
   ```

3. Open a PR targeting `staging`:
   ```bash
   CYCLE_TITLE=$(head -1 docs/cycles/<current-cycle>.md | sed 's/^# *//')
   gh pr create \
     --base staging \
     --head "$FEAT_BRANCH" \
     --title "[$MODEL] $CYCLE_TITLE" \
     --body-file .github/pull_request_template.md \
     --label needs-cto-review \
     --label "model:$MODEL"
   ```

4. Edit the PR body to fill in the template fields from the cycle doc (Summary from Context, Model/Role from `.claude/session-role`, Gates checked off, cycle doc link).

5. Return the PR URL to the user.

## Step 3: Post-ship checklist

Print (don't execute — just remind the user):

- [ ] Check the Vercel preview deploy succeeded
- [ ] Smoke-test the feature on the preview URL (follow `## Ship Notes` instructions)
- [ ] For product-builder sessions: tag the PR for CTO review
- [ ] Staging → main promotion is a separate manual decision, not automated

## Rules

- **Never push to `main`.** Only humans merge staging → main.
- **Never bypass hooks** (`--no-verify`). GitHub branch protection should reject it anyway.
- **Role is authoritative.** If `.claude/session-role` says `product-builder`, you open a PR no matter what the user asks in chat. The user can change the role by editing the file, and `/ship` will pick it up next run.
- **Single source of truth.** Don't update README.md or CLAUDE.md in `/ship` — that's `/build`'s job via the cycle doc. `/ship` only moves bits, it doesn't author docs.
