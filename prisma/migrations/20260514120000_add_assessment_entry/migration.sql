-- Cycle: 2026-05-14 curriculum-c4-weekly-assessments (T1).
-- Adds AssessmentEntry model + AssessmentSource + LearningCenter enums.
-- Per-student per-indicator assessment record. `source` discriminates HOMEROOM
-- (walas Pekanan) vs CENTER (sentra Harian — wired in C5).
-- AchievementLevel enum + curriculum models already shipped in
-- 20260512100000_add_curriculum_models — reused here.
--
-- Additive only: no backfill, no destructive ALTER on existing tables.
-- The legacy AssessmentTemplate / StudentAssessment models stay in place;
-- new write paths target AssessmentEntry exclusively.

-- CreateEnum
CREATE TYPE "AssessmentSource" AS ENUM ('HOMEROOM', 'CENTER');

-- CreateEnum
CREATE TYPE "LearningCenter" AS ENUM ('WORSHIP', 'NATURAL_MATERIALS', 'ART', 'COOKING', 'ROLE_PLAY', 'BLOCKS', 'PREPARATION', 'AREA');

-- CreateTable
CREATE TABLE "AssessmentEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekId" TEXT NOT NULL,
    "source" "AssessmentSource" NOT NULL,
    "center" "LearningCenter",
    "activity" TEXT,
    "level" "AchievementLevel" NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentEntry_tenantId_studentId_indicatorId_date_source_key" ON "AssessmentEntry"("tenantId", "studentId", "indicatorId", "date", "source");

-- CreateIndex
CREATE INDEX "AssessmentEntry_tenantId_weekId_studentId_idx" ON "AssessmentEntry"("tenantId", "weekId", "studentId");

-- CreateIndex
CREATE INDEX "AssessmentEntry_tenantId_studentId_date_idx" ON "AssessmentEntry"("tenantId", "studentId", "date");

-- AddForeignKey
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "AchievementIndicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: AssessmentEntry is service-role-only writable from API routes (which
-- already gate via requirePermission + tenant scoping). Mirror the curriculum
-- pattern from 20260512100000_add_curriculum_models — service_role bypass
-- + RLS enabled so authenticated/anon JWT callers can never reach the rows
-- directly. No tenant-scoped SELECT policy because the app never queries
-- this table from a JWT-authenticated client; if that changes, add a
-- `tenantId = current_setting('app.tenant_id')::text` USING clause.
ALTER TABLE "AssessmentEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessmententry_service_all ON "AssessmentEntry" AS PERMISSIVE FOR ALL TO service_role USING (true);
