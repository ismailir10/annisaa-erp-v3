-- Cycle: 2026-07-29 class-picker-year-scoping (T7).
--
-- ClassSection.name and ClassTrack.name embed their campus as a token
-- ("TK B Metland 3", "KB — Aster") purely because the old unique keys were
-- not campus-scoped. 20260729000000_class_section_unique_per_campus (T6,
-- same cycle) widened ClassSection's key to
-- (tenantId, academicYearId, campusId, name) and ClassTrack already keys on
-- (tenantId, campusId, programId, name) — so two campuses can now
-- independently hold the same class name and the token is redundant: Campus
-- is a first-class column, already displayed separately in every picker.
--
-- Campus -> token mapping (documented assumption):
-- The token cannot be derived positionally from Campus.name — it is the
-- second word in one campus name and the first in the other, and the two
-- environments prefix them differently:
--   prod:    'Taman Aster'                      / 'Metland Cibitung'
--   staging: 'An Nisaa'' Sekolahku Taman Aster' / 'An Nisaa'' Sekolahku Metland Cibitung'
-- So the match is a case-insensitive CONTAINS, not an equality test. An
-- earlier draft used `WHEN 'Taman Aster'` equality and would have silently
-- no-op'd on staging — the migration would have "succeeded" while leaving
-- every staging class name campus-bearing. Any campus matching neither
-- pattern yields a NULL token and its rows are left completely untouched;
-- this migration never blind-strips a word it cannot attribute to a campus.
--
-- Separator handling: prod writes "TK B Metland 3" (plain space) while
-- staging writes "KB — Metland" (em-dash). The regex therefore consumes an
-- optional preceding " —" / " -" along with the token, so the em-dash form
-- does not leave a dangling "KB —".
--
-- Idempotent: the UPDATE's WHERE clause only touches rows whose name still
-- contains the campus token as a whole word (Postgres advanced regex \y =
-- word boundary), so a second run matches 0 rows.
--
-- Abort-on-collision: the DO block below pre-computes what every row's name
-- would become and RAISEs (rolling back the whole migration, which Prisma
-- runs in an implicit transaction) if that would produce a duplicate under
-- either table's unique key — so a bad assumption fails the deploy loudly
-- instead of corrupting names.
--
-- Hand-checked examples:
--   'TK B Metland 3'              -> 'TK B 3'
--   'KB Aster 1'                  -> 'KB 1'
--   'Daycare Metland (2-6 th)'    -> 'Daycare (2-6 th)'
--   'Daycare Aster'               -> 'Daycare'
--   'Bayi 6-12 Bulan Metland 6'   -> 'Bayi 6-12 Bulan 6'
--   'KB — Metland'                -> 'KB'        (staging em-dash form)
--   'TKIT-A — Aster'              -> 'TKIT-A'    (internal hyphen preserved)
--   'KB — Panduan Contoh'         -> unchanged   (no campus token)

DO $$
DECLARE
  section_dupes integer;
  track_dupes integer;
BEGIN
  WITH candidate AS (
    SELECT
      cs."tenantId",
      cs."academicYearId",
      cs."campusId",
      CASE
        WHEN tok.token IS NOT NULL AND cs.name ~ ('\y' || tok.token || '\y')
          THEN trim(regexp_replace(
                 regexp_replace(
                   cs.name,
                   '(\s*(—|-))?\s*\y' || tok.token || '\y',
                   '', 'g'
                 ),
                 '\s+', ' ', 'g'
               ))
        ELSE cs.name
      END AS new_name
    FROM "ClassSection" cs
    JOIN "Campus" c ON c.id = cs."campusId"
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN c.name ILIKE '%Aster%'   THEN 'Aster'
        WHEN c.name ILIKE '%Metland%' THEN 'Metland'
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

  WITH candidate AS (
    SELECT
      ct."tenantId",
      ct."campusId",
      ct."programId",
      CASE
        WHEN tok.token IS NOT NULL AND ct.name ~ ('\y' || tok.token || '\y')
          THEN trim(regexp_replace(
                 regexp_replace(
                   ct.name,
                   '(\s*(—|-))?\s*\y' || tok.token || '\y',
                   '', 'g'
                 ),
                 '\s+', ' ', 'g'
               ))
        ELSE ct.name
      END AS new_name
    FROM "ClassTrack" ct
    JOIN "Campus" c ON c.id = ct."campusId"
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN c.name ILIKE '%Aster%'   THEN 'Aster'
        WHEN c.name ILIKE '%Metland%' THEN 'Metland'
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
      regexp_replace(
        cs.name,
        '(\s*(—|-))?\s*\y' || tok.token || '\y',
        '', 'g'
      ),
      '\s+', ' ', 'g'
    ))
FROM "Campus" c
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN c.name ILIKE '%Aster%'   THEN 'Aster'
    WHEN c.name ILIKE '%Metland%' THEN 'Metland'
    ELSE NULL
  END AS token
) tok
WHERE c.id = cs."campusId"
  AND tok.token IS NOT NULL
  AND cs.name ~ ('\y' || tok.token || '\y');

-- Strip the campus token from ClassTrack.name.
UPDATE "ClassTrack" ct
SET name = trim(regexp_replace(
      regexp_replace(
        ct.name,
        '(\s*(—|-))?\s*\y' || tok.token || '\y',
        '', 'g'
      ),
      '\s+', ' ', 'g'
    ))
FROM "Campus" c
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN c.name ILIKE '%Aster%'   THEN 'Aster'
    WHEN c.name ILIKE '%Metland%' THEN 'Metland'
    ELSE NULL
  END AS token
) tok
WHERE c.id = ct."campusId"
  AND tok.token IS NOT NULL
  AND ct.name ~ ('\y' || tok.token || '\y');
