# Cycle B — Talib Production Infrastructure

## Context

Cycle A (rebrand → Talib) is shipping to main. Cycle B stands up the production environment so `talib.annisaasekolahku.com` can serve real users on Cycle C launch day. Pure infrastructure hardening: prod database migrations, nightly encrypted backups, uptime monitoring, security headers (CSP Report-Only fresh-add), in-memory rate limit, GitHub branch protection, and a runbook. No user-facing UI changes.

Source design: [`docs/superpowers/specs/2026-05-03-talib-cycle-b-prod-infra-design.md`](../superpowers/specs/2026-05-03-talib-cycle-b-prod-infra-design.md). Brainstorm resolved 9 decisions including reuse of existing prod Supabase project `vxwywmvpxetdgnxejjgk` (no new project), webhook URL fix from umbrella spec (`/api/webhooks/xendit` → `/api/xendit/webhook`, already corrected in Xendit dashboard 2026-05-03), in-memory rate limit (accept N-instance leakage), email-only UR alerts Day 1, and pause-staging DR drill against inactive `qrnbanxcrmrwganpmzmn`.

No UAT reports overlap (most recent: `parent` + `student-journal`, unrelated to infra). design-system token NOT required — frontend-gate doesn't fire (zero `app/**/*.{tsx,css}` or `components/**/*.tsx` diffs expected).

## Spec

### Acceptance criteria
- [ ] Prod Supabase `vxwywmvpxetdgnxejjgk` has all migrations from `prisma/migrations/` applied; `_prisma_migrations` row count matches staging
- [ ] `prisma migrate diff --from-url $STAGING_DIRECT --to-url $PROD_DIRECT` is empty post-migration (schema parity)
- [ ] `verify-rls-coverage.ts` exits 0 against prod direct URL
- [ ] `GET /api/health` returns 200 `{ok:true,sha:...}` when DB reachable; 503 `{ok:false,error:"db_unreachable"}` on DB throw
- [ ] Unit test for `/api/health` covers both 200 + 503 paths
- [ ] proxy.ts emits CSP-Report-Only, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers on every response
- [ ] `/api/csp-report` endpoint logs CSP violations to stdout (no DB write)
- [ ] In-memory rate limit on `/api/auth/*` returns 429 + Retry-After after 5 req/min/IP
- [ ] `scripts/audit-vercel-env.ts` exits 0 when prod scope env keys match `.env.example`
- [ ] `.github/workflows/backup.yml` runs nightly cron `0 17 * * *` UTC; uploads GPG-encrypted dump to R2 bucket `talib-backups`
- [ ] R2 bucket has 30-day lifecycle rule; first `workflow_dispatch` run produces `YYYY/MM/DD/dump.pgc.gpg`
- [ ] DR drill executed: pause staging → reactivate `qrnbanxcrmrwganpmzmn` → restore latest R2 dump → verify row counts match staging pre-pause → pause back → unpause staging
- [ ] UptimeRobot monitor configured: `/api/health`, 5min interval, email alert
- [~] GitHub branch protection on `main` + `staging`: **DEFERRED — needs GitHub Pro $4/mo (free private repos can't enable protection or rulesets).** `pre-push` hook + CTO discipline only for now. Ruleset config staged at `ops/ruleset-main.json` ready for execution after upgrade.
- [ ] `docs/runbooks/prod-incident.md` documents: Vercel rollback, R2 restore steps, Xendit webhook re-point, branch protection toggle for hotfixes
- [ ] README env table reads "Singapore" not "Mumbai/Tokyo"; prod URL = `talib.annisaasekolahku.com`
- [ ] Umbrella spec webhook URL corrected to `/api/xendit/webhook`
- [ ] Supabase Auth email templates (invite, magic-link, recovery, confirm-signup, change-email) Talib-branded; sender display = `Talib by An Nisaa' Sekolahku`; cross-checked against `design-system.html`; HTML mirrored in `lib/supabase/email-templates/`

### Non-goals
- Sentry / Datadog / external error tracking
- Upstash Redis or any global rate-limit backend
- Twilio / WhatsApp Business API integration
- Per-PR Supabase Preview DB branches
- Repo rename `annisaa-erp-v3` → `talib`
- New Playwright e2e specs (regression-only run)
- Any user-facing UI changes
- CSP enforcement (stays Report-Only this cycle; promote post-launch +1wk)

### Assumptions
1. Prod Supabase `vxwywmvpxetdgnxejjgk` is empty (no manual schema work since 2026-04-21 provision). `prisma migrate diff staging→prod` is expected to show all migrations missing pre-T1.
2. Vercel CLI logged in with access to project; can read prod-scope env vars for T5 audit.
3. R2 account exists or will be created; user has Cloudflare dashboard access.
4. 1Password vault exists for GPG private key storage.
5. UptimeRobot account will be created during T9 (free tier, no payment).
6. ~~GitHub repo `ismailir10/annisaa-erp-v3` is private (branch protection free since Feb 2023).~~ **Wrong.** Verified 2026-05-03 via `gh api`: both legacy branch protection and modern Rulesets return 403 "Upgrade to GitHub Pro or make this repository public" on private free plan. Free branch protection is public-repo-only. Cycle B accepts the gap (option C) — `pre-push` git hook + CTO discipline only; force-push to main remains technically possible. Revisit post-launch via $4/mo Pro upgrade.
7. No backfill of historical data — prod stays empty until Cycle C `seed-prod.ts` run.
8. Staging downtime ~30min during T8 DR drill is acceptable (off-hours, internal users only).
9. Resend SMTP credentials are or will be wired into Supabase Auth → SMTP settings on the prod project (T12 depends on this; sender domain `talib.annisaasekolahku.com` SPF/DKIM already authenticated per Cycle A risk-mitigation).

→ Correct any of these now or `/build` will proceed with them.

## Tasks

Task = one commit. Between-task gate: `npm run build && npx vitest run`. Dependencies marked `(depends: T#)`. Tasks without dependency marker can run independently → `/build` may dispatch as parallel subagents.

- [ ] **T1: Apply prisma migrations to prod Supabase**
  - Files: none (DB-only). Commands run from worktree shell.
  - Pre-flight: `prisma migrate diff --from-url $STAGING_DIRECT --to-url $PROD_DIRECT` must be empty of unexpected drift; abort if non-empty
  - Run: `DATABASE_URL=$PROD_POOLER DIRECT_URL=$PROD_DIRECT npx prisma migrate deploy`
  - Verify: `_prisma_migrations` row count = `ls prisma/migrations/ | wc -l`; `npx tsx scripts/verify-rls-coverage.ts` exits 0
  - Commit message: `chore(db): apply migrations to talib prod supabase` (no repo diff — empty commit with `--allow-empty` to anchor cycle progress)
  - Acceptance: prod schema matches staging; RLS coverage check passes

- [x] **T2: `/api/health` endpoint + unit test**
  - Files: `app/api/health/route.ts` (new), `app/api/__tests__/health.test.ts` (new)
  - Reuse: `prisma` from `@/lib/db`
  - Behavior: `GET` → `prisma.$queryRaw\`SELECT 1\``; success → 200 `{ok:true,sha:VERCEL_GIT_COMMIT_SHA ?? "local"}`; throw → 503 `{ok:false,error:"db_unreachable"}`
  - Test: mock `prisma.$queryRaw`; assert status code + JSON body for both paths
  - Acceptance: vitest passes; `curl localhost:3000/api/health` → 200 in dev

- [x] **T3: Security headers in proxy.ts** *(depends: T2)*
  - Files: `lib/security/headers.ts` (new), `proxy.ts` (modify), `app/api/csp-report/route.ts` (new)
  - `lib/security/headers.ts` exports `applySecurityHeaders(response: NextResponse)`. Sets:
    - `Content-Security-Policy-Report-Only`: `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.xendit.co https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://api.xendit.co https://api.resend.com; frame-ancestors 'none'; report-uri /api/csp-report`
    - `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
    - `X-Frame-Options`: `DENY`
    - `X-Content-Type-Options`: `nosniff`
    - `Referrer-Policy`: `strict-origin-when-cross-origin`
    - `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`
  - proxy.ts: call `applySecurityHeaders(response)` before every `return response` path. Skip on `/api/csp-report` (avoid loops).
  - `/api/csp-report` route: `POST` handler reads JSON body, `console.log("[csp-report]", body)`, returns 204. No DB write. Mark `// @public` (no auth).
  - Acceptance: `curl -I https://localhost:3000/` shows all 6 headers; CSP violations log to Vercel stdout

- [x] **T4: In-memory rate limit on `/api/auth/*`** *(depends: T3)*
  - Files: `lib/security/rate-limit.ts` (new), `lib/security/__tests__/rate-limit.test.ts` (new), `proxy.ts` (modify)
  - `rate-limit.ts` exports `rateLimit(key: string, max: number, windowMs: number) → {ok: boolean, retryAfter?: number}`
  - Token bucket with lazy GC (drop expired buckets when `buckets.size > 10_000`)
  - proxy.ts: at top of handler, if `pathname.startsWith("/api/auth/")`, derive `ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`; call `rateLimit(\`${ip}:${pathname}\`, 5, 60_000)`; on `!ok` return `NextResponse.json({error:"rate_limited"}, {status:429, headers:{"Retry-After": String(retryAfter)}})`
  - Test: 5 sequential calls pass; 6th + 7th return 429 with Retry-After
  - Acceptance: vitest passes; manual `for i in 1..7; curl -i .../api/auth/test` shows 429 on 6th+

- [x] **T5: Vercel env audit script**
  - Files: `scripts/audit-vercel-env.ts` (new)
  - Behavior: shell out to `vercel env ls production` (or use `@vercel/sdk`), parse keys, diff vs `.env.example` (extract VAR names from leftmost `^[A-Z_]+=`), exit 1 with diff on mismatch, exit 0 otherwise
  - Special case: warn (not fail) on `STAGING_*` keys in production scope
  - Reuse: existing `process` argv parsing pattern from `scripts/verify-rls-coverage.ts`
  - Acceptance: `npx tsx scripts/audit-vercel-env.ts` exits 0 once prod scope is locked

- [x] **T6 (code parts): GPG keypair + R2 + GitHub Actions backup workflow** *(depends: T5)*  · ops portion of T6 = Phase 2 user-driven
  - Files: `.github/workflows/backup.yml` (new), `ops/backup-public.asc` (new), `docs/runbooks/prod-setup.md` (new — keypair gen + key recovery procedure)
  - GPG keypair gen (manual, one-time, run by user): `gpg --quick-generate-key "Talib Backup <backup@talib.local>" ed25519 sign,encr never`. Export public: `gpg --armor --export backup@talib.local > ops/backup-public.asc`. Private key stored in 1Password vault `Talib Backups` + paper safe.
  - Workflow:
    ```yaml
    name: Nightly Backup
    on:
      schedule:
        - cron: '0 17 * * *'
      workflow_dispatch:
    jobs:
      backup:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - run: gpg --import ops/backup-public.asc
          - env:
              DB_URL: ${{ secrets.PROD_DB_URL }}
            run: pg_dump "$DB_URL" --format=custom --no-owner --no-acl > dump.pgc
          - run: gpg --batch --yes --trust-model always --encrypt --recipient backup@talib.local --output dump.pgc.gpg dump.pgc
          - env:
              AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
              AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
              AWS_ENDPOINT_URL: ${{ secrets.R2_ENDPOINT }}
            run: |
              DATE=$(date -u +%Y/%m/%d)
              aws s3 cp dump.pgc.gpg "s3://talib-backups/$DATE/dump.pgc.gpg"
    ```
  - R2 bucket creation (manual): create `talib-backups`, attach 30-day lifecycle rule (delete after 30 days). Generate API token with read+write on this bucket only.
  - GitHub secrets to add (manual): `PROD_DB_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`
  - Acceptance: workflow file passes `actionlint`; manual setup steps documented in `docs/runbooks/prod-setup.md`

- [ ] **T7: Verify first nightly backup** *(depends: T6)*
  - Files: none (verification only). Document result in cycle doc Implementation section.
  - Trigger: `gh workflow run backup.yml --ref feat/cycle-b-prod-infra` (or via GitHub UI)
  - Verify: workflow run completes green; R2 bucket has `YYYY/MM/DD/dump.pgc.gpg`; download locally; `gpg -d dump.pgc.gpg | pg_restore --list | head -20` shows table list including `Student`, `Invoice`, `User`
  - Acceptance: encrypted dump round-trips successfully

- [ ] **T8: DR drill — restore round-trip** *(depends: T7)*
  - Files: none (operational). Document procedure + results in `docs/runbooks/prod-incident.md` §Restore (T11).
  - Procedure:
    1. Off-hours notification (no users on staging — internal only)
    2. Capture pre-pause row counts: `SELECT COUNT(*) FROM "Student"`, `"Invoice"`, `"User"` against staging direct URL
    3. Pause staging via Supabase MCP `pause_project udbivhchbizpxoryejgz`
    4. Reactivate `qrnbanxcrmrwganpmzmn` via Supabase dashboard (manual UI step)
    5. Pull latest R2 backup → `gpg -d dump.pgc.gpg > dump.pgc` → `pg_restore -d $SCRATCH_DIRECT_URL dump.pgc`
    6. Verify restored row counts match pre-pause counts; spot-check 1 invoice via `SELECT`
    7. Pause `qrnbanxcrmrwganpmzmn`
    8. Unpause staging via Supabase MCP
    9. Record timing + commands + counts in runbook
  - Acceptance: drill log committed in T11 runbook; row counts matched

- [x] **T9: UptimeRobot monitor** *(depends: T2)* — done by user 2026-05-03; public stats: https://stats.uptimerobot.com/WsNlx9OOOz
  - Files: none (external config). Document URL + monitor settings in cycle doc Implementation.
  - Monitor: HTTP(s), URL `https://talib.annisaasekolahku.com/api/health`, interval 5min, alert contact = email
  - Note: monitor stays paused until Cycle B merges to main and `/api/health` is live on prod
  - Acceptance: UR dashboard shows monitor green for ≥24h before Cycle C kickoff

- [~] **T10: GitHub branch protection** *(DEFERRED — needs GitHub Pro $4/mo)*
  - Files: none (GitHub UI / `gh api`). Document command set in `docs/runbooks/prod-setup.md`.
  - Use `gh api -X PUT repos/ismailir10/annisaa-erp-v3/branches/main/protection` with body: `required_status_checks: {strict: true, contexts: ["Lint, Typecheck & Test", "Build", "Playwright E2E"]}, enforce_admins: true, required_pull_request_reviews: null, restrictions: null, allow_force_pushes: false, allow_deletions: false`
  - Repeat for `staging`
  - Verify: `gh api repos/.../branches/main/protection` shows expected JSON; force-push attempt rejected
  - Acceptance: protection active on both branches; runbook documents toggle procedure for hotfix incidents

- [x] **T12: Supabase Auth email templates — Talib brand** *(depends: T1)*
  - Files: `lib/supabase/email-templates/{invite,magic-link,recovery,confirm-signup,change-email}.html` (new — version-controlled mirror), `docs/runbooks/supabase-email-templates.md` (new — sync procedure)
  - Templates: 5 standard Supabase Auth emails. HTML inline-styled for email client compat (no external CSS). Cross-check `.claude/standards/design-system.html` for Talib brand colors (primary, neutral palette), typography (system stack — emails can't load custom fonts), and Talib wordmark + "by An Nisaa' Sekolahku" sub-label in header.
  - Sender display: `Talib by An Nisaa' Sekolahku <noreply@talib.annisaasekolahku.com>` (configured in Supabase Auth → SMTP settings — Resend SMTP per umbrella spec §3)
  - Subject lines (Indonesian, Bu Sari voice — see `.claude/standards/voice.md`):
    - Invite: `Anda diundang ke Talib`
    - Magic link: `Tautan masuk Talib Anda`
    - Recovery: `Reset kata sandi Talib`
    - Confirm signup: `Konfirmasi email Talib`
    - Change email: `Konfirmasi perubahan email`
  - Body content per template: Talib wordmark header, single primary CTA button (brand color, 44px min tap target per design-system), magic-link URL fallback as plain text, footer with "An Nisaa' Sekolahku" + support email
  - Sync procedure documented in `docs/runbooks/supabase-email-templates.md`: copy HTML → Supabase dashboard → Auth → Email Templates → paste per slot. Manual one-time per env (staging done in test-only run; prod done as part of T12).
  - Acceptance: 5 HTML files committed; Supabase prod dashboard shows Talib-branded templates; test invite email rendered in Gmail + Outlook web shows brand correctly; design-system cross-checked

- [ ] **T11: Docs sync — README + umbrella spec + runbook** *(depends: T1, T2, T6, T8, T10, T12)*
  - Files: `README.md` (modify), `docs/superpowers/specs/2026-05-02-talib-production-launch-design.md` (modify), `docs/runbooks/prod-incident.md` (new)
  - README edits:
    - L5: prod URL `annisaa-erp-v3.vercel.app` → `talib.annisaasekolahku.com`
    - L14: "prod Mumbai, staging Tokyo" → "prod + staging Singapore (ap-southeast-1)"
    - L105-106: pooler/direct rows say "Mumbai" + "Tokyo" → "Singapore" both
    - L111: `NEXT_PUBLIC_APP_URL` prod = `https://talib.annisaasekolahku.com`
    - L124-125: env table rows "Mumbai" + "Tokyo" → "Singapore"; prod URL same fix
  - Umbrella spec: `/api/webhooks/xendit` → `/api/xendit/webhook` (3 occurrences in §3 + §8.1)
  - Runbook contents:
    - **§Vercel rollback:** `vercel rollback` command + dashboard fallback
    - **§R2 restore:** decrypt `dump.pgc.gpg` → `pg_restore` against prod direct URL; commands from T8 drill
    - **§Xendit webhook re-point:** dashboard URL field, sandbox test procedure, prod test (Rp 10k self-payment)
    - **§Branch protection toggle:** `gh api -X PUT .../branches/main/protection` with `required_status_checks: null` for emergency disable; re-enable after; audit log via GitHub Settings → Audit Log
    - **§Supabase auto-pause recovery:** if UR detects DB unreachable + Vercel deploys are healthy → likely Supabase pause; reactivate via dashboard; investigate UR keepalive failure
  - Acceptance: README env table accurate; umbrella spec webhook URL accurate; runbook has 5 sections each with copy-pasteable commands

## Implementation

- Subagent plan: T2/T3/T4/T5/T11-partial/T12 sequential per-commit (shared file edits to proxy.ts in T3+T4 + cycle-doc churn make parallel dispatch unsafe). T1, T6 ops, T7-T10, T11 runbook = Phase 2 user-driven ops with assistant coaching.
- T4 reuses existing `lib/rate-limit.ts` instead of creating `lib/security/rate-limit.ts` (DRY — existing `rateLimit(key, limit, windowMs) → {success, remaining}` covers the need; cycle doc adjusted at commit time).
- Task 2: `/api/health` — `app/api/health/route.ts` + `app/api/__tests__/health.test.ts` — public DB-aware liveness via `SELECT 1`; 200 with git SHA on success; 503 `{error:"db_unreachable"}` + server-side `console.error` log on DB throw. Reviewers (feature-dev:code-reviewer + superpowers:code-reviewer) cleared with 2 inline fixes applied (env-stub semantics + error log).
- Task 3: Security headers — `lib/security/headers.ts` (`applySecurityHeaders` helper) + `lib/security/__tests__/headers.test.ts` + `app/api/csp-report/route.ts` (public, 204, 8KB body cap, log to stdout) + `app/api/__tests__/csp-report.test.ts` + `proxy.ts` (wrapped existing logic in `proxyImpl`; outer `proxy` applies headers to every return; skip on `/api/csp-report`). Reviewers cleared with 5 inline fixes: added `wss://*.supabase.co` for Realtime, added `https://vitals.vercel-insights.com` for Analytics, dropped HSTS `preload` (deferred to post-launch +30d — irreversible), added 8KB body cap on csp-report (log-flooding mitigation). `unsafe-inline` script-src/style-src + nonce strategy = post-launch follow-up.
- Task 4: Auth rate limit — `lib/security/auth-rate-limit.ts` (`enforceAuthRateLimit(request) → NextResponse | null`) + `lib/security/__tests__/auth-rate-limit.test.ts` + `proxy.ts` (calls helper at top of proxyImpl) + `lib/rate-limit.ts` (added `__resetRateLimitForTest`). 5 req/min/IP across all `/api/auth/*` paths; 429 + `Retry-After: 60` on cap. Reviewers cleared with 3 critical fixes: (a) drop pathname from key — was `auth:${ip}:${pathname}` letting attackers rotate sub-paths to multiply cap; now `auth:${ip}` total, (b) skip rate limit when IP is unidentifiable (`"anonymous"` fallback) — sharing one bucket across all anon callers was a global DoS vector; only triggers in dev since Vercel always sets XFF, (c) replaced fragile module-mock test pattern with real lib + `__resetRateLimitForTest` helper.
- Task 5: Vercel env audit — `scripts/audit-vercel-env.ts` (read-only `vercel env ls production` shell-out + diff vs `.env.example`) + `scripts/__tests__/audit-vercel-env.test.ts` (9 unit tests on pure functions). Exits 0 clean / 1 missing required / 2 CLI failure. STAGING_* leaks warn (printed) but do not fail per cycle-doc spec. Reviewer cleared with 3 inline fixes: removed dead-code header-skip block (lowercase headers don't match the uppercase regex anyway), aligned exit code with spec ("warn not fail" on STAGING_*), added test for header-row filtering.
- Task 6 (code parts): Backup workflow — `.github/workflows/backup.yml` (nightly cron `0 17 * * *` UTC + workflow_dispatch; pg_dump → GPG encrypt → R2 upload), `docs/runbooks/prod-setup.md` (manual ops procedures: keypair gen, R2 setup, GitHub secrets, branch protection commands, UR setup), `ops/backup-public.asc` (placeholder; real ED25519 public key replaces during Phase 2 ops). Reviewers cleared with 4 hardenings: (a) added `environment: production` job-level gate — required-reviewer approval before secrets unlock, blocks unauthorized exfiltration via tampered branches, (b) added GPG fingerprint pin via `BACKUP_GPG_FINGERPRINT` secret — workflow refuses to encrypt against a swapped public key, (c) dropped redundant `--endpoint-url` flag on aws s3 ls (env var already covers it), (d) clarified runbook that GnuPG creates ED25519 sign primary + CV25519 encrypt subkey (not single-algorithm). 6 secrets total: PROD_DB_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, BACKUP_GPG_RECIPIENT, BACKUP_GPG_FINGERPRINT.
- Task 11 (partial — README + umbrella spec only; runbook = Phase 2): README env table updated — Mumbai/Tokyo references replaced with Singapore (`ap-southeast-1`); pooler+direct rows say Singapore both; `NEXT_PUBLIC_APP_URL` prod = `talib.annisaasekolahku.com`; environments table prod URL fixed. Umbrella spec §8.1 webhook URL `/api/webhooks/xendit` → `/api/xendit/webhook` (2 occurrences). Runbook `docs/runbooks/prod-incident.md` deferred to Phase 2 since it captures DR drill timings (T8) + branch protection toggle commands (T10) which only exist after those operational tasks complete.
- Task 9 (Phase 2): UptimeRobot monitor live — done by user 2026-05-03; public stats https://stats.uptimerobot.com/WsNlx9OOOz; pings `/api/health` 5min, email alert.
- Task 10 (Phase 2): branch protection DEFERRED. `gh api` POST/PUT both returned 403 on legacy branch protection AND modern Rulesets — GitHub Free plan blocks both on private repos (assumption #6 violated, fixed inline). Cycle B option C: accept gap, rely on `pre-push` hook + CTO discipline. Ruleset JSON staged at `ops/ruleset-main.json` + legacy fallback at `ops/branch-protection.json` for execution after $4/mo Pro upgrade. Runbook §7 updated to reflect deferred state with instructions for both upgrade-and-enable + emergency-toggle once active.
- Task 11 runbook (Phase 2): `docs/runbooks/prod-incident.md` — 9 sections covering Vercel rollback, stuck deploy, Supabase auto-pause, DB outage, R2 restore (incl. T8 DR drill placeholder for "last validated" line), Xendit webhook re-point, branch protection toggle (deferred), UR alert tuning, incident comms template (Indonesian), accounts/recovery-keys table, followup register.
- Task 12: Supabase Auth email templates — `lib/supabase/email-templates/{invite,magic-link,recovery,confirm-signup,change-email}.html` (5 transactional emails, Indonesian Bu Sari voice with Islamic greeting/closing) + `docs/runbooks/supabase-email-templates.md` (mapping → dashboard slot, sender display config, sync procedure, brand-token table). Shell aligned with existing `lib/email/templates/salary-slip.ts` (560px max-width, white card with 3px teal bottom-border header, 48px logo, 20px wordmark, teal CTA, support link, fine-print footer). Dispatched implementer subagent + UI design reviewer subagent. Reviewer flagged 3 ship-blockers + several minors; all applied to both Supabase templates AND salary-slip.ts: (a) wrap header + body cards in `<table bgcolor="#FFFFFF">` instead of `<div>` — Outlook desktop bg reliability, (b) bulletproof CTA button with VML `<v:roundrect>` for Outlook + plain anchor for Gmail/Apple Mail, (c) fine-print color `#9B9BB0` → `#6B6B7A` for WCAG AA on glare-prone Android phones. Minors also applied: `mengkonfirmasi` → `mengonfirmasi` (KBBI), `alt="An Nisaa'"` → `alt="Talib — An Nisaa' Sekolahku"`, `display:block` on `<img>`, `role="presentation"` on tables, support email link added before footer hr, confirm-signup gained "berlaku selama 24 jam" expiry note. Logo URL hardcoded to `https://talib.annisaasekolahku.com/logo.png` since Supabase Auth has no `appUrl` substitution.

## Verification

- T2: `npx vitest run app/api/__tests__/health.test.ts` — 4 passed (200 path, sha env present, sha env absent via `delete process.env.*`, 503 path with error log assertion). Full suite 978 passed | 42 todo | 0 failed. `npm run build` ✓ — `/api/health` route present in build output.
- T3: `npx vitest run lib/security app/api/__tests__/csp-report.test.ts` — 8 passed (CSP directive content × 2, HSTS no-preload, clickjacking/content-type/referrer/permissions, in-place mutation; csp-report 204 valid + 204 malformed + 413 oversize). Full suite 986 passed | 42 todo | 0 failed. `npm run build` ✓ — `/api/csp-report` route present.
- T4: `npx vitest run lib/security/__tests__/auth-rate-limit.test.ts` — 6 passed (non-auth bypass; 5-allow-then-429; Retry-After 60 + body; per-IP scoping; cross-path bucket-share; anonymous-IP skip). Full suite 992 passed | 42 todo | 0 failed. `npm run build` ✓.
- T5: `npx vitest run scripts/__tests__/audit-vercel-env.test.ts` — 9 passed (parseEnvExample x2; parseVercelEnvOutput x3 incl. header filtering; diffEnv x4 incl. optional handling + STAGING leak detection). Full suite 1000 passed | 42 todo | 0 failed. `npm run build` ✓ (script not bundled into app — pure CLI).
- T6 (code parts): YAML syntax validated via `js-yaml` load. Full suite 1001 passed | 42 todo | 0 failed (no new tests — workflow is exec-time only). `npm run build` ✓. Workflow won't run successfully until Phase 2 ops fills the 6 environment secrets and replaces the placeholder `ops/backup-public.asc` with the real public key — intentional fail-closed behavior.
- T12: existing `lib/email/__tests__/escape.test.ts` XSS tests still pass against the rewritten salary-slip shell (8 tests). Full suite 1001 passed | 42 todo | 0 failed. `npm run build` ✓. No new test added — HTML templates have no programmatic surface to assert beyond the XSS escaping already covered.

## Ship Notes
<filled by /ship — migrations, env vars, manual steps, rollback plan>
