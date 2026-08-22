#!/usr/bin/env bash
#
# Nightly production backup — dump, verify, encrypt, upload, prune.
#
# Every stage is a subcommand so that `.github/workflows/backup.yml` reads as a
# list of named checks, and so the whole pipeline can be rehearsed locally
# against a throwaway database (`self-test`) without any production credential.
#
# The guiding rule: a backup that exits 0 is not a backup. Every stage asserts
# something about its output — size, archive integrity, table count, a real
# pg_restore into a scratch database, and the size of the object that actually
# landed in R2. Anything short of that is how you discover at restore time that
# you have been writing zero-byte files for three months.
#
# Usage: bash scripts/backup-prod.sh <subcommand> [args]
#        bash scripts/backup-prod.sh self-test      # no credentials needed
#
set -euo pipefail

# --- tunables (env-overridable) ---------------------------------------------
# Floors, not targets. They exist to catch catastrophic degradation (empty dump,
# truncated upload), not to police normal growth.
BACKUP_MIN_BYTES="${BACKUP_MIN_BYTES:-20000}"
BACKUP_MIN_TABLES="${BACKUP_MIN_TABLES:-20}"
BACKUP_REQUIRED_TABLES="${BACKUP_REQUIRED_TABLES:-User Student Parent Invoice Payment}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-7}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-48}"

die() { echo "::error::$*" >&2; exit 1; }
note() { echo "  $*"; }
ok() { echo "  OK — $*"; }

# Runs a subcommand in a SUBSHELL and succeeds only if it fails. The subshell
# matters: these helpers signal failure with `die`, which calls `exit` — run
# inline inside an `if`, that would terminate the whole script instead of being
# caught as a false condition.
must_fail() { if ( "$@" ) >/dev/null 2>&1; then return 1; else return 0; fi; }

file_bytes() { wc -c < "$1" | tr -d ' '; }

# --- check-secrets ----------------------------------------------------------
# Reports EVERY missing secret in one pass. The original workflow exited on the
# first empty one, which turned "configure six secrets" into six failed nightly
# runs before the owner saw the full list.
cmd_check_secrets() {
  local missing="" n=0 v
  for v in "$@"; do
    # Presence only — never echo, measure or otherwise characterise the value.
    if [ -z "${!v:-}" ]; then
      missing="${missing:+$missing }$v"
      n=$((n + 1))
    else
      ok "$v is set"
    fi
  done
  if [ "$n" -gt 0 ]; then
    echo "::error::$n required secret(s) are unset or empty: $missing"
    echo "Set them in GitHub → Settings → Environments → Production → Environment secrets."
    echo "See docs/runbooks/prod-setup.md §3 for what each value should contain."
    exit 1
  fi
  ok "all ${#} required secrets are present"
}

# --- check-pubkey -----------------------------------------------------------
# The committed public key started life as a placeholder. Detect that case by
# name so the failure says "the key was never generated" instead of an opaque
# fingerprint mismatch.
cmd_check_pubkey() {
  local keyfile="$1" expected="${2:-}"
  [ -f "$keyfile" ] || die "GPG public key $keyfile does not exist"

  if grep -q 'PLACEHOLDER' "$keyfile"; then
    die "$keyfile is still the placeholder committed in Cycle B — the backup keypair was never generated. Follow docs/runbooks/prod-incident.md §1, then commit the real exported public key."
  fi
  grep -q 'BEGIN PGP PUBLIC KEY BLOCK' "$keyfile" \
    || die "$keyfile is not an ASCII-armored PGP public key block"

  local actual
  actual=$(gpg --with-colons --import-options show-only --import "$keyfile" \
    | awk -F: '/^fpr:/{print $10; exit}')
  [ -n "$actual" ] || die "$keyfile did not parse as a usable PGP public key"

  if [ -n "$expected" ]; then
    local want
    want=$(echo "$expected" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
    if [ "$actual" != "$want" ]; then
      die "GPG fingerprint mismatch — BACKUP_GPG_FINGERPRINT expects $want, $keyfile is $actual. Either the secret is stale or the committed key was swapped."
    fi
    ok "fingerprint matches BACKUP_GPG_FINGERPRINT"
  fi
  gpg --import "$keyfile" >/dev/null 2>&1
  ok "imported public key $actual"
}

# --- dump -------------------------------------------------------------------
cmd_dump() {
  local db_url="$1" out="$2"
  pg_dump "$db_url" --format=custom --no-owner --no-acl --file="$out"
  [ -f "$out" ] || die "pg_dump reported success but produced no file at $out"
  ok "wrote $out ($(file_bytes "$out") bytes)"
}

# --- verify-dump ------------------------------------------------------------
# Structural validation of the custom-format archive. Proves the TOC is
# readable and that the dump carries real application data.
cmd_verify_dump() {
  local f="$1"
  [ -f "$f" ] || die "dump $f does not exist"

  local bytes
  bytes=$(file_bytes "$f")
  [ "$bytes" -ge "$BACKUP_MIN_BYTES" ] \
    || die "dump is $bytes bytes, below the $BACKUP_MIN_BYTES floor — treat as an empty or truncated dump"
  ok "size $bytes bytes (floor $BACKUP_MIN_BYTES)"

  local toc
  toc=$(pg_restore --list "$f" 2>&1) \
    || die "pg_restore --list failed — the archive header or TOC is corrupt: $toc"
  ok "archive TOC is readable"

  local n
  n=$(printf '%s\n' "$toc" | grep -c 'TABLE DATA' || true)
  [ "$n" -ge "$BACKUP_MIN_TABLES" ] \
    || die "dump contains $n TABLE DATA entries, below the $BACKUP_MIN_TABLES floor — this looks schema-only or near-empty"
  ok "$n TABLE DATA entries (floor $BACKUP_MIN_TABLES)"

  local t missing=()
  for t in $BACKUP_REQUIRED_TABLES; do
    printf '%s\n' "$toc" | grep -qE "TABLE DATA public \"?${t}\"? " || missing+=("$t")
  done
  [ ${#missing[@]} -eq 0 ] \
    || die "dump is missing data for required table(s): ${missing[*]} — wrong database or a partial dump"
  ok "all required tables present: $BACKUP_REQUIRED_TABLES"
}

# --- restore-test -----------------------------------------------------------
# The real proof. Restores the dump into a scratch database and counts rows.
# This is the DR path the runbook documents; running it nightly means it is
# continuously drilled instead of first attempted during an outage.
cmd_restore_test() {
  local f="$1" target="$2"
  pg_restore --dbname="$target" --no-owner --no-acl --exit-on-error "$f" >/dev/null \
    || die "pg_restore into the scratch database failed — this dump is NOT restorable"
  ok "pg_restore into scratch database succeeded"

  local tables
  tables=$(psql "$target" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
  [ "$tables" -ge "$BACKUP_MIN_TABLES" ] \
    || die "restored database has only $tables tables, below the $BACKUP_MIN_TABLES floor"
  ok "restored $tables tables"

  # Exact row count across the restored public schema. A restore that yields a
  # perfect schema and zero rows is the failure mode a naive "exit 0" check
  # misses. Counted via query_to_xml rather than pg_class.reltuples, which is
  # still unpopulated straight after a restore because nothing has ANALYZEd yet.
  local rows
  rows=$(psql "$target" -tAc "
    SELECT coalesce(sum(cnt), 0) FROM (
      SELECT (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename),
                             false, true, '')))[1]::text::bigint AS cnt
      FROM pg_tables WHERE schemaname = 'public'
    ) t")
  note "restored row count: $rows"
  [ "$rows" -gt 0 ] || die "restored database contains zero rows — the dump is structurally valid but carries no data"
  ok "restored database is non-empty"
}

# --- encrypt / verify-encrypted --------------------------------------------
cmd_encrypt() {
  local in="$1" out="$2" recipient="$3"
  gpg --batch --yes --trust-model always \
    --encrypt --recipient "$recipient" --output "$out" "$in"
  [ -f "$out" ] || die "gpg reported success but produced no file at $out"
  ok "encrypted to $out ($(file_bytes "$out") bytes)"
}

cmd_verify_encrypted() {
  local f="$1"
  [ -f "$f" ] || die "encrypted file $f does not exist"
  # We cannot decrypt in CI — the private key deliberately never touches the
  # runner. Packet inspection is the strongest available check: it proves the
  # file is a well-formed OpenPGP message with a public-key encrypted session
  # key, not a plaintext dump that silently skipped encryption.
  local packets
  packets=$(gpg --list-packets "$f" 2>&1 || true)
  printf '%s\n' "$packets" | grep -q 'pubkey enc packet' \
    || die "$f has no public-key encrypted session key packet — it may not be encrypted"
  ok "well-formed OpenPGP message with an encrypted session key"
  grep -q 'PGP MESSAGE' "$f" 2>/dev/null && note "(armored)" || true
}

# --- upload / verify-remote -------------------------------------------------
cmd_upload() {
  local f="$1" uri="$2"
  aws s3 cp "$f" "$uri" --endpoint-url "$AWS_ENDPOINT_URL" --only-show-errors
  ok "uploaded to $uri"
}

# Confirms the object that actually landed is byte-identical in length to what
# we uploaded. Catches truncated or aborted multipart uploads that still exit 0.
cmd_verify_remote() {
  local uri="$1" expected_bytes="$2"
  local rest bucket key remote
  rest="${uri#s3://}"
  bucket="${rest%%/*}"
  key="${rest#*/}"
  remote=$(aws s3api head-object --bucket "$bucket" --key "$key" \
    --endpoint-url "$AWS_ENDPOINT_URL" --query 'ContentLength' --output text) \
    || die "uploaded object $uri is not readable back from R2"
  [ "$remote" = "$expected_bytes" ] \
    || die "uploaded object is $remote bytes but the local file was $expected_bytes — truncated upload"
  ok "remote object verified at $remote bytes"
}

# --- check-freshness --------------------------------------------------------
# Guards the failure mode nobody notices: the workflow stops running at all
# (schedule disabled, workflow deleted, repo inactivity). If the newest object
# is stale, say so loudly even when tonight's own upload succeeded.
cmd_check_freshness() {
  local bucket="$1" max_hours="${2:-$BACKUP_MAX_AGE_HOURS}"
  local newest
  newest=$(aws s3api list-objects-v2 --bucket "$bucket" --endpoint-url "$AWS_ENDPOINT_URL" \
    --query 'sort_by(Contents,&LastModified)[-1].LastModified' --output text 2>/dev/null || echo "None")
  [ "$newest" != "None" ] && [ -n "$newest" ] || die "bucket $bucket contains no backup objects at all"

  local newest_epoch now age_h
  newest_epoch=$(date -u -d "$newest" +%s 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%S+00:00" "${newest%%.*}+00:00" +%s)
  now=$(date -u +%s)
  age_h=$(( (now - newest_epoch) / 3600 ))
  [ "$age_h" -le "$max_hours" ] \
    || die "newest backup in $bucket is ${age_h}h old, older than the ${max_hours}h freshness budget"
  ok "newest backup is ${age_h}h old (budget ${max_hours}h)"
}

# --- prune ------------------------------------------------------------------
# Deletes only objects strictly older than the retention window, and refuses to
# run at all unless enough recent backups survive. Safe by construction: it can
# never prune the bucket down to nothing, and it never touches a recent object.
cmd_prune() {
  local bucket="$1" days="${2:-$BACKUP_RETENTION_DAYS}" min_keep="${3:-$BACKUP_MIN_KEEP}"
  local cutoff
  cutoff=$(date -u -d "-${days} days" +%s 2>/dev/null || date -u -v-"${days}"d +%s)

  local listing
  listing=$(aws s3api list-objects-v2 --bucket "$bucket" --endpoint-url "$AWS_ENDPOINT_URL" \
    --query 'Contents[].[Key,LastModified]' --output text 2>/dev/null || true)
  [ -n "$listing" ] || { note "bucket is empty — nothing to prune"; return 0; }

  local keep=() drop=() key ts epoch
  while IFS=$'\t' read -r key ts; do
    [ -n "$key" ] || continue
    epoch=$(date -u -d "$ts" +%s 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%S+00:00" "${ts%%.*}+00:00" +%s)
    if [ "$epoch" -lt "$cutoff" ]; then drop+=("$key"); else keep+=("$key"); fi
  done <<< "$listing"

  note "retention ${days}d: ${#keep[@]} within window, ${#drop[@]} beyond it"
  if [ ${#drop[@]} -eq 0 ]; then ok "nothing beyond the retention window"; return 0; fi

  if [ ${#keep[@]} -lt "$min_keep" ]; then
    echo "::warning::refusing to prune — only ${#keep[@]} backup(s) inside the ${days}d window, below the min-keep floor of $min_keep. Leaving all ${#drop[@]} older object(s) in place."
    return 0
  fi

  for key in "${drop[@]}"; do
    note "pruning $key"
    aws s3 rm "s3://$bucket/$key" --endpoint-url "$AWS_ENDPOINT_URL" --only-show-errors
  done
  ok "pruned ${#drop[@]} object(s) beyond ${days}d, kept ${#keep[@]}"
}

# --- self-test --------------------------------------------------------------
# Rehearses the entire pipeline against throwaway infrastructure: builds a
# fixture database, dumps it, verifies it, restores it, encrypts it against a
# generated keypair, and — if an S3-compatible endpoint is provided — uploads,
# verifies, freshness-checks and prunes. Touches no production system, needs no
# production credential, and asserts that the negative paths fail too.
#
#   PGURL_SOURCE    empty throwaway database, the fixture is built here
#   PGURL_SCRATCH   empty throwaway database, the restore lands here
#   BACKUP_SELFTEST_BUCKET  optional; S3/MinIO bucket to exercise the R2 path
cmd_self_test() {
  local src="${PGURL_SOURCE:?set PGURL_SOURCE to a throwaway source database}"
  local scratch="${PGURL_SCRATCH:?set PGURL_SCRATCH to a throwaway scratch database}"
  local tmp; tmp=$(mktemp -d)
  # Expanded now rather than at trap time: $tmp is function-local, and the trap
  # fires after the function has returned, where it is unset under `set -u`.
  # shellcheck disable=SC2064 # expanding at definition time is deliberate here
  trap "rm -rf '$tmp'" EXIT

  echo "== fixture: build a source database =="
  # 30 tables so the MIN_TABLES floor is meaningfully exercised, including every
  # table named in BACKUP_REQUIRED_TABLES, each carrying rows.
  {
    local t
    for t in $BACKUP_REQUIRED_TABLES; do
      echo "CREATE TABLE \"$t\" (id serial primary key, payload text);"
      echo "INSERT INTO \"$t\" (payload) SELECT repeat('x', 200) FROM generate_series(1, 500);"
    done
    local i
    for i in $(seq 1 25); do
      echo "CREATE TABLE \"Filler$i\" (id serial primary key, payload text);"
      echo "INSERT INTO \"Filler$i\" (payload) SELECT repeat('y', 200) FROM generate_series(1, 200);"
    done
  } > "$tmp/fixture.sql"
  psql "$src" -q -v ON_ERROR_STOP=1 -f "$tmp/fixture.sql"
  ok "fixture built"

  echo "== dump =="
  cmd_dump "$src" "$tmp/dump.pgc"
  echo "== verify-dump =="
  cmd_verify_dump "$tmp/dump.pgc"
  echo "== restore-test =="
  cmd_restore_test "$tmp/dump.pgc" "$scratch"

  echo "== negative: a schema-only dump must be rejected =="
  pg_dump "$src" --format=custom --schema-only --no-owner --no-acl --file="$tmp/schema-only.pgc"
  must_fail cmd_verify_dump "$tmp/schema-only.pgc" \
    || die "verify-dump accepted a schema-only dump — the empty-dump guard does not work"
  ok "schema-only dump correctly rejected"

  echo "== negative: a truncated dump must be rejected =="
  head -c 400 "$tmp/dump.pgc" > "$tmp/truncated.pgc"
  must_fail cmd_verify_dump "$tmp/truncated.pgc" \
    || die "verify-dump accepted a truncated dump — the size/TOC guard does not work"
  ok "truncated dump correctly rejected"

  echo "== negative: the placeholder public key must be rejected =="
  printf -- '-----PLACEHOLDER-----\nnot a real key\n-----PLACEHOLDER-----\n' > "$tmp/placeholder.asc"
  must_fail cmd_check_pubkey "$tmp/placeholder.asc" "" \
    || die "check-pubkey accepted a placeholder key file"
  ok "placeholder key correctly rejected"

  echo "== encrypt round-trip against a generated keypair =="
  export GNUPGHOME="$tmp/gnupg"; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
  gpg --batch --quick-generate-key "Backup Selftest <selftest@talib.invalid>" ed25519 sign,encr never
  gpg --armor --export selftest@talib.invalid > "$tmp/pub.asc"
  local fpr
  fpr=$(gpg --with-colons --fingerprint selftest@talib.invalid | awk -F: '/^fpr:/{print $10; exit}')
  cmd_check_pubkey "$tmp/pub.asc" "$fpr"

  echo "== negative: a mismatched fingerprint must be rejected =="
  must_fail cmd_check_pubkey "$tmp/pub.asc" "DEADBEEF00000000000000000000000000000000" \
    || die "check-pubkey accepted a mismatched fingerprint — tamper detection does not work"
  ok "mismatched fingerprint correctly rejected"

  cmd_encrypt "$tmp/dump.pgc" "$tmp/dump.pgc.gpg" selftest@talib.invalid
  cmd_verify_encrypted "$tmp/dump.pgc.gpg"
  # Prove the ciphertext really is the dump: decrypt and compare byte-for-byte.
  gpg --batch --yes --decrypt --output "$tmp/roundtrip.pgc" "$tmp/dump.pgc.gpg" 2>/dev/null
  cmp -s "$tmp/dump.pgc" "$tmp/roundtrip.pgc" \
    || die "decrypted ciphertext does not match the original dump"
  ok "GPG round-trip is byte-identical"

  echo "== negative: plaintext must not pass verify-encrypted =="
  must_fail cmd_verify_encrypted "$tmp/dump.pgc" \
    || die "verify-encrypted accepted an unencrypted file"
  ok "plaintext correctly rejected"

  if [ -n "${BACKUP_SELFTEST_BUCKET:-}" ]; then
    local b="$BACKUP_SELFTEST_BUCKET"
    echo "== upload / verify-remote against $b =="
    local bytes; bytes=$(file_bytes "$tmp/dump.pgc.gpg")
    cmd_upload "$tmp/dump.pgc.gpg" "s3://$b/$(date -u +%Y/%m/%d)/dump-selftest.pgc.gpg"
    cmd_verify_remote "s3://$b/$(date -u +%Y/%m/%d)/dump-selftest.pgc.gpg" "$bytes"

    echo "== negative: a size mismatch must be rejected =="
    must_fail cmd_verify_remote "s3://$b/$(date -u +%Y/%m/%d)/dump-selftest.pgc.gpg" 1 \
      || die "verify-remote accepted a size mismatch — truncated uploads would pass"
    ok "size mismatch correctly rejected"

    echo "== check-freshness =="
    cmd_check_freshness "$b" 48
    echo "== negative: an empty bucket must be reported as having no backups =="
    must_fail cmd_check_freshness "${b}-empty" 48 \
      || die "check-freshness passed on a bucket with no objects"
    ok "empty bucket correctly rejected"

    echo "== prune refuses to empty the bucket =="
    # One object, retention 0 days, min-keep 7: everything is "beyond the
    # window" but the min-keep floor must stop the delete.
    cmd_prune "$b" 0 7
    aws s3api head-object --bucket "$b" \
      --key "$(date -u +%Y/%m/%d)/dump-selftest.pgc.gpg" \
      --endpoint-url "$AWS_ENDPOINT_URL" >/dev/null \
      || die "prune deleted the only backup despite the min-keep floor"
    ok "prune correctly refused to breach the min-keep floor"
  else
    note "BACKUP_SELFTEST_BUCKET unset — skipping the R2/S3 stages"
  fi

  echo
  ok "self-test passed"
}

# --- dispatch ---------------------------------------------------------------
sub="${1:-}"; shift || true
case "$sub" in
  check-secrets)    cmd_check_secrets "$@" ;;
  check-pubkey)     cmd_check_pubkey "$@" ;;
  dump)             cmd_dump "$@" ;;
  verify-dump)      cmd_verify_dump "$@" ;;
  restore-test)     cmd_restore_test "$@" ;;
  encrypt)          cmd_encrypt "$@" ;;
  verify-encrypted) cmd_verify_encrypted "$@" ;;
  upload)           cmd_upload "$@" ;;
  verify-remote)    cmd_verify_remote "$@" ;;
  check-freshness)  cmd_check_freshness "$@" ;;
  prune)            cmd_prune "$@" ;;
  self-test)        cmd_self_test ;;
  *)
    echo "usage: bash scripts/backup-prod.sh <subcommand> [args]" >&2
    echo "subcommands: check-secrets check-pubkey dump verify-dump restore-test" >&2
    echo "             encrypt verify-encrypted upload verify-remote" >&2
    echo "             check-freshness prune self-test" >&2
    exit 2 ;;
esac
