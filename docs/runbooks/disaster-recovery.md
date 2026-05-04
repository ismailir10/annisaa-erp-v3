# Disaster Recovery Runbook

> **Status:** STUB (drafted phase 0). Full content fleshed out W7 polish phase.
>
> Tested before W8 production cutover.

## Scope

Recovery procedures for An Nisaa Sekolahku ERP under operational failure scenarios.

## Tier-aware

| Phase | Backup | PITR | Runbook applicability |
|---|---|---|---|
| W1-W7 (free tier) | Weekly manual `pg_dump` | None | Local dev recovery only |
| W8+ (Pro tier) | Daily managed backup | 7 days PITR | Full production runbook |

## Scenarios

### S1: Local dev DB corruption (W1-W7)

**Symptom:** Prisma queries fail, schema drift errors locally.

**Recovery:**

```bash
# 1. Reset local DB
npx prisma migrate reset --skip-seed

# 2. Re-apply seeds (when phase 1 ships)
npx tsx prisma/seed/index.ts

# 3. Verify
npx prisma studio
```

### S2: Staging DB corruption (W8+)

**Symptom:** Production users report data missing or queries fail.

**Recovery (Pro tier PITR):**

1. Open Supabase dashboard → Project → Database → Backups
2. Identify last-known-good timestamp (parent reports / audit log scan)
3. Click "Point-in-time recovery" → restore to timestamp
4. Verify via smoke test queries
5. Communicate to admin + Kepsek via WA: "System restored to [time]. Latest changes since [time] need re-entry."

### S3: Vercel deploy bad release

**Symptom:** App returns 500 / wrong UI after deploy.

**Recovery:**

1. Open Vercel dashboard → Deployments
2. Identify last-known-good deployment (timestamp before issue)
3. Click "..." → "Promote to Production"
4. Verify via smoke test
5. Investigate bad commit + revert in git, ship fix forward

### S4: Sentry incident response

(TODO — flesh out W7)

### S5: pg-boss queue stuck

(TODO — flesh out W7)

### S6: Xendit webhook delivery failure

(TODO — flesh out W7)

### S7: Total Supabase project loss

(TODO — flesh out W7. Will require: pg_dump restore to fresh project + Storage backup bucket import + DNS update. ~4 hours target RTO.)

## Test cadence

- [ ] Pre-W8: rehearse S1 + S3 manually
- [ ] W8: rehearse S2 (PITR) on staging clone
- [ ] Quarterly: full S7 drill on isolated test project

## Contact

- Solo dev: Ismail (ismailir10)
- Backup dev: TBD
- School Kepsek: Kepala TKIT / Kepala RA An Nisaa

## Last reviewed

2026-05-04 (stub created phase 0)
