
-- Student: government compliance fields
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "nis" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "nisn" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "birthPlace" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "nik" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "kkNumber" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "livingWith" TEXT;
CREATE INDEX IF NOT EXISTS "Student_nis_idx" ON "Student"("nis");
CREATE INDEX IF NOT EXISTS "Student_nisn_idx" ON "Student"("nisn");

-- Parent: government compliance fields
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "nik" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "education" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "occupation" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "employer" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "employerAddress" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "employerCity" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "incomeRange" TEXT;
ALTER TABLE "Parent" ADD COLUMN IF NOT EXISTS "childrenTotal" INTEGER;

-- StudentGuardian: child order in family
ALTER TABLE "StudentGuardian" ADD COLUMN IF NOT EXISTS "childOrder" INTEGER;
;
