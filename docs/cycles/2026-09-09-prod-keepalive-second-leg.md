# Prod Keepalive — Second Leg After the 2026-09-09 Auto-Pause Recurrence

## Context

Production went fully dark on **2026-09-09**. The prod Supabase project
`vxwywmvpxetdgnxejjgk` (`annisaa-erp-v3-prod-sgp`) auto-paused. Both
`vxwywmvpxetdgnxejjgk.supabase.co` and `db.vxwywmvpxetdgnxejjgk.supabase.co`
returned NXDOMAIN, so Google sign-in failed at the network layer — below the app,
below NextAuth — and `/api/health` returned 503 `db_unreachable`. The owner
restored the project from the Supabase dashboard.

**This is the second occurrence.** `docs/cycles/archive/2026-05-02-hr-module-bugs-and-gaps.md`
recorded both prod projects INACTIVE with prod SSO broken, and filed it as an
out-of-scope "high-priority CTO action". `docs/runbooks/prod-incident.md` §3 says
to "file follow-up task to investigate keepalive gap". Neither follow-up
happened, so it recurred four months later. The lesson is the same one the
nightly-backup postmortem already taught: **filing an owner action is necessary
but not sufficient, because nothing in the system was shouting.**

`app/api/health/route.ts` carries the comment `Doubles as Supabase free-tier
keepalive (5min UR ping = no auto-pause)`. That claim is now falsified twice. The
route itself is correct — it runs `SELECT 1` through Prisma and is
`force-dynamic`, so a request really does touch the database. What failed is the
*caller*: a single external monitor, on a free plan, in a dashboard only the
owner can see, with no in-repo evidence of whether it is even still running.

### What we can and cannot determine from code

Determinable, and confirmed this cycle:

- Supabase MCP `list_projects` now shows `vxwywmvpxetdgnxejjgk` as
  `ACTIVE_HEALTHY` — the restore worked. `udbivhchbizpxoryejgz` (staging-sgp) is
  also `ACTIVE_HEALTHY`. `qrnbanxcrmrwganpmzmn` and `jzhujpqaxyeeokgexerc` remain
  `INACTIVE` and are unused legacy projects.
- `vxwywmvpxetdgnxejjgk.supabase.co` resolves again (Cloudflare A records).

Not determinable from code, and deliberately not guessed at: **why** the
UptimeRobot ping did not hold the project awake. The UR dashboard is owner-only.
The owner checklist is in `docs/runbooks/prod-incident.md` §3 rather than a
speculation here.

### The bigger find: the "fail loudly" mechanism has never worked either

While looking for corroborating evidence of the pause window in the nightly
backup's run history, the backup workflow turned out to still be failing every
night — and, worse, **its `alert` job is failing too**:

```
$ gh run list --workflow=backup.yml   → 122 runs, 0 successes
run 34270189343 (2026-09-08)
  backup   failure  — "Sanity-check required secrets" (the six secrets are still unset)
  alert    failure  — "Open or update the backup-failure issue"
  resolve  skipped
```

The `alert` job's log gives the cause in one line:

```
failed to run git: fatal: not a git repository (or any of the parent directories): .git
##[error]Process completed with exit code 1.
```

The `alert` and `resolve` jobs run `gh issue list` / `gh issue create` **without
an `actions/checkout` step and without `GH_REPO` set**. `gh` resolves the target
repository from the git remote of the working directory; in a bare runner there
is no working directory to resolve from, so every invocation exits 1 before
touching the API. `gh issue list --state open --label backup-failure` returns
zero open issues, which confirms it from the other side: **not one
`backup-failure` issue has ever been opened**, across every night since the alert
job landed on 2026-08-22.

So the repo currently has two nested silent failures: prod backups are broken,
and the alarm for prod backups being broken is broken. Reusing that alert pattern
for a new keepalive workflow without fixing it first would have produced a third
silent failure — a monitor that watches production and tells nobody. Fixing it is
therefore task one of this cycle, not a drive-by.

The corroborating evidence was also worth having in its own right: because the
nightly backup dies at the secret check, it never opens a connection to prod at
all. It is neither a keepalive nor a pause detector today. Had the six secrets
been set, `pg_dump` would have failed loudly on 2026-09-09 and the nightly run
would itself have been a second leg. That is one more reason the owner actions
from `docs/cycles/2026-08-22-nightly-backup-repair.md` still matter.

## Spec

- A **second, independent keepalive** exists that shares no component with
  UptimeRobot: different scheduler, different network origin, different alert
  channel. Either leg failing alone leaves production still monitored.
- The keepalive touches the database on every run, so it is a keepalive and not
  merely a probe. It reaches `/api/health`, which runs `SELECT 1` through Prisma.
- A paused project is a **detected, named signal**, not a generic red build:
  503 + `db_unreachable` classifies as `db_paused` and points at
  `docs/runbooks/prod-incident.md` §3. App-down, DNS-failure and wrong-body cases
  classify separately and point elsewhere.
- **Failure is non-silent, and the non-silence is itself tested.** An alert opens
  a deduplicated GitHub issue that is *assigned* to the repo owner, because
  assignment is what actually generates a notification — an issue merely created
  by `github-actions[bot]` reaches nobody under default watch settings.
- The alert path is one shared, shellchecked, self-tested script used by both the
  keepalive and the nightly backup, so a bug in it cannot exist in one copy and
  not the other.
- Transient blips do not page anyone: a run alerts only after several
  consecutive failed attempts, mirroring UptimeRobot's 3-strike behaviour.
- Recovery is self-clearing: an open alert issue always means "broken right now".
- The whole pipeline is rehearsed in CI against a local fixture server and a stub
  `gh`, with the negative cases asserted to fail.
- `docs/runbooks/prod-incident.md` §3 records the recurrence and a fast diagnosis
  path that pins an auto-pause in under a minute.

**Non-goals.** Not touching any credential, secret value, or dashboard setting —
UptimeRobot, Supabase, Vercel and GitHub secrets are all owner actions, surfaced
in Ship Notes. Not setting the six nightly-backup secrets. Not changing
`app/api/health/route.ts` behaviour. Not adding a paid uptime service. Not
upgrading the Supabase plan, which is the only true fix for auto-pause and is a
commercial decision, not an engineering one.

**Assumptions.**
1. Every-3-hours is the right cadence: 8 pings/day against a 7-day idle timer is
   ~56x margin, survives GitHub delaying scheduled runs under load, and costs
   ~250 runner-minutes/year.
2. The repo owner (`github.repository_owner`) is the right assignee for prod
   alerts. There is no on-call rotation.
3. GitHub Actions is genuinely independent of UptimeRobot for this purpose. Both
   ultimately depend on the public internet reaching Vercel, but they share no
   account, scheduler, or notification channel.

## Tasks

- [x] **T1** — `scripts/alert-issue.sh`: one shared, tested implementation of
      deduplicated open/close GitHub-issue alerting, with owner assignment and an
      injectable `gh` for testing.
      *Accepts when:* `self-test` passes against a stub `gh`, including the
      dedup, assignment and close paths, and `shellcheck --severity=warning` is
      clean.
- [x] **T2** — Repair `backup.yml`'s `alert` / `resolve` jobs to use it, fixing
      the `not a git repository` defect that has silenced them since 2026-08-22.
      *Accepts when:* both jobs set `GH_REPO` and call the shared script; no
      `gh` invocation depends on a checkout.
- [x] **T3** — `scripts/keepalive-probe.sh`: retrying probe plus a pure
      `classify` that maps HTTP status and body to a named failure class.
      *Accepts when:* `self-test` drives a real local HTTP server through
      healthy / 503-paused / 500 / wrong-body / connection-refused and asserts
      each classification, and negative cases fail.
- [x] **T4** — `.github/workflows/keepalive.yml`: 3-hourly probe, cadence
      self-check, and alert / resolve jobs built on T1.
      *Accepts when:* the workflow parses, jobs resolve to
      `keepalive`, `alert`, `resolve`, and no `gh` call lacks `GH_REPO`.
- [x] **T5** — Wire a `Keepalive & Alert Self-Test` job into `ci.yml` so both new
      scripts are regression-guarded on every PR.
      *Accepts when:* the job runs both self-tests and shellchecks both scripts.
- [x] **T6** — `docs/runbooks/prod-incident.md`: §3 rewritten with the
      2026-09-09 recurrence, the sub-minute diagnosis path, and the owner-only
      UptimeRobot checklist; §8 and the followups list brought into line.
      *Accepts when:* `bash scripts/audit-docs.sh` exits 0.

## Implementation

- Subagent plan: driver=claude-opus-5, no fan-out. Six tasks, all sequential and
  all touching the same two-script/two-workflow surface — T2, T4 and T5 consume
  T1's interface directly, and T6 documents the result. Parallel dispatch would
  have cost more in interface-restatement than it saved, so this is the
  documented exception in CLAUDE.md § the expensive-driver rule rather than a
  violation of it. The evidence-gathering that produced the Context section
  (workflow history, job logs, Supabase project status) was the expensive part
  and is where the driver's time actually went.

### Worktree deviation

This cycle ran in the main checkout on branch `claude/modest-hopper-8tfx9t`, not
in a `feat/*` worktree. The session harness mandates that branch by name and
pushes only there, which `setup-worktree.sh`'s `feat/<slug>` convention would
contradict. Recorded here rather than silently diverging; the isolation the
worktree rule protects (no shared mutable state between parallel harnesses) is
provided instead by this session's own ephemeral container.

### T1 — `scripts/alert-issue.sh` (new)

Subcommands `open` and `close`, plus `self-test`.

`open <label> <title> <body-file>` finds an existing open issue with that label
and title, comments on it if present, otherwise creates it — creating the label
first if it does not exist. `close <label> <comment>` closes every open issue
carrying the label. Both are idempotent.

Three things this fixes relative to the inline version it replaces:

- **`GH_REPO` is asserted, not assumed.** The script exits with a named error if
  neither `GH_REPO` nor a git remote is available, so the failure mode that
  silenced `backup.yml` for eighteen nights cannot recur silently — it now says
  what is wrong instead of `fatal: not a git repository`.
- **New issues are assigned.** `--assignee` on creation is what generates the
  notification. GitHub does not notify a repo owner about an issue opened by
  `github-actions[bot]` under the default "participating and @mentions" watch
  setting, which is the second half of why 122 red nights produced no signal. The
  body also `@`-mentions the assignee as a belt-and-braces second trigger.
- **`gh` is injectable.** `GH_BIN` defaults to `gh`; the self-test points it at a
  stub that records its argv, so the dedup, assignment and close paths are
  asserted without touching the real API. An alert path that is only exercised
  during an outage is an alert path nobody has tested.

The assignment is best-effort by design: `--assignee` is retried without the flag
if GitHub rejects the login, because an unassigned alert issue is still far
better than no issue at all. That fallback is asserted in the self-test.

### T2 — `.github/workflows/backup.yml` (alert / resolve repaired)

Both jobs now set `GH_REPO: ${{ github.repository }}` and shell out to
`scripts/alert-issue.sh`, which requires a checkout — added to both jobs, since
they need the script itself. The `backup-failure` label, title and
reuse-and-close semantics are unchanged, so any issue history stays continuous.

### T3 — `scripts/keepalive-probe.sh` (new)

`classify <curl-exit> <http-code> <body>` is a pure function returning one of
`healthy`, `db_paused`, `app_error`, `unreachable`, `bad_body`. Keeping it pure
and separate is what makes the interesting cases testable without a network:
`db_paused` (503 + `db_unreachable`) is the auto-pause signature this whole cycle
exists to catch, and it must never be confused with `app_error`, which points at
runbook §1 instead of §3.

`probe <url>` retries `KEEPALIVE_ATTEMPTS` times (default 3) with
`KEEPALIVE_RETRY_DELAY` seconds between them (default 20), and reports down only
if every attempt fails — a single blip is not an outage. It reports the *last*
classification rather than the first, so a project mid-restore reads as recovered
rather than paused. `curl --max-time` is bounded so a hung connection cannot pin
the runner for its full timeout budget.

`self-test` starts a real Python HTTP server on a loopback port and drives it
through healthy, 503-paused, 500, 200-with-wrong-body and connection-refused,
asserting the classification of each and asserting that the failing cases make
`probe` exit non-zero. It borrows `must_fail`'s subshell trick from
`backup-prod.sh` for the same reason documented there: `die` calls `exit`, so an
inline `if` would kill the script rather than register a false condition.

### T4 — `.github/workflows/keepalive.yml` (new)

`0 */3 * * *` plus `workflow_dispatch`. The probe step classifies; the failure
message names the class, the runbook section, and — for `db_paused` — the exact
two commands from runbook §3 that confirm it.

A `check-cadence` step compares the current run against the previous successful
run of this same workflow and fails if the gap exceeds `KEEPALIVE_MAX_GAP_HOURS`
(default 12, against a 3-hour schedule). This is the analogue of the nightly
backup's `check-freshness` and closes the same failure mode: a schedule that
quietly becomes erratic.

**Its limit, stated plainly:** a run that never happens cannot check its own
freshness, so this does *not* catch the schedule stopping outright — which
GitHub will do after 60 days of repo inactivity. That blind spot is exactly the
one UptimeRobot covers, and UptimeRobot's blind spot (a single owner-only
dashboard with no in-repo evidence) is the one this workflow covers. Neither leg
is sufficient; the argument for this design is that their failure modes do not
overlap, not that either is complete.

`concurrency` with `cancel-in-progress: false` keeps a slow run from being
cancelled by the next scheduled one mid-probe.

### T5 — `Keepalive & Alert Self-Test` job in `ci.yml`

Shellchecks both new scripts and runs both self-tests. No service containers and
no secrets — the fixture server and the stub `gh` are both local, so the job is
fast and cannot touch production.

### T6 — `docs/runbooks/prod-incident.md`

§3 rewritten: both occurrences dated, the sub-minute diagnosis path, the
owner-only UptimeRobot checklist, and the second leg documented with its limits.
§8 gains the checklist cross-reference. The stale
"file follow-up task to investigate keepalive gap" line is replaced by what the
follow-up actually concluded.

## Verification

Gates, run on the final tree:

```
npm run build   → success (Next.js 16, 100 static pages, no type errors)
npx vitest run  → 3138 passed | 42 todo (3180), 0 failed
shellcheck --severity=warning scripts/alert-issue.sh scripts/keepalive-probe.sh → clean
bash -n on both scripts → clean
bash scripts/audit-docs.sh → exit 0
```

Substantive proof, both self-tests run locally end to end:

```
$ bash scripts/keepalive-probe.sh self-test
  OK — healthy: 200 + ok:true classified as healthy
  OK — paused: 503 + db_unreachable classified as db_paused
  OK — app error: 500 classified as app_error
  OK — wrong body: 200 without ok:true classified as bad_body
  OK — unreachable: connection refused classified as unreachable
  OK — probe exits 0 against a healthy server
  OK — probe exits non-zero against a paused server
  OK — probe exits non-zero against an unreachable port
  OK — probe recovers when a later attempt succeeds
  OK — self-test passed

$ bash scripts/alert-issue.sh self-test
  OK — missing GH_REPO is reported by name
  OK — first failure creates the issue, with label and assignee
  OK — second failure comments instead of creating a duplicate
  OK — assignment failure falls back to an unassigned issue
  OK — close closes every open issue carrying the label
  OK — close on no open issues is a no-op
  OK — self-test passed
```

Both workflows parse as YAML and their jobs resolve to the expected names
(`keepalive`, `alert`, `resolve`; `backup`, `alert`, `resolve`).

**Asserted about the repaired alert path specifically:** every `gh` invocation in
both workflows now runs with `GH_REPO` set and after a checkout. Grepping both
workflow files for `gh ` outside those two conditions returns nothing.

**Not verified, and not verifiable from here:**

- The live prod endpoint. This session's sandbox proxy refuses the host
  (`curl: (56) CONNECT tunnel failed, response 403`), so no request to
  `talib.annisaasekolahku.com` was made from this cycle. The first real
  end-to-end proof is the workflow's own first scheduled run on `main`.
- Whether the keepalive workflow's issue actually lands in the owner's inbox.
  That depends on the owner's GitHub notification settings, which is an owner
  action in Ship Notes.
- Why the UptimeRobot monitor did not hold the project awake. Owner-only
  dashboard; the checklist is in runbook §3 rather than a guess here.
- No production system was read, written, woken or paused in this cycle. The one
  production touch was a read-only Supabase MCP `list_projects` to confirm the
  restore.

Playwright: **deferred to the required CI `Playwright E2E` check.** Preview-verify
and `design-system` cross-check: **skipped** — the diff is CI, ops scripts and
docs only, with no `app/**`, `lib/**`, `components/**` or any frontend file
touched, so nothing rendered changes.

## Ship Notes

**Migrations:** none. **Env vars:** none. **Secrets:** none added, none read.

**Rollback:** revert the PR. The keepalive is purely additive — nothing depends on
it — and `backup.yml`'s alert jobs would simply return to the broken state they
have been in since 2026-08-22, which is no worse than today.

**Deploy note:** scheduled workflows only run from the repository's *default
branch*. This keepalive therefore does nothing at all until the PR reaches
`main` via `/ship --to-main`. Merging to `staging` alone is not enough, and the
absence of runs before that promotion is expected, not a fault.

### Owner actions

**1. Check UptimeRobot — the first leg, still unexplained.** Owner-only
dashboard. Work `docs/runbooks/prod-incident.md` §3's checklist and report back
what the monitor's history shows for 2026-08-22 → 2026-09-09. Until that is
answered we do not know whether leg one is working, and this cycle has only
rebuilt the redundancy, not diagnosed the original failure.

**2. Confirm the alert actually reaches you.** After the promotion to `main`,
dispatch the keepalive workflow manually with a deliberately wrong URL
(`workflow_dispatch` accepts a `url` input for exactly this rehearsal) and
confirm an assigned `prod-down` issue appears *and* that you receive the
notification. An alert path first exercised during an outage is not an alert
path. Check GitHub → Settings → Notifications if the issue appears but no mail
does.

**3. Set the six nightly-backup secrets.** Still outstanding from
`docs/cycles/2026-08-22-nightly-backup-repair.md` — 122 consecutive red nights,
and prod still has no backup of any kind. With them set, the nightly `pg_dump`
becomes a third independent pause detector as a side effect. The repaired alert
job in this cycle means the next failure will finally open an issue.

**4. Consider the $25/mo Supabase Pro plan.** Auto-pause does not exist on paid
plans. Every mechanism in this cycle is a workaround for a free-tier constraint,
and two outages in four months is the running cost of that constraint. This is a
commercial call, deliberately not made here.

**5. Check the free-tier project cap.** A Supabase free organisation allows two
active projects. `cxvijwljlmdmohemvvau` holds four, of which exactly two are
active: staging-sgp and prod-sgp. Waking either legacy project
(`qrnbanxcrmrwganpmzmn`, `jzhujpqaxyeeokgexerc`) could force one of the two live
projects to pause regardless of how much traffic it is getting — a pause no
keepalive on earth can prevent. If either legacy project is genuinely dead,
deleting it removes that risk entirely.
