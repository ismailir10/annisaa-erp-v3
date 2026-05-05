-- 05_sessions — ClassSession + SessionTeacher (spec §4.1 row "Sessions") +
-- 2 enums (SessionStatus, SessionTeacherRole per §4.2 + §4.5) + composite-FK
-- pattern (§6.4) + SELECT-only RLS (§6.3) + defense-in-depth REVOKE.
--
-- Design locks (per p1-regions-seed reviewer + design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches 02_identity / §6.3 canonical)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- ClassSession.sentraId = single-col FK SET NULL (denorm column FK, not join).
-- SessionTeacher composite FK to ClassSession + Employee Cascade per §4.4.
-- SessionTeacherRole members PRIMARY/SUBSTITUTE/SENTRA/ASSISTANT per §4.5
-- critical pattern verbatim. SessionStatus members PLANNED/IN_PROGRESS/
-- COMPLETED/CANCELLED for operational lifecycle.
--
-- Single-PRIMARY-per-session guard: partial unique index
-- session_teacher_primary_unique enforces at most one row with role='PRIMARY'
-- per (sessionId, tenantId). Defends against future cron bug
-- (p5-class-session-materializer) silently creating duplicates.

-- ── Enums ─────────────────────────────────────────────────────────────
CREATE TYPE "SessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE "SessionTeacherRole" AS ENUM ('PRIMARY', 'SUBSTITUTE', 'SENTRA', 'ASSISTANT');

-- ── CreateTable ClassSession ──────────────────────────────────────────
-- Operational instance — no soft-delete. version per §4.4 (versioned entity
-- ahead of 17_version_triggers). dayOfWeek denorm for query speed; CHECK
-- constraint enforces ISO 8601 range Mon=1 … Sun=7.
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classSectionId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "sentraId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "notes" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClassSession_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7)
);

-- ── CreateTable SessionTeacher ────────────────────────────────────────
-- Composite-FK join per §6.4. PK is (sessionId, employeeId, role, tenantId)
-- — multi-row per session permitted (e.g. PRIMARY + ASSISTANT both attend).
-- Cascade on session/employee delete per §4.4.
CREATE TABLE "SessionTeacher" (
    "sessionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "SessionTeacherRole" NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "SessionTeacher_pkey" PRIMARY KEY ("sessionId", "employeeId", "role", "tenantId")
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
CREATE UNIQUE INDEX "ClassSession_id_tenantId_key" ON "ClassSession"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
CREATE INDEX "ClassSession_tenantId_idx" ON "ClassSession"("tenantId");
CREATE INDEX "ClassSession_tenantId_academicTermId_idx" ON "ClassSession"("tenantId", "academicTermId");
CREATE INDEX "ClassSession_tenantId_sessionDate_idx" ON "ClassSession"("tenantId", "sessionDate");
CREATE INDEX "ClassSession_tenantId_classSectionId_sessionDate_idx" ON "ClassSession"("tenantId", "classSectionId", "sessionDate");
CREATE INDEX "ClassSession_tenantId_status_idx" ON "ClassSession"("tenantId", "status");
CREATE INDEX "ClassSession_sentraId_tenantId_idx" ON "ClassSession"("sentraId", "tenantId");

CREATE INDEX "SessionTeacher_tenantId_idx" ON "SessionTeacher"("tenantId");
CREATE INDEX "SessionTeacher_employeeId_tenantId_idx" ON "SessionTeacher"("employeeId", "tenantId");

-- ── Full unique index (no soft-delete on ClassSession) ────────────────
-- One session per class per day. Plain unique — not partial — because
-- ClassSession is operational, no deletedAt column.
CREATE UNIQUE INDEX "class_session_class_date_active_unique"
  ON "ClassSession" ("tenantId", "classSectionId", "sessionDate");

-- ── Partial unique index ──────────────────────────────────────────────
-- At most one PRIMARY teacher per session — protects against p5-class-session-
-- materializer cron bug silently creating duplicate PRIMARY rows. Per
-- pre-build reviewer IMPORTANT 2.
CREATE UNIQUE INDEX "session_teacher_primary_unique"
  ON "SessionTeacher" ("sessionId", "tenantId")
  WHERE "role" = 'PRIMARY';

-- ── Foreign keys ─────────────────────────────────────────────────────
-- ClassSession: composite FK to ClassSection / AcademicTerm Restrict. Tenant
-- Restrict. sentraId single-col SET NULL (denorm column, §6.4 reserves
-- composite for join tables).
-- SessionTeacher: composite FK chain Cascade per §4.4 "Cascade for owned
-- children (SessionTeacher, UserRole)".

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classSectionId_tenantId_fkey"
  FOREIGN KEY ("classSectionId", "tenantId") REFERENCES "ClassSection"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_academicTermId_tenantId_fkey"
  FOREIGN KEY ("academicTermId", "tenantId") REFERENCES "AcademicTerm"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_sentraId_fkey"
  FOREIGN KEY ("sentraId") REFERENCES "Sentra"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionTeacher" ADD CONSTRAINT "SessionTeacher_sessionId_tenantId_fkey"
  FOREIGN KEY ("sessionId", "tenantId") REFERENCES "ClassSession"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionTeacher" ADD CONSTRAINT "SessionTeacher_employeeId_tenantId_fkey"
  FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
-- Neither table has soft-delete — omit deletedAt clause from policies.

-- ClassSession
ALTER TABLE "ClassSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ClassSession" FROM anon, authenticated;
GRANT SELECT ON "ClassSession" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "ClassSession"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "ClassSession"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- SessionTeacher
ALTER TABLE "SessionTeacher" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SessionTeacher" FROM anon, authenticated;
GRANT SELECT ON "SessionTeacher" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "SessionTeacher"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "SessionTeacher"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
