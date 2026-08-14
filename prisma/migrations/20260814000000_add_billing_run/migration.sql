-- BillingRun / BillingRunRow / BillingRunLine — Cycle B1 of the bulk
-- invoice wizard arc (docs/cycles/2026-08-14-billing-run-wizard.md).
--
-- Replaces the in-memory plan/batch flow (lib/finance/run-bulk-generate.ts)
-- with a persisted draft: BillingRun is the scoped run, BillingRunRow is
-- one materialized row per in-scope student, BillingRunLine is one row per
-- fee component per student (keringanan already resolved onto it via
-- applyAdjustments, unchanged from Cycle A). Commit writes the draft
-- verbatim; BillingRunRow.invoiceId is the idempotency guard.
--
-- BillingRunRow.invoiceId is deliberately a plain column, not a foreign
-- key to Invoice: a voided invoice must never block deletion of the run
-- it came from.
--
-- Additive only: three new tables, no ALTER on existing ones.

CREATE TABLE "BillingRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scope" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "BillingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingRunRow" (
    "id" TEXT NOT NULL,
    "billingRunId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentNameSnapshot" TEXT NOT NULL,
    "classLabelSnapshot" TEXT,
    "parentId" TEXT,
    "totalDue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT,
    "error" TEXT,

    CONSTRAINT "BillingRunRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingRunLine" (
    "id" TEXT NOT NULL,
    "billingRunRowId" TEXT NOT NULL,
    "feeComponentId" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT,
    "finalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'BASE',

    CONSTRAINT "BillingRunLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingRun_tenantId_status_idx"
    ON "BillingRun"("tenantId", "status");

CREATE UNIQUE INDEX "BillingRunRow_billingRunId_studentId_key"
    ON "BillingRunRow"("billingRunId", "studentId");
CREATE INDEX "BillingRunRow_billingRunId_status_idx"
    ON "BillingRunRow"("billingRunId", "status");

CREATE INDEX "BillingRunLine_billingRunRowId_idx"
    ON "BillingRunLine"("billingRunRowId");

ALTER TABLE "BillingRun" ADD CONSTRAINT "BillingRun_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingRun" ADD CONSTRAINT "BillingRun_academicYearId_fkey"
    FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingRunRow" ADD CONSTRAINT "BillingRunRow_billingRunId_fkey"
    FOREIGN KEY ("billingRunId") REFERENCES "BillingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingRunRow" ADD CONSTRAINT "BillingRunRow_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingRunLine" ADD CONSTRAINT "BillingRunLine_billingRunRowId_fkey"
    FOREIGN KEY ("billingRunRowId") REFERENCES "BillingRunRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingRunLine" ADD CONSTRAINT "BillingRunLine_feeComponentId_fkey"
    FOREIGN KEY ("feeComponentId") REFERENCES "FeeComponentDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: service_role (Prisma) full access; app-layer filters carry tenantId.
ALTER TABLE "BillingRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY billingrun_service_all ON "BillingRun"
    AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "BillingRunRow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY billingrunrow_service_all ON "BillingRunRow"
    AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "BillingRunLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY billingrunline_service_all ON "BillingRunLine"
    AS PERMISSIVE FOR ALL TO service_role USING (true);
