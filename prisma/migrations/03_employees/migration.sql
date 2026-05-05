-- 03_employees — Employee + EmployeeCampusAssignment (spec §4.1 row "Org") +
-- composite-FK pattern (§6.4) + SELECT-only RLS (§6.3) + defense-in-depth REVOKE.
--
-- Backfill: composite unique on Campus(id, tenantId) — 01_tenancy shipped Campus
-- before §6.4 was active; this index lets EmployeeCampusAssignment reference
-- Campus via composite FK without rewriting 01_tenancy. Zero data movement.
--
-- Wire-up: Program.headEmployeeId FK — 01_tenancy declared the column without a
-- constraint (Employee didn't exist yet). Wired here as single-col SET NULL.
--
-- Design locks (per p1-regions-seed reviewer + design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches 02_identity / §6.3 canonical)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--   * NO additional Tenant FK on join tables (composite FK chain enforces alignment per §6.4)
--
-- JobTitle stays inline VARCHAR(50) — spec §4.3 catalog list excludes JobTitle for MVP.

-- ── CreateTable Employee ──────────────────────────────────────────────
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "nik" VARCHAR(16),
    "phone" VARCHAR(20),
    "jobTitle" VARCHAR(50),
    "supabaseUserId" VARCHAR(255),
    "googleSubjectId" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hiredAt" DATE,
    "terminatedAt" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable EmployeeCampusAssignment ──────────────────────────────
-- Composite PK (employeeId, campusId, tenantId) per §6.4. No soft-delete —
-- historical assignments captured via endDate; hard-delete is a data correction.
CREATE TABLE "EmployeeCampusAssignment" (
    "employeeId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" VARCHAR(50),
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "EmployeeCampusAssignment_pkey" PRIMARY KEY ("employeeId", "campusId", "tenantId")
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
-- Per §6.4: composite FKs from EmployeeCampusAssignment + future TeachingDefault /
-- SessionTeacher reference Employee(id, tenantId). The composite uniqueness is
-- what makes this referenceable.
CREATE UNIQUE INDEX "Employee_id_tenantId_key" ON "Employee"("id", "tenantId");

-- ── Backfill: Campus composite unique (id, tenantId) ──────────────────
-- 01_tenancy shipped Campus before §6.4 composite-FK pattern was active. Adding
-- the (id, tenantId) unique here lets EmployeeCampusAssignment reference Campus
-- via composite FK without back-editing 01_tenancy. Zero data movement.
CREATE UNIQUE INDEX "Campus_id_tenantId_key" ON "Campus"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");
CREATE INDEX "Employee_tenantId_supabaseUserId_idx" ON "Employee"("tenantId", "supabaseUserId");
CREATE INDEX "Employee_tenantId_googleSubjectId_idx" ON "Employee"("tenantId", "googleSubjectId");
CREATE INDEX "Employee_tenantId_isActive_idx" ON "Employee"("tenantId", "isActive");

CREATE INDEX "EmployeeCampusAssignment_tenantId_idx" ON "EmployeeCampusAssignment"("tenantId");
CREATE INDEX "EmployeeCampusAssignment_campusId_tenantId_idx" ON "EmployeeCampusAssignment"("campusId", "tenantId");

-- ── Partial unique indexes (codes unique among non-deleted rows) ──────
-- Per §4.4. Deleted rows free up the slot for re-creation.
CREATE UNIQUE INDEX "employee_email_active_unique"
  ON "Employee" ("tenantId", "email")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "employee_nik_active_unique"
  ON "Employee" ("tenantId", "nik")
  WHERE "deletedAt" IS NULL AND "nik" IS NOT NULL;

-- ── Foreign keys ─────────────────────────────────────────────────────
-- Employee → Tenant: Restrict per §4.4 (never cascade Tenant).
-- EmployeeCampusAssignment composite → Employee + Campus: Cascade per §6.4.
-- Program.headEmployeeId → Employee: SET NULL — column FK (not join), tenant
-- alignment app-layer. Single-col matches §6.4 scope (composite for join only).
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeCampusAssignment" ADD CONSTRAINT "EmployeeCampusAssignment_employeeId_tenantId_fkey"
  FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeCampusAssignment" ADD CONSTRAINT "EmployeeCampusAssignment_campusId_tenantId_fkey"
  FOREIGN KEY ("campusId", "tenantId") REFERENCES "Campus"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Program" ADD CONSTRAINT "Program_headEmployeeId_fkey"
  FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. All writes go through service-role (bypasses RLS).
-- REVOKE ALL strips PostgREST write paths (defense-in-depth). NO FORCE ROW
-- LEVEL SECURITY — service-role seed/cron must bypass per design lock from
-- p1-regions-seed.

-- Employee
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Employee" FROM anon, authenticated;
GRANT SELECT ON "Employee" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Employee"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Employee"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- EmployeeCampusAssignment — no soft-delete, omit deletedAt clause
ALTER TABLE "EmployeeCampusAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EmployeeCampusAssignment" FROM anon, authenticated;
GRANT SELECT ON "EmployeeCampusAssignment" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "EmployeeCampusAssignment"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "EmployeeCampusAssignment"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
