# Staging data cleanup — UAT pollution purge

> Last reviewed: 2026-05-12 (cycle `uat-may12-fixes`)
> Driver: UAT 2026-05-12 admin M1 + B1 (E2E test rows accumulated in `AcademicYear` and `Semester`, producing the "Semester period shows year 2065" appearance for live demos).

## Purpose

Identify and remove rows that E2E specs created in staging without cleaning up after themselves. Restores trust in the staging DB so it can be used for demos and walkthrough UAT without admin reviewers seeing test artefacts mixed in with real data.

This is a manual runbook — **not** a scheduled job. CTO runs it after a UAT or before a demo.

## Scope of pollution (as of 2026-05-12)

| Source spec | Table(s) touched | Pattern to match |
|---|---|---|
| `e2e/curriculum-promes-import.spec.ts:52` — creates AcademicYear with `name: \`E2E PROMES Import ${Date.now()}\`` and a Semester linked to it. No `test.afterAll` teardown — every CI run leaves a row behind. | `AcademicYear`, `Semester` (cascade-linked) | `AcademicYear.name LIKE 'E2E PROMES Import %'` |

> **Known gaps in E2E teardown.** Audit this list whenever a new spec is added that calls `POST /api/...` and does not have a corresponding `test.afterAll` delete. Add entries here so the next CTO running this runbook knows what to grep for.

## Dry run — count what would be purged

Run from your local laptop with `psql` pointed at staging via the read-write URL (Supabase MCP `execute_sql` is the recommended path — see [docs/runbooks/prod-setup.md](./prod-setup.md) §Supabase MCP).

```sql
-- 1. How many polluted AcademicYears?
SELECT id, name, "startDate", "endDate", "createdAt"
FROM "AcademicYear"
WHERE name LIKE 'E2E PROMES Import %'
ORDER BY "createdAt" DESC;

-- 2. How many Semester rows hang off them?
SELECT s.id, s.number, s."startDate", s."endDate", ay.name AS academic_year
FROM "Semester" s
JOIN "AcademicYear" ay ON ay.id = s."academicYearId"
WHERE ay.name LIKE 'E2E PROMES Import %'
ORDER BY s."createdAt" DESC;
```

Expected output: roughly one AcademicYear + one Semester per CI run since the spec was added. UAT 2026-05-12 reported 8 such rows.

## Purge

**Order matters** — delete children before parents, otherwise the FK constraint stops you. Wrap in a transaction so you can rollback if a count looks wrong:

```sql
BEGIN;

-- Semesters whose parent AY matches the test-pollution pattern.
DELETE FROM "Semester"
WHERE "academicYearId" IN (
  SELECT id FROM "AcademicYear" WHERE name LIKE 'E2E PROMES Import %'
);

-- Then the AcademicYears themselves.
DELETE FROM "AcademicYear"
WHERE name LIKE 'E2E PROMES Import %';

-- Verify deletion counts match the dry-run before committing.
-- ROLLBACK; -- uncomment to abort if anything looks off
COMMIT;
```

## After purge — verify

```sql
-- Should return 0.
SELECT COUNT(*) FROM "AcademicYear" WHERE name LIKE 'E2E PROMES Import %';
-- Should return 0.
SELECT COUNT(*) FROM "Semester" s
JOIN "AcademicYear" ay ON ay.id = s."academicYearId"
WHERE ay.name LIKE 'E2E PROMES Import %';
```

Then in the admin UI: open `/admin/curriculum/semesters` and `/admin/academic-years` to confirm the rows are gone and the remaining list looks clean for the next demo.

## Fix at the source (follow-up — not this cycle)

The right long-term fix is for `e2e/curriculum-promes-import.spec.ts` to add a `test.afterAll` block that deletes the AcademicYear it created. The spec currently has no teardown. Spinning that off is a separate cycle (the cycle that introduces a global `cleanupCreatedRows()` helper for E2E specs).

Spec gap to track:

- `e2e/curriculum-promes-import.spec.ts` — needs `test.afterAll` that DELETEs the created `AcademicYear` + child `Semester` (cascade) via the API or a direct Prisma call. Until that lands, this runbook is the workaround.

If you add a new E2E spec that creates DB rows, add a teardown immediately AND add an entry to the "Scope of pollution" table above so future CTOs know what to look for.

## Diagnostic — stale ACTIVE enrollments in an ARCHIVED year

> Added 2026-08-21 (cycle `enrollment-flexibility`). **Read-only. Do not "clean" these rows.**

A student promoted into a new academic year should leave the prior year's `StudentEnrollment` at `GRADUATED`. Rows bulk-loaded by the roster imports did not go through the promote route, so on staging **16 of the 21 current-year students** carry a stale `ACTIVE` row in the ARCHIVED 2024/2025 year alongside their real current-year row. Every one is shaped `X/2024-2025(ARCHIVED) + Y/2025-2026(ACTIVE)`; there are zero same-year doubles.

These rows are **deliberately preserved** — [`docs/cycles/archive/2026-07-21-historical-roster-visibility.md`](../cycles/archive/2026-07-21-historical-roster-visibility.md) made archived-year enrollments visible on purpose, and mass-closing them would destroy that history. The `enrollment-flexibility` cycle made them inert instead, by scoping every guard, billing query and display query to a specific academic year. Run this when you need to know the current blast radius, or when triaging a report of a wrong class appearing on a raport or invoice.

```sql
-- Students holding more than one ACTIVE enrollment, with the shape of each.
-- A row whose shape spans two years is a stale prior-year row (expected).
-- A row with two ACTIVE enrollments in the SAME year and the SAME program
-- type violates the cycle's invariant and IS worth investigating.
SELECT s.name,
       string_agg(
         p.code || '/' || p.type || '/' || ay.name || '(' || ay.status || ')',
         ' + ' ORDER BY ay.name
       ) AS shape,
       count(*) AS active_rows
FROM "StudentEnrollment" se
JOIN "ClassSection"  cs ON cs.id = se."classSectionId"
JOIN "Program"       p  ON p.id  = cs."programId"
JOIN "AcademicYear"  ay ON ay.id = cs."academicYearId"
JOIN "Student"       s  ON s.id  = se."studentId"
WHERE se.status = 'ACTIVE'
GROUP BY s.id, s.name
HAVING count(*) > 1
ORDER BY active_rows DESC, s.name;
```

Reading the result:

| Shape | Meaning | Action |
|---|---|---|
| `KB/SEMESTER/2024-2025(ARCHIVED) + TKIT-A/SEMESTER/2025-2026(ACTIVE)` | Stale prior-year row. Expected on staging. | None — preserved by design. |
| `KB/SEMESTER/2025-2026(ACTIVE) + DCARE/YEAR_ROUND/2025-2026(ACTIVE)` | A genuine school + day-care placement. | None — this is the feature. |
| Two rows, same year, **same** `Program.type` | Violates "one ACTIVE per program type per year". Should be unreachable: both enrol doors take a `pg_advisory_xact_lock` on `studentId:academicYearId:programType`. | Investigate — either a pre-existing import artefact, or a real gap in the guard. |

There is no database constraint backing that invariant (adding one would need `Program.type` denormalised onto `StudentEnrollment`), so this query is the only detector. Worth running before a billing run.

## Related

- [docs/runbooks/reseed-staging.md](./reseed-staging.md) — full staging reseed (nuke + rebuild). Use this when pollution is not isolated to a known pattern.
- UAT report: `docs/uat/reports/2026-05-12-admin-full-walkthrough.md` — admin M1 and B1.
- [docs/cycles/2026-08-21-enrollment-flexibility.md](../cycles/2026-08-21-enrollment-flexibility.md) — why the stale rows are inert rather than cleaned.
