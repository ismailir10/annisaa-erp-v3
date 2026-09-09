#!/usr/bin/env bash
#
# alert-issue.sh — deduplicated GitHub-issue alerting for scheduled workflows.
#
# A red scheduled workflow notifies nobody. Every scheduled job in this repo that
# guards production therefore opens an issue on failure and closes it on
# recovery, so that "an open issue with this label" always means "broken right
# now". This script is the single implementation of that, shared by
# .github/workflows/backup.yml and .github/workflows/keepalive.yml.
#
# It exists as a script rather than inline YAML because the inline version was
# wrong for eighteen consecutive nights and nobody could tell: the alert job in
# backup.yml had no checkout and no GH_REPO, so `gh` could not resolve the target
# repository and died with `fatal: not a git repository` before reaching the API.
# 122 red backup runs produced zero issues. Alerting code only ever runs during
# an incident, which is the worst possible time to discover it does not work —
# so this version is injectable (GH_BIN) and has a self-test.
#
# Usage: bash scripts/alert-issue.sh open  <label> <title> <body-file> [assignee]
#        bash scripts/alert-issue.sh close <label> <comment>
#        bash scripts/alert-issue.sh self-test      # no credentials needed
#
set -euo pipefail

# Injectable so the self-test can drive a stub and assert the argv we build.
GH_BIN="${GH_BIN:-gh}"
ALERT_LABEL_COLOR="${ALERT_LABEL_COLOR:-B60205}"
ALERT_LABEL_DESCRIPTION="${ALERT_LABEL_DESCRIPTION:-Automated production alert}"

die() { echo "::error::$*" >&2; exit 1; }
note() { echo "  $*"; }
ok() { echo "  OK — $*"; }

# See the header. `gh` resolves the repository from GH_REPO or, failing that,
# from the git remote of the working directory. A workflow job with neither has
# no way to reach the API, and the error it produces names git rather than the
# real problem — so say the real problem here instead.
require_repo() {
  [ -n "${GH_REPO:-}" ] && return 0
  git rev-parse --git-dir >/dev/null 2>&1 && return 0
  die "neither GH_REPO nor a git repository is available, so gh cannot resolve the target repository. Add 'GH_REPO: \${{ github.repository }}' to the job's env (and an actions/checkout step if the job needs this script)."
}

# --- open -------------------------------------------------------------------
# Comments on the existing open issue if there is one, otherwise creates it.
cmd_open() {
  local label="${1:?usage: open <label> <title> <body-file> [assignee]}"
  local title="${2:?missing title}"
  local body_file="${3:?missing body file}"
  local assignee="${4:-}"
  require_repo
  [ -f "$body_file" ] || die "body file $body_file does not exist"

  local existing
  existing=$("$GH_BIN" issue list --state open --label "$label" \
    --search "$title in:title" --json number --jq '.[0].number // empty' 2>/dev/null || true)

  if [ -n "$existing" ]; then
    "$GH_BIN" issue comment "$existing" --body-file "$body_file" \
      || die "could not comment on the existing #$existing"
    ok "commented on existing #$existing"
    return 0
  fi

  # Idempotent: fails harmlessly when the label already exists.
  "$GH_BIN" label create "$label" --color "$ALERT_LABEL_COLOR" \
    --description "$ALERT_LABEL_DESCRIPTION" >/dev/null 2>&1 || true

  # Assignment is the part that actually notifies a human. GitHub does not mail
  # a repo owner about an issue opened by github-actions[bot] under the default
  # "participating and @mentions" watch setting — being assigned does trigger a
  # notification. Best-effort, though: an unassigned alert issue still beats no
  # issue at all, so a rejected login falls back rather than failing the job.
  if [ -n "$assignee" ]; then
    if "$GH_BIN" issue create --title "$title" --body-file "$body_file" \
         --label "$label" --assignee "$assignee"; then
      ok "opened a new issue assigned to $assignee"
      return 0
    fi
    echo "::warning::could not assign the alert issue to '$assignee' — opening it unassigned. Check that the login exists and has repo access."
  fi

  "$GH_BIN" issue create --title "$title" --body-file "$body_file" --label "$label" \
    || die "could not create the alert issue"
  ok "opened a new unassigned issue"
}

# --- close ------------------------------------------------------------------
# Closes every open issue carrying the label, so recovery is self-clearing.
cmd_close() {
  local label="${1:?usage: close <label> <comment>}"
  local comment="${2:?missing comment}"
  require_repo

  local numbers n closed=0
  numbers=$("$GH_BIN" issue list --state open --label "$label" \
    --json number --jq '.[].number' 2>/dev/null || true)

  for n in $numbers; do
    "$GH_BIN" issue close "$n" --comment "$comment" || die "could not close #$n"
    closed=$((closed + 1))
  done

  if [ "$closed" -eq 0 ]; then
    ok "no open '$label' issue to close"
  else
    ok "closed $closed '$label' issue(s)"
  fi
}

# --- self-test --------------------------------------------------------------
# Drives every path against a stub `gh` that records its argv, so the dedup,
# assignment, fallback and close behaviours are asserted without an API call.
must_fail() { if ( "$@" ) >/dev/null 2>&1; then return 1; else return 0; fi; }

cmd_self_test() {
  local tmp; tmp=$(mktemp -d)
  # shellcheck disable=SC2064 # expand $tmp now: it is unset when the trap fires
  trap "rm -rf '$tmp'" EXIT

  # The stub. Records argv, and answers the two `issue list` shapes from env.
  cat > "$tmp/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  "issue list")
    # The dedup lookup passes --search; the close sweep does not.
    if printf '%s\n' "$@" | grep -q -- '--search'; then
      printf '%s\n' "${STUB_EXISTING:-}"
    else
      printf '%s\n' ${STUB_OPEN_NUMBERS:-}
    fi
    ;;
  "issue create")
    if [ "${STUB_ASSIGN_FAILS:-0}" = "1" ] && printf '%s\n' "$@" | grep -q -- '--assignee'; then
      echo "could not assign: no such user" >&2; exit 1
    fi
    ;;
esac
exit 0
STUB
  chmod +x "$tmp/gh"
  export GH_BIN="$tmp/gh"
  export GH_REPO="owner/repo"
  echo "alert body" > "$tmp/body.md"

  echo "== negative: a job with no GH_REPO and no git repo must say so =="
  ( cd "$tmp" && env -u GH_REPO GH_BIN="$tmp/gh" \
      bash "$OLDPWD/scripts/alert-issue.sh" open lbl "T" "$tmp/body.md" ) >"$tmp/err" 2>&1 \
    && die "open succeeded with no GH_REPO and no git repository"
  grep -q 'GH_REPO' "$tmp/err" \
    || die "the no-repo error does not name GH_REPO — it would be as unhelpful as 'fatal: not a git repository'"
  ok "missing GH_REPO is reported by name"

  echo "== first failure creates the issue, with label and assignee =="
  GH_LOG="$tmp/log1"; export GH_LOG; : > "$GH_LOG"
  STUB_EXISTING="" cmd_open prod-down "Prod is down" "$tmp/body.md" theowner >/dev/null
  grep -q 'issue create .*--label prod-down' "$GH_LOG" || die "no issue was created"
  grep -q 'issue create .*--assignee theowner' "$GH_LOG" \
    || die "the created issue was not assigned — nobody would be notified"
  grep -q 'label create prod-down' "$GH_LOG" || die "the label was not ensured"
  grep -q 'issue comment' "$GH_LOG" && die "it commented as well as creating"
  ok "first failure creates the issue, with label and assignee"

  echo "== second failure comments instead of creating a duplicate =="
  GH_LOG="$tmp/log2"; export GH_LOG; : > "$GH_LOG"
  STUB_EXISTING="42" cmd_open prod-down "Prod is down" "$tmp/body.md" theowner >/dev/null
  grep -q 'issue comment 42' "$GH_LOG" || die "it did not comment on the existing #42"
  grep -q 'issue create' "$GH_LOG" && die "it created a duplicate issue"
  ok "second failure comments instead of creating a duplicate"

  echo "== a rejected assignee falls back to an unassigned issue =="
  GH_LOG="$tmp/log3"; export GH_LOG; : > "$GH_LOG"
  STUB_EXISTING="" STUB_ASSIGN_FAILS=1 \
    cmd_open prod-down "Prod is down" "$tmp/body.md" ghost >/dev/null 2>&1
  grep -q 'issue create .*--assignee ghost' "$GH_LOG" || die "it never tried to assign"
  grep -qE 'issue create [^-]*--title[^\n]*--label prod-down$' "$GH_LOG" \
    || grep -q 'issue create --title Prod is down --body-file .* --label prod-down' "$GH_LOG" \
    || die "it did not retry without --assignee, so the alert would have been lost"
  ok "assignment failure falls back to an unassigned issue"

  echo "== close closes every open issue carrying the label =="
  GH_LOG="$tmp/log4"; export GH_LOG; : > "$GH_LOG"
  STUB_OPEN_NUMBERS="7 8" cmd_close prod-down "recovered" >/dev/null
  grep -q 'issue close 7 ' "$GH_LOG" || die "#7 was not closed"
  grep -q 'issue close 8 ' "$GH_LOG" || die "#8 was not closed"
  ok "close closes every open issue carrying the label"

  echo "== close on a healthy repo is a no-op =="
  GH_LOG="$tmp/log5"; export GH_LOG; : > "$GH_LOG"
  STUB_OPEN_NUMBERS="" cmd_close prod-down "recovered" >/dev/null
  grep -q 'issue close' "$GH_LOG" && die "it closed something when nothing was open"
  ok "close on no open issues is a no-op"

  echo "== negative: a missing body file must be rejected =="
  must_fail cmd_open prod-down "T" "$tmp/nope.md" \
    || die "open accepted a body file that does not exist"
  ok "missing body file correctly rejected"

  echo
  ok "self-test passed"
}

# --- dispatch ---------------------------------------------------------------
sub="${1:-}"; shift || true
case "$sub" in
  open)      cmd_open "$@" ;;
  close)     cmd_close "$@" ;;
  self-test) cmd_self_test ;;
  *)
    echo "usage: bash scripts/alert-issue.sh <open|close|self-test> [args]" >&2
    echo "  open  <label> <title> <body-file> [assignee]" >&2
    echo "  close <label> <comment>" >&2
    exit 2 ;;
esac
