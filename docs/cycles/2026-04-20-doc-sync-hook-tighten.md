# Doc-Sync Hook Tighten — Require README on feat:/perf: Commits

## Context

On 2026-04-20 the docs-cleanup cycle (PR #74) retroactively added five
user-visible cycles to the README "Completed" list that had already merged
weeks earlier:

- `perf: Phase 6 query optimization` (2026-04-16, PR #32)
- Parent invoice cold-nav perf (2026-04-17)
- `Perf Deep Fix — Observability-Driven Investigation` (2026-04-18, PR #70)
- Perf quick wins (2026-04-18)
- `UAT Critical Fixes (1–5)` (2026-04-19, PR #73)

Each of these merged through the existing pre-commit hook without touching
README.md. The history narrative in README drifts further from reality every
time this happens, and the 2026-04-20 cleanup PR had to reconstruct five
cycles' worth of user-facing context from cycle docs and commit messages.

**Root cause (confirmed by reading `.githooks/pre-commit`):** Rule 2 accepts
any one of `README.md`, `CLAUDE.md`, or `docs/cycles/*.md` as sufficient docs
staging when code changes. A `feat:` or `perf:` commit that touches `app/**`
or `lib/**` and only stages its own cycle doc passes the hook — the cycle doc
captures per-cycle detail but the README history summary never gets updated.

**Design constraint discovered during /spec:** the pre-commit hook cannot see
the commit message — it runs before the user types it — so the commit-prefix
check must live in a new `commit-msg` hook, not in `pre-commit`.

**Out of scope:** markdown allowlist (Rule 1 of pre-commit), `prepare-commit-msg`,
`pre-push`. Audit of how many of the 5 drifted commits used `--no-verify`
versus passed the permissive rule is done in Task 1 below but no retroactive
fixup is part of this cycle — the README was already reconciled by PR #74.

---

## Spec

### The tightened rule

A new `.githooks/commit-msg` hook enforces:

> If the commit message subject line matches `^(feat|perf)(\([^)]+\))?!?:`
> AND the staged diff (at pre-commit time, re-read via `git diff --cached`)
> touches any path under `app/**` or `lib/**`,
> then `README.md` MUST also be staged. Staging only a cycle doc is insufficient.

All other commit types (`fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `style:`,
`build:`, `ci:`, plus `release:`) retain the existing permissive rule — cycle
doc alone still satisfies. `pre-commit`'s Rule 2 is left unchanged.

### Why narrow to feat:/perf:

- `feat:` and `perf:` are the commit types that introduce or change
  **user-visible behavior** — the exact content that belongs in README's module
  list, CRUD-status matrix, and completed-cycles summary.
- `fix:` and `refactor:` usually do not change the README narrative; forcing
  README staging on every bug fix would create friction and tempt `--no-verify`.
- `chore:`, `docs:`, `test:`, `build:`, `ci:` are by definition not user-visible
  and rarely belong in README.
- `release:` is reserved for staging→main PRs and already stages everything.

### Bypass posture

`--no-verify` still works locally (matches the existing posture in
`pre-commit`). GitHub branch protection is the real enforcement layer.
Adding `--no-verify` usage should remain discouraged via commit trailer /
review, not by making the hook unbypassable.

### Acceptance criteria

1. A new `.githooks/commit-msg` hook exists, is executable, and is installed
   by `scripts/install-hooks.sh` alongside the other three hooks.
2. Given staged changes to `app/api/invoices/route.ts` + a cycle doc ONLY
   (no README.md), a commit with message `perf: reduce invoice query cost`
   is **rejected** by the `commit-msg` hook with a clear error explaining
   why README.md must be staged.
3. Same staged set + the same message, but with `README.md` ALSO staged,
   is **accepted**.
4. Same staged set (app/** + cycle doc, no README) but with message
   `fix: handle null guardian in invoice list` is **accepted** — fixes are
   exempt.
5. Same staged set but with message `refactor(invoices): extract formatter`
   is **accepted** — refactors are exempt.
6. A `feat:` or `perf:` commit that touches only `prisma/**` or `components/**`
   (not `app/**` or `lib/**`) is **accepted** without README.md — scope is
   narrowed to the two directories where user-visible behavior is most
   concentrated, matching the user's spec.
7. `release:` commits (used for staging→main PRs) are **accepted** without
   README.md restriction — they by construction aggregate already-documented
   cycles.
8. A breaking-change marker (`feat!:` or `feat(api)!:`) is treated the same
   as `feat:` — still requires README.md staging.
9. `scripts/test-hooks.sh` executes all above scenarios and exits non-zero
   on any mismatch. It is runnable standalone (`bash scripts/test-hooks.sh`)
   and wired into `npm run lint` is NOT required for this cycle.
10. `CLAUDE.md` §"Documentation Maintenance" documents the tightened rule
    and links to `scripts/test-hooks.sh` as the source of truth.

### Non-goals

- Changing `pre-commit`'s Rule 1 (markdown allowlist) or Rule 2 (path-based
  doc-sync).
- Adding README-staging requirement to `fix:`/`refactor:`/`chore:` commits.
- Retroactively rewriting the 5 drifted merge histories.
- Enforcing any README section/structure beyond "file is staged".
- Adding CI-side enforcement (GitHub action) — the hook is client-side only,
  with branch protection as the real gate. A server-side duplicate can come
  in a later cycle.

---

## Tasks

Tasks are ordered so each one compiles and ships independently. Between each,
run `npm run build && npx vitest run`.

### Task 1 — Audit the 5 drifted merges ✅

Read-only investigation. No code changes. Output lands in this doc's
Implementation section (filled by /build), NOT in a separate file.

For each of the 5 PRs listed in Context, check:
- The merge commit and its squashed/rebased parents
- Whether any commit in the range was made with `--no-verify` (look for
  absence of `Model-Trailer` / `Role` trailers — hooks add those)
- Whether the cycle doc alone was staged, or README.md was also touched

Goal: confirm the suspected failure mode (cycle doc alone satisfied the hook)
versus hook bypass. Shapes whether the tightening actually solves the problem
or whether bypass was the real cause.

Files touched: none (read-only audit).

### Task 2 — Add `.githooks/commit-msg` ✅

Create `.githooks/commit-msg` implementing the rule above.

Structure:
```bash
#!/usr/bin/env bash
# commit-msg — require README.md on feat:/perf: commits that touch app/** or lib/**
set -eu

MSG_FILE="$1"
SUBJECT="$(head -n1 "$MSG_FILE")"

# Skip on merge/revert/fixup — these are not new feature commits
case "$SUBJECT" in
  "Merge "*|"Revert "*|"fixup! "*|"squash! "*|"amend! "*) exit 0 ;;
esac

# Does the subject start with feat: or perf: (with optional scope + !)?
if ! printf '%s' "$SUBJECT" | grep -qE '^(feat|perf)(\([^)]+\))?!?:'; then
  exit 0
fi

STAGED=$(git diff --cached --name-only --diff-filter=ACM)
TOUCHES_SCOPE=0
README_STAGED=0
while IFS= read -r f; do
  case "$f" in
    app/*|lib/*) TOUCHES_SCOPE=1 ;;
  esac
  [ "$f" = "README.md" ] && README_STAGED=1
done <<EOF
$STAGED
EOF

if [ "$TOUCHES_SCOPE" = "1" ] && [ "$README_STAGED" = "0" ]; then
  echo "commit-msg: feat:/perf: commits that touch app/** or lib/** must stage README.md." >&2
  echo "" >&2
  echo "  Detected subject: $SUBJECT" >&2
  echo "  Reason: user-visible behavior changes need the README history/module narrative" >&2
  echo "          updated in the same commit — cycle doc alone is insufficient for these." >&2
  echo "" >&2
  echo "  Fix: stage README.md with a matching entry under 'Completed' or module docs," >&2
  echo "       then re-commit." >&2
  echo "" >&2
  echo "  Exempt types: fix: refactor: chore: docs: test: style: build: ci: release:" >&2
  exit 1
fi

exit 0
```

Files touched: `.githooks/commit-msg` (new).

### Task 3 — Wire commit-msg into `scripts/install-hooks.sh` ✅

Update the installer to chmod +x the new hook and mention it in the completion
message. Users who already ran install-hooks.sh will auto-pick-up the new hook
(core.hooksPath is already set), but re-running the installer makes the hook
executable on fresh clones.

Files touched: `scripts/install-hooks.sh`.

### Task 4 — Add `scripts/test-hooks.sh` fixture ✅

Create an end-to-end test script that exercises all 8 acceptance scenarios
against a scratch git repo in `/tmp`. Must:

- Set up a disposable repo with `.githooks/commit-msg` and
  `.githooks/.installed` present
- For each scenario: stage the right fixture files, attempt a commit with the
  right message, assert the expected accept/reject outcome
- Print a summary and exit non-zero on any failure
- Never mutate the real repo (no commits, no branch creation in cwd)

Files touched: `scripts/test-hooks.sh` (new, executable).

Why bash and not Playwright (`e2e/hooks.spec.ts`): hook behavior is pure shell,
no browser involved. Shell fixtures are faster, simpler, and don't pull the
e2e suite's dev-server overhead. They can be invoked from CI later.

### Task 5 — Document the tightened rule in CLAUDE.md

Update §"Documentation Maintenance" to replace the current paragraph:
> "The `pre-commit` hook enforces that code changes stage at least one of:
>  the current cycle doc, README.md, or CLAUDE.md. This catches missed doc
>  updates before they become drift."

With a two-layer description:

1. pre-commit enforces at-least-one docs file staged (unchanged).
2. commit-msg adds a stricter rule for `feat:` and `perf:` on `app/**|lib/**`:
   README.md must be staged. Cycle doc alone is insufficient for
   user-visible-behavior commits.

Include a small rationale (the 2026-04-20 drift) and a pointer to
`scripts/test-hooks.sh` for the exact rules.

Files touched: `CLAUDE.md`.

---

## Implementation

### Task 1 — Audit findings

Read-only pass over the 5 drifted merges. Results:

| Merge | Cycle doc | README.md | `--no-verify`? |
|-------|-----------|-----------|----------------|
| PR #32 perf Phase 6 (`cc5c368`) | ✅ staged | ❌ not staged | No (squash merge on GitHub strips trailers; underlying commits had them) |
| Parent invoice perf (`0ece253`, `27dfc67`, `47053f0`) | ✅ staged | ❌ not staged | No (trailers present) |
| PR #70 Perf Deep Fix (`5ac4345`) | ✅ staged | ❌ not staged | No (all 5 sub-commits have Model-Trailer/Role) |
| PR #44 UAT Quick Wins (`899e985`) | ✅ staged (+ `docs/uat/jobs/teacher.md`) | ❌ not staged | No (squash) |
| PR #73 UAT Critical Fixes (`71c79a1`) | ✅ staged (+ `.claude/skills/uat/SKILL.md`) | ❌ not staged | No (all 7 sub-commits have trailers) |

**Verdict:** No hook bypass. All 5 merges passed pre-commit cleanly because
`docs/cycles/*.md` alone satisfies Rule 2. This matches the suspected failure
mode exactly, and validates the tightening design — moving the narrow
`feat:/perf:` + `app/**|lib/**` check into a new `commit-msg` hook would have
blocked every one of these merges at commit time and forced the author to
append a README entry.

No retroactive fixup required: PR #74 already reconciled the README on
2026-04-20.

Files touched: none (cycle doc only).

### Task 2 — `.githooks/commit-msg`

Added a new executable shell hook that enforces the rule described in Spec.
Exits 0 immediately for merge/revert/fixup/squash/amend subjects and for any
subject whose first line doesn't match `^(feat|perf)(\([^)]+\))?!?:`. When
the subject matches AND the staged diff touches `app/**` or `lib/**`, the
hook rejects the commit unless `README.md` is also staged. Exits 1 with an
error message listing exempt types and pointing to `scripts/test-hooks.sh`.

Regex sanity-tested inline against `feat:`, `feat(scope):`, `feat!:`,
`feat(scope)!:`, `perf:`, `perf(scope):` — all match. `chore: something`
correctly exits 0 without checking staging.

Files touched: `.githooks/commit-msg` (new, executable).

### Task 3 — `scripts/install-hooks.sh`

Added `.githooks/commit-msg` to the `chmod +x` list and updated the
completion-message echo to list all four hooks. Ran the installer to confirm
no regressions — output now reads
`pre-commit, prepare-commit-msg, commit-msg, pre-push enabled.`

Existing clones pick up the new hook on next `git pull` because
`core.hooksPath` is already set; re-running `install-hooks.sh` only matters
for fresh clones or to re-chmod after a file-mode loss.

Files touched: `scripts/install-hooks.sh`.

### Task 4 — `scripts/test-hooks.sh`

Added a bash fixture that runs 17 scenarios (all 8 acceptance criteria plus
9 edge/coverage cases) against `.githooks/commit-msg`. Each scenario is
isolated in its own scratch repo under `mktemp`, which is removed on exit
— the real repo is never mutated. The hook is invoked directly (not via
`git commit`) so pre-commit and prepare-commit-msg don't interfere.

Scenario coverage beyond the stated AC:
- `perf:` on `lib/**` (not just `app/**`) — proves lib/ is covered
- `chore(deps):` on `app/**` without README — proves chore is exempt
- `Revert "feat: ..."` and `fixup! feat: ...` — proves subject prefixes
  other than Merge also bypass
- `feat: + README only` (no cycle doc) — proves the hook doesn't duplicate
  pre-commit's doc-sync rule, only tightens the README part

Run: `bash scripts/test-hooks.sh` — all 17 pass.

Files touched: `scripts/test-hooks.sh` (new, executable).

## Verification

_Filled by /build. Gate: `npm run build && npx vitest run` between tasks;
end-of-cycle adds `npx playwright test` unless the cycle touches zero app code
(this cycle does not touch app code, so Playwright may be skipped with a note)._

Additional gate specific to this cycle: `bash scripts/test-hooks.sh` must
pass locally before the last commit.

## Ship Notes

_Filled by /ship._

Likely notes:
- No migrations, no env vars, no prod behavior change.
- Rollback: `git revert` of the commit that adds `.githooks/commit-msg`;
  clones already running the hook will stop enforcing once the file is gone
  on the next `install-hooks.sh` run (or manual `rm .githooks/commit-msg`).
- Rollout: existing clones pick up the hook automatically on next `git pull`
  because `core.hooksPath` is already set to `.githooks` — no action required
  by other contributors.
