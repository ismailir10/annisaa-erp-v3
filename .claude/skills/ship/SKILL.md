---
name: ship
description: Ship a completed cycle via PR. All roles open a PR from feat/* → staging and print a two-command hand-off so the user can watch CI and merge manually when green. Never pushes directly to staging or main. Supports `/ship --to-main` for CTO-initiated staging → main promotion. Folds in git-workflow-and-versioning, ci-cd-and-automation, documentation-and-adrs, and shipping-and-launch from the upstream agent-skills plugin. Use after /build has completed all tasks in the current cycle doc.
disable-model-invocation: true
---

# /ship — open a PR, hand off to the user for manual merge

You are shipping a completed cycle. `/build` has finished all tasks and filled `## Ship Notes`. This command opens a PR and stops — the user watches CI and merges manually when all checks are green. No direct pushes to `staging` or `main`, ever — the `pre-push` hook rejects them.

> **Why manual merge:** GitHub branch protection enforces PR + required checks, but the final merge stays human-owned. `/ship` handles gates, PR creation, and preview verification; the author watches CI and merges only when the protected checks are green.

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
6. **Doc-staleness check (A-scope, blocking).** Invoke `/audit-docs` against the current branch. Treat any `fail` finding in the produced report as a `/ship` precondition failure — print the failing rows and tell the user:

   ```
   /ship precondition failed: /audit-docs reports N stale claim(s) in
   README.md or CLAUDE.md that contradict the current cycle.

   Fix the listed docs (or, for a numeric drift that the cycle introduced,
   update the relevant claim) and commit the change to the cycle branch
   before re-running /ship. Use `--no-verify` is forbidden.
   ```

   Treat `warn` findings as informational — print them but do not block. Cycle doc Verification already records the `/audit-docs` output if `/build` ran it as part of the end-of-cycle gate (Task 10); this preflight invocation reruns the same audit to catch any drift since.

7. **JTBD library fresh?** If this cycle added, removed, or changed user-facing capabilities (check `## Implementation` for portal pages/API changes), confirm `docs/uat/jobs/<portal>.md` was updated by `/build`. If not, warn the user — the `/uat` library may be stale.

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

**1c. Soft-skip + DEMO_MODE-skip delta check** (catches new vacuous-green tests landing on the ship gate). A test that 100%-skips in CI exists only to inflate the green-tick count; once accumulated, the suite looks healthy while losing coverage. This check counts the soft-skip + DEMO_MODE-gate occurrences on the current branch and against `origin/staging`. Existing skips are grandfathered (they may be load-bearing in ways the audit cannot see); only the **delta** blocks `/ship`.

```bash
git fetch origin staging --quiet

# Count soft-skip + DEMO_MODE-gate occurrences in test files only.
# Patterns matched:
#   - test.skip(true,  / it.skip(true,  / describe.skip(  — Playwright
#     and vitest static skips that resolve to "always skip" in CI
#   - test.skip()  — Playwright no-arg always-skip form (terse evasion
#     path: a future author could vacuously green a test with one line)
#   - test.skip($  / it.skip($  — multi-line invocations where the
#     condition lives on the next line (catches dynamic env-conditional
#     skips like `test.skip(\n  !SUPABASE_ENV_READY,\n  "preview-verify
#     covers this surface"\n);` — same anti-pattern as DEMO_MODE-gated
#     skips, missed by the literal-arg patterns above. Tradeoff: also
#     matches multi-line `test.skip(true, ...)` and multi-line
#     `test.skip(!seedFixture, ...)` — those are grandfathered (counted
#     in the baseline) and the delta-only rule still blocks growth.
#   - process.env.DEMO_MODE === "true"  — gate that always fires in CI
#     (CI sets DEMO_MODE=true), often paired with test.skip(...)
#
# Known gaps (NOT caught by this regex — possible future evasion paths):
#   - test.skip(callback, reason) — top-of-file/describe predicate form,
#     e.g. test.skip(({ browserName }) => browserName !== 'webkit', '…').
#     Hard to distinguish via regex from legitimate single-test gates.
#     If a PR adds this pattern, reviewer must catch it manually.
#   - Custom-named env-conditional helpers that evaluate to false in CI
#     but aren't named in `!ALL_CAPS` form — e.g. `test.skip(notReady,…)`
#     where `notReady` is a variable. The line ends with a non-EOL char
#     so `test\.skip\($` misses it.
#
# Both sides use `git grep -c` so the file set + path resolution are
# symmetric (mixing filesystem grep with `git grep` against a ref
# produces a method-asymmetric delta — files that exist only in one
# tree would silently miscount). `:(glob)` pathspecs restrict to test
# files so source files that legitimately branch on DEMO_MODE (e.g.
# `lib/xendit/client.ts`) are not counted.
SKIP_REGEX='test\.skip\(true,|it\.skip\(true,|describe\.skip\(|process\.env\.DEMO_MODE === "true"|test\.skip\($|it\.skip\($|test\.skip\(\)'
PATHSPECS=':(glob)**/*.test.ts :(glob)**/*.test.tsx :(glob)**/*.spec.ts :(glob)**/*.spec.tsx'

CURRENT_SKIPS=$(git grep -cE "$SKIP_REGEX" HEAD -- $PATHSPECS 2>/dev/null \
  | awk -F: '{s+=$NF} END {print s+0}')
BASE_SKIPS=$(git grep -cE "$SKIP_REGEX" origin/staging -- $PATHSPECS 2>/dev/null \
  | awk -F: '{s+=$NF} END {print s+0}')

echo "Soft-skip + DEMO_MODE-skip delta vs origin/staging:"
echo "  baseline=$BASE_SKIPS  current=$CURRENT_SKIPS  delta=$((CURRENT_SKIPS - BASE_SKIPS))"

if [ "$CURRENT_SKIPS" -gt "$BASE_SKIPS" ]; then
  echo ""
  echo "/ship precondition failed: this branch introduces $((CURRENT_SKIPS - BASE_SKIPS))"
  echo "new soft-skip / DEMO_MODE-gate test(s). Skipped tests in CI = vacuous"
  echo "green — they exist only to inflate the green-tick count."
  echo ""
  echo "Resolve one of:"
  echo "  - Convert the new skip into a hard assertion (preferred)."
  echo "  - Replace the test with one that actually exercises the surface."
  echo "  - If this is a legitimate WIP gate (e.g., describe.skip for an"
  echo "    undeployed feature), document it in the cycle doc's"
  echo "    ## Verification AND keep delta ≤ 0 by removing an equivalent"
  echo "    soft-skip in the same cycle. Existing legitimate skips are"
  echo "    grandfathered; the audit only blocks net growth."
  exit 1
fi
```

If the delta is positive, stop and hand back to the user. Do not open a PR on a regression-on-the-gate.

## Step 2: Open the PR (same flow for every role)

Every role opens a PR from `feat/*` → `staging`, then hands off to the user. The user watches CI and merges manually when all four required checks (`Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`) are green.

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
   # Product-builder PRs (opencode/glm) always require CTO review before merge.
   if [ "$ROLE" = "product-builder" ]; then
     gh pr edit "$PR_NUMBER" --add-label "needs-cto-review" || true
   fi
   ```

4. **Announce, then proceed to preview verification.** Do not print the merge hand-off here — that lives in **Step 5** after the preview-verify loop clears. Print one line so the user can follow the PR while verification runs:
   ```
   PR opened: $PR_URL — proceeding to preview verification (Step 3).
   ```
   Then fall through to **Step 3**. (For `--to-main`, skip Steps 3 and 4 entirely and go straight to Step 5: staging → main is already verified by the individual feat → staging PRs that built it.)

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

   Merge when all four required checks are green:
     gh pr merge $PR_NUMBER --squash
   ```
   Exit after printing. Do not proceed past Step 2. The CTO is responsible for waiting for green and running the merge command themselves.

## Step 3: Preview verification (C+ via Chrome MCP)

`/ship --to-main` skips this entire step — go to Step 5. For the default flow, run every check here before the merge hand-off in Step 5.

**Goal:** catch ugliness or bugs on the Vercel preview before the user merges. Headless Playwright in CI cannot exercise the preview because staging gates on Google sign-in; Chrome MCP can, because it operates the user's already-signed-in Chrome profile.

**Boundary with Playwright:** Playwright stays the deterministic CI regression gate and should remain lean: critical cross-module smoke flows only. Chrome MCP is the human-like preview gate: real browser profile, preview URL, console, network, screenshots, and visual/interaction judgment. Do not replace Playwright with Chrome MCP as the only gate; use Chrome MCP to catch environment/auth/layout issues that deterministic CI cannot replay.

### 3.0 Harness capability gate (who runs this step)

Preview-verify requires **Chrome MCP** with the three portal Google accounts (`.claude/verify-accounts.json`) signed into the profile. Route by the harness in `.claude/session-role`:

- **Claude** — has Chrome MCP (`mcp__Claude_in_Chrome__*`). Proceed with Step 3 directly.
- **opencode** (`role=product-builder`) — **never self-verifies.** Every opencode PR requires CTO review, and opencode lacks the signed-in Chrome profile. Stop after Step 2 and print:
  ```
  PB ship: PR $PR_URL opened and labeled needs-cto-review.
  opencode does not run preview-verify — handing to a CTO harness (Claude/Codex)
  for Step 3 preview-verify + review before the merge hand-off.
  ```
  Add the `needs-cto-review` label (`gh pr edit $PR_NUMBER --add-label needs-cto-review`) and exit.
- **Codex** — if Codex's Chrome MCP is connected with the three accounts signed in, proceed. Otherwise hand the open PR to a Claude session for Step 3 and record in `## Ship Notes`: *"Preview-verify delegated to Claude — Codex lacks Chrome MCP profile."*

### 3a. Wait for preview ready

Prefer the Vercel MCP tool over the CLI fallback:

1. **Vercel MCP preferred:** call `mcp__2037f9b7-455d-46a1-965a-fe464b218823__get_deployment` with the feature branch (`$FEAT_BRANCH`) or the head SHA. Loop with 10s sleep until `state == READY` (or terminal-fail). Cap at 5 minutes. Capture `url` (the preview URL).
2. **CLI fallback:** `bash scripts/wait-preview-ready.sh $PR_NUMBER`. Exit 0 prints the URL on stdout.

If both fail after 5 minutes, stop and tell the user: *"Preview did not become ready in 5 minutes — investigate `vercel deployments list` or the Vercel dashboard."* Do not proceed.

### 3b. Derive flows from the cycle doc

Read the current cycle's `## Implementation` section. Extract every distinct page route, API route, or admin module referenced in task bullets. Build a flow list:

- **For each user-facing page** mentioned: open it, screenshot, verify primary CTAs render, click each visible primary CTA once, capture results.
- **For each admin module** mentioned: walk list → detail → edit → save, observing console + network at every step.
- **For each portal** mentioned (teacher/parent): switch demo identity (or sign in as the relevant user) and walk the same flow a real user would.

Cap the flow list at 2-4 per cycle. If `## Implementation` references >4 distinct surfaces, pick the highest-blast-radius ones (mutations > reads, portal > admin only if portal is touched, billing/payroll > everything else).

If the cycle is pure-docs (no `app/**`, `components/**`, `lib/**` in the staged diff between `origin/staging..HEAD`), **record a one-line skip** in the cycle doc Verification (*"Preview-verify skipped — pure-docs cycle, no UI surface"*), then go to Step 5.

### 3c. Seed via UI CRUD

For each flow, identify the fixtures it needs. Use the **Seed-via-CRUD playbook** table above to choose the admin pages to walk.

**Never call `/api/admin/seed` or `npx prisma db seed` against the preview.** Use Chrome MCP to create fixtures the same way a real user would — list page → "New" button → form → save.

Reuse existing fixtures where possible: list the admin entity first; only create what's missing.

### 3d. Walk flows + capture

For each flow, use Chrome MCP to:

1. `mcp__Claude_in_Chrome__navigate` — go to the page.
2. `mcp__Claude_in_Chrome__read_console_messages` — drain console; record errors + warnings separately.
3. `mcp__Claude_in_Chrome__read_network_requests` — capture all requests since last call; tag 4xx + 5xx.
4. `mcp__Claude_in_Chrome__get_page_text` or `read_page` — verify expected content is rendered.
5. For each interaction in the flow: `mcp__Claude_in_Chrome__left_click` / `form_input` / `navigate`, then re-read console + network.
6. `mcp__Claude_in_Chrome__screenshot` at each meaningful step (post-load, post-mutation). Save the screenshot path.

**Sign-in — role-scoped account.** Each portal is verified as its own real user. Read `.claude/verify-accounts.json` and pick the account matching the flow's portal:

| Flow / portal | Google account |
|---|---|
| admin (`/admin/**`) | `ismailir10@gmail.com` |
| teacher (`/teacher/**`) | `ismail10rabbanii@gmail.com` |
| parent (`/parent/**`) | `rightjet.hq@gmail.com` |

When the preview prompts for Google auth, use Chrome MCP to click the account picker and pick the **account for the portal under test** (sign out / switch account between portals so admin flows aren't walked as the parent identity, etc.). Do **not** type credentials — fail if that account is not already signed into the profile (surface to the user with `AskUserQuestion`). Accounts live in `.claude/verify-accounts.json` — read from there, never hardcode in a flow.

### 3e. Classify findings

For every observation, classify as **blocker** or **minor**.

**Blocker** — fix in Step 4:

- Any console message at severity `error` (red).
- Any HTTP response with status ≥ 500.
- A primary CTA click that produces no DOM change AND no network request within 2 seconds.
- A form submit that produces no network request.
- A screenshot showing visibly broken layout — overlapping text, content cut off the viewport, missing primary buttons, blank-page-where-content-expected.
- Navigation that loops back to sign-in unexpectedly.

**Minor** — PR comment, no fix attempt:

- Console warnings (yellow).
- 4xx responses on optional/probe endpoints (favicon, `/api/auth/session` on first paint, etc.).
- Copy nits, spacing nits the screenshot reveals but which do not break understanding.
- Performance observations that aren't covered by `/uat`.

### 3f. Emit results

After all flows are walked:

1. **Append to cycle doc `## Verification`** a sub-block:
   ```markdown
   - Preview-verify iteration N (<PREVIEW_URL>): flows=[...], blockers=N, minors=M
     - Screenshots: docs/cycles/screenshots/<slug>/iter-N/*.png
   ```
2. **If blockers > 0**, fall through to **Step 4** (fix loop). Do NOT post the minors-comment yet — wait until the fix loop converges.
3. **If blockers == 0 and minors > 0**, post a single PR comment via `gh pr comment $PR_NUMBER --body "<markdown>"`. Subject the comment with `[preview-verify]` so humans can filter. List minors with screenshots referenced.
4. **If blockers == 0**, go to **Step 5** (hand off).

## Step 4: Fix loop

Reached only when Step 3 reports blockers > 0. The cycle's branch is on `feat/<slug>`; this step pushes additional `fix(...)` commits to it until preview-verify is clean. **No iteration cap** — but soft-escalate to the user every 3 iterations.

### 4a. Triage each blocker

For each blocker observation captured in Step 3:

1. Read the screenshot + console message + network trace + the page route.
2. Identify the offending source file. Common shapes:
   - Console `error` referencing `app/...` or `components/...` → that file.
   - 5xx on `/api/<route>` → `app/api/<route>/route.ts` or the handler it imports.
   - Layout break → the page's `client.tsx` / the component it renders.
   - Broken interaction → wire up the missing handler / state update.
3. Bound the fix to the **smallest** change that turns the blocker green. Do not refactor adjacent code; do not "while I'm here" cleanups. The fix loop is not a place to redesign.

### 4b. Fix + commit

For each blocker (or grouped commit per file where multiple blockers share one file):

```bash
git add <files-touched>
git commit -m "$(cat <<EOF
fix(<scope>): <one-line description of what was broken on preview>

Found by preview-verify iteration $ITER. See cycle doc Verification.

Cycle: docs/cycles/<current-cycle>.md
EOF
)"
```

The `prepare-commit-msg` hook appends `Model-Trailer`, `Role`, `Co-Authored-By` automatically — do not include them in the HEREDOC.

**Hooks must pass.** Never use `--no-verify`. If `pre-commit` rejects the change (e.g., frontend gate, doc-sync), edit the staged set until it accepts — usually means staging the cycle doc with an updated Verification bullet.

Update the cycle doc's `## Verification` section with the iteration's findings before the commit so the doc-sync rule is satisfied and the iteration log is preserved.

### 4c. Push + re-verify

```bash
git push origin "$FEAT_BRANCH"
```

The push triggers a new Vercel preview build. Increment the iteration counter, then **return to Step 3** with the new commit SHA. Step 3a will wait for the new preview, 3b-3f will re-walk the same flows.

### 4d. Soft escalation every 3 iterations

After every third iteration that did NOT converge (i.e., Step 3 still reports blockers), pause the loop and use `AskUserQuestion`:

```
Preview-verify is on iteration $ITER and still reports $N blocker(s) on
PR #$PR_NUMBER ($PREVIEW_URL).

Summary of attempts:
  - Iter 1: fixed <X>; result <Y>
  - Iter 2: fixed <X>; result <Y>
  - Iter 3: fixed <X>; result <Y>

Current hypothesis: <one-line of what looks load-bearing>

Continue, pause for manual inspection, or abort the ship?
```

Answer routing:

- **Continue** → resume the loop (next iteration starts immediately).
- **Pause** → exit `/ship` and tell the user: *"Loop paused. Inspect $PREVIEW_URL manually. When ready, run `/ship` again — it will re-enter Step 3 against the current head."*
- **Abort** → exit `/ship` and tell the user: *"Aborted. The feat branch is at $FEAT_SHA with $ITER iterations of fixes. Use `git reset --hard origin/staging` to discard, or open the PR manually and continue investigation."* Do not auto-close the PR.

### 4e. Clean exit

When Step 3 returns `blockers == 0`, post the minors-comment (if any) and proceed to **Step 5**. Append a final `## Verification` bullet to the cycle doc:

```markdown
- Preview-verify converged on iteration N (clean): $ITER iteration(s), $TOTAL_FIX_COMMITS fix commit(s), final preview $PREVIEW_URL.
```

## Step 5: Hand off + post-ship checklist

Reached only when Step 3 exits clean (no blockers). Print the merge hand-off (deferred from Step 2) followed by the post-ship reminders:

```
PR opened: $PR_URL — preview verified clean over $ITER iteration(s).

Watch CI live:
  gh pr checks $PR_NUMBER --watch

Merge when all four required checks are green:
  gh pr merge $PR_NUMBER --squash --delete-branch

Staging auto-deploys to the Vercel preview within ~60s of merge.
```

Then print the post-ship checklist (don't execute — just remind the user):

- [ ] Wait for all four required checks green via `gh pr checks <number> --watch`, then run `gh pr merge <number> --squash --delete-branch` yourself
- [ ] Once merged, check the Vercel preview deploy on staging succeeded
- [ ] Smoke-test the feature on the preview URL (follow `## Ship Notes` instructions)
- [ ] Reclaim disk + reduce next-session noise: `bash scripts/cleanup-merged.sh --yes` from the main checkout. Removes the worktree + local branch for any feat/* PR that was squash-merged. SessionStart already prints the same candidates in `--report` mode on every new session.
- [ ] Staging → main promotion is a separate `/ship --to-main` call, CTO-initiated

## Seed-via-CRUD playbook

Reference for the preview-verification step. When the cycle's flows need fixtures, the AI uses Chrome MCP to create them **through the admin UI** — never via `/api/admin/seed` or direct DB writes. The table below maps cycle scope (keyword in the cycle's `## Implementation` section) to the fixture chain.

| Cycle scope keyword(s) | Fixtures needed (in order) | Admin pages to walk |
|---|---|---|
| `invoice`, `billing`, `fee`, `xendit`, `payment` | academic year → fee structure → student → guardian → enrollment → invoice | `/admin/academic` → `/admin/fees` → `/admin/students` → `/admin/guardians` → `/admin/enrollments` → `/admin/invoices` |
| `assessment`, `raport`, `score`, `grade`, `curriculum` | academic year → class → curriculum → student → enrollment → assessment session → score | `/admin/academic` → `/admin/curriculum` → `/admin/students` → `/admin/enrollments` → `/admin/assessments` |
| `salary`, `payroll`, `employee` | employee → position → salary structure → payroll run | `/admin/(hr)/employees` → `/admin/(hr)/positions` → `/admin/(hr)/salary` → `/admin/(hr)/payroll` |
| `attendance`, `journal` | academic year → class → student → enrollment → attendance entry | `/admin/academic` → `/admin/students` → `/admin/enrollments` → `/admin/student-attendance` (or `/admin/student-journal`) |
| `admission`, `applicant`, `daftar` | open admission cycle → applicant submission → decision | `/admin/admissions` (admin) + public `/daftar` (applicant flow if cycle touches the public path) |
| `teaching-assignment`, `homeroom` | teacher employee → academic year → class → assignment | `/admin/(hr)/employees` → `/admin/academic` → `/admin/teaching-assignments` |
| `parent`, `parent-portal`, `household` | guardian → student → enrollment → invoice or attendance (whichever the flow exercises) | `/admin/guardians` → `/admin/students` → `/admin/enrollments` → [domain page] |
| `teacher`, `teacher-portal` | teacher employee → teaching assignment → class roster | `/admin/(hr)/employees` → `/admin/teaching-assignments` → walk teacher portal |
| `auth`, `role`, `permission`, `super-admin`, `school-admin` | (no fixtures — switch active demo identity via the demo-role picker) | demo-role picker in admin shell header |
| `branding`, `design-system`, `theme`, `voice` | (no fixtures — visual / copy verification only) | walk pages mentioned in Implementation directly |

**Rules**

- **Use existing fixtures where possible.** Re-running the chain on every iteration is wasteful — check the admin lists first; only create what's missing.
- **Clean up on a clean-pass loop only when the cycle's scope is destructive** (e.g., a soft-delete cycle); otherwise leave fixtures in place — they aid the next cycle's preview-verify.
- **Never escalate scope.** If the playbook for the cycle's scope keyword doesn't exist, fall back to: walk every admin page mentioned in `## Implementation`, create minimum fixtures inline. Do not invent new fixture chains.
- **Authoritative source on entities.** When the chain references entities not yet documented here, consult `prisma/schema.prisma` for required fields, never the CRUD form's optional fields.

## Rules

- **No direct pushes to `staging` or `main`, ever.** The `pre-push` hook rejects them locally; GitHub branch protection is the server-side boundary. All shipping is PR-based.
- **Never bypass hooks** (`--no-verify`).
- **Merge manually when CI is green.** `/ship` opens the PR and stops. You watch `gh pr checks <number> --watch`, wait for all four required checks to pass, then run `gh pr merge <number> --squash --delete-branch` yourself. Do not merge a PR with red or pending checks.
- **Keep server-side enforcement aligned.** `staging` and `main` must require PRs and these checks: `Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`. Local hooks are helpful, but GitHub protection is the real boundary.
- **Single source of truth.** Don't update README.md or CLAUDE.md in `/ship` — that's `/build`'s job via the cycle doc. `/ship` only moves bits, it doesn't author docs.
