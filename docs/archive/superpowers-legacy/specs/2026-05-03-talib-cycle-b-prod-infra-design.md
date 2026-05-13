# Talib Cycle B — Production Infrastructure — Design

**Date:** 2026-05-03
**Author:** ismailir10 (CTO)
**Status:** Approved design, awaiting `/spec` kickoff
**Parent spec:** [`2026-05-02-talib-production-launch-design.md`](./2026-05-02-talib-production-launch-design.md) §8

---

## 1. Goal

Stand up production infrastructure so `talib.annisaasekolahku.com` can serve real users on Cycle C launch day. No user-facing UI changes — pure infra hardening: prod database, backups, monitoring, security headers, branch protection, runbook.

## 2. Locked decisions (from umbrella spec + brainstorm)

| Decision | Value |
|---|---|
| Supabase prod project | Reuse existing `vxwywmvpxetdgnxejjgk` (`annisaa-erp-v3-prod-sgp`, ACTIVE_HEALTHY, region `ap-southeast-1`) — do not create new |
| Migration strategy | `prisma migrate deploy` against prod direct URL |
| Xendit prod webhook URL | `https://talib.annisaasekolahku.com/api/xendit/webhook` (already configured in Xendit dashboard 2026-05-03; umbrella spec carried wrong path `/api/webhooks/xendit` — fixed in Task 11) |
| Rate limit storage | In-memory token bucket per Vercel instance; accept N-instance leakage |
| CSP enforcement | Add fresh as Report-Only (proxy.ts currently has none); graduate to enforcing post-launch +1wk |
| `/api/health` scope | DB-aware (`SELECT 1`); 200/503; UR ping every 5min |
| UptimeRobot alerts | Email-only Day 1; defer WhatsApp until Pro upgrade |
| GPG key | ED25519 keypair, public in repo (`ops/backup-public.asc`), private in 1Password + paper safe |
| Branch protection bypass | None by default; manual toggle for incidents documented in runbook |
| DR drill scratch project | Pause staging → reactivate inactive `qrnbanxcrmrwganpmzmn` → restore drill → pause back → unpause staging |
| Supabase Preview integration | Disconnect stale PR-166 ref `uxfvnrawepquktlvwhlt`; skip per-PR DB branches entirely |

## 3. Scope

**In scope (11 tasks):** prod migrations, `/api/health`, security headers, rate limit, env audit, R2 backups, DR drill, UptimeRobot, branch protection, runbook, docs sync.

**Out of scope:**
- Sentry / observability tooling
- Upstash Redis / global rate limit
- Twilio WhatsApp alerts
- Repo rename (`annisaa-erp-v3` → `talib`)
- Per-PR Supabase Preview branches
- New Playwright e2e specs (regression-only run)
- Any user-facing UI changes (frontend-gate doesn't fire)

## 4. Tasks + ordering

Each task = one commit. Between-task gate: `npm run build && npx vitest run`.

| # | Task | Touches | Reversible? |
|---|---|---|---|
| 1 | Run prisma migrations on prod Supabase `vxwywmvpxetdgnxejjgk` (`prisma migrate deploy` against direct URL) | DB only (no repo diff) | Hard — schema mutations. Pre-run pg_dump captures empty-state baseline |
| 2 | `/api/health` endpoint + unit test | `app/api/health/route.ts`, `app/api/__tests__/health.test.ts` | Trivial |
| 3 | Security headers in proxy.ts (CSP Report-Only, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) + `/api/csp-report` log endpoint | `proxy.ts`, `lib/security/headers.ts` (new), `app/api/csp-report/route.ts` (new) | Trivial |
| 4 | In-memory rate limit on `/api/auth/*` (5 req/min/IP) | `lib/security/rate-limit.ts` (new), wired in `proxy.ts` | Trivial |
| 5 | Vercel env audit script — list prod scope env keys, diff vs `.env.example`, fail on extras/missing | `scripts/audit-vercel-env.ts` (new) | Trivial — read-only |
| 6 | GPG keypair gen + R2 bucket + GitHub Actions backup workflow (nightly cron `0 17 * * *` UTC = 00:00 WIB) | `.github/workflows/backup.yml` (new), `ops/backup-public.asc` (new) | Trivial |
| 7 | Verify first nightly backup — manual `workflow_dispatch` trigger; check R2 bucket has encrypted blob | None (verification only) | N/A |
| 8 | DR drill — pause staging → reactivate `qrnbanxcrmrwganpmzmn` → restore latest R2 dump → verify schema + sample queries → pause back → unpause staging | None (operational) | ~30min staging downtime, scheduled off-hours |
| 9 | UptimeRobot config — `/api/health` 5min interval, email alert | None (external config) | Trivial |
| 10 | GitHub branch protection on `main` + `staging` via `gh api` (require PR + 3 CI checks; `enforce_admins=true`; no force-push; no deletions) | None (GitHub UI) | Trivial |
| 11 | Docs sync — README env table (Mumbai/Tokyo → Singapore), prod URL, umbrella spec webhook URL fix, write `docs/runbooks/prod-incident.md` | `README.md`, `docs/superpowers/specs/2026-05-02-talib-production-launch-design.md`, `docs/runbooks/prod-incident.md` (new) | Trivial |

**Ordering rationale:**
- T1 first — schema must exist before anything queries it
- T2-T4 = code changes; T5 catches env drift before T6's workflow needs them
- T6 deploys workflow → T7 verifies it ran → T8 proves restore works → safe to T9 turn on monitoring
- T10 last among infra (after CI check job names confirmed stable)
- T11 last — README references the state we just set up

## 5. Component details

### 5.1 T1 — Migration apply

```bash
DATABASE_URL="postgres://...@db.vxwywmvpxetdgnxejjgk.supabase.co:5432/postgres" \
DIRECT_URL="postgres://...@db.vxwywmvpxetdgnxejjgk.supabase.co:5432/postgres" \
  npx prisma migrate deploy
```

Pre-run: take manual `pg_dump` of empty prod (audit baseline). Verify `prisma migrate diff --from-url $STAGING_DIRECT --to-url $PROD_DIRECT` is empty before T1; abort if non-empty (someone hand-modified staging). Post-run: `_prisma_migrations` row count = `ls prisma/migrations/ | wc -l`. Run `npx tsx scripts/verify-rls-coverage.ts` against prod.

### 5.2 T2 — `/api/health`

```ts
// app/api/health/route.ts
// @public — UptimeRobot ping target. No auth.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "db_unreachable" }, { status: 503 });
  }
}
```

Unit test: mock `prisma.$queryRaw` → assert 200 on success, 503 on throw, response shape includes `ok` and `sha` keys.

### 5.3 T3 — Security headers (`lib/security/headers.ts`)

Headers attached to every NextResponse in proxy.ts:

| Header | Value |
|---|---|
| `Content-Security-Policy-Report-Only` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.xendit.co https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.xendit.co https://api.resend.com; frame-ancestors 'none'; report-uri /api/csp-report` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

`/api/csp-report` endpoint logs payload to stdout (Vercel logs ingest). No DB write. Reviewed weekly post-launch; promoted from Report-Only to enforcing once noise = 0.

### 5.4 T4 — Rate limit (`lib/security/rate-limit.ts`)

```ts
// In-memory token bucket. Per-instance only — N-instance leakage accepted.
type Bucket = { tokens: number; reset: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  // Lazy GC — drop expired buckets on access (cap memory)
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { tokens: max - 1, reset: now + windowMs });
    return { ok: true };
  }
  if (b.tokens <= 0) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.tokens--;
  return { ok: true };
}
```

Wired in proxy.ts on `/api/auth/*` only:
- `key = ip + ":" + pathname`
- `max = 5`, `windowMs = 60_000`
- 429 + `Retry-After` header on rejection

### 5.5 T6 — Backup workflow (`.github/workflows/backup.yml`)

```yaml
name: Nightly Backup
on:
  schedule:
    - cron: '0 17 * * *'  # 00:00 WIB
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Import GPG public key
        run: gpg --import ops/backup-public.asc
      - name: Dump
        env:
          DB_URL: ${{ secrets.PROD_DB_URL }}
        run: pg_dump "$DB_URL" --format=custom --no-owner --no-acl > dump.pgc
      - name: Encrypt
        run: gpg --batch --yes --trust-model always --encrypt --recipient backup@talib.local --output dump.pgc.gpg dump.pgc
      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_ENDPOINT_URL: ${{ secrets.R2_ENDPOINT }}
        run: |
          DATE=$(date -u +%Y/%m/%d)
          aws s3 cp dump.pgc.gpg "s3://talib-backups/$DATE/dump.pgc.gpg"
```

R2 bucket `talib-backups`: lifecycle rule deletes objects > 30 days. Public key (`ops/backup-public.asc`) committed; private key NEVER committed — 1Password vault + paper safe. GPG keypair UID = `Talib Backup <backup@talib.local>` (synthetic, never receives mail). `aws-cli` is pre-installed on `ubuntu-latest` GitHub runners; no install step needed.

### 5.6 T8 — DR drill procedure

1. Off-hours notification (no users on staging — internal only)
2. Pause staging via Supabase MCP `pause_project udbivhchbizpxoryejgz`
3. Reactivate `qrnbanxcrmrwganpmzmn` via Supabase dashboard
4. Pull latest R2 backup → `gpg -d dump.pgc.gpg > dump.pgc` → `pg_restore -d $SCRATCH_DIRECT_URL dump.pgc`
5. Verify: row counts match staging pre-pause for `Student`, `Invoice`, `User`; spot-check 1 invoice via `SELECT`
6. Pause `qrnbanxcrmrwganpmzmn`
7. Unpause staging via Supabase MCP
8. Document timing + commands + results in `docs/runbooks/prod-incident.md` §Restore

### 5.7 T10 — Branch protection

Required CI checks (job names from `.github/workflows/ci.yml`):
- `Lint, Typecheck & Test`
- `Build`
- `Playwright E2E`

Settings:
- `required_pull_request_reviews=null` (solo founder, no human reviewer required)
- `enforce_admins=true` (no owner bypass)
- `restrictions=null`
- `allow_force_pushes=false`
- `allow_deletions=false`

Same on `main` and `staging`. Manual toggle for incidents documented in runbook.

## 6. Verification

### 6.1 End-of-cycle gate
- `npm run build && npx vitest run && npx playwright test` all green
- New unit test: `app/api/__tests__/health.test.ts` covers 200 + 503 paths
- Playwright = regression-only (no new specs); zero diff expected
- `design-system` token NOT required in cycle doc — frontend-gate doesn't fire

### 6.2 Per-task verification

| # | Verify |
|---|---|
| 1 | `_prisma_migrations` row count matches staging; `verify-rls-coverage.ts` exits 0 |
| 2 | `curl https://talib.annisaasekolahku.com/api/health` → 200 with `{ok:true,sha:...}` |
| 3 | DevTools Network → response headers include CSP-Report-Only + HSTS + X-Frame-Options on `/` |
| 4 | `for i in 1..7; curl -i .../api/auth/test; done` — 6th + 7th return 429 + Retry-After |
| 5 | `npx tsx scripts/audit-vercel-env.ts` exits 0 against prod scope |
| 6 | First `workflow_dispatch` run completes; R2 bucket has `YYYY/MM/DD/dump.pgc.gpg` |
| 7 | Local decrypt: `gpg -d dump.pgc.gpg \| pg_restore --list \| head` shows table list |
| 8 | DR drill log in runbook: timing, commands, restored row counts vs source |
| 9 | UR dashboard: monitor green ≥24h before Cycle C |
| 10 | `gh api repos/.../branches/main/protection` confirms rules; force-push attempt rejected |
| 11 | README env table reads "Singapore" not "Mumbai/Tokyo"; umbrella spec webhook URL = `/api/xendit/webhook` |

## 7. Ship Notes (template — filled by `/build` after last task)

- **Migrations:** `prisma migrate deploy` run on `vxwywmvpxetdgnxejjgk`, N migrations applied
- **New env vars (production scope):** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `BACKUP_GPG_RECIPIENT` — added via Vercel UI before merge
- **New GitHub secrets:** same four + `PROD_DB_URL` for backup workflow
- **External config (manual, post-merge):**
  - UptimeRobot monitor created → `/api/health`, 5min, email alert
  - GitHub branch protection enabled on `main` + `staging`
  - R2 bucket `talib-backups` created + 30-day lifecycle rule
  - GPG keypair: public in repo `ops/backup-public.asc`; private in 1Password + paper safe
- **Rollback:** revert merge commit; security headers / rate limit / health endpoint all soft (no DB schema dependency); T1 migrations NOT auto-rollback — recovery path = `qrnbanxcrmrwganpmzmn` restore

## 8. Risks specific to Cycle B

| Risk | Mitigation |
|---|---|
| Migration drift staging vs prod (someone hand-modified staging schema) | `prisma migrate diff` between staging + prod direct URLs run pre-T1; abort if non-empty |
| Vercel env var `PROD_DB_URL` accidentally pointed at staging | T5 audit script + visual confirmation before T6 workflow runs |
| GPG private key loss | Public-key encryption — recipient is keyid; private-key recovery = importing from 1Password vault or paper backup |
| Branch protection bricks legitimate hotfix | Manual toggle in GitHub UI; documented in runbook |
| CSP Report-Only generates noise from Vercel preview-comments toolbar | report-uri filters in `/api/csp-report`; or accept noise during 1-week soak |
| `qrnbanxcrmrwganpmzmn` reactivation takes longer than expected | Free-tier reactivation = ~5-10min; if blocked, fall back to local Docker Postgres restore (proves dump integrity, skips Supabase round-trip) |
| Xendit prod webhook secret leak via Vercel preview env | T5 audit verifies `XENDIT_WEBHOOK_TOKEN` exists ONLY in production scope |

## 9. Non-goals

Documented for future-cycle reference so we don't accidentally re-litigate:

- Sentry / Datadog / external error tracking — accept "manual log-grep" MTTR; punt to post-launch
- Upstash Redis or any global rate-limit backend — in-memory acceptable for soft launch
- Twilio / WhatsApp Business API integration — email alert sufficient
- Per-PR Supabase Preview DB branches — disconnect stale integration, do not reconnect
- Repo rename `annisaa-erp-v3` → `talib` — clone URL stays in README until repo actually renamed (separate decision)
