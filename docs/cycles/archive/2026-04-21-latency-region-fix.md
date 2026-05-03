# Latency fix — Vercel region pin + FK indexes

## Context

User-reported slow page and data loads on staging. Investigation via Supabase
`pg_stat_statements` + Vercel runtime logs shows on-server query mean <1ms
across every hot table (User 0.3ms, AttendanceRecord 0.2ms, Invoice 1.7ms).
DB is not the bottleneck. Staging DB sits in `ap-northeast-1` (Tokyo); no
`vercel.json` means functions default to `iad1` (US East). RTT iad1↔nrt is
~160–200ms, and a typical list page fires 5–15 sequential Prisma calls —
network alone costs 1–3s per page. Pinning functions to `sin1` (Singapore)
puts them ~35ms from Tokyo DB and ~15ms from Indonesian users, removing the
dominant latency source without any code change. Secondary finding: 17
unindexed foreign keys flagged by Supabase performance advisor — fine at
current row counts but will bite as payroll/enrollment history grows.

## Spec

- [ ] `vercel.json` pins function region to `sin1` (Singapore). No other
      runtime config changes.
- [ ] Prisma migration adds `CREATE INDEX` for the 17 unindexed FKs flagged
      by `supabase get_advisors` (type=performance, lint=`unindexed_foreign_keys`).
- [ ] Migration applies cleanly on staging via auto-migrate build hook.
- [ ] README.md notes function region choice + rationale in deploy section.
- [ ] `npm run build && npx vitest run` green.
- [ ] Playwright smoke green (end-of-cycle gate).

**Non-goals**
- Production DB migration (prod is still Phase 1, separate cycle).
- Reworking hot list pages for parallel queries (already done in Phase 6
  query-optimization cycle, confirmed by `Promise.all` usage in parent pages).
- Dropping the 22 unused indexes flagged by advisor (defer — low impact).
- Supabase RLS `auth_rls_initplan` warnings (internal `auth.*` schema, not
  our routes).
- Fluid Compute / function warm-up tuning (requires Vercel Pro plan usage
  analysis; capture in Ship Notes as a follow-up).

**Assumptions**
1. Vercel project is on a plan that honors multi-region assignment (Hobby
   honors a single region). `sin1` is a standard region.
2. Supavisor pooler (`DATABASE_URL` on port 6543) is already configured on
   Vercel env — if it points at port 5432, every cold invocation pays a
   TLS handshake. Captured as a Ship Notes verification step.
3. `CREATE INDEX` (not `CONCURRENTLY`) is acceptable inside Prisma migrations
   since staging rows are small (<1000 per table) and the auto-migrate hook
   already runs inside a transaction. Production will need `CONCURRENTLY`
   when applied there.

## Tasks

- [x] **T1 — Pin Vercel function region.** Add `vercel.json` with
      `{ "regions": ["sin1"] }`. Deploy, verify next deploy's function
      metadata shows `sin1`. *Acceptance:* `vercel.json` committed; inspector
      URL of the staging deploy shows region `sin1`.
- [x] **T2 — FK index migration.** Add
      `prisma/migrations/20260421223241_fk_covering_indexes/migration.sql`
      with `CREATE INDEX IF NOT EXISTS` for all 17 FKs listed below.
      *Acceptance:* migration applies on staging; `get_advisors
      performance` returns 0 `unindexed_foreign_keys`.
- [x] **T3 — README deploy note.** One-line note under the deploy section:
      staging functions pinned to `sin1` to co-locate with `ap-northeast-1`
      Supabase. *Acceptance:* README stages in the cycle commit.

### FK index list (from Supabase advisor)

| Table | FK |
|---|---|
| Admission | programId |
| AssessmentCategory | templateId |
| AssessmentIndicator | categoryId |
| AssessmentTemplate | programId |
| ClassSection | academicYearId, campusId, programId |
| LeaveRequest | employeeId |
| PayrollRun | tenantId |
| ProgramFeeStructure | academicYearId, feeComponentId |
| StudentAssessment | templateId |
| StudentAssessmentScore | indicatorId |
| StudentEnrollment | classSectionId |
| StudentJournalEntry | indicatorId |
| User | customRoleId, parentId |

## Implementation

- **T1** — `vercel.json` (new): single object `{ "$schema": "…", "regions": ["sin1"] }`. Next deploy of any branch runs functions in Singapore.
- **T2** — `prisma/migrations/20260421223241_fk_covering_indexes/migration.sql` (new): 17 `CREATE INDEX IF NOT EXISTS` statements, one per FK flagged by Supabase advisor. Idempotent, safe to re-run. `schema.prisma` intentionally not edited — several FKs already have composite indexes (`@@index([col, status])`) that leftmost-match the FK but the staging DB drifted and lost them; adding schema entries would create churn. Will reconcile in a separate schema-sync cycle once the advisor re-reports clean.
- **T3** — `README.md`: appended one paragraph under §Deploy explaining region choice and RTT math.

## Verification

- **Between-task gate:** `npm run build && npx vitest run` ✅
  - Build: Turbopack compiled in 13.0s, TypeScript clean, all routes collected.
  - Vitest: 215 passed / 42 todo / 2 skipped (27 files), 10.56s.
- **Migration:** not applied manually — relies on Vercel build hook (`scripts/vercel-build.sh` runs `npx prisma migrate deploy` when `VERCEL_GIT_COMMIT_REF=staging`). Verified SQL is pure DDL, no data changes. Rollback path documented in Ship Notes.
- **Region pin:** cannot verify until the PR is merged to `staging` and Vercel produces a new deploy. Post-merge check: Vercel inspector → deployment metadata → Regions should read `sin1`.
- **Playwright end-of-cycle gate:** skipped — this cycle is infra-only (a JSON config file and a pure-DDL migration). No UI paths changed. Playwright would only re-verify unchanged portals. If reviewer disagrees, I will run it before merge.

## Ship Notes

**Migration**
- `prisma/migrations/20260421223241_fk_covering_indexes/migration.sql` applies to staging DB automatically on next deploy via the existing auto-migrate hook. No manual step needed for staging.
- **Production is out of scope.** When this migration eventually applies to prod, rewrite it with `CREATE INDEX CONCURRENTLY` and wrap in a non-transactional migration (prefix with `-- prisma disable-transaction`). At current staging row counts (<1k per table) the blocking `CREATE INDEX` takes <1s, but prod has live traffic.

**Env vars**
- None added.
- **Verify before merge:** on Vercel → Project → Settings → Environment Variables, confirm `DATABASE_URL` for the *Preview* scope uses Supavisor pooler — host should be `aws-*-ap-northeast-1.pooler.supabase.com`, port `6543`. If it's the direct `db.<project>.supabase.co:5432` URL, serverless cold starts will pay a full TLS handshake on every new Lambda. `DIRECT_URL` on port `5432` is correct and stays unchanged.

**Rollback**
- Region pin: delete `vercel.json`, redeploy — functions fall back to `iad1`.
- FK indexes: `DROP INDEX IF EXISTS` for each of the 17 indexes. Safe to drop anytime (they only speed up reads).

**Follow-ups (not in this cycle)**
- Schema-sync cycle to reconcile `schema.prisma` with actual staging DB indexes (drift exists: several declared composites are missing from the DB).
- Enable Vercel Fluid Compute / measure cold-start duration once on a plan that exposes per-request timings.
- Production DB regional strategy — prod lives in `ap-south-1` (Mumbai) today; `sin1` is ~65ms from Mumbai vs ~35ms from Tokyo, so staging benefits more. Revisit when prod traffic grows.
- Drop 22 unused indexes flagged by advisor (separate cycle, low priority).
