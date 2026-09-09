#!/usr/bin/env bash
# flake-hunt — run the vitest suite N times under deliberate CPU
# oversubscription and report every test that failed in any run.
#
# Why this exists: CI runs the suite on a 4-vCPU runner with three vitest
# forks, so a wall-clock ceiling (testTimeout, testing-library's
# asyncUtilTimeout, a component's own setTimeout) can fire before the work it
# is waiting on. That is invisible on an idle laptop — a single green run
# proves nothing. Oversubscribing reproduces it: the 2026-08-22 flake cycle
# found one unreported race this way that a static sweep had cleared.
#
#   bash scripts/flake-hunt.sh                 # 10 runs, 12 hogs
#   bash scripts/flake-hunt.sh 20              # 20 runs
#   bash scripts/flake-hunt.sh 20 0            # 20 runs, no CPU load
#   bash scripts/flake-hunt.sh 10 12 app/admin # only these paths
#
# Exit 0 = every run green.
set -uo pipefail

RUNS="${1:-10}"
HOGS="${2:-12}"
shift $(( $# > 2 ? 2 : $# ))
TARGETS=("$@")

OUT="$(mktemp -d -t flake-hunt)"
HOG_JS="$OUT/hog.mjs"
cat > "$HOG_JS" <<'EOF'
const end = Date.now() + Number(process.argv[2] || 3_600_000);
let x = 0;
while (Date.now() < end) { for (let i = 0; i < 1e6; i++) x += Math.sqrt(i); }
EOF

hog_pids=()
cleanup() {
  for p in "${hog_pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

if [ "$HOGS" -gt 0 ]; then
  echo "flake-hunt: starting $HOGS CPU hogs (host has $(node -e 'console.log(require("os").availableParallelism())') cores)"
  for _ in $(seq 1 "$HOGS"); do
    node "$HOG_JS" 3600000 &
    hog_pids+=("$!")
  done
  sleep 1
fi

workers_flag=()
[ "$HOGS" -gt 0 ] && workers_flag=(--maxWorkers="$HOGS")

failed_runs=0
for r in $(seq 1 "$RUNS"); do
  log="$OUT/run-$r.txt"
  npx vitest run ${workers_flag[@]+"${workers_flag[@]}"} ${TARGETS[@]+"${TARGETS[@]}"} > "$log" 2>&1
  line=$(grep -E '^ +Tests +' "$log" | tail -1)
  if grep -qE '^ +Tests +[0-9]+ failed' "$log"; then
    failed_runs=$(( failed_runs + 1 ))
    echo "run $r: FAIL —${line}"
    grep -E '^ FAIL ' "$log" | sed 's/^/    /'
  else
    echo "run $r: ok  —${line}"
  fi
done

echo
if [ "$failed_runs" -eq 0 ]; then
  echo "flake-hunt: $RUNS/$RUNS runs green."
  rm -rf "$OUT"
  exit 0
fi

echo "flake-hunt: $failed_runs of $RUNS runs failed. Logs: $OUT"
echo "Tests that failed at least once:"
grep -h -E '^ FAIL ' "$OUT"/run-*.txt | sort | uniq -c | sort -rn
exit 1
