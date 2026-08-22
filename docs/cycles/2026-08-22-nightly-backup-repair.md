# Nightly Backup Repair — 104 Consecutive Failures

## Context

`.github/workflows/backup.yml` has **never produced a single backup**. Every run
since the workflow landed on 2026-05-10 has failed:

```
$ gh run list --workflow=backup.yml --limit 200 --json conclusion
total runs: 104 {'failure': 104}
oldest: 2026-05-10T17:41:49Z   newest: 2026-08-21T17:18:49Z
successes: 0
```

Each run dies after ~10s at step 3 of 8:

```
##[error]Required secret PROD_DB_URL is empty
##[error]Process completed with exit code 1.
```

The prod pilot database has had **no backup of any kind for 104 nights.**

This was already found. `docs/cycles/archive/2026-07-19-repo-audit.md` logged it
as P0.1 at 70/70 failures and marked it "OWNER, not a cycle". Nothing happened,
and the counter ran to 104. That outcome is the real lesson: filing the owner
action was necessary but not sufficient, because **nothing in the system was
shouting.** A red scheduled workflow notifies no one.

### Root cause

Two independent blockers, either one fatal, plus the reason nobody noticed:

1. **None of the six `production` secrets exist.** `gh secret list --env production`
   returns empty; the only repo secret is `XENDIT_SECRET_KEY`. Owner action —
   secret *values* cannot be set from code, and are deliberately not handled here.
2. **`ops/backup-public.asc` is a placeholder, not a key.** It literally reads
   `-----PLACEHOLDER-----  This file is replaced by the real ED25519 GPG public
   key during Cycle B Phase 2 (T6 ops)`. That ops phase never ran. Even with all
   six secrets set, the workflow would fail one step later at GPG import — and
   with a confusing "fingerprint mismatch" rather than the truth.
3. **Failure was silent.** 104 red runs, zero alerts. This is the defect worth
   fixing in code, and the only one of the three that code *can* fix.

Secondary defects found while reading the workflow:

| # | Defect | Effect |
|---|---|---|
| 4 | Secret check exits on the *first* empty var | Owner sets one secret, next night reveals the next. Six serial nights to discover six missing secrets. |
| 5 | No validation that the dump is restorable | `pg_dump` exiting 0 proves nothing. A schema-only or truncated dump uploads happily. |
| 6 | `aws s3 ls` used as the "verification" | Proves an object was listed, not that it is complete or valid. |
| 7 | No retention | Cycle B specced a 30-day rule; never implemented anywhere in code. |
| 8 | Comment claims required-reviewer gating on the `production` environment | False. `GET /environments/Production` → `"rules": []`. It is a Vercel-auto-created environment with zero protection. |
| 9 | Object key is date-only | A second run the same day silently overwrites the first. |
| 10 | Nothing detects the job *not running at all* | Schedule disabled or workflow deleted → indefinite silence. |
| 11 | `ops/README.md`, cited by the placeholder, does not exist | Dead pointer; the real instructions are in `docs/runbooks/prod-incident.md` §1. |

## Spec

- Backup logic extracted to `scripts/backup-prod.sh` so it is testable outside CI.
- A failed backup opens (and a healthy one closes) a GitHub issue. An open
  `backup-failure` issue means "prod is unprotected right now".
- Every stage asserts something about its output. Exit 0 is never sufficient.
- The dump is **restored into a scratch Postgres every night** and row-counted —
  the DR drill `docs/runbooks/prod-incident.md` §5 has recorded as
  "Last validated: TBD" since Cycle B now runs continuously.
- 30-day retention that is safe by construction: it can never empty the bucket.
- The whole pipeline is rehearsed in CI against throwaway infrastructure, with
  negative cases asserted to fail.
- No secret value is created, printed or handled anywhere in this cycle.

## Tasks

- [x] **T1** — Extract `scripts/backup-prod.sh` with per-stage subcommands.
- [x] **T2** — Rewrite `.github/workflows/backup.yml` around it: report all
      missing secrets at once, detect the placeholder key by name, restore
      rehearsal, encrypted-payload check, remote size verification, freshness
      guard, safe prune.
- [x] **T3** — Add `alert` / `resolve` jobs so failure is loud and recovery is
      self-clearing.
- [x] **T4** — Add the `Backup Pipeline Self-Test` CI job (fixture Postgres +
      generated GPG keypair + MinIO standing in for R2).
- [x] **T5** — Correct the false environment-protection comment; document the
      owner actions.

## Implementation

### T1 — `scripts/backup-prod.sh` (new)

Subcommands: `check-secrets`, `check-pubkey`, `dump`, `verify-dump`,
`restore-test`, `encrypt`, `verify-encrypted`, `upload`, `verify-remote`,
`check-freshness`, `prune`, `self-test`.

Verification thresholds are env-overridable floors, not targets — they exist to
catch catastrophic degradation, not to police growth: `BACKUP_MIN_BYTES` (20000),
`BACKUP_MIN_TABLES` (20), `BACKUP_REQUIRED_TABLES` (`User Student Parent Invoice
Payment`), `BACKUP_RETENTION_DAYS` (30), `BACKUP_MIN_KEEP` (7),
`BACKUP_MAX_AGE_HOURS` (48).

Notes on two things that are easy to get wrong:

- `restore-test` counts rows via `query_to_xml`, **not** `pg_class.reltuples`.
  `reltuples` is unpopulated immediately after a restore because nothing has
  `ANALYZE`d yet, so a reltuples-based check would report 0 rows on a perfectly
  good dump.
- `must_fail` runs its argument in a **subshell**. The helpers signal failure via
  `die`, which calls `exit`; run inline inside an `if`, that would terminate the
  whole script rather than register as a false condition.

`prune` is safe by construction: it deletes only objects strictly older than the
window, and refuses to act at all unless `BACKUP_MIN_KEEP` recent backups
survive. It cannot prune the bucket to nothing.

### T2/T3 — `.github/workflows/backup.yml` (rewritten)

Pipeline: check secrets → check/import key → dump → verify structure → **restore
into a `postgres:17` service container and count rows** → encrypt → verify the
ciphertext is a real OpenPGP message → shred the plaintext → upload → verify the
remote object's byte length matches → freshness guard → prune.

`alert` opens or comments on a single deduplicated `backup-failure` issue;
`resolve` closes it on the next green run. `permissions: issues: write` added.
Object keys are now timestamped (`YYYY/MM/DD/dump-HHMMSS.pgc.gpg`).

The plaintext dump is shredded after encryption and its absence asserted, so it
cannot leak into a later step.

### T4 — `Backup Pipeline Self-Test` job in `ci.yml`

Fixture Postgres (30 tables, all required tables populated), a GPG keypair
generated in-job, and MinIO as an S3-compatible R2 stand-in. Runs the full
pipeline including a byte-for-byte encrypt→decrypt round-trip, and asserts these
negative cases **fail**: schema-only dump, truncated dump, placeholder key,
mismatched fingerprint, plaintext passed to `verify-encrypted`, remote size
mismatch, empty bucket, and prune breaching the min-keep floor.

## Verification

- `bash -n scripts/backup-prod.sh` → clean.
- Both workflow files parse as YAML; jobs resolve to
  `backup`, `alert`, `resolve` and `lint-typecheck-test`, `build`, `e2e`,
  `backup-selftest`.
- `Backup Pipeline Self-Test` in CI is the substantive proof — full pipeline plus
  eight asserted negative cases. See the PR checks for the run.
- **Not verified, and cannot be from code:** the real prod path. The six secrets
  are unset and the GPG key is a placeholder, so no end-to-end prod run is
  possible until the owner actions below are done. No prod data or existing
  backup was read, written or deleted in this cycle.
- Playwright/preview-verify: **skipped** — CI and ops config only, no `app/**`,
  `lib/**` or frontend diff. Nothing rendered changes.

## Ship Notes

**Migrations:** none. **Rollback:** revert the PR; the backup was non-functional
before it, so there is nothing to lose.

### Owner actions — required, and blocking

The backup stays broken until a human does these. No secret value appears in
this repo, this PR, or any log.

1. **Generate the backup keypair** per `docs/runbooks/prod-incident.md` §1, then
   commit the exported *public* key over `ops/backup-public.asc`. The private key
   goes to 1Password + paper safe and must never reach CI.
2. **Create the R2 bucket** `talib-backups` per `docs/runbooks/prod-setup.md` §2,
   including the 30-day lifecycle rule (the in-workflow prune is the second layer,
   not a replacement).
3. **Set six secrets** on GitHub → Settings → Environments → **Production**:

   | Secret | Contains |
   |---|---|
   | `PROD_DB_URL` | Postgres connection string for the prod Supabase DB (direct connection, not the pooler — `pg_dump` needs session-level access) |
   | `R2_ACCESS_KEY_ID` | R2 API token access key, scoped to `talib-backups`, Object Read & Write |
   | `R2_SECRET_ACCESS_KEY` | the matching secret key |
   | `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
   | `BACKUP_GPG_RECIPIENT` | the key's UID, e.g. `backup@talib.local` |
   | `BACKUP_GPG_FINGERPRINT` | full fingerprint from step 1, no spaces |

4. **Dispatch the workflow manually** and confirm it goes green, then confirm the
   object exists in R2 and the run summary shows a non-zero size and a passed
   restore rehearsal.
5. **Record the DR drill date** in `docs/runbooks/prod-incident.md` §5, which
   still reads "Last validated: TBD".

Note for step 3: the `Production` environment currently has **zero** protection
rules despite the old comment in the workflow claiming required reviewers. Adding
required reviewers would gate every nightly run behind a human approval, so it is
used purely as a secret scope. If gating is wanted, it needs a different design.
