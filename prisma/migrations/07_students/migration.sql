-- 07_students — Household + Student + StudentIdentifier + StudentIdentifierSequence
-- (spec §6.1 row "Students" + §6.4 composite-FK pattern + §4.5 NIS history) +
-- SELECT-only RLS (§6.3) + defense-in-depth REVOKE + storage.objects RLS folded
-- inline (per p1-upload-route-sharp Ship Notes step 4).
--
-- Design locks (per p1-regions-seed reviewer + design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- Soft-delete policy per cycle assumption 11:
--   * YES: Household, Student, StudentIdentifier (admin-correctable; NIS
--     history retained — soft-deleted PRIMARY rows do NOT block re-assignment).
--   * NO:  StudentIdentifierSequence (operational, append-only counter row;
--     matches ExportJob/EmailLog precedent in 16_scaffold).
--
-- Partial-unique PRIMARY guard (per cycle assumption 11):
--   `WHERE "isPrimary" = true AND "deletedAt" IS NULL` — diverges from
--   SessionTeacher's `WHERE "role" = 'PRIMARY'` precedent because soft-deleted
--   primaries must free the slot for re-issue per spec §4.5 NIS history rule.
--
-- NIS allocator advisory-lock is purely app-layer (per cycle assumption 12) —
-- this migration defines NO `pg_advisory_xact_lock` helper function. The lock
-- call lives in `lib/students/nis-allocator.ts` invoked via `prisma.$queryRaw`
-- inside `prisma.$transaction(...)`. T11 migration test asserts only schema
-- shape + RLS + partial-unique; lock semantics covered by T3 vitest cases.
--
-- Address FK deferred: `Household.addressId TEXT` ships without a constraint.
-- Address model lands in p2-addresses-idn-chain (spec §6.1). Wired then.

-- ── CreateTable Household ─────────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit per §4.4. `code` is the display code
-- (e.g. "HH-2026-001"); allocated lazily by admin tools, NULL until issued.
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50),
    "addressId" TEXT,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Student ───────────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit per §4.4. `nis` allocated lazily by
-- NIS allocator (T3); unique per tenant among non-deleted rows. `nik` is
-- Indonesian national ID; PII (T2 schema annotates with /// @PII redact).
-- gender uses CHECK (no enum) — single binary value, schema-light.
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "nis" VARCHAR(50),
    "nik" VARCHAR(16),
    "fullName" VARCHAR(255) NOT NULL,
    "nickname" VARCHAR(100),
    "birthPlace" VARCHAR(100),
    "birthDate" DATE,
    "gender" VARCHAR(10) NOT NULL,
    "enrolledAt" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Student_gender_check" CHECK ("gender" IN ('MALE', 'FEMALE'))
);

-- ── CreateTable StudentIdentifier ─────────────────────────────────────
-- Tenant-scoped, soft-delete (NIS history), audit per §4.4. `kind` uses
-- CHECK (NIS / NISN / PREVIOUS_SCHOOL) — schema-light, no enum. Composite
-- FK to Student per §6.4. Cascade on Student hard-delete (admin-tool path);
-- soft-delete on Student preserves identifier history (deletedAt cascades
-- via app-layer, not FK).
CREATE TABLE "StudentIdentifier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" DATE,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "StudentIdentifier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentIdentifier_kind_check" CHECK ("kind" IN ('NIS', 'NISN', 'PREVIOUS_SCHOOL'))
);

-- ── CreateTable StudentIdentifierSequence ─────────────────────────────
-- Operational counter row per (tenant, year, program) triple. NO soft-
-- delete (append-only — admin tools may reset via UPDATE but never delete).
-- NIS allocator (T3) bumps `lastValue` inside a `pg_advisory_xact_lock`
-- transaction — per-row contention is rare (different programs allocate
-- different ranges), so lock granularity at (tenant, year) is sufficient.
CREATE TABLE "StudentIdentifierSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "StudentIdentifierSequence_pkey" PRIMARY KEY ("id")
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
-- Per §6.4: Household + Student + StudentIdentifier are referenced by
-- composite FKs from join tables in this migration AND from future
-- p2-guardians (Guardian/StudentGuardian) + p2-admission-funnel cycles.
CREATE UNIQUE INDEX "Household_id_tenantId_key" ON "Household"("id", "tenantId");
CREATE UNIQUE INDEX "Student_id_tenantId_key" ON "Student"("id", "tenantId");
CREATE UNIQUE INDEX "StudentIdentifier_id_tenantId_key" ON "StudentIdentifier"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
-- Household
CREATE INDEX "Household_tenantId_idx" ON "Household"("tenantId");

-- Student
CREATE INDEX "Student_tenantId_idx" ON "Student"("tenantId");
CREATE INDEX "Student_tenantId_householdId_idx" ON "Student"("tenantId", "householdId");
CREATE INDEX "Student_tenantId_programId_idx" ON "Student"("tenantId", "programId");
CREATE INDEX "Student_tenantId_fullName_idx" ON "Student"("tenantId", "fullName");
-- Trigram index for fuzzy fullName search (pg_trgm loaded by 00_extensions;
-- precedent: Village.name in 09_regions). Supports admin search-by-name UX.
CREATE INDEX "Student_fullName_trgm_idx" ON "Student" USING GIN ("fullName" gin_trgm_ops);

-- StudentIdentifier
CREATE INDEX "StudentIdentifier_tenantId_idx" ON "StudentIdentifier"("tenantId");
CREATE INDEX "StudentIdentifier_tenantId_studentId_idx" ON "StudentIdentifier"("tenantId", "studentId");
CREATE INDEX "StudentIdentifier_tenantId_kind_value_idx" ON "StudentIdentifier"("tenantId", "kind", "value");

-- StudentIdentifierSequence
CREATE INDEX "StudentIdentifierSequence_tenantId_idx" ON "StudentIdentifierSequence"("tenantId");

-- ── Partial unique indexes (codes unique among non-deleted rows) ──────
-- Per §4.4. Deleted rows free up the slot for re-creation.
-- Household.code unique per tenantId (display code, optional).
CREATE UNIQUE INDEX "household_code_active_unique"
  ON "Household" ("tenantId", "code")
  WHERE "deletedAt" IS NULL AND "code" IS NOT NULL;

-- Student.nis unique per tenantId (allocated lazily by NIS allocator).
CREATE UNIQUE INDEX "student_nis_active_unique"
  ON "Student" ("tenantId", "nis")
  WHERE "deletedAt" IS NULL AND "nis" IS NOT NULL;

-- ── Partial unique index — single PRIMARY identifier per student ──────
-- Per cycle assumption 11. Diverges from SessionTeacher precedent
-- (`WHERE "role" = 'PRIMARY'`) by also requiring `deletedAt IS NULL` —
-- soft-deleted primaries must NOT block re-issue, per spec §4.5
-- "NIS reissues per cohort retain history, no overwrite".
CREATE UNIQUE INDEX "StudentIdentifier_singlePrimary_key"
  ON "StudentIdentifier" ("studentId", "tenantId")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;

-- ── Full unique index — one sequence row per (tenant, year, program) ──
-- StudentIdentifierSequence is append-only — no soft-delete, plain unique.
CREATE UNIQUE INDEX "student_identifier_sequence_triple_unique"
  ON "StudentIdentifierSequence" ("tenantId", "academicYearId", "programId");

-- ── Foreign keys ──────────────────────────────────────────────────────
-- Tenant FKs Restrict per §4.4 (never cascade Tenant).
-- Composite FKs per §6.4 for join tables and tenant-aligned children.
-- Student → Household / Program: Restrict (admin must move students before
-- deleting parent). StudentIdentifier → Student: Cascade on Student hard-
-- delete (admin-tool path; soft-delete preserves history via app-layer).
-- StudentIdentifierSequence → AcademicYear / Program: Restrict.
-- Address FK on Household.addressId DEFERRED to p2-addresses-idn-chain.

-- Household
ALTER TABLE "Household" ADD CONSTRAINT "Household_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Student
ALTER TABLE "Student" ADD CONSTRAINT "Student_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_householdId_tenantId_fkey"
  FOREIGN KEY ("householdId", "tenantId") REFERENCES "Household"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_programId_tenantId_fkey"
  FOREIGN KEY ("programId", "tenantId") REFERENCES "Program"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- StudentIdentifier
ALTER TABLE "StudentIdentifier" ADD CONSTRAINT "StudentIdentifier_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentifier" ADD CONSTRAINT "StudentIdentifier_studentId_tenantId_fkey"
  FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- StudentIdentifierSequence
ALTER TABLE "StudentIdentifierSequence" ADD CONSTRAINT "StudentIdentifierSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentifierSequence" ADD CONSTRAINT "StudentIdentifierSequence_academicYearId_tenantId_fkey"
  FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentifierSequence" ADD CONSTRAINT "StudentIdentifierSequence_programId_tenantId_fkey"
  FOREIGN KEY ("programId", "tenantId") REFERENCES "Program"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
--
-- Soft-delete asymmetry on tenant_isolation_select USING clause:
--   * deletedAt IS NULL clause:    Household, Student, StudentIdentifier
--   * NO deletedAt clause:         StudentIdentifierSequence (operational)

-- Household
ALTER TABLE "Household" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Household" FROM anon, authenticated;
GRANT SELECT ON "Household" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Household"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Household"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Student
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Student" FROM anon, authenticated;
GRANT SELECT ON "Student" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Student"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Student"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- StudentIdentifier
ALTER TABLE "StudentIdentifier" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StudentIdentifier" FROM anon, authenticated;
GRANT SELECT ON "StudentIdentifier" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "StudentIdentifier"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "StudentIdentifier"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- StudentIdentifierSequence (no soft-delete — omit deletedAt clause)
ALTER TABLE "StudentIdentifierSequence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StudentIdentifierSequence" FROM anon, authenticated;
GRANT SELECT ON "StudentIdentifierSequence" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "StudentIdentifierSequence"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "StudentIdentifierSequence"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ══════════════════════════════════════════════════════════════════════
-- storage.objects RLS (folded inline per p1-upload-route-sharp Ship Notes
-- step 4 — was deferred from cycle 16_scaffold awaiting first p2 entity
-- migration; lands here)
-- ══════════════════════════════════════════════════════════════════════
-- Path convention per docs/cycles/2026-05-05-p1-audit-timeline-files.md §430:
-- `<tenantId>/<kind>/<cuid>.<ext>` — every uploaded object lives under the
-- tenant's `id` prefix. The five buckets (documents, images, videos, audios,
-- archives — see lib/storage/supabase.ts BUCKETS) each carry the tenant
-- prefix in `name`; the policy gates on the prefix match across all buckets
-- (no bucket_id constraint — applies uniformly).
--
-- Service-role bypasses RLS for app writes (the upload route runs server-
-- side with SUPABASE_SERVICE_ROLE_KEY). PostgREST clients (anon/authenticated)
-- can SELECT only objects under their tenant prefix; all other operations
-- denied. Verbatim from cycle 7 runbook.

CREATE POLICY "tenant_scoped_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    name LIKE (current_setting('request.jwt.claims', true)::json->>'tenant_id') || '/%'
  );

CREATE POLICY "no_writes_via_postgrest_storage" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
