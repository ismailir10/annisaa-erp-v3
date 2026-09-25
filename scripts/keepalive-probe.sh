#!/usr/bin/env bash
#
# keepalive-probe.sh — second-leg Supabase keepalive and auto-pause detector.
#
# The prod Supabase project is on the free tier, which auto-pauses after 7 days
# idle. app/api/health/route.ts runs `SELECT 1` through Prisma on every request
# and is force-dynamic, so a request to it is real database activity — which is
# why an UptimeRobot ping was supposed to be enough to hold the project awake.
#
# It was not enough, twice: 2026-05-02 and 2026-09-09. The route is fine; the
# single owner-only monitor calling it is the fragile part. This script is the
# second leg, driven by GitHub Actions, sharing no account, scheduler or
# notification channel with UptimeRobot. See docs/runbooks/prod-incident.md §3.
#
# Usage: bash scripts/keepalive-probe.sh probe <url>
#        bash scripts/keepalive-probe.sh classify <curl-exit> <http-code> <body>
#        bash scripts/keepalive-probe.sh refine <class> <resolves|nxdomain|unknown>
#        bash scripts/keepalive-probe.sh self-test      # no network needed
#
set -euo pipefail

# --- tunables (env-overridable) ---------------------------------------------
KEEPALIVE_ATTEMPTS="${KEEPALIVE_ATTEMPTS:-3}"
KEEPALIVE_RETRY_DELAY="${KEEPALIVE_RETRY_DELAY:-20}"
KEEPALIVE_TIMEOUT="${KEEPALIVE_TIMEOUT:-30}"

# The database hostname whose disappearance distinguishes an auto-pause from
# every other database failure. Injectable so the self-test never does DNS.
KEEPALIVE_DB_HOST="${KEEPALIVE_DB_HOST:-vxwywmvpxetdgnxejjgk.supabase.co}"
KEEPALIVE_RESOLVER="${KEEPALIVE_RESOLVER:-}"

die() { echo "::error::$*" >&2; exit 1; }
note() { echo "  $*"; }
ok() { echo "  OK — $*"; }

# Runs a subcommand in a SUBSHELL and succeeds only if it fails. The subshell
# matters: the helpers signal failure with `die`, which calls `exit` — run
# inline inside an `if`, that would terminate the whole script instead of being
# caught as a false condition. Same reasoning as scripts/backup-prod.sh.
must_fail() { if ( "$@" ) >/dev/null 2>&1; then return 1; else return 0; fi; }

# --- classify ---------------------------------------------------------------
# Pure: (curl exit, HTTP status, body) → one failure class. Kept separate from
# the network so the interesting cases are testable without one.
#
#   healthy         200 + {"ok":true}       nothing to do
#   db_unreachable  503 + db_unreachable    the app is up, the database is not
#   app_error       any other non-2xx       app or deploy broken  → runbook §1/§2
#   unreachable     curl could not connect  DNS / TLS / Vercel edge → runbook §1
#   bad_body        200 without ok:true     served, but not our health route
#
# db_unreachable must never be reported as app_error: they point at different
# runbook sections and different owner actions.
#
# It is deliberately NOT reported as `db_paused` either, however tempting the
# 2026-09-09 shape makes that. app/api/health/route.ts returns the identical
# 503 `db_unreachable` body for every Prisma exception — bad credentials, an
# exhausted pooler, connection limits, a Supabase incident — and an auto-pause
# is only one of them. Telling the owner "the project auto-paused" on that
# evidence alone sends them to click Restore on a project that is running.
# The pause is pinned by the SECOND signal, DNS, in cmd_refine below: the
# runbook's own diagnosis is the PAIR of commands, not the curl alone.
cmd_classify() {
  local curl_exit="${1:?usage: classify <curl-exit> <http-code> <body>}"
  local http="${2:?missing http code}"
  local body="${3-}"

  if [ "$curl_exit" != "0" ]; then echo "unreachable"; return 0; fi

  case "$http" in
    200)
      case "$body" in
        *'"ok":true'*|*'"ok": true'*) echo "healthy" ;;
        *) echo "bad_body" ;;
      esac
      ;;
    503)
      case "$body" in
        *db_unreachable*) echo "db_unreachable" ;;
        *) echo "app_error" ;;
      esac
      ;;
    *) echo "app_error" ;;
  esac
}

# --- refine -----------------------------------------------------------------
# Pure: (class, DNS state) → class. The second half of the runbook's two-command
# diagnosis, applied automatically so the alert names a cause rather than
# handing the owner a symptom.
#
# A paused Supabase project loses its DNS record outright, which nothing else in
# this stack does: a project that is merely unhealthy still resolves. So only the
# pair (503 db_unreachable, hostname does not resolve) may be called db_paused.
#
#   db_unreachable + nxdomain  → db_paused       project auto-paused  → §3
#   db_unreachable + resolves  → db_unreachable  project up, DB isn't → §4
#   db_unreachable + unknown   → db_unreachable  cannot tell; do not guess
#
# Anything that is not db_unreachable passes through untouched: DNS says nothing
# about a broken deploy.
cmd_refine() {
  local class="${1:?usage: refine <class> <resolves|nxdomain|unknown>}"
  local dns="${2:?missing dns state}"

  if [ "$class" = "db_unreachable" ] && [ "$dns" = "nxdomain" ]; then
    echo "db_paused"
  else
    echo "$class"
  fi
}

# Resolves a hostname to one of: resolves | nxdomain | unknown.
#
# `getent hosts` exits non-zero both for NXDOMAIN and for a resolver that is
# itself broken, which would normally be exactly the kind of conflation this
# script exists to avoid. It is safe here only because of where it is called
# from: refinement runs after curl has already reached the app and got a 503
# back, so this runner's DNS demonstrably works. A failure to resolve the
# database host specifically, from a runner that just resolved the app host, is
# the real thing.
resolve_state() {
  local host="$1"
  if [ -n "$KEEPALIVE_RESOLVER" ]; then
    if "$KEEPALIVE_RESOLVER" "$host" >/dev/null 2>&1; then echo "resolves"; else echo "nxdomain"; fi
    return 0
  fi
  if ! command -v getent >/dev/null 2>&1; then echo "unknown"; return 0; fi
  if getent hosts "$host" >/dev/null 2>&1; then echo "resolves"; else echo "nxdomain"; fi
}

# --- probe ------------------------------------------------------------------
# Retries before declaring an outage — one blip is not an incident, and paging
# on it is how a monitor teaches its owner to ignore it. Mirrors UptimeRobot's
# 3-consecutive-failures default.
#
# Reports the LAST attempt's classification, not the first: a project part-way
# through a restore should read as recovered, not paused.
cmd_probe() {
  local url="${1:?usage: probe <url>}"
  local tmp; tmp=$(mktemp)
  # shellcheck disable=SC2064 # expand $tmp now: it is unset when the trap fires
  trap "rm -f '$tmp'" EXIT

  local attempt=1 http curl_exit class="" body
  while [ "$attempt" -le "$KEEPALIVE_ATTEMPTS" ]; do
    curl_exit=0
    http=$(curl -sS -o "$tmp" -w '%{http_code}' --max-time "$KEEPALIVE_TIMEOUT" \
      "$url" 2>/dev/null) || curl_exit=$?
    # curl prints nothing on -w when it fails to connect; normalise for classify.
    [ -n "$http" ] || http="000"
    body=$(head -c 2000 "$tmp" 2>/dev/null || true)

    class=$(cmd_classify "$curl_exit" "$http" "$body")
    note "attempt $attempt/$KEEPALIVE_ATTEMPTS: http=$http class=$class"

    if [ "$class" = "healthy" ]; then
      ok "$url is healthy (HTTP $http) — the database was touched, so this ping also serves as the keepalive"
      echo "class=healthy"
      return 0
    fi

    attempt=$((attempt + 1))
    [ "$attempt" -le "$KEEPALIVE_ATTEMPTS" ] && sleep "$KEEPALIVE_RETRY_DELAY"
  done

  # Second signal. Only asked for when the first one warrants it — there is no
  # reason to look up the database host because a deploy is broken.
  if [ "$class" = "db_unreachable" ]; then
    local dns; dns=$(resolve_state "$KEEPALIVE_DB_HOST")
    note "dns: $KEEPALIVE_DB_HOST → $dns"
    class=$(cmd_refine "$class" "$dns")
  fi

  echo "class=$class"
  case "$class" in
    db_paused)
      die "$url returned 503 db_unreachable on every attempt AND $KEEPALIVE_DB_HOST does not resolve. That pair is the auto-pause signature — a paused project loses its DNS record, and nothing else here does. Recover per docs/runbooks/prod-incident.md §3." ;;
    db_unreachable)
      die "$url returned 503 db_unreachable on every attempt, but $KEEPALIVE_DB_HOST still resolves — so the project is running and the database is not reachable from the app: credentials, an exhausted pooler, connection limits, or a Supabase incident. This is NOT an auto-pause and restoring the project will not fix it. See docs/runbooks/prod-incident.md §4." ;;
    unreachable)
      die "$url could not be reached on any attempt (curl exit $curl_exit) — DNS, TLS or the Vercel edge. See docs/runbooks/prod-incident.md §1." ;;
    bad_body)
      die "$url returned HTTP 200 but not the health route's body — something is serving this path that should not be. See docs/runbooks/prod-incident.md §2." ;;
    *)
      die "$url returned HTTP $http on every attempt — the app or its deploy is broken. See docs/runbooks/prod-incident.md §1 and §2." ;;
  esac
}

# --- self-test --------------------------------------------------------------
# Drives a real loopback HTTP server through every class. No network, no
# production system, no credential.
FIXTURE_PID=""
FIXTURE_PORT=""
fixture_stop() {
  [ -n "$FIXTURE_PID" ] || return 0
  kill "$FIXTURE_PID" 2>/dev/null || true
  wait "$FIXTURE_PID" 2>/dev/null || true
  FIXTURE_PID=""
}

# Starts the fixture in $1 mode and sets FIXTURE_PID + FIXTURE_PORT.
#
# Deliberately NOT `port=$(fixture_start ...)`: a command substitution runs in a
# subshell, so FIXTURE_PID would be set there and lost, leaving fixture_stop
# with nothing to kill. That is not theoretical — the first CI run of this
# self-test ended with "Terminate orphan process: pid (…) (python3)" four times
# over, one per fixture.
#
# The port file is truncated before each start. Reusing it without truncating
# let the wait loop see the PREVIOUS server's port still sitting in it, return
# immediately, and probe a port nothing was listening on — which is how this
# self-test first reported a paused server as unreachable.
fixture_start() {
  local mode="$1" dir="$2"
  : > "$dir/port"
  python3 "$dir/server.py" "$mode" > "$dir/port" 2>/dev/null &
  FIXTURE_PID=$!
  local i=0
  while [ ! -s "$dir/port" ] && [ "$i" -lt 100 ]; do sleep 0.1; i=$((i + 1)); done
  [ -s "$dir/port" ] || die "the fixture server did not start"
  FIXTURE_PORT=$(cat "$dir/port")
}

assert_refine() { # expected, class, dns, description
  local got; got=$(cmd_refine "$2" "$3")
  [ "$got" = "$1" ] || die "$4: expected '$1', got '$got'"
  ok "$4"
}

assert_class() { # expected, curl_exit, http, body, description
  local got; got=$(cmd_classify "$2" "$3" "$4")
  [ "$got" = "$1" ] || die "$5: expected '$1', got '$got'"
  ok "$5"
}

cmd_self_test() {
  local tmp; tmp=$(mktemp -d)
  # shellcheck disable=SC2064 # expand $tmp now: it is unset when the trap fires
  trap "fixture_stop; rm -rf '$tmp'" EXIT

  cat > "$tmp/server.py" <<'PYSERVER'
import sys, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

mode = sys.argv[1]
state = {"n": 0}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        state["n"] += 1
        m = mode
        # "flaky" fails once, then recovers — proves probe reports the LAST
        # attempt, so a project mid-restore reads as recovered, not paused.
        if mode == "flaky":
            m = "paused" if state["n"] == 1 else "healthy"
        if m == "healthy":
            code, body = 200, b'{"ok":true,"sha":"deadbeef"}'
        elif m == "paused":
            code, body = 503, b'{"ok":false,"error":"db_unreachable"}'
        elif m == "app_error":
            code, body = 500, b'Internal Server Error'
        else:
            code, body = 200, b'<html>not the health route</html>'
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

srv = HTTPServer(("127.0.0.1", 0), H)
print(srv.server_address[1], flush=True)
srv.serve_forever()
PYSERVER

  echo "== classify: every class, without a network =="
  assert_class healthy     0 200 '{"ok":true,"sha":"abc"}'              "200 + ok:true classified as healthy"
  assert_class db_unreachable 0 503 '{"ok":false,"error":"db_unreachable"}' "503 + db_unreachable classified as db_unreachable"
  assert_class app_error   0 500 'Internal Server Error'                "500 classified as app_error"
  assert_class app_error   0 503 'upstream unavailable'                 "503 without db_unreachable is app_error, not db_unreachable"
  assert_class bad_body    0 200 '<html>nope</html>'                    "200 without ok:true classified as bad_body"
  assert_class unreachable 6 000 ''                                     "connection failure classified as unreachable"
  assert_class db_unreachable 0 503 '{"ok":false,"error":"db_unreachable"}' \
    "classify alone never says db_paused — only refine may, and only with DNS"

  # Stub resolvers, so the self-test asserts the DNS branch without doing DNS.
  printf '#!/bin/sh\nexit 1\n' > "$tmp/dns-nxdomain"; chmod +x "$tmp/dns-nxdomain"
  printf '#!/bin/sh\nexit 0\n' > "$tmp/dns-resolves"; chmod +x "$tmp/dns-resolves"

  echo
  echo "== resolve_state: what the DNS half actually reports =="
  mkdir -p "$tmp/nobin"
  local rs
  rs=$( ( KEEPALIVE_RESOLVER="$tmp/dns-nxdomain"; resolve_state example.invalid ) )
  [ "$rs" = "nxdomain" ] || die "an injected failing resolver must report nxdomain, got '$rs'"
  ok "a host that does not resolve reports nxdomain"
  rs=$( ( KEEPALIVE_RESOLVER="$tmp/dns-resolves"; resolve_state example.invalid ) )
  [ "$rs" = "resolves" ] || die "an injected succeeding resolver must report resolves, got '$rs'"
  ok "a host that resolves reports resolves"
  # With no resolver available at all, the honest answer is "I do not know" —
  # NOT nxdomain. Reading a missing lookup tool as a vanished hostname would
  # turn every database failure on such a runner back into a false auto-pause.
  # shellcheck disable=SC2123 # emptying PATH is the point: it is how this test
  # simulates a runner with no getent, and it is scoped to the subshell.
  rs=$( ( PATH="$tmp/nobin"; KEEPALIVE_RESOLVER=""; resolve_state example.invalid ) )
  [ "$rs" = "unknown" ] || die "with no resolver on PATH, resolve_state must report unknown, got '$rs'"
  ok "no resolver available reports unknown, not nxdomain"

  echo
  echo "== refine: only 503 + a vanished hostname is an auto-pause =="
  assert_refine db_paused      db_unreachable nxdomain "503 + NXDOMAIN is the auto-pause signature"
  assert_refine db_unreachable db_unreachable resolves "503 while the host still resolves is NOT a pause (§4)"
  assert_refine db_unreachable db_unreachable unknown  "503 with no resolver answer stays generic rather than guessing"
  assert_refine app_error      app_error      nxdomain "DNS does not reclassify a broken app"
  assert_refine healthy        healthy        nxdomain "DNS does not reclassify a healthy probe"

  # Retries would make the negative cases take KEEPALIVE_ATTEMPTS * delay.
  export KEEPALIVE_ATTEMPTS=2 KEEPALIVE_RETRY_DELAY=0 KEEPALIVE_TIMEOUT=5

  echo "== probe against a real loopback server =="
  fixture_start healthy "$tmp"
  # In a subshell: cmd_probe installs its own EXIT trap for its temp file, which
  # would otherwise replace this self-test's fixture_stop/rm cleanup trap.
  ( cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" ) >/dev/null \
    || die "probe failed against a healthy server"
  ok "probe exits 0 against a healthy server"
  fixture_stop

  fixture_start paused "$tmp"
  must_fail cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" \
    || die "probe passed against a server returning 503 db_unreachable"

  local out
  out=$( ( KEEPALIVE_RESOLVER="$tmp/dns-nxdomain"; cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" ) 2>&1 || true )
  printf '%s\n' "$out" | grep -q 'class=db_paused' \
    || die "probe did not report class=db_paused for 503 + a hostname that does not resolve"
  printf '%s\n' "$out" | grep -q 'prod-incident.md §3' \
    || die "the db_paused failure does not point at runbook §3"
  ok "503 + NXDOMAIN → db_paused, naming runbook §3"

  # The regression Codex caught: before refinement, ANY database failure read as
  # a pause and sent the owner to click Restore on a running project.
  out=$( ( KEEPALIVE_RESOLVER="$tmp/dns-resolves"; cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" ) 2>&1 || true )
  printf '%s\n' "$out" | grep -q 'class=db_unreachable' \
    || die "a 503 whose host still resolves must NOT be reported as a pause"
  printf '%s\n' "$out" | grep -q 'prod-incident.md §4' \
    || die "the db_unreachable failure does not point at runbook §4"
  printf '%s\n' "$out" | grep -q 'NOT an auto-pause' \
    || die "the db_unreachable failure does not say plainly that it is not a pause"
  ok "503 + a host that resolves → db_unreachable, naming runbook §4"
  fixture_stop

  fixture_start bad_body "$tmp"
  must_fail cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" \
    || die "probe passed against a 200 that is not the health route"
  ok "probe exits non-zero on HTTP 200 with the wrong body"
  fixture_stop

  echo "== probe recovers when a later attempt succeeds =="
  fixture_start flaky "$tmp"
  ( cmd_probe "http://127.0.0.1:$FIXTURE_PORT/api/health" ) >/dev/null \
    || die "probe reported down even though the second attempt succeeded — a single blip would page someone"
  ok "probe recovers when a later attempt succeeds"
  fixture_stop

  echo "== negative: an unreachable port must fail =="
  # Bind and immediately release a port, so nothing is listening on it.
  local dead
  dead=$(python3 -c "
import socket
s = socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1]); s.close()")
  must_fail cmd_probe "http://127.0.0.1:$dead/api/health" \
    || die "probe passed against a port with nothing listening"
  ok "probe exits non-zero against an unreachable port"

  echo
  ok "self-test passed"
}

# --- dispatch ---------------------------------------------------------------
sub="${1:-}"; shift || true
case "$sub" in
  probe)     cmd_probe "$@" ;;
  classify)  cmd_classify "$@" ;;
  refine)    cmd_refine "$@" ;;
  self-test) cmd_self_test ;;
  *)
    echo "usage: bash scripts/keepalive-probe.sh <probe|classify|refine|self-test> [args]" >&2
    echo "  probe    <url>" >&2
    echo "  classify <curl-exit> <http-code> <body>" >&2
    echo "  refine   <class> <resolves|nxdomain|unknown>" >&2
    exit 2 ;;
esac
