-- Cycle: 2026-05-15 academic-hierarchy-refactor (T1).
-- Foundation for the Campus > Program > AcademicYear > Class > Session
-- hierarchy: introduces ClassTrack (stable multi-year class identity) and
-- ClassSession (daily class meeting), wires ClassSection + StudentAttendance
-- into the new structure, and enables RLS on both new tables.
--
-- Backfill strategy (this migration only — Task 8 does the full historical
-- ClassSession + StudentAttendance.sessionId backfill):
--   * ClassTrack: one row per distinct (tenantId, campusId, programId, name)
--     drawn from existing ClassSection rows, so ClassSection.classTrackId can
--     be made NOT NULL without orphaning the 6 existing sections.
--   * StudentAttendance.sessionId stays NULL for existing rows — Postgres
--     treats NULLs as distinct in a unique index, so @@unique([studentId,
--     sessionId]) does not collide across the 301 legacy attendance rows.
--
-- ClassSection.campusId / programId / academicYearId are intentionally
-- retained this cycle for query compatibility (see cycle doc Non-goals).

-- ── ClassTrack ───────────────────────────────────────────────
-- CreateTable
CREATE TABLE "ClassTrack" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ClassTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassTrack_tenantId_status_idx" ON "ClassTrack"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassTrack_tenantId_campusId_programId_name_key" ON "ClassTrack"("tenantId", "campusId", "programId", "name");

-- AddForeignKey
ALTER TABLE "ClassTrack" ADD CONSTRAINT "ClassTrack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTrack" ADD CONSTRAINT "ClassTrack_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTrack" ADD CONSTRAINT "ClassTrack_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ClassSession ─────────────────────────────────────────────
-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL DEFAULT 'FULL_DAY',
    "teacherId" TEXT,
    "defaultTeacherId" TEXT,
    "substituteReason" TEXT,
    "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassSession_teacherId_date_idx" ON "ClassSession"("teacherId", "date");

-- CreateIndex
CREATE INDEX "ClassSession_date_idx" ON "ClassSession"("date");

-- CreateIndex
CREATE INDEX "ClassSession_semesterId_idx" ON "ClassSession"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_classSectionId_date_slot_key" ON "ClassSession"("classSectionId", "date", "slot");

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_defaultTeacherId_fkey" FOREIGN KEY ("defaultTeacherId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ClassSection: add classTrackId + slotTemplate ────────────
-- AlterTable: add classTrackId nullable first, backfill, then enforce NOT NULL.
ALTER TABLE "ClassSection" ADD COLUMN "classTrackId" TEXT;
ALTER TABLE "ClassSection" ADD COLUMN "slotTemplate" TEXT NOT NULL DEFAULT 'FULL_DAY';

-- Backfill: one ClassTrack per distinct (tenantId, campusId, programId, name)
-- among existing sections. cuid()-shaped ids are not available in pure SQL;
-- use a deterministic 'ct_' + md5 surrogate so the migration is idempotent
-- and reproducible. Application-created tracks will use real cuid()s.
INSERT INTO "ClassTrack" ("id", "tenantId", "campusId", "programId", "name", "status")
SELECT
    'ct_' || md5("tenantId" || ':' || "campusId" || ':' || "programId" || ':' || "name"),
    "tenantId",
    "campusId",
    "programId",
    "name",
    'ACTIVE'
FROM "ClassSection"
GROUP BY "tenantId", "campusId", "programId", "name"
ON CONFLICT ("tenantId", "campusId", "programId", "name") DO NOTHING;

-- Link each section to its backfilled track.
UPDATE "ClassSection" cs
SET "classTrackId" = ct."id"
FROM "ClassTrack" ct
WHERE ct."tenantId" = cs."tenantId"
  AND ct."campusId" = cs."campusId"
  AND ct."programId" = cs."programId"
  AND ct."name" = cs."name";

-- Now enforce NOT NULL + FK.
ALTER TABLE "ClassSection" ALTER COLUMN "classTrackId" SET NOT NULL;
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_classTrackId_fkey" FOREIGN KEY ("classTrackId") REFERENCES "ClassTrack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── StudentAttendance: sessionId + pickup fields, uniqueness swap ──
-- AlterTable
ALTER TABLE "StudentAttendance" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "StudentAttendance" ADD COLUMN "pickedUpByRelation" TEXT;
ALTER TABLE "StudentAttendance" ADD COLUMN "pickedUpByName" TEXT;

-- Drop legacy unique (studentId, date) — blocks DCARE multi-shift attendance.
DROP INDEX "StudentAttendance_studentId_date_key";

-- A non-unique [studentId, date] index already exists
-- ("StudentAttendance_studentId_date_idx" from 20260416000002_add_learning_indexes);
-- dropping the unique above leaves exactly that one in place. No new index needed.

-- New primary uniqueness: (studentId, sessionId). NULL sessionId rows are
-- distinct under Postgres unique-index semantics, so legacy rows do not collide.
CREATE UNIQUE INDEX "StudentAttendance_studentId_sessionId_key" ON "StudentAttendance"("studentId", "sessionId");

-- Partial unique index restoring atomic uniqueness for the legacy
-- (session-agnostic) attendance path. Because @@unique([studentId, sessionId])
-- does NOT constrain rows where sessionId IS NULL (Postgres treats NULLs as
-- distinct), two concurrent marks for the same (studentId, date) with
-- sessionId=NULL could both pass a findFirst guard and both insert. This
-- partial index makes that path atomic during the migration window.
-- NOTE: the follow-up cycle (Task 7 — ClassSession-backed marking) drops this
-- index once every StudentAttendance row carries a non-NULL sessionId.
CREATE UNIQUE INDEX "StudentAttendance_studentId_date_legacy_key" ON "StudentAttendance"("studentId", "date") WHERE "sessionId" IS NULL;

-- AddForeignKey
ALTER TABLE "StudentAttendance" ADD CONSTRAINT "StudentAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════
-- RLS: ClassTrack (direct tenancy) + ClassSession (indirect via ClassSection)
-- Pattern matches the existing indirect-tenancy policies for
-- TeachingAssignment + StudentAttendance (20260415_rls_policies).
-- ════════════════════════════════════════════════════════════
ALTER TABLE "ClassTrack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassSession" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classtrack_select_own_tenant" ON "ClassTrack";
CREATE POLICY "classtrack_select_own_tenant" ON "ClassTrack"
  FOR SELECT
  TO authenticated
  USING (
    "tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
  );

DROP POLICY IF EXISTS "classtrack_service_all" ON "ClassTrack";
CREATE POLICY "classtrack_service_all" ON "ClassTrack"
  FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "classsession_select_own_tenant" ON "ClassSession";
CREATE POLICY "classsession_select_own_tenant" ON "ClassSession"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "ClassSection" cs
      WHERE cs."id" = "ClassSession"."classSectionId"
      AND cs."tenantId" IN (SELECT "tenantId" FROM "User" WHERE "id" = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "classsession_service_all" ON "ClassSession";
CREATE POLICY "classsession_service_all" ON "ClassSession"
  FOR ALL
  TO authenticated
  USING (true);
