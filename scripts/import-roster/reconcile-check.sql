-- reconcile-check.sql — post-import integrity check for scripts/import-roster/*.
--
-- Read-only: no INSERT/UPDATE/DELETE. Run after history-import.sql (or any
-- roster import) against the target DB, e.g.:
--   psql "$DATABASE_URL" -f scripts/import-roster/reconcile-check.sql
-- or paste into the Supabase SQL editor / `execute_sql` against a project.
--
-- Each check RAISE NOTICEs its raw count first (always, even when zero --
-- never a fabricated/expected value, just what the query returns), then
-- RAISE EXCEPTIONs if a violation exists, so a bad import aborts loud with
-- the offending count as the last line before the error. Style follows the
-- existing `DO $$ ... RAISE EXCEPTION` guards in this repo:
-- prisma/migrations/20260421124312_tenant_isolation_hardening/migration.sql
-- and scripts/import-roster/build-import-sql.ts's transform.sql assertions.
--
-- Run all four blocks in one session; if block N raises, blocks after N did
-- not run in that pass -- fix and re-run the whole file (idempotent, no writes).

-- (a) AcademicYear.status must be one of the app enum values
--     (prisma/schema.prisma AcademicYear: PLANNING | ACTIVE | ARCHIVED;
--     lib/classes/year-guard.ts gates writes on status = 'ARCHIVED'). PR #404's
--     original backfill wrote the off-enum 'INACTIVE' for every past year,
--     which silently disabled the archived-year immutability guard and the
--     UI's archived-mode rendering.
DO $$
DECLARE
  bad_year_count int;
BEGIN
  SELECT count(*) INTO bad_year_count
  FROM "AcademicYear"
  WHERE status NOT IN ('PLANNING', 'ACTIVE', 'ARCHIVED');

  RAISE NOTICE '(a) AcademicYear rows with off-enum status: %', bad_year_count;

  IF bad_year_count > 0 THEN
    RAISE EXCEPTION '(a) FAILED: % AcademicYear row(s) have status outside PLANNING|ACTIVE|ARCHIVED', bad_year_count;
  END IF;
END $$;

-- (b) Every Student should have at least one StudentEnrollment row (current
--     or historical). A student with zero enrollments either missed the
--     history backfill or has a StudentEnrollment/Student desync.
DO $$
DECLARE
  orphan_student_count int;
BEGIN
  SELECT count(*) INTO orphan_student_count
  FROM "Student" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "StudentEnrollment" se WHERE se."studentId" = s.id
  );

  RAISE NOTICE '(b) Students with zero StudentEnrollment rows: %', orphan_student_count;

  IF orphan_student_count > 0 THEN
    RAISE EXCEPTION '(b) FAILED: % Student row(s) have no StudentEnrollment at all', orphan_student_count;
  END IF;
END $$;

-- (c) Self-consistency: the non-WITHDRAWN enrollment count per ClassSection
--     -- the exact filter the admin roster API uses, see classListSelect /
--     classDetailSelect in app/api/admin/classes/_helpers.ts:
--       enrollments: { where: { status: { not: "WITHDRAWN" } } }
--     -- must equal the same count re-joined through Student on the SAME
--     tenant as the ClassSection. A mismatch means a StudentEnrollment row
--     the naive/roster count includes points at a student in a different
--     tenant (or a dangling studentId) -- a tenant-isolation or FK-integrity
--     defect the raw count alone would not surface.
DO $$
DECLARE
  mismatched_section_count int;
BEGIN
  SELECT count(*) INTO mismatched_section_count
  FROM (
    SELECT
      cs.id,
      (SELECT count(*) FROM "StudentEnrollment" se
        WHERE se."classSectionId" = cs.id AND se.status <> 'WITHDRAWN') AS roster_count,
      (SELECT count(*) FROM "StudentEnrollment" se
        JOIN "Student" s ON s.id = se."studentId" AND s."tenantId" = cs."tenantId"
        WHERE se."classSectionId" = cs.id AND se.status <> 'WITHDRAWN') AS tenant_scoped_count
    FROM "ClassSection" cs
  ) x
  WHERE x.roster_count <> x.tenant_scoped_count;

  RAISE NOTICE '(c) ClassSections where non-WITHDRAWN roster count != tenant-scoped count: %', mismatched_section_count;

  IF mismatched_section_count > 0 THEN
    RAISE EXCEPTION '(c) FAILED: % ClassSection(s) have a StudentEnrollment pointing at a student outside the section''s tenant (or a dangling studentId)', mismatched_section_count;
  END IF;
END $$;

-- (d) StudentEnrollment.status must be one of the app enum values
--     (lib/validations/enrollment.ts: ACTIVE | GRADUATED | WITHDRAWN).
DO $$
DECLARE
  bad_enrollment_count int;
BEGIN
  SELECT count(*) INTO bad_enrollment_count
  FROM "StudentEnrollment"
  WHERE status NOT IN ('ACTIVE', 'GRADUATED', 'WITHDRAWN');

  RAISE NOTICE '(d) StudentEnrollment rows with off-enum status: %', bad_enrollment_count;

  IF bad_enrollment_count > 0 THEN
    RAISE EXCEPTION '(d) FAILED: % StudentEnrollment row(s) have status outside ACTIVE|GRADUATED|WITHDRAWN', bad_enrollment_count;
  END IF;
END $$;

-- All four checks passed if this script completes without a RAISE EXCEPTION abort.
