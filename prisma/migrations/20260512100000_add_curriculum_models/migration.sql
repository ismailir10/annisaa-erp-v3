Loaded Prisma config from prisma.config.ts.

-- CreateEnum
CREATE TYPE "CurriculumElement" AS ENUM ('RELIGIOUS_MORAL', 'IDENTITY', 'STEAM', 'MOTOR_SKILLS', 'ART');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "AchievementLevel" AS ENUM ('CONSISTENT', 'EMERGING', 'NEEDS_REINFORCEMENT');

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubTheme" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subThemeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "element" "CurriculumElement" NOT NULL,
    "number" INTEGER NOT NULL,
    "competencyText" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementIndicator" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorThemeLink" (
    "indicatorId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicatorThemeLink_pkey" PRIMARY KEY ("indicatorId","themeId")
);

-- CreateIndex
CREATE INDEX "Semester_tenantId_idx" ON "Semester"("tenantId");

-- CreateIndex
CREATE INDEX "Semester_tenantId_academicYearId_idx" ON "Semester"("tenantId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_tenantId_academicYearId_number_key" ON "Semester"("tenantId", "academicYearId", "number");

-- CreateIndex
CREATE INDEX "Theme_tenantId_idx" ON "Theme"("tenantId");

-- CreateIndex
CREATE INDEX "Theme_tenantId_semesterId_idx" ON "Theme"("tenantId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_tenantId_semesterId_name_key" ON "Theme"("tenantId", "semesterId", "name");

-- CreateIndex
CREATE INDEX "SubTheme_tenantId_idx" ON "SubTheme"("tenantId");

-- CreateIndex
CREATE INDEX "SubTheme_tenantId_themeId_idx" ON "SubTheme"("tenantId", "themeId");

-- CreateIndex
CREATE UNIQUE INDEX "SubTheme_tenantId_themeId_name_key" ON "SubTheme"("tenantId", "themeId", "name");

-- CreateIndex
CREATE INDEX "Week_tenantId_idx" ON "Week"("tenantId");

-- CreateIndex
CREATE INDEX "Week_tenantId_subThemeId_idx" ON "Week"("tenantId", "subThemeId");

-- CreateIndex
CREATE INDEX "Week_tenantId_startDate_endDate_idx" ON "Week"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Week_tenantId_subThemeId_number_key" ON "Week"("tenantId", "subThemeId", "number");

-- CreateIndex
CREATE INDEX "LearningObjective_tenantId_idx" ON "LearningObjective"("tenantId");

-- CreateIndex
CREATE INDEX "LearningObjective_tenantId_semesterId_idx" ON "LearningObjective"("tenantId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjective_tenantId_semesterId_ageGroup_element_numb_key" ON "LearningObjective"("tenantId", "semesterId", "ageGroup", "element", "number");

-- CreateIndex
CREATE INDEX "AchievementIndicator_tenantId_idx" ON "AchievementIndicator"("tenantId");

-- CreateIndex
CREATE INDEX "AchievementIndicator_tenantId_objectiveId_idx" ON "AchievementIndicator"("tenantId", "objectiveId");

-- CreateIndex
CREATE INDEX "IndicatorThemeLink_themeId_idx" ON "IndicatorThemeLink"("themeId");

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTheme" ADD CONSTRAINT "SubTheme_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTheme" ADD CONSTRAINT "SubTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_subThemeId_fkey" FOREIGN KEY ("subThemeId") REFERENCES "SubTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementIndicator" ADD CONSTRAINT "AchievementIndicator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementIndicator" ADD CONSTRAINT "AchievementIndicator_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorThemeLink" ADD CONSTRAINT "IndicatorThemeLink_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "AchievementIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorThemeLink" ADD CONSTRAINT "IndicatorThemeLink_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cycle C1 — Curriculum schema (Pack 1 / July 2026 cutover).
-- 7 tables; 6 tenant-scoped (Semester, Theme, SubTheme, Week, LearningObjective,
-- AchievementIndicator) + 1 junction (IndicatorThemeLink — no tenantId; tenant
-- isolation enforced by parent rows).
--
-- See docs/cycles/2026-05-12-curriculum-schema-and-admin.md and
-- docs/superpowers/specs/2026-05-12-curriculum-penilaian-raport-design.md §4.1.

-- Enable RLS on every tenant-scoped curriculum table. Service role (Prisma)
-- always has full access. Read-only Supabase clients respect tenantId via
-- app-layer filters; RLS is the belt to the app-layer suspenders.
ALTER TABLE "Semester" ENABLE ROW LEVEL SECURITY;
CREATE POLICY semester_service_all ON "Semester" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "Theme" ENABLE ROW LEVEL SECURITY;
CREATE POLICY theme_service_all ON "Theme" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "SubTheme" ENABLE ROW LEVEL SECURITY;
CREATE POLICY subtheme_service_all ON "SubTheme" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "Week" ENABLE ROW LEVEL SECURITY;
CREATE POLICY week_service_all ON "Week" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "LearningObjective" ENABLE ROW LEVEL SECURITY;
CREATE POLICY learningobjective_service_all ON "LearningObjective" AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "AchievementIndicator" ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievementindicator_service_all ON "AchievementIndicator" AS PERMISSIVE FOR ALL TO service_role USING (true);
