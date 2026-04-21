-- Add reverse-lookup indexes on foreign keys that previously relied only on
-- composite uniques or were missing entirely. These speed up:
--   * Listing teachers in a ClassSection (TeachingAssignment.classSectionId)
--   * Joining InvoiceLine -> FeeComponentDef when reporting on a fee component
CREATE INDEX IF NOT EXISTS "TeachingAssignment_classSectionId_idx"
  ON "TeachingAssignment"("classSectionId");

CREATE INDEX IF NOT EXISTS "InvoiceLine_feeComponentId_idx"
  ON "InvoiceLine"("feeComponentId");
