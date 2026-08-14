-- StudentFeeAdjustment (Keringanan) — Cycle A of the keringanan / bulk
-- invoice wizard arc (docs/cycles/2026-08-13-keringanan-fee-adjustments.md).
--
-- Durable per-student discount/surcharge, granted once against an academic
-- year and applied automatically by every subsequent bulk invoice run. The
-- resolver (lib/finance/apply-adjustments.ts, added in a later task) is pure
-- and reads from this table; this migration only creates the record store.
--
-- feeComponentId is nullable on purpose: Cycle B adds whole-invoice
-- adjustments (there is no single FeeComponentDef to hang those off), but
-- Cycle A validation requires it to be set — every Cycle A adjustment is
-- scoped to one fee component.
--
-- Additive only: one new table, no ALTER on existing ones.

CREATE TABLE "StudentFeeAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "feeComponentId" TEXT,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "validFrom" TEXT,
    "validTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFeeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentFeeAdjustment_tenantId_status_idx"
    ON "StudentFeeAdjustment"("tenantId", "status");
CREATE INDEX "StudentFeeAdjustment_studentId_academicYearId_idx"
    ON "StudentFeeAdjustment"("studentId", "academicYearId");
CREATE INDEX "StudentFeeAdjustment_feeComponentId_idx"
    ON "StudentFeeAdjustment"("feeComponentId");

ALTER TABLE "StudentFeeAdjustment" ADD CONSTRAINT "StudentFeeAdjustment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAdjustment" ADD CONSTRAINT "StudentFeeAdjustment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAdjustment" ADD CONSTRAINT "StudentFeeAdjustment_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAdjustment" ADD CONSTRAINT "StudentFeeAdjustment_feeComponentId_fkey"
    FOREIGN KEY ("feeComponentId") REFERENCES "FeeComponentDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: service_role (Prisma) full access; app-layer filters carry tenantId.
ALTER TABLE "StudentFeeAdjustment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY studentfeeadjustment_service_all ON "StudentFeeAdjustment"
    AS PERMISSIVE FOR ALL TO service_role USING (true);
