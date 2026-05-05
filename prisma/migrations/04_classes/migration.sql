-- 04_classes — ClassSection + Sentra (catalog) + TeachingDefault + SentraRotation
-- (spec §4.1 row "Classes") + composite-FK pattern (§6.4) + SELECT-only RLS
-- (§6.3) + defense-in-depth REVOKE.
--
-- Backfills: composite uniques on Program(id, tenantId), AcademicYear(id,
-- tenantId), AcademicTerm(id, tenantId) — these tables shipped in 01_tenancy /
-- 02_identity before this cycle's join tables needed §6.4 composite-FK targets.
-- Zero data movement.
--
-- Design locks (per p1-regions-seed reviewer + design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches 02_identity / §6.3 canonical)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--   * NO additional Tenant FK on join tables (composite chain enforces alignment)
--
-- TeachingDefault   = (ClassSection × Sentra × Term → Employee). Sentra-teacher default per term.
-- SentraRotation    = (ClassSection × dayOfWeek × Term → Sentra). Week-grid schedule.
-- ClassSection.walasEmployeeId = single-col FK SET NULL (column FK, §6.4 reserves composite for join tables).

-- ── CreateTable ClassSection ──────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit, version per §4.4.
CREATE TABLE "ClassSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "walasEmployeeId" TEXT,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Sentra ────────────────────────────────────────────────
-- Catalog table per §4.3 (PAUD learning-center categories). source = SYSTEM
-- (engineer-seeded) | ADMIN (admin-extensible v1.1+).
CREATE TABLE "Sentra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source" "CatalogSource" NOT NULL DEFAULT 'SYSTEM',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Sentra_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable TeachingDefault ───────────────────────────────────────
-- Composite-FK join per §6.4. PK is (classSectionId, academicTermId, sentraId,
-- tenantId) — one default sentra-teacher per (class × sentra × term). No
-- soft-delete (overwrite per term).
CREATE TABLE "TeachingDefault" (
    "classSectionId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "sentraId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "TeachingDefault_pkey" PRIMARY KEY ("classSectionId", "academicTermId", "sentraId", "tenantId")
);

-- ── CreateTable SentraRotation ────────────────────────────────────────
-- Composite-FK join per §6.4. Week-grid (class × dayOfWeek × term → sentra).
-- dayOfWeek ISO 8601 (Mon=1 … Sun=7). CHECK constraint enforces range.
CREATE TABLE "SentraRotation" (
    "classSectionId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "sentraId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "SentraRotation_pkey" PRIMARY KEY ("classSectionId", "dayOfWeek", "academicTermId", "tenantId"),
    CONSTRAINT "SentraRotation_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7)
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
-- Per §6.4: ClassSection + Sentra are referenced by composite FKs from join
-- tables in this migration AND from ClassSession / SessionTeacher in 05_sessions.
CREATE UNIQUE INDEX "ClassSection_id_tenantId_key" ON "ClassSection"("id", "tenantId");
CREATE UNIQUE INDEX "Sentra_id_tenantId_key" ON "Sentra"("id", "tenantId");

-- ── Backfill: composite uniques on existing tenancy tables ────────────
-- Program / AcademicYear / AcademicTerm shipped in 01_tenancy + 02_identity
-- before this cycle's join tables needed (id, tenantId) FK targets. Adding the
-- backfill indexes here lets ClassSection (Program/AcademicYear/Campus) and
-- TeachingDefault / SentraRotation / ClassSession (AcademicTerm) reference them
-- via composite FK without back-editing the prior migrations. Zero data movement.
CREATE UNIQUE INDEX "Program_id_tenantId_key" ON "Program"("id", "tenantId");
CREATE UNIQUE INDEX "AcademicYear_id_tenantId_key" ON "AcademicYear"("id", "tenantId");
CREATE UNIQUE INDEX "AcademicTerm_id_tenantId_key" ON "AcademicTerm"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
CREATE INDEX "ClassSection_tenantId_idx" ON "ClassSection"("tenantId");
CREATE INDEX "ClassSection_tenantId_programId_idx" ON "ClassSection"("tenantId", "programId");
CREATE INDEX "ClassSection_tenantId_academicYearId_idx" ON "ClassSection"("tenantId", "academicYearId");
CREATE INDEX "ClassSection_tenantId_campusId_idx" ON "ClassSection"("tenantId", "campusId");
CREATE INDEX "ClassSection_walasEmployeeId_idx" ON "ClassSection"("walasEmployeeId");

CREATE INDEX "Sentra_tenantId_idx" ON "Sentra"("tenantId");

CREATE INDEX "TeachingDefault_tenantId_idx" ON "TeachingDefault"("tenantId");
CREATE INDEX "TeachingDefault_employeeId_tenantId_idx" ON "TeachingDefault"("employeeId", "tenantId");
CREATE INDEX "TeachingDefault_sentraId_tenantId_idx" ON "TeachingDefault"("sentraId", "tenantId");
CREATE INDEX "TeachingDefault_academicTermId_tenantId_idx" ON "TeachingDefault"("academicTermId", "tenantId");

CREATE INDEX "SentraRotation_tenantId_idx" ON "SentraRotation"("tenantId");
CREATE INDEX "SentraRotation_sentraId_tenantId_idx" ON "SentraRotation"("sentraId", "tenantId");
CREATE INDEX "SentraRotation_academicTermId_tenantId_idx" ON "SentraRotation"("academicTermId", "tenantId");

-- ── Partial unique indexes (codes unique among non-deleted rows) ──────
-- Per §4.4. ClassSection.code unique per (tenantId, academicYearId).
-- Sentra.code unique per tenantId.
CREATE UNIQUE INDEX "class_section_code_active_unique"
  ON "ClassSection" ("tenantId", "academicYearId", "code")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "sentra_code_active_unique"
  ON "Sentra" ("tenantId", "code")
  WHERE "deletedAt" IS NULL;

-- ── Foreign keys ─────────────────────────────────────────────────────
-- ClassSection: composite FKs to Program/AcademicYear/Campus Restrict; tenant
-- FK Restrict; walasEmployeeId single-col SET NULL (column FK, §6.4 reserves
-- composite for join tables).
-- TeachingDefault / SentraRotation: composite FK chain Cascade per parent.

ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_programId_tenantId_fkey"
  FOREIGN KEY ("programId", "tenantId") REFERENCES "Program"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_academicYearId_tenantId_fkey"
  FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_campusId_tenantId_fkey"
  FOREIGN KEY ("campusId", "tenantId") REFERENCES "Campus"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_walasEmployeeId_fkey"
  FOREIGN KEY ("walasEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sentra" ADD CONSTRAINT "Sentra_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeachingDefault" ADD CONSTRAINT "TeachingDefault_classSectionId_tenantId_fkey"
  FOREIGN KEY ("classSectionId", "tenantId") REFERENCES "ClassSection"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeachingDefault" ADD CONSTRAINT "TeachingDefault_academicTermId_tenantId_fkey"
  FOREIGN KEY ("academicTermId", "tenantId") REFERENCES "AcademicTerm"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeachingDefault" ADD CONSTRAINT "TeachingDefault_sentraId_tenantId_fkey"
  FOREIGN KEY ("sentraId", "tenantId") REFERENCES "Sentra"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeachingDefault" ADD CONSTRAINT "TeachingDefault_employeeId_tenantId_fkey"
  FOREIGN KEY ("employeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SentraRotation" ADD CONSTRAINT "SentraRotation_classSectionId_tenantId_fkey"
  FOREIGN KEY ("classSectionId", "tenantId") REFERENCES "ClassSection"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SentraRotation" ADD CONSTRAINT "SentraRotation_academicTermId_tenantId_fkey"
  FOREIGN KEY ("academicTermId", "tenantId") REFERENCES "AcademicTerm"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SentraRotation" ADD CONSTRAINT "SentraRotation_sentraId_tenantId_fkey"
  FOREIGN KEY ("sentraId", "tenantId") REFERENCES "Sentra"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL SECURITY
-- per design lock from p1-regions-seed.

-- ClassSection (soft-delete → deletedAt clause)
ALTER TABLE "ClassSection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ClassSection" FROM anon, authenticated;
GRANT SELECT ON "ClassSection" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "ClassSection"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "ClassSection"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Sentra (soft-delete → deletedAt clause)
ALTER TABLE "Sentra" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Sentra" FROM anon, authenticated;
GRANT SELECT ON "Sentra" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Sentra"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Sentra"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- TeachingDefault (no soft-delete — omit deletedAt clause)
ALTER TABLE "TeachingDefault" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TeachingDefault" FROM anon, authenticated;
GRANT SELECT ON "TeachingDefault" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "TeachingDefault"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "TeachingDefault"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- SentraRotation (no soft-delete — omit deletedAt clause)
ALTER TABLE "SentraRotation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SentraRotation" FROM anon, authenticated;
GRANT SELECT ON "SentraRotation" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "SentraRotation"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "SentraRotation"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
