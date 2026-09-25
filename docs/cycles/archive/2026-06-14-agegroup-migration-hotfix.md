# ageGroup Migration Hotfix — P3009 on staging

## Context

The `20260520000000_classsection_age_group` migration (shipped in PR #332, curriculum cutover prep) **failed on the first staging deploy** (2026-06-14 11:02 UTC) with `P3009` → `P0001`:

```
ClassSection ageGroup backfill incomplete. Names not matching the legacy A/B suffix:
KB Aster, KB Metland, POPUP Weekend, E2E F-3 ...
```

The migration's backfill derived ageGroup from `split_part(name, ' ', -1)` (the legacy `deriveAgeGroup` heuristic) and **RAISE'd** on any row that didn't resolve to a bare `A`/`B`. The cycle's Spec Assumption #2 — *"all current staging + production ClassSection.name rows resolve to A or B"* — was **false** against real data:

- **4 real ACTIVE classes** whose names don't encode A/B: `D'Care Aster` (10 students), `KB Aster` (15), `KB Metland` (15), `POPUP Weekend` (21) — playgroup / daycare / weekend cohorts.
- **11 stale `E2E F-3 <timestamp>` rows** — the `admin-dialogs` F-3 e2e creates real ClassSections against the staging DB on every CI run (Vercel preview points `DATABASE_URL` at the staging pooler) and its cleanup leaked. Separate hygiene issue (see Follow-ups).

The migration ran in a transaction, so the RAISE rolled back **all** its DDL — no `ageGroup` column exists, no data corrupted. But the failed record left staging in `P3009`: **every staging deploy is now blocked** ("new migrations will not be applied"), which in turn blocked the staging→main promote (#337).

## Spec

- Migration must backfill **every** ClassSection row (total, no NULL) and `SET NOT NULL` cleanly on staging + prod.
- Non-A/B names default to `A` (seed convention; younger cohorts) — admin corrects exceptions via the `/admin/classes` Tambah/Ubah Kelas form (ageGroup is editable, shipped in #332).
- No data loss. Idempotent / re-runnable.
- **Non-goal:** deleting the leaked E2E rows (handled by the default backfill → they get `A`; true cleanup + the e2e-writes-to-staging leak are follow-ups).

## Tasks

1. Replace the fail-loud assertion in the migration with a safe `ELSE 'A'` default.
2. Clear the failed `_prisma_migrations` record on staging so the amended migration re-applies on next deploy.
3. PR → staging; staging deploy re-runs the migration clean. Verify column + NOT NULL + backfill.

## Implementation

- **`prisma/migrations/20260520000000_classsection_age_group/migration.sql`** — dropped the `DO $$ … RAISE EXCEPTION` block; `UPDATE` CASE now defaults non-A/B suffixes to `'A'::"AgeGroup"`. Column-add + NOT NULL unchanged.

## Verification

- Migration is total (no NULL possible) → `SET NOT NULL` cannot fail.
- Staging `_prisma_migrations` failed record cleared (DELETE of the `finished_at IS NULL` row) so the amended file applies fresh (no checksum drift).
- Post-deploy staging check: `ageGroup` column exists, NOT NULL, all rows A/B; the 4 real non-TK classes = A (admin to adjust if any should be B).
- Pure DB/migration change — no app code, no vitest/Playwright impact. Cross-checked design-system.html §none (no UI surface).

## Ship Notes

**Migration:** amended `20260520000000_classsection_age_group` — re-applies on staging deploy after the failed record is cleared; applies fresh on prod via the promote (prod never ran the original).

**Manual step (staging, pre-merge):** `DELETE FROM _prisma_migrations WHERE migration_name='20260520000000_classsection_age_group' AND finished_at IS NULL;` (done via Supabase MCP).

**Env vars:** none. **Rollback:** drop column.

**Follow-ups:**
- Stop the `admin-dialogs` F-3 e2e from persisting ClassSections to the staging DB (or guarantee teardown) — 11 rows leaked. Then purge the `E2E F-3 *` rows + their orphaned `ClassSession` children from staging.
- Confirm with the school whether `D'Care Aster` / `KB *` / `POPUP Weekend` should be A or B; correct via `/admin/classes`.
