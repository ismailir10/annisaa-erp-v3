-- Add ClassSection.ageGroup column.
-- Two-phase:
--   1. ADD COLUMN nullable
--   2. Backfill via the legacy split-on-whitespace heuristic
--      (matches lib/curriculum/weekly-assessment-loader.ts deriveAgeGroup)
--   3. Fail loudly if any row resolves to NULL — surfaces the offender
--      ClassSection names so the operator can fix them before re-running
--   4. SET NOT NULL once backfill is verified complete
--
-- Idempotency: this migration is run once at deploy time. The assertion
-- in step 3 prevents partial state from advancing to step 4.

ALTER TABLE "ClassSection" ADD COLUMN "ageGroup" "AgeGroup";

UPDATE "ClassSection"
SET "ageGroup" = CASE upper(split_part(name, ' ', -1))
  WHEN 'A' THEN 'A'::"AgeGroup"
  WHEN 'B' THEN 'B'::"AgeGroup"
  ELSE NULL
END;

DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(name, ', ') INTO offenders FROM "ClassSection" WHERE "ageGroup" IS NULL;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'ClassSection ageGroup backfill incomplete. Names not matching the legacy A/B suffix: %. Fix the rows manually (UPDATE "ClassSection" SET "ageGroup" = ''A''|''B'' WHERE name = ...) and re-run prisma migrate deploy.', offenders;
  END IF;
END $$;

ALTER TABLE "ClassSection" ALTER COLUMN "ageGroup" SET NOT NULL;
