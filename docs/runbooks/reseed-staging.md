# Runbook — Reseed Staging

When the staging database has drifted or needs a fresh realistic dataset, the operator can rebuild it from scratch via `scripts/reseed-staging.ts`. The script wipes every application row, deletes non-preserved Supabase auth users, then rebuilds a multi-year dataset (~200 students, ~28 employees, 22 payroll runs, full attendance + journal history, and live Xendit sandbox sessions for the most-recent invoices).

**Take a manual Supabase snapshot before running.** Use the staging project's dashboard → Database → Backups → "Create backup". The script reminds the operator on every run, but cannot take the snapshot itself.

## Setup

`.env.local` is reserved for local SQLite demo mode — its values do not point at staging. Reseed uses a dedicated, gitignored `.env.staging` file pulled from Vercel:

```bash
# one-time per env change in Vercel
npx vercel link            # if not yet linked
npx vercel env pull .env.staging --environment=preview
```

That populates `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `XENDIT_SECRET_KEY` (sandbox), and `XENDIT_WEBHOOK_TOKEN` into `.env.staging`. The npm script auto-loads it via `tsx --env-file-if-exists=.env.staging`, so the operator command is just:

```bash
STAGING_CONFIRM=yes npm run reseed:staging
```

`STAGING_CONFIRM=yes` is the destructive-op gate — typed at the prompt, never persisted. `STAGING_SUPABASE_REF` is auto-derived from the `<ref>.supabase.co` host so it doesn't need to live in `.env.staging` either.

| Var | Source |
|---|---|
| `STAGING_CONFIRM` | typed at the prompt |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.staging` (`npx vercel env pull`) |
| `DATABASE_URL` | `.env.staging` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.staging` |
| `XENDIT_SECRET_KEY` | `.env.staging` |
| `XENDIT_WEBHOOK_TOKEN` | `.env.staging` (must be set in Vercel preview env, otherwise webhook handler 401s every delivery) |
| `STAGING_SUPABASE_REF` | auto-derived from Supabase URL host (override only if you need to) |

The guard refuses to run if the Supabase URL doesn't resolve to a `<ref>.supabase.co` host, the resolved ref contains a "prod"/"production"/"live" substring, the Xendit key isn't a `xnd_development_*` sandbox key, or the `DATABASE_URL` host/username doesn't reference the same ref (split-brain check). There is no way to point the script at production.

## Preserved test accounts

Six accounts are kept across reseeds (auth UUIDs reused if present, created if missing):

- `ismailir10@gmail.com` (SUPER_ADMIN)
- `wirarajaisme@gmail.com` (SCHOOL_ADMIN)
- `ismail10rabbanii@gmail.com` + `wirarajaism@gmail.com` (TEACHER, employees IR01/WR03)
- `rightjet.hq@gmail.com` (GUARDIAN → Bilal Hakim)
- `commandprompt.adhan@gmail.com` (GUARDIAN → Ahmad Faris Abdullah)

## Rollback

To roll back a botched reseed, restore the manual Supabase snapshot via the dashboard.

**Partial failure:** if the script crashes after the "wiping application data" stage but before completing, **restore the snapshot before re-running**. The wipe is committed by that point and re-running directly will fail with a duplicate-key error on Tenant creation (`t_annisaa` already exists). The script does not auto-rewipe — that protects against accidentally re-truncating a successful run.

## Post-reseed UAT smoke (parent payment flow)

1. Verify the Xendit dashboard webhook URL points at the staging preview domain — `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/api/xendit/webhook` — and that `XENDIT_WEBHOOK_TOKEN` is set in Vercel preview env. If absent, every webhook delivery 401s.
2. Log in as `rightjet.hq@gmail.com` (Ibu Nurul / Bilal Hakim's parent) on staging Vercel.
3. Open Tagihan → click any Apr-2026 invoice → tap the Xendit "Bayar Sekarang" button. Browser navigates to the sandbox checkout (`dev.xen.to/...`).
4. Complete a sandbox payment (use Xendit test card / VA).
5. Within ~30 seconds the parent invoice page should refresh to `Lunas` (PAID). Watch Vercel runtime logs for the `[XENDIT WEBHOOK] Invoice INV-… → PAID eventId=...` line.
6. To verify the expired path: in the Xendit dashboard, find a sandbox session and trigger an `expired` test event; the corresponding invoice should flip to `Dibatalkan` (CANCELLED) with the Xendit fields cleared.

## Diagnostic — invoice not flipping to PAID

If the parent invoice does not flip to PAID within ~30s of completing the sandbox payment, query `WebhookEvent` directly:

```sql
SELECT "eventId", "eventType", status, "errorMessage", "createdAt"
FROM "WebhookEvent"
WHERE provider = 'xendit'
ORDER BY "createdAt" DESC
LIMIT 10;
```

Status legend: `RECEIVED` = mid-flight; `PROCESSED` = succeeded; `IGNORED` = unknown event or invoice not found (`errorMessage` will say which); `FAILED` = transient error (row was deleted, watch for re-arrival).
