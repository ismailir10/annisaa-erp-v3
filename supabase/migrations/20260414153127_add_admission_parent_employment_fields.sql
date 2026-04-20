
ALTER TABLE "Admission" ADD COLUMN IF NOT EXISTS "parentEducation" TEXT;
ALTER TABLE "Admission" ADD COLUMN IF NOT EXISTS "parentOccupation" TEXT;
ALTER TABLE "Admission" ADD COLUMN IF NOT EXISTS "parentIncome" TEXT;
;
