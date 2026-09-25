---
name: ship
description: Ship a completed cycle via PR. Classifies the actual diff to select local verification or signed-in preview verification, then watches CI and self-merges once the selected verification route and all four required checks are green. Never pushes directly to staging or main. Use after /build has completed all tasks in the current cycle doc. `/ship --to-main` promotes staging → main and is user-initiated only — never invoke it yourself.
---

# /ship — verify the actual change, then merge it green

You are shipping a completed cycle. `/build` has finished all tasks and filled `## Ship Notes`. This command opens or continues a PR, selects the verification route from the actual diff, and merges once that route and all required checks are green. No direct pushes to `staging` or `main`, ever — the `pre-push` hook rejects them.

> **Merge gate:** GitHub branch protection enforces PR + four required checks. You may self-merge when the selected verification route is clean and all four checks are green — never on red or pending. Signed-in preview verification is required for auth-impacting or uncertain changes. If that route is required but this environment lacks signed-in browser access, leave the PR open with `needs-preview-verify` and continue any independent shipping work already authorized.

## Invocation modes

- `/ship` — default. Opens or continues PR `feat/<cycle>` → `staging`, classifies the actual diff, runs the required verification route, watches CI, and merges when green. This is the mode the cycle reaches on its own.
- `/ship --to-main` — staging → main promotion. Opens PR `staging` → `main`, then prints a two-command hand-off. **User-initiated only**: run it when the user says so, never as the tail of a cycle. Use after 2–4 cycles have accumulated on staging, or when the user explicitly says "ship to prod".

If the user's message contains `--to-main`, jump to the **Step 2 (--to-main)** section below instead of the default Step 2.

## Preflight

**Bind existing-PR work before the numbered preflight.** If continuing an authorized PR, resolve its number, base branch, head branch, and remote head SHA now; set `$FEAT_BRANCH` to that PR head branch. Confirm this isolated worktree is for that branch. If it is not, use the correct worktree and preserve any uncommitted work before switching; never discard it with a blind reset. Fetch the PR head branch. With a clean checkout, fast-forward only when local HEAD is behind and an ancestor of the remote head. If local HEAD is ahead, retain those commits for the normal Step 2 push; if it is dirty or diverged, stop and reconcile while preserving the work. Record the resolved PR metadata and compare the candidate diff from its base to local HEAD. Step 1 gates and route classification apply to this bound candidate; Step 2 later confirms the pushed remote PR diff.

1. **Session role set?** Read `.claude/session-role`. Extract `role=` and `model=`. If missing, stop.
2. **Worktree isolation?** Every session MUST work in a worktree. If you are in the main checkout (git-dir == git-common-dir), stop — you should have been in a worktree since `/spec`. Ask the user whether to continue in a fresh worktree (unusual mid-cycle) or abort.
3. **Hooks installed?** Check `.githooks/.installed`.
4. **Working tree clean?** If not, abort and tell the user to commit or stash.
5. **Cycle doc complete?** Find the most recent `docs/cycles/*.md` and set `CYCLE_FILE` to that path. Verify:
   - All tasks in `## Tasks` are checked.
   - `## Implementation`, `## Verification`, `## Ship Notes` are filled.
   - `## Implementation` opens with a `Subagent plan:` bullet. `/build` calls this mandatory, yet only 3 of the 15 cycles before 2026-09-17 had one — so check it here, the same way Step 1a checks Playwright status. If it is missing, stop and tell the user which cycle doc to fix. A bullet that invokes the "fan-out costs more than it saves" exception satisfies this, as long as it says so and says why.
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

7. **Claims match reality.** Apply **`superpowers:verification-before-completion`** to the cycle doc's `## Verification`: every gate it claims passed must have real output behind it. If a line was written from memory, from a prediction, or from a subagent's unverified report, re-run the command now and correct the doc before opening the PR.
8. **JTBD library fresh?** If this cycle added, removed, or changed user-facing capabilities (check `## Implementation` for portal pages/API changes), confirm `docs/uat/jobs/<portal>.md` was updated by `/build`. If not, warn the user — the `/uat` library may be stale.
9. **Select the verification route from the actual diff (blocking).** For a new PR, inspect `origin/staging...HEAD`; for an existing authorized PR, inspect that PR's base-to-head diff. Do not classify from the cycle doc alone. Record the compared head SHA and changed paths in cycle Verification. Choose exactly one route:
   - **Documentation-only:** every changed file is documentation content (for example Markdown under `docs/`, `CLAUDE.md`, or `.claude/skills/`). Any package manifest or lockfile, build/CI/config file, schema or migration, generated artifact, or runtime source makes this ineligible. Skip browser and database verification; CI still applies.
   - **Auth-impacting or uncertain:** changes to Google login, OAuth callback, session, cookies, auth guards, auth dependencies, or dependency behavior that may affect authentication require signed-in preview verification, even if demo mode passes. When impact is unclear, choose this route.
   - **Other code changes:** use local verification. For app behavior, run the app with demo auth and verify the changed flows in a browser against a disposable local Postgres database. For non-UI code, run the relevant local checks against disposable local services as needed. Demo auth alone does not satisfy the database part.
   Classify before checking browser-tool availability; route based on the required evidence, never on model or harness name. Re-run the selected route after every code or integration update. A commit that only records verification evidence or other documentation does not invalidate evidence for the recorded source SHA. Keep that source SHA distinct from the latest PR head, which is refreshed and pinned immediately before merge; do not claim evidence against a later code SHA.

## Step 1: Re-run the end-of-cycle gate

**1a. Confirm `/build` recorded Playwright status.** Grep the current cycle doc's `## Verification` section for a line mentioning `playwright` (case-insensitive). A local pass OR an explicit CI-deferral note (see 1b) both satisfy this. For a documentation-only route, an explicit note that the actual PR diff is documentation-only and local Playwright was skipped also satisfies this. If none is found, stop:

```
/ship precondition failed: cycle doc Verification section records no Playwright
status. Run the end-of-cycle gate in /build first
(npm run build && npx vitest run && npx playwright test) — or, if this harness
cannot run Playwright locally, record the CI-deferral note (see 1b) — and
commit the updated Verification before calling /ship again.
```

**1b. Re-run the gate on the exact commit being shipped** (belt-and-suspenders — catches drift since `/build` last ran).

**Always run the portable gate** — these execute in any harness environment:

```bash
npm run build && npx vitest run
```

If either fails, stop and hand back to the user. Do not open a PR on a broken commit.

**Playwright — local is best-effort; CI is the real gate.** The required CI check `Playwright E2E` runs on every PR and **blocks the merge** (Step 5: a CTO never merges unless it is green). Local Playwright is fast feedback, not the deterministic gate. For a documentation-only route, record the verified docs-only paths and skip the local run. Otherwise, attempt it:

```bash
npx playwright test
```

- **Runs, all pass** → proceed.
- **Runs, a test FAILS** → STOP. Real regression — do not open a PR on a red Playwright run. Hand back to the user.
- **Cannot execute in this harness's environment** — the run errors during *setup*, before tests execute: Playwright browsers not installed, staging-only `DATABASE_URL` unreachable from local, the known Turbopack `node_modules` symlink issue, or any CI-only dependency. Then **DEFER to CI**: skip the local run and record in the cycle doc `## Verification`:

  ```markdown
  - Playwright: local run deferred to CI (env cannot execute it — <reason>).
    Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.
  ```

  Deferral is **only** for environment-can't-run, never to dodge a known test failure. The merge guarantee holds because `Playwright E2E` is a required protected check.

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

## Step 2: Open the PR

Open a PR from `feat/*` → `staging`, or continue the existing authorized PR. The actual base-to-head diff determines verification; a cycle document by itself never determines the route. Merge requires a clean selected route and all four required checks (`Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`).

The `gh` commands below show the expected GitHub operations. Use an available connected GitHub tool when the CLI is unavailable, as long as it performs the same PR, label, check, comment, or merge operation; on merge pass the verified head as `expected_head_sha`. Never replace the PR flow with a direct push to a protected branch.

1. Ensure you are on a feature branch. If somehow on `staging`, create one from HEAD:
   ```bash
   CURRENT=$(git branch --show-current)
   if [ "$CURRENT" = "staging" ] || [ "$CURRENT" = "main" ]; then
     SLUG=$(ls -t docs/cycles/*.md | head -1 | xargs basename | sed 's/^[0-9-]*//;s/\.md$//')
     git checkout -b "feat/$SLUG"
   fi
   FEAT_BRANCH=$(git branch --show-current)
   ```

If continuing an existing authorized PR, reuse the metadata resolved before Preflight. Skip only PR creation; do not skip local commits or fixes. After Step 1, compare local HEAD with the resolved remote head. Push local commits normally to that PR's head branch if local HEAD is a clean descendant, then refresh PR metadata and confirm remote head equals the pushed SHA. If remote state changed unexpectedly, stop and reconcile without force-pushing. Reclassify the actual refreshed PR base-to-head diff before Step 3. Create a new PR only when none exists for this work.

2. Push the feature branch (new PR only):
   ```bash
   git push -u origin "$FEAT_BRANCH"
   ```

3. Open the PR to `staging` and capture its number (new PR only):
   ```bash
   CYCLE_FILE=$(ls -t docs/cycles/*.md | head -1)
   CYCLE_TITLE=$(head -1 "$CYCLE_FILE" | sed 's/^# *//')
   MODEL=$(grep '^model=' .claude/session-role | cut -d= -f2-)
   ROLE=$(grep '^role=' .claude/session-role | cut -d= -f2-)
   # Ensure the model label exists — gh pr create aborts if --label names a
   # missing label. Each new model id needs its label created once.
   gh label create "model:$MODEL" --color 5319E7 --description "Built by $MODEL" 2>/dev/null || true
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
   PR_HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)
   ```

4. **Announce, then run the selected verification route.** Do not print the merge hand-off here — that lives in **Step 5** after verification clears. Print one line so the user can follow the PR while verification runs:
   ```
   PR opened: $PR_URL — proceeding to <selected verification route> (Step 3).
   ```
   Then fall through to **Step 3**. A `/ship --to-main` invocation follows its own Step 2 and stops after opening the promotion PR and printing the hand-off; it does not enter Steps 3–5.

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
   PR_HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)
   ```

5. **Stop and hand off to the user.** Do not invoke `gh pr merge`. Print the PR URL followed by exactly these two commands, with the real PR number and captured head SHA substituted. Before merging, the user must refresh the PR head/base and confirm all four required checks have successful conclusions for that exact head; missing, skipped, cancelled, pending, neutral, or failed checks are not success. Two deviations from the `feat/* → staging` flow, both deliberate: **`--merge`, never `--squash`** (a squashed promotion collapses staging's commits into one new SHA on main, so git can no longer see staging as an ancestor and the two branches permanently diverge — this is what broke PR #381 → #406), and no `--delete-branch` (`staging` is a permanent branch).
   ```
   staging → main PR opened: $PR_URL

   Watch CI live:
     gh pr checks $PR_NUMBER --watch

   Merge only after confirming the current PR head/base and all four required checks are fresh and green (merge commit — NOT squash):
     gh pr merge $PR_NUMBER --merge --match-head-commit $PR_HEAD_SHA
   ```
   Exit after printing. Do not proceed past Step 2. The CTO is responsible for waiting for green and running the merge command themselves.

## Step 3: Run the selected verification route

Only the default `/ship` flow reaches this step. A `/ship --to-main` invocation stops at its own Step 2 after opening the promotion PR and printing the hand-off. For the default flow, complete the route selected in Preflight before Step 5.

**Goal:** verify the changed behavior at the level its risk requires. Record the source head SHA, route, exercised flows, and evidence in the cycle doc's `## Verification`.

**Boundary with Playwright:** Playwright remains a required deterministic CI regression gate. Local browser verification and signed-in preview verification supplement it; neither replaces the four protected CI checks.

### 3.0 Route and capability gate

Use the route from Preflight, which was selected from the actual PR diff:

- **Documentation-only:** confirm the PR diff contains documentation files only and record the changed paths plus compared head SHA; set `$VERIFIED_SHA` to that compared head. Skip browser and database verification; proceed to Step 4e to publish evidence. This skip is invalid if the diff includes any manifest, lockfile, build/CI/config, schema, migration, generated artifact, or runtime source.
- **Local:** for app behavior, run the app with demo auth and verify the changed flows in a browser using a disposable local Postgres database. Confirm the app's `DATABASE_URL` points to that local database. Scope `DEMO_MODE=true` to the app build/server process only; do not export it across Vitest, whose auth and payment unit assertions expect normal mode. In `next dev`, use the demo login picker. A local production build has an auth-login guard that returns 403 even with demo mode enabled; use the existing E2E fixture identity mechanism instead (for example, `context.addCookies` with the `school-erp-session` cookie and seeded local user IDs used by `e2e/admin-dashboard.spec.ts`). Limit those fixture cookies to `localhost`/`127.0.0.1` and the disposable local database. Never weaken the production auth guard or reuse these cookies on a preview or shared host. Walk the changed flow and capture rendered content, primary interactions, console messages, network responses, and screenshots. Classify findings using 3e. For non-UI code, run relevant local checks against disposable local services where needed. Record source SHA, flow list, findings, and evidence; proceed to Step 4e to publish evidence when clean.
- **Signed-in preview:** requires browser access to the user's current signed-in profile and the Vercel PR preview. Check available tools directly; do not infer capability from `model=`. If this environment cannot access that profile, keep the PR open, add `needs-preview-verify`, report the missing capability, and continue other independent PRs or queue items already authorized. Do not mark this route passed or merge it.

When the selected route passes, set `$VERIFIED_SHA` to the exact code head exercised by that route and include it in the cycle doc evidence.

If the PR already has `needs-preview-verify` and Preflight selects Local or Documentation-only, remove that label after recording the route and evidence. Add it only when signed-in preview is required and unavailable.

Signed-in preview is mandatory for changes to Google login, OAuth callbacks, sessions, cookies, auth guards, auth dependencies, or dependency behavior that can affect authentication. If uncertain, require signed-in preview even when demo auth works.

### 3a. Wait for preview ready (signed-in preview route only)

Prefer the Vercel MCP tool over the CLI fallback:

1. **Vercel MCP preferred:** call `mcp__2037f9b7-455d-46a1-965a-fe464b218823__get_deployment` with the feature branch (`$FEAT_BRANCH`) or the head SHA. Loop with 10s sleep until `state == READY` (or terminal-fail). Cap at 5 minutes. Capture `url` (the preview URL).
2. **CLI fallback:** `bash scripts/wait-preview-ready.sh $PR_NUMBER`. Exit 0 prints the URL on stdout.

If both fail after 5 minutes, stop and tell the user: *"Preview did not become ready in 5 minutes — investigate `vercel deployments list` or the Vercel dashboard."* Do not proceed.

### 3b. Derive flows from the actual diff (signed-in preview route)

Inspect the PR base-to-head diff first. Use the cycle's `## Implementation` section as context, not as the source of scope. Extract each changed user-facing route or auth flow and build a focused flow list:

- **For each user-facing page** mentioned: open it, screenshot, verify primary CTAs render, click each visible primary CTA once, capture results.
- **For each admin module** mentioned: walk list → detail → edit → save, observing console + network at every step.
- **For each portal** mentioned (teacher/parent): switch demo identity (or sign in as the relevant user) and walk the same flow a real user would.

Cap the flow list at 2-4 per cycle. If `## Implementation` references >4 distinct surfaces, pick the highest-blast-radius ones (mutations > reads, portal > admin only if portal is touched, billing/payroll > everything else).

If the PR diff has documentation files only, use the Documentation-only route in 3.0 and go to Step 4e to publish evidence. Do not infer a docs-only change from the absence of `app/**` or other UI paths; package, lock, build/CI/config, schema, migration, generated, and other non-doc files disqualify the skip.

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

**Sign-in — role-scoped account.** Each portal is verified as its own real user. Read `.claude/verify-accounts.json` (gitignored — copy it from `.claude/verify-accounts.example.json` if absent, and stop to ask the user for the accounts rather than guessing) and pick the account matching the flow's portal:

| Flow / portal | Google account |
|---|---|
| admin (`/admin/**`) | `ismailir10@gmail.com` |
| teacher (`/teacher/**`) | `ismail10rabbanii@gmail.com` |
| parent (`/parent/**`) | `rightjet.hq@gmail.com` |

When the preview prompts for Google auth, use Chrome MCP to click the account picker and pick the **account for the portal under test** (sign out / switch account between portals so admin flows aren't walked as the parent identity, etc.). Do **not** type credentials — fail if that account is not already signed into the profile (surface to the user with `AskUserQuestion`). Accounts live in `.claude/verify-accounts.json` — read from there, never hardcode in a flow.

### 3e. Classify findings (local browser and signed-in preview)

For every observation from the selected route, classify as **blocker** or **minor**.

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

After all flows are walked (or relevant local checks are complete):

1. **Append to cycle doc `## Verification`** a sub-block with the actual source SHA, route, flows, result, and evidence. For signed-in preview:
   ```markdown
   - Signed-in preview-verify source SHA <SHA>, iteration N (<PREVIEW_URL>): flows=[...], blockers=N, minors=M
     - Screenshots: docs/cycles/screenshots/<slug>/iter-N/*.png
   ```
   For Local, record `route=demo-auth browser + disposable local Postgres`, the changed flows, blocker/minor counts, command output, and screenshot paths. For Documentation-only, record the exact changed paths and compared source SHA.
2. **If blockers > 0**, fall through to **Step 4** (fix loop). Do NOT post the minors-comment yet — wait until the fix loop converges.
3. **If blockers == 0 and minors > 0**, post a single PR comment via `gh pr comment $PR_NUMBER --body "<markdown>"`. Subject the comment with `[preview-verify]` so humans can filter. List minors with screenshots referenced.
4. **If blockers == 0**, proceed to **Step 4e** to finalize, commit, and publish the evidence before Step 5.

## Step 4: Fix and re-verify loop

Reached only when the selected verification route reports blockers. The cycle's branch is on `feat/<slug>`; this step pushes additional `fix(...)` commits until the required route is clean. **No iteration cap** — but soft-escalate to the user every 3 iterations. After any code or integration update, rerun the selected route; documentation-only commits that merely record evidence do not invalidate evidence tied to its source SHA.

### 4a. Triage each blocker

For each blocker observation captured in Step 3 (local browser or signed-in preview):

1. Read the available evidence (browser screenshot, console/network trace, local command output, and changed flow).
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
LOCAL_HEAD_SHA=$(git rev-parse HEAD)
PR_HEAD_SHA=$(git ls-remote origin "refs/heads/$FEAT_BRANCH" | cut -f1)
if [ -z "$PR_HEAD_SHA" ] || [ "$PR_HEAD_SHA" != "$LOCAL_HEAD_SHA" ]; then
  echo "Remote PR head does not match the pushed local SHA; stop and resolve before verification."
  exit 1
fi
```

The push triggers CI and, for the signed-in preview route, a new Vercel preview build. Increment the iteration counter, then return to Step 3 and repeat the selected route against that code SHA. Step 3a-3f apply to signed-in preview; local verification repeats the same changed flows against the disposable local database. After the route passes, set `$VERIFIED_SHA=$PR_HEAD_SHA`. A later evidence-only documentation commit may advance the PR head without invalidating route evidence; Step 5 refreshes and pins the newer PR head after confirming no code or integration changed.

### 4d. Soft escalation every 3 iterations

After every third iteration that did NOT converge (i.e., Step 3 still reports blockers), pause the loop and use `AskUserQuestion`:

```
Verification route $VERIFICATION_ROUTE is on iteration $ITER and still reports
$N blocker(s) on PR #$PR_NUMBER (target: $VERIFICATION_TARGET).

Summary of attempts:
  - Iter 1: fixed <X>; result <Y>
  - Iter 2: fixed <X>; result <Y>
  - Iter 3: fixed <X>; result <Y>

Current hypothesis: <one-line of what looks load-bearing>

Continue, pause for manual inspection, or abort the ship?
```

Answer routing:

- **Continue** → resume the loop (next iteration starts immediately).
- **Pause** → exit `/ship` and tell the user: *"Loop paused. Inspect the verification target at $VERIFICATION_TARGET. When ready, run `/ship` again — it will re-enter the selected route against the current code head."*
- **Abort** → exit `/ship` and tell the user: *"Aborted. The feat branch is at $FEAT_SHA with $ITER iterations of fixes. Use `git reset --hard origin/staging` to discard, or open the PR manually and continue investigation."* Do not auto-close the PR.

### 4e. Clean exit and publish evidence

When the selected route returns no blockers, post a minors-comment only for signed-in preview findings. Ensure the applicable final `## Verification` bullet identifies `$VERIFIED_SHA`; keep already committed evidence and do not add a duplicate bullet:

```markdown
- Signed-in preview-verify passed for source SHA $VERIFIED_SHA on iteration N: $ITER iteration(s), $TOTAL_FIX_COMMITS fix commit(s), final preview $PREVIEW_URL.
- Local verification passed for source SHA $VERIFIED_SHA: route=demo-auth browser + disposable local Postgres (or relevant local checks), flows=[...].
- Documentation-only verification skipped for source SHA $VERIFIED_SHA: changed paths=[...]; no runtime files were in the PR diff.
```

Publish the verification record and any referenced screenshots that are tracked artifacts before Step 5. Stage the cycle doc and those screenshot files; if screenshots are outside the repository or ignored, use durable PR artifact links instead of temporary local paths. Commit and push only when this creates a non-empty change, using the resolved PR head branch, normal hooks, and never `--no-verify`:

```bash
git add "$CYCLE_FILE"
# Also stage each tracked screenshot artifact referenced by Verification, if any.
if ! git diff --cached --quiet; then
  git commit -m "docs(ship): record verification evidence"
  git push origin "$FEAT_BRANCH"
fi
LOCAL_HEAD_SHA=$(git rev-parse HEAD)
PR_HEAD_SHA=$(git ls-remote origin "refs/heads/$FEAT_BRANCH" | cut -f1)
if [ -z "$PR_HEAD_SHA" ] || [ "$PR_HEAD_SHA" != "$LOCAL_HEAD_SHA" ]; then
  echo "Remote PR head does not match the published evidence commit; stop before Step 5."
  exit 1
fi
```

An evidence-only commit does not require rerunning the route: retain `$VERIFIED_SHA` as the code SHA exercised. It triggers CI, so Step 5 must wait for and confirm all four required checks against the published `$PR_HEAD_SHA`. If evidence was already committed and pushed, do not create an empty duplicate commit. Do not enter Step 5 with uncommitted or unpublished changes.

## Step 5: Watch checks, refresh PR state, then merge

Reached only when the selected route in Step 3 is clean (or documentation-only was validly skipped) and Step 4e has committed and pushed its evidence. Require a clean working tree and local HEAD equal to the published PR head; otherwise publish the intended work through the normal route and repeat any affected checks. You now **actively watch CI and merge** once green — no hand-off to the user.

1. **Watch the required checks to completion:**
   ```bash
   gh pr checks "$PR_NUMBER" --watch
   ```
   This blocks until every check resolves.

2. **Confirm all four required checks succeeded for the current PR head** (`Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`). Refresh the current head SHA into `$PR_HEAD_SHA` (for example, `gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid`), and confirm each result applies to that SHA:
   ```bash
   gh pr checks "$PR_NUMBER"
   ```
   - Every required check must be present and have a successful conclusion for the current head SHA. Missing, skipped, cancelled, pending, neutral, or failed checks are not success.
   - **Any required check is not successful** → STOP. Do not merge. Report the check, diagnose and fix it, then re-run the selected verification route after code or integration changes.

3. **Refresh and pin the merge target.** Immediately before merging, fetch the current target base and refresh PR metadata and check results. Read the latest PR head SHA again. If it differs from the last verified code head (`$VERIFIED_SHA`), inspect the intervening diff: any code or integration change requires rerunning the selected verification route; documentation-only evidence commits preserve evidence tied to `$VERIFIED_SHA` but require all four checks to succeed on the newer head. Confirm the base is the expected target and current/up-to-date, then confirm all four successful check conclusions apply to the latest head. If the base moved or the PR is behind, wait for/update through the normal PR workflow and let required checks complete again. Set `$PR_HEAD_SHA` to this freshly checked head and use it as the merge precondition so a concurrent update cannot slip through.

4. **Merge** (squash, delete the feature branch):
   ```bash
   gh pr merge "$PR_NUMBER" --squash --delete-branch --match-head-commit "$PR_HEAD_SHA"
   ```

5. **Confirm post-merge staging deploy.** Staging auto-deploys within ~60s. Optionally re-check the staging URL via Chrome MCP for a final smoke. Print:
   ```
   Merged PR $PR_URL → staging (selected verification route + CI green). Staging deploying (~60s).
   ```

6. Then print the post-ship checklist below.

**Why self-merging is allowed:** the user approved the Spec before code was written, the selected verification route is clean, and all four protected checks are green. Never merge on red or pending.

**When signed-in preview is required but unavailable, do not reach this step.** Leave the PR open with `needs-preview-verify`; a capable environment can finish it:

```
gh pr checks $PR_NUMBER --watch
gh pr merge $PR_NUMBER --squash --delete-branch --match-head-commit $PR_HEAD_SHA
```

### Post-ship checklist

- [ ] Once merged, check the Vercel preview deploy on staging succeeded
- [ ] For auth-impacting changes verified on the PR preview, confirm the staging deploy and repeat the relevant signed-in smoke after merge. For local-route changes, check deployment health; a signed-in staging smoke is not a default gate.
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
- **Merge when the selected verification route and CI are green.** Watch `gh pr checks <number> --watch`; merge only after the route required by the actual diff is clean and all four required checks pass. Never merge on red or pending. Add `needs-preview-verify` only when signed-in preview is required but unavailable. Feature PRs use `--squash --delete-branch`; staging promotions use `--merge` and are user-initiated only.
- **Promotions merge, feature PRs squash.** `feat/* → staging` uses `--squash --delete-branch`. `staging → main` (and any reconcile PR) uses **`--merge`**, with no `--delete-branch`. Squashing a promotion rewrites staging's commits into a single new SHA on main, so staging stops being an ancestor of main and the branches diverge for good — PR #381 did exactly that and the next promotion (#406) came up CONFLICTING and had to be closed.
- **Keep server-side enforcement aligned.** `staging` and `main` must require PRs and these checks: `Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`. Local hooks are helpful, but GitHub protection is the real boundary.
- **Single source of truth.** Don't update README.md or CLAUDE.md in `/ship` — that's `/build`'s job via the cycle doc. `/ship` only moves bits, it doesn't author docs.
