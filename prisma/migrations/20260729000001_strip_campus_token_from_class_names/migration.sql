-- Cycle: 2026-07-29 class-picker-year-scoping (T7).
--
-- ClassSection.name and ClassTrack.name embed their campus as a token
-- ("TK B Metland 3", "KB Aster 1") purely because the old unique keys
-- were not campus-scoped. 20260729000000_class_section_unique_per_campus
-- (T6, same cycle) widened ClassSection's key to
-- (tenantId, academicYearId, campusId, name) and ClassTrack already keys
-- on (tenantId, campusId, programId, name) — so two campuses can now
-- independently hold the same class name and the token is redundant:
-- Campus is a first-class column, already displayed separately in every
-- picker. This migration strips the token from both tables' `name`.
--
-- Hardcoded name -> token mapping (documented assumption):
-- The token cannot be derived mechanically from Campus.name — it's the
-- second word for one campus and the first word for the other:
--   Campus.name = 'Taman Aster'      -> token 'Aster'
--   Campus.name = 'Metland Cibitung' -> token 'Metland'
-- Production has exactly these two campuses (confirmed pre-deploy). Any
-- row whose campus does not match either name is left completely
-- untouched (token resolves to NULL, guarded out before the regexp) —
-- this migration never blind-strips words it can't attribute to a
-- known campus.
--
-- Idempotent: the UPDATE's WHERE clause only touches rows whose name
-- still contains the campus token as a whole word (Postgres advanced
-- regex \y = word boundary), so a second run matches 0 rows.
--
-- Abort-on-collision: a DO block pre-computes what every row's name
-- would become and RAISEs (rolling back the whole transaction) if that
-- would produce a duplicate under either table's unique key, so a bad
-- assumption fails the deploy loudly instead of corrupting names.
--
-- Hand-checked examples:
--   'TK B Metland 3'              -> 'TK B 3'
--   'KB Aster 1'                  -> 'KB 1'
--   'Daycare Metland (2-6 th)'    -> 'Daycare (2-6 th)'
--   'Daycare Aster'               -> 'Daycare'
--   'Bayi 6-12 Bulan Metland 6'   -> 'Bayi 6-12 Bulan 6'

DO $$
DECLARE
  section_dupes integer;
  track_dupes integer;
BEGIN
  -- Pre-flight: would stripping the token collide two ClassSection rows
  -- under (tenantId, academicYearId, campusId, name)?
  WITH candidate AS (
    SELECT
      cs."tenantId",
      cs."academicYearId",
      cs."campusId",
      CASE
        WHEN tok.token IS NOT NULL AND cs.name ~ ('\y' || tok.token || '\y')
          THEN trim(regexp_replace(
                 regexp_replace(cs.name, '\y' || tok.token || '\y', '', 'g'),
                 '\s+', ' ', 'g'
               ))
        ELSE cs.name
      END AS new_name
    FROM "ClassSection" cs
    JOIN "Campus" c ON c.id = cs."campusId"
    CROSS JOIN LATERAL (
      SELECT CASE c.name
        WHEN 'Taman Aster' THEN 'Aster'
        WHEN 'Metland Cibitung' THEN 'Metland'
        ELSE NULL
      END AS token
    ) tok
  )
  SELECT count(*) INTO section_dupes
  FROM (
    SELECT 1
    FROM candidate
    GROUP BY "tenantId", "academicYearId", "campusId", new_name
    HAVING count(*) > 1
  ) dups;

  IF section_dupes > 0 THEN
    RAISE EXCEPTION
      'strip_campus_token_from_class_names: % ClassSection name collision(s) under (tenantId, academicYearId, campusId, name) would result from stripping the campus token; aborting migration',
      section_dupes;
  END IF;

  -- Pre-flight: would stripping the token collide two ClassTrack rows
  -- under (tenantId, campusId, programId, name)?
  WITH candidate AS (
    SELECT
      ct."tenantId",
      ct."campusId",
      ct."programId",
      CASE
        WHEN tok.token IS NOT NULL AND ct.name ~ ('\y' || tok.token || '\y')
          THEN trim(regexp_replace(
                 regexp_replace(ct.name, '\y' || tok.token || '\y', '', 'g'),
                 '\s+', ' ', 'g'
               ))
        ELSE ct.name
      END AS new_name
    FROM "ClassTrack" ct
    JOIN "Campus" c ON c.id = ct."campusId"
    CROSS JOIN LATERAL (
      SELECT CASE c.name
        WHEN 'Taman Aster' THEN 'Aster'
        WHEN 'Metland Cibitung' THEN 'Metland'
        ELSE NULL
      END AS token
    ) tok
  )
  SELECT count(*) INTO track_dupes
  FROM (
    SELECT 1
    FROM candidate
    GROUP BY "tenantId", "campusId", "programId", new_name
    HAVING count(*) > 1
  ) dups;

  IF track_dupes > 0 THEN
    RAISE EXCEPTION
      'strip_campus_token_from_class_names: % ClassTrack name collision(s) under (tenantId, campusId, programId, name) would result from stripping the campus token; aborting migration',
      track_dupes;
  END IF;
END $$;

-- Strip the campus token from ClassSection.name.
UPDATE "ClassSection" cs
SET name = trim(regexp_replace(
      regexp_replace(cs.name, '\y' || tok.token || '\y', '', 'g'),
      '\s+', ' ', 'g'
    ))
FROM "Campus" c
CROSS JOIN LATERAL (
  SELECT CASE c.name
    WHEN 'Taman Aster' THEN 'Aster'
    WHEN 'Metland Cibitung' THEN 'Metland'
    ELSE NULL
  END AS token
) tok
WHERE c.id = cs."campusId"
  AND tok.token IS NOT NULL
  AND cs.name ~ ('\y' || tok.token || '\y');

-- Strip the campus token from ClassTrack.name.
UPDATE "ClassTrack" ct
SET name = trim(regexp_replace(
      regexp_replace(ct.name, '\y' || tok.token || '\y', '', 'g'),
      '\s+', ' ', 'g'
    ))
FROM "Campus" c
CROSS JOIN LATERAL (
  SELECT CASE c.name
    WHEN 'Taman Aster' THEN 'Aster'
    WHEN 'Metland Cibitung' THEN 'Metland'
    ELSE NULL
  END AS token
) tok
WHERE c.id = ct."campusId"
  AND tok.token IS NOT NULL
  AND ct.name ~ ('\y' || tok.token || '\y');
