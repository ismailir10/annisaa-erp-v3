# Production Incident Runbook — Talib

Operational playbook for `talib.annisaasekolahku.com` and the systems it depends on. Follow the section that matches the symptom; each section ends with "verify recovery" steps.

**Pre-launch baseline:**
- Hosting: Vercel Hobby, project links `main` → `talib.annisaasekolahku.com`, `staging` → preview URL
- DB: Supabase free, prod project `vxwywmvpxetdgnxejjgk` (`annisaa-erp-v3-prod-sgp`, ap-southeast-1)
- Backups: nightly `0 17 * * *` UTC (00:00 WIB) GitHub Actions → R2 `talib-backups`, 30-day lifecycle
- Monitoring: UptimeRobot `/api/health` 5min, email alert
- Payments: Xendit prod merchant; webhook `https://talib.annisaasekolahku.com/api/xendit/webhook`

**Always do first when an alert fires:**
1. Open Vercel project dashboard → check current production deployment status
2. Open Supabase project `vxwywmvpxetdgnxejjgk` → check status (sometimes auto-paused)
3. `curl -i https://talib.annisaasekolahku.com/api/health` — interpret the response

| Response | Likely cause |
|---|---|
| 200 `{ok:true,sha:...}` | App + DB healthy. UR alert is stale or transient. |
| 503 `{ok:false,error:"db_unreachable"}` | DB down. Jump to §3 Supabase auto-pause or §4 DB outage. |
| Connection refused / 5xx HTML | App down or Vercel deploy broken. Jump to §1. |
| 200 but old SHA | Deploy stuck. Jump to §2. |

---

## §1 — Vercel rollback (deploy bricked production)

Symptom: app returns 5xx, blank page, or visible JS errors after a recent deploy.

```bash
# List recent prod deployments
vercel ls --prod

# Rollback to the previous good deployment (replace <hash>)
vercel rollback <deployment-url> --yes

# OR via Vercel UI: Project → Deployments → previous good build → "Promote to Production"
```

Verify recovery:
- `curl -i https://talib.annisaasekolahku.com/api/health` → 200
- Spot-check parent portal home + invoice list

If rollback also fails, the issue is downstream (DB, Xendit, Resend) — jump to relevant section.

---

## §2 — Stuck deploy (new code merged, prod still serves old)

Symptom: `/api/health` returns the previous git SHA; users not seeing the new code.

```bash
# Check deployment status
vercel ls --prod

# Force a rebuild on main
git fetch origin main && git checkout main && git pull
vercel --prod --force
```

Verify: `/api/health` shows the new SHA.

---

## §3 — Supabase auto-pause (free-tier idle)

Symptom: `/api/health` returns 503 + `db_unreachable`. Vercel logs show pooler timeout / connection refused. No app code changed.

Free-tier projects auto-pause after 7 days idle. UptimeRobot's 5-min `/api/health` ping is supposed to keep the DB alive — if pause triggers anyway, the keepalive failed (UR was paused, network blip, etc).

```bash
# Recovery: reactivate via Supabase dashboard
# 1. Open https://supabase.com/dashboard/project/vxwywmvpxetdgnxejjgk
# 2. Click "Restore project" or "Wake up" (free tier shows this when paused)
# 3. Wait ~30-60s for the project to come back online
# 4. curl /api/health until 200 returned

# Then investigate why keepalive failed:
# - UptimeRobot dashboard → check monitor history for the gap
# - If UR was paused: unpause + add a backup channel (manual pg_isready cron or similar)
```

Post-recovery: file follow-up task to investigate keepalive gap.

---

## §4 — DB outage that's not auto-pause

Symptom: 503 from `/api/health`, Supabase project status is "active" not paused, but pooler / direct connections timeout.

```bash
# Check Supabase status page
open https://status.supabase.com

# Try direct connection
psql "$PROD_DIRECT_URL" -c "SELECT 1"

# If direct works but pooler doesn't:
# - Connection string issue OR pooler instance restart
# - Restart the pooler from Supabase dashboard → Settings → Database → Connection pooling

# If neither works:
# - Open Supabase support ticket (paid users only) OR wait for status.supabase.com update
# - Communicate the outage to users via email blast (no public status page yet)
```

If outage > 2h, evaluate restoring from R2 backup to a fresh Supabase project + pointing Vercel at it. See §5.

---

## §5 — R2 backup restore (catastrophic data loss)

Use when: prod DB corrupted, accidentally truncated, or Supabase project deleted. Requires the GPG private key (1Password vault `Talib Backups` or paper safe).

```bash
# 1. Pull the most recent backup from R2
DATE=$(date -u +%Y/%m/%d)
# Or pick a specific date if today's backup is the cause:
# DATE=2026-05-02

aws s3 cp "s3://talib-backups/$DATE/dump.pgc.gpg" /tmp/dump.pgc.gpg \
  --endpoint-url "$R2_ENDPOINT"

# 2. Import the private key (one-time per workstation)
gpg --import /path/to/talib-backup-private.asc

# 3. Decrypt
gpg -d /tmp/dump.pgc.gpg > /tmp/dump.pgc

# 4. Restore. Two paths:

# 4a. Restore IN PLACE — wipes prod schema, replays the dump. NEVER run on a healthy DB.
pg_restore -d "$PROD_DIRECT_URL" --clean --if-exists /tmp/dump.pgc

# 4b. Restore to a SCRATCH project first to validate, then promote.
# Reactivate an inactive Supabase project (e.g. qrnbanxcrmrwganpmzmn) via dashboard.
# Get its direct URL.
pg_restore -d "$SCRATCH_DIRECT_URL" /tmp/dump.pgc
# Verify row counts. Then update Vercel envs (DATABASE_URL, DIRECT_URL,
# NEXT_PUBLIC_SUPABASE_URL, etc) to point at the scratch project.
# This is the safer path during a real incident.
```

Verify recovery:
- `psql "$DIRECT_URL" -c 'SELECT COUNT(*) FROM "Student"'` returns expected count
- Spot-check 1 student via `SELECT * FROM "Student" LIMIT 1`
- `curl /api/health` → 200
- Parent portal home + 1 invoice render correctly

**Last validated: TBD (T8 DR drill — record date + restored row counts here when drill runs).**

---

## §6 — Xendit webhook re-point (URL change or migration)

Default: `https://talib.annisaasekolahku.com/api/xendit/webhook`. Re-point if the domain changes or you cut over to a new project.

```
1. Xendit dashboard → Settings → Callbacks → Payment Session
2. Update URL to the new endpoint
3. Click "Test" — Xendit dispatches a test event
4. Check Vercel logs for the receiving deployment:
   vercel logs --prod | grep "x-callback-token"
   Expect: signature-valid log line, no 4xx/5xx
5. If test fails (404 / 401):
   - 404 → URL typo, Vercel deployment missing, or path wrong (correct path is /api/xendit/webhook NOT /api/webhooks/xendit)
   - 401 → XENDIT_WEBHOOK_TOKEN mismatch between Vercel env and Xendit dashboard
6. After test passes, save the URL in Xendit dashboard
```

---

## §7 — Branch protection (currently DEFERRED)

**Status:** branch protection / rulesets NOT enabled. Verified 2026-05-03 — GitHub Free plan blocks both APIs on private repos (returns 403 "Upgrade to GitHub Pro or make this repository public"). Cycle B accepted this gap.

**What protects main + staging today:**
- `pre-push` git hook (`.githooks/pre-push`) — blocks direct push to main/staging for all roles. Bypassable with `--no-verify`.
- CTO discipline — only push via `/ship` PR flow.

**To enable when ready (one-time, $4/mo Pro upgrade):**

```bash
# After upgrading to GitHub Pro:
gh api -X POST repos/ismailir10/annisaa-erp-v3/rulesets \
  --input ops/ruleset-main.json
# Then duplicate the ruleset for staging by editing the include pattern
# in ops/ruleset-main.json from "~DEFAULT_BRANCH" to "refs/heads/staging"
# and re-running, OR use the legacy branch-protection API:
gh api -X PUT repos/ismailir10/annisaa-erp-v3/branches/staging/protection \
  --input ops/branch-protection.json
```

**Emergency hotfix path (once protection IS enabled):**

```bash
# Find the active ruleset
gh api repos/ismailir10/annisaa-erp-v3/rulesets --jq '.[].id'

# Temporarily disable
gh api -X PATCH repos/ismailir10/annisaa-erp-v3/rulesets/<id> \
  -F enforcement=disabled

# ...do the hotfix, push, verify...

# Re-enable
gh api -X PATCH repos/ismailir10/annisaa-erp-v3/rulesets/<id> \
  -F enforcement=active
```

GitHub's audit log records both PATCH calls, so the disable window is auditable.

**Sanity check before disabling:** if CI is failing on a legit hotfix PR, first try:
1. Re-running the failing job (`gh run rerun`)
2. Waiting 5 minutes for transient flake
3. Marking the failing job as not-required (PATCH the ruleset's `required_status_checks` to drop the failing one)

Only disable enforcement if minutes-of-downtime cost > audit-log noise.

---

## §8 — UptimeRobot alert tuning

If alerts fire too often (false positives) or too rarely (real outages missed):

- Public status: https://stats.uptimerobot.com/WsNlx9OOOz
- Default config: `/api/health`, 5min, HTTP 200 expected, alert on 3 consecutive failures (~15min before notify)
- Adjust at: uptimerobot.com → Monitor → Edit
- Free tier limits: 50 monitors, 5min minimum interval, email + SMS only (no WhatsApp without Pro upgrade)

---

## §9 — Communications during incident

No status page yet — communicate via email blast to all-staff distribution list.

Template (Indonesian):
```
Subject: Talib — gangguan sementara

Assalamu'alaikum,

Saat ini Talib sedang mengalami gangguan. Kami sedang menanganinya
dan akan memberi kabar segera setelah pulih.

Estimasi pulih: <waktu>
Layanan terdampak: <portal admin/teacher/parent atau webhook pembayaran>
Workaround: <jika ada, mis. "tagihan tetap bisa dilihat di Xendit langsung">

Mohon maaf atas ketidaknyamanan ini.
Tim Talib
```

After resolution, send a follow-up with: what happened, when it started, when it pulih, what we're doing to prevent recurrence.

---

## Phone numbers + accounts

| Service | Account | Recovery key location |
|---|---|---|
| Vercel | ismails-projects | 1Password "Vercel" |
| Supabase | ismailir10 | 1Password "Supabase" |
| GitHub | ismailir10 | 1Password "GitHub" + recovery codes printed |
| Cloudflare R2 | (same as DNS account) | 1Password "Cloudflare" |
| GPG backup private key | — | 1Password "Talib Backups" + paper safe |
| Xendit | (school account) | 1Password "Xendit" |
| Resend | ismails account | 1Password "Resend" |
| UptimeRobot | ismails account | 1Password "UptimeRobot" |

---

## Followups (deferred from Cycle B)

- **GitHub branch protection / rulesets** — needs Pro $4/mo on private repos. Pre-push hook + discipline only today. Ruleset JSON staged at `ops/ruleset-main.json` ready for execution after upgrade.
- HSTS preload submission to https://hstspreload.org (defer +30d post-launch — irreversible if shipped early)
- CSP graduate Report-Only → enforcing (defer +1wk post-launch once `/api/csp-report` shows zero noise from legitimate flows)
- Sentry / Datadog observability (current MTTR = manual log-grep)
- WhatsApp alerts via UptimeRobot Pro upgrade or Twilio integration
- Upstash Redis global rate-limit (replace in-memory once traffic warrants)
