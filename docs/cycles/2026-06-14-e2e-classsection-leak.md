# E2E ClassSection Leak — F-3 teardown + staging purge

## Context

The `admin-dialogs` F-3 test ("Tambah Kelas — Program combobox writes selected value") creates a real `ClassSection` via the UI to verify the create path. CI Playwright runs against the Vercel preview, whose `DATABASE_URL` points at the **real staging Supabase DB**, so each run persisted a row there. Two flaws made it leak:

1. **Cleanup ran *after* the assertions** — a failed `expect` (e.g. during the 2026-06-14 incident churn) threw before the inline `DELETE`, leaving an **ACTIVE** row.
2. **`DELETE /api/admin/classes/[id]` is a soft-delete** (status→INACTIVE) — the row + its `reconcileSessions`-created `ClassSession` children persist regardless.

Result: 11 `E2E F-3 <timestamp>` rows accumulated in staging. They were among the offenders that failed the ageGroup migration ([2026-06-14 hotfix](2026-06-14-agegroup-migration-hotfix.md)).

## Spec

- Teardown must run even when an assertion fails (no ACTIVE leak).
- Purge the 11 stale `E2E F-3 *` rows + orphaned children from staging.
- **Non-goal:** eliminating staging writes entirely — that needs an isolated per-PR preview DB (Supabase branching), a larger infra change. Flagged as the real follow-up.

## Implementation

- **`e2e/admin-dialogs.spec.ts`** — F-3 now records the created id **before** asserting and tears it down in `test.afterEach`, so cleanup runs on assertion failure too. (Still a soft-delete — best the API offers — but no more ACTIVE leaks.)

## Verification

- `npx tsc --noEmit` clean (spec typechecks).
- Staging purge via Supabase MCP (FK-ordered: `StudentAttendance` + `StudentEnrollment` RESTRICT deleted first, then `ClassSection` cascades `ClassSession` + `TeachingAssignment`): `E2E F-3 %` rows 11 → 0; staging `ClassSection` count = 6 (the real classes only).
- e2e-only change — no app build/vitest impact; CI Playwright is the behavioral gate. Cross-checked design-system.html §none (no UI surface).

## Ship Notes

**DB:** one-time purge of `E2E F-3 *` rows on staging (already executed via MCP — not part of the merge).
**Env vars:** none. **Migrations:** none. **Rollback:** revert the spec change.

**Follow-up (the real fix):** wire an isolated preview DB (Supabase branching) so CI Playwright never mutates the staging DB. Until then, soft-deleted `E2E F-3` rows still accrete slowly (1/run); a periodic purge or a `reseed-staging` sweep keeps them in check.
