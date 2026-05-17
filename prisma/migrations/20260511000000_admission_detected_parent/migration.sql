-- Phase 1.2 sibling-auto-detect: nullable FK on Admission to the Parent
-- whose email/phone matched the applicant at /daftar submit time.
-- Additive — every existing Admission row gets NULL. SetNull on parent
-- delete preserves the Admission row; the detection signal soft-invalidates.

ALTER TABLE "Admission"
  ADD COLUMN "detectedParentId" TEXT;

ALTER TABLE "Admission"
  ADD CONSTRAINT "Admission_detectedParentId_fkey"
  FOREIGN KEY ("detectedParentId") REFERENCES "Parent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Admission_tenantId_detectedParentId_idx"
  ON "Admission"("tenantId", "detectedParentId");
