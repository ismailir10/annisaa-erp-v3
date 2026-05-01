#!/usr/bin/env bash
# test-hooks.sh — fixture tests for .githooks/commit-msg + ADR-cell-length rule in .githooks/pre-commit
#
# commit-msg cases enforce docs/cycles/2026-04-20-doc-sync-hook-tighten.md.
# pre-commit ADR cases enforce docs/cycles/2026-05-01-readme-claude-md-simplify.md (Rule 6).
#
# Usage: bash scripts/test-hooks.sh
# Exit:  0 if all scenarios match expected outcome, 1 otherwise.
#
# Never mutates the real repo — all work is done in a mktemp'd directory that
# is removed on exit.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.githooks/commit-msg"
PRE_COMMIT_HOOK="$ROOT/.githooks/pre-commit"

if [ ! -x "$HOOK" ]; then
  echo "test-hooks: $HOOK not executable or missing" >&2
  echo "            run scripts/install-hooks.sh" >&2
  exit 1
fi
if [ ! -x "$PRE_COMMIT_HOOK" ]; then
  echo "test-hooks: $PRE_COMMIT_HOOK not executable or missing" >&2
  exit 1
fi

TMPDIR=$(mktemp -d -t school-erp-hooks-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

# Strip inherited git env so each case targets its own fresh repo
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR

PASS=0
FAIL=0
FAILED_NAMES=""

# run_case <name> <expect:accept|reject> <subject> [file1 file2 ...]
run_case() {
  local name="$1" expect="$2" subject="$3"
  shift 3
  local files=("$@")
  local casenum=$((PASS + FAIL + 1))
  local casedir="$TMPDIR/case-$casenum"

  mkdir -p "$casedir"
  (
    cd "$casedir"
    git init -q -b main >/dev/null 2>&1
    git config user.email "t@t"
    git config user.name "t"
    # Stage fixture files
    for f in "${files[@]}"; do
      local parent
      parent="$(dirname "$f")"
      [ "$parent" != "." ] && mkdir -p "$parent"
      printf 'x\n' > "$f"
      git add "$f"
    done
    # Write commit message
    printf '%s\n' "$subject" > .msg
    "$HOOK" .msg >/dev/null 2>&1
  )
  local exitcode=$?

  local outcome="accept"
  [ "$exitcode" != "0" ] && outcome="reject"

  if [ "$outcome" = "$expect" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name — expected $expect, got $outcome (exit $exitcode)"
    FAIL=$((FAIL + 1))
    FAILED_NAMES="$FAILED_NAMES\n    - $name"
  fi
}

echo ""
echo "Testing .githooks/commit-msg against spec scenarios..."
echo ""

# AC 2 — feat:/perf: on app/** or lib/** without README must reject
run_case "AC2  perf: + app/api + cycle-doc-only → reject" \
  reject "perf: reduce invoice query cost" \
  "app/api/invoices/route.ts" "docs/cycles/2026-04-20-x.md"

run_case "AC2b perf: + lib/ without README → reject" \
  reject "perf(parent-helpers): cache week window" \
  "lib/parent-helpers.ts" "docs/cycles/2026-04-20-x.md"

# AC 3 — same but with README.md staged must accept
run_case "AC3  perf: + app/api + README.md → accept" \
  accept "perf: reduce invoice query cost" \
  "app/api/invoices/route.ts" "docs/cycles/2026-04-20-x.md" "README.md"

# AC 4 — fix: is exempt
run_case "AC4  fix: + app/ without README → accept" \
  accept "fix: handle null guardian in invoice list" \
  "app/api/invoices/route.ts" "docs/cycles/2026-04-20-x.md"

# AC 5 — refactor: is exempt
run_case "AC5  refactor(invoices): + app/ without README → accept" \
  accept "refactor(invoices): extract formatter" \
  "app/api/invoices/route.ts" "docs/cycles/2026-04-20-x.md"

# AC 5b — chore/docs/test/style/build/ci exempt
run_case "AC5b chore(deps): + app/ without README → accept" \
  accept "chore(deps): bump prisma" \
  "app/api/x/route.ts" "docs/cycles/2026-04-20-x.md"

# AC 6 — feat: outside app/** and lib/** is accepted
run_case "AC6a feat: on prisma/** only → accept" \
  accept "feat(schema): add index" \
  "prisma/schema.prisma" "docs/cycles/2026-04-20-x.md"

run_case "AC6b feat: on components/** only → accept" \
  accept "feat(ui): add button variant" \
  "components/ui/button.tsx" "docs/cycles/2026-04-20-x.md"

# AC 7 — release: is exempt even on app/**
run_case "AC7  release: + app/ without README → accept" \
  accept "release: staging → main" \
  "app/api/invoices/route.ts"

# AC 8 — breaking change marker still triggers
run_case "AC8a feat!: + app/ no README → reject" \
  reject "feat!: rename endpoint" \
  "app/api/invoices/route.ts" "docs/cycles/2026-04-20-x.md"

run_case "AC8b feat(api)!: + lib/ no README → reject" \
  reject "feat(api)!: change auth shape" \
  "lib/auth.ts" "docs/cycles/2026-04-20-x.md"

run_case "AC8c feat(api)!: + lib/ + README → accept" \
  accept "feat(api)!: change auth shape" \
  "lib/auth.ts" "README.md"

# Edge — merge/revert/fixup must always pass
run_case "Edge merge commit bypass → accept" \
  accept "Merge branch 'feat/x' into staging" \
  "app/api/invoices/route.ts"

run_case "Edge Revert bypass → accept" \
  accept "Revert \"feat: add thing\"" \
  "app/api/invoices/route.ts"

run_case "Edge fixup! bypass → accept" \
  accept "fixup! feat: do thing" \
  "app/api/invoices/route.ts"

# Edge — feat: with README only (no cycle doc) must accept (pre-commit handles
# the broader doc-sync rule, not commit-msg)
run_case "Edge feat: + README only → accept" \
  accept "feat: new module" \
  "app/api/x/route.ts" "README.md"

# Edge — feat: scoped to app with scope() must reject without README
run_case "Edge feat(scope): + app/ no README → reject" \
  reject "feat(invoices): new field" \
  "app/api/invoices/route.ts"

echo ""
echo "Testing .githooks/pre-commit Rule 6 (ADR cell length)..."
echo ""

# run_adr_case <name> <expect:accept|reject> <readme-content> [extra_file_path]
# Stages README.md plus an optional second file (default: none).
# Pre-commit hook needs .githooks/.installed marker and a copy of itself
# in $PWD/.githooks/pre-commit.
run_adr_case() {
  local name="$1" expect="$2" readme_content="$3"
  local extra="${4:-}"
  local casenum=$((PASS + FAIL + 1))
  local casedir="$TMPDIR/adrcase-$casenum"

  mkdir -p "$casedir/.githooks"
  cp "$PRE_COMMIT_HOOK" "$casedir/.githooks/pre-commit"
  chmod +x "$casedir/.githooks/pre-commit"
  touch "$casedir/.githooks/.installed"

  (
    cd "$casedir"
    git init -q -b main >/dev/null 2>&1
    git config user.email "t@t"
    git config user.name "t"
    printf '%s' "$readme_content" > README.md
    git add README.md
    if [ -n "$extra" ]; then
      local parent
      parent="$(dirname "$extra")"
      [ "$parent" != "." ] && mkdir -p "$parent"
      printf 'cycle doc body\n' > "$extra"
      git add "$extra"
    fi
    bash .githooks/pre-commit >/dev/null 2>&1
  )
  local exitcode=$?

  local outcome="accept"
  [ "$exitcode" != "0" ] && outcome="reject"

  if [ "$outcome" = "$expect" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name — expected $expect, got $outcome (exit $exitcode)"
    FAIL=$((FAIL + 1))
    FAILED_NAMES="$FAILED_NAMES\n    - $name"
  fi
}

# Build 500-char filler portably
S500=$(printf '%500s' '' | tr ' ' x)

run_adr_case "ADR1 short cells → accept" accept \
"# README

## Architecture Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | Short decision | Short reason |

## Setup
"

run_adr_case "ADR2 cell at 500 chars in ADR table → reject" reject \
"# README

## Architecture Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | Short | $S500 |

## Setup
"

run_adr_case "ADR3 long cell in non-ADR table → accept" accept \
"# README

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | $S500 |

## Architecture Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | Short | Short |

## Setup
"

# Regression: real-world commit stages README.md alongside a cycle doc.
# Earlier case-pattern detection (case " $STAGED " in *' README.md '*) only
# matched space-delimited lists; STAGED is newline-separated, so the rule
# silently skipped multi-file commits. Lock the loop-based detection in.
run_adr_case "ADR4 README + cycle-doc, 500-char ADR cell → reject" reject \
"# README

## Architecture Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | Short | $S500 |

## Setup
" "docs/cycles/2026-05-01-x.md"

echo ""
echo "Summary: $PASS passed, $FAIL failed"

if [ "$FAIL" != "0" ]; then
  printf "Failed cases:%b\n" "$FAILED_NAMES"
  exit 1
fi

exit 0
