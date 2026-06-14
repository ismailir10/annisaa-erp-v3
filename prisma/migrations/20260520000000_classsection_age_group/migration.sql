-- Add ClassSection.ageGroup column.
-- Two-phase:
--   1. ADD COLUMN nullable (IF NOT EXISTS — operator recovery from a
--      partial run that died between steps 1 and 4 will not error)
--   2. Backfill via the legacy split-on-whitespace heuristic
--      (matches lib/curriculum/weekly-assessment-loader.ts deriveAgeGroup
--      that this migration retires)
--   3. Fail loudly if any row resolves to NULL — surfaces the offender
--      ClassSection names so the operator can fix them before re-running
--   4. SET NOT NULL once backfill is verified complete
--
-- Idempotency: prisma migrate deploy tracks completed migrations in
-- _prisma_migrations and won't re-run a clean apply. For partial-run
-- recovery (column added, NOT NULL not yet set), every statement here
-- is safe to re-execute: ADD COLUMN IF NOT EXISTS no-ops, UPDATE only
-- touches NULL rows (next iteration), the assertion sees only the
-- remaining offenders, and SET NOT NULL on an already-NOT-NULL column
-- is also a no-op.

ALTER TABLE "ClassSection" ADD COLUMN IF NOT EXISTS "ageGroup" "AgeGroup";

UPDATE "ClassSection"
SET "ageGroup" = CASE upper(split_part(name, ' ', -1))
  WHEN 'A' THEN 'A'::"AgeGroup"
  WHEN 'B' THEN 'B'::"AgeGroup"
  ELSE NULL
END
WHERE "ageGroup" IS NULL;

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
