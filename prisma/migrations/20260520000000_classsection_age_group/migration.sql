-- Add ClassSection.ageGroup column.
--   1. ADD COLUMN nullable (IF NOT EXISTS — safe to re-run after a partial run)
--   2. Backfill: TKIT A/B from the legacy split-on-whitespace suffix
--      (matches lib/curriculum/weekly-assessment-loader.ts deriveAgeGroup
--      that this migration retires). Names that do NOT end in a bare A/B
--      token — KB / D'Care / POPUP and other non-TK cohorts — default to
--      'A' (the seed convention; these are the younger 4-5 yo groups).
--      The /admin/classes Tambah/Ubah Kelas form makes ageGroup editable,
--      so any class needing 'B' is corrected in one click post-migration.
--   3. SET NOT NULL once every row has a value.
--
-- History: the original 2026-05-20 form of this migration RAISE'd on any
-- non-A/B name (Spec Assumption #2 — "all ClassSection names resolve to
-- A/B"). That assumption was false against real staging data (KB Aster,
-- KB Metland, D'Care Aster, POPUP Weekend + leaked E2E rows), so the first
-- staging deploy failed P3009. Replaced the fail-loud assertion with a
-- safe default — backfill is now total and deploy-clean on staging + prod.
--
-- Idempotency: every statement is safe to re-execute. ADD COLUMN IF NOT
-- EXISTS no-ops; the UPDATE only touches NULL rows; SET NOT NULL on an
-- already-NOT-NULL column is a no-op.

ALTER TABLE "ClassSection" ADD COLUMN IF NOT EXISTS "ageGroup" "AgeGroup";

UPDATE "ClassSection"
SET "ageGroup" = CASE upper(split_part(name, ' ', -1))
  WHEN 'A' THEN 'A'::"AgeGroup"
  WHEN 'B' THEN 'B'::"AgeGroup"
  ELSE 'A'::"AgeGroup"
END
WHERE "ageGroup" IS NULL;

ALTER TABLE "ClassSection" ALTER COLUMN "ageGroup" SET NOT NULL;
