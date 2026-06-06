-- Cycle: 2026-06-06 admin-raport-mvp (T1).
-- Adds the Raport Triwulan foundation: ReportSection enum + Term,
-- ReportCardEntry, StudentMeasurement tables. Per-student triwulan report card
-- aggregating penilaian (AssessmentEntry) + attendance; admin-driven MVP.
--
-- Additive only: no backfill, no destructive ALTER on existing tables.
-- All three tables are tenant-scoped and follow the curriculum/AssessmentEntry
-- RLS convention (service_role bypass + RLS enabled; the app never queries
-- these from a JWT-authenticated client — API routes gate via
-- requirePermission + tenant scoping).

-- CreateEnum
CREATE TYPE "ReportSection" AS ENUM ('INTRODUCTION', 'RELIGIOUS_MORAL', 'IDENTITY', 'STEAM', 'PERFORMANCE_SHOWCASE', 'CLOSING', 'FOLLOW_UP_PLAN', 'HOME_ACTIVITIES');

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "homeroomTeacherId" TEXT,
    "sectionLevels" JSONB NOT NULL,
    "sectionNarratives" JSONB NOT NULL,
    "permittedAbsenceDays" INTEGER NOT NULL DEFAULT 0,
    "sickDays" INTEGER NOT NULL DEFAULT 0,
    "unexcusedAbsenceDays" INTEGER NOT NULL DEFAULT 0,
    "totalSchoolDays" INTEGER NOT NULL DEFAULT 0,
    "parentMeetingAttendance" JSONB,
    "memorizationNotes" TEXT,
    "walasSignedAt" TIMESTAMP(3),
    "kepalaSignedAt" TIMESTAMP(3),
    "parentComment" TEXT,
    "parentSignedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ReportCardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentMeasurement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "heightCm" DECIMAL(5,1),
    "weightKg" DECIMAL(4,1),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "StudentMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Term_tenantId_idx" ON "Term"("tenantId");

-- CreateIndex
CREATE INDEX "Term_tenantId_semesterId_idx" ON "Term"("tenantId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Term_tenantId_semesterId_number_key" ON "Term"("tenantId", "semesterId", "number");

-- CreateIndex
CREATE INDEX "ReportCardEntry_tenantId_termId_idx" ON "ReportCardEntry"("tenantId", "termId");

-- CreateIndex
CREATE INDEX "ReportCardEntry_tenantId_studentId_idx" ON "ReportCardEntry"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardEntry_tenantId_studentId_termId_key" ON "ReportCardEntry"("tenantId", "studentId", "termId");

-- CreateIndex
CREATE INDEX "StudentMeasurement_tenantId_termId_idx" ON "StudentMeasurement"("tenantId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentMeasurement_tenantId_studentId_termId_key" ON "StudentMeasurement"("tenantId", "studentId", "termId");

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardEntry" ADD CONSTRAINT "ReportCardEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardEntry" ADD CONSTRAINT "ReportCardEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardEntry" ADD CONSTRAINT "ReportCardEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMeasurement" ADD CONSTRAINT "StudentMeasurement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMeasurement" ADD CONSTRAINT "StudentMeasurement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMeasurement" ADD CONSTRAINT "StudentMeasurement_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: raport tables are service-role-only (mirrors AssessmentEntry +
-- curriculum models). RLS enabled so authenticated/anon JWT callers can never
-- reach the rows directly; API routes are the only access path and they gate
-- via requirePermission("reportCard.*") + session.tenantId scoping. Add a
-- `tenantId = current_setting('app.tenant_id')::text` USING clause only if a
-- JWT-authenticated client ever queries these directly.
ALTER TABLE "Term" ENABLE ROW LEVEL SECURITY;
CREATE POLICY term_service_all ON "Term" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "ReportCardEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY reportcardentry_service_all ON "ReportCardEntry" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "StudentMeasurement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY studentmeasurement_service_all ON "StudentMeasurement" AS PERMISSIVE FOR ALL TO service_role USING (true);
