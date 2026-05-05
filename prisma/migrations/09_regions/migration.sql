-- 09_regions — Indonesian administrative regions reference data per spec §6.1
-- migration 09 (regions portion only — Address chain split out to a future
-- 10_addresses migration when p2-addresses-idn-chain lands). 4 tables (Province
-- / Regency / District / Village) + 1 enum (RegencyType) + trigram GIN on
-- Village.name + public-read RLS (anon + authenticated SELECT, all writes
-- blocked via PostgREST).
--
-- Non-tenant-scoped: regions are global reference data shared across tenants.
-- No tenantId, no soft-delete, no audit-by columns. RLS deviates from
-- tenant_isolation_select (which 02_identity uses) — public_read with
-- USING (true) is correct because (a) no PII, (b) admission form /daftar
-- needs anon access, (c) data is identical across tenants. Documented in
-- docs/cycles/2026-05-05-p1-regions-seed.md.
--
-- BPS-code primary keys (deterministic): Province CHAR(2), Regency CHAR(4),
-- District CHAR(6), Village CHAR(10). District at CHAR(6) (not Permendagri-137
-- CHAR(7)) — idn-area-data v4.0.1 ships PPRRDD form; padding to 7 would break
-- the Village(10) ⊃ District prefix chain.

-- ── Enum ──────────────────────────────────────────────────────────────
CREATE TYPE "RegencyType" AS ENUM ('KABUPATEN', 'KOTA');

-- ── CreateTable Province ──────────────────────────────────────────────
CREATE TABLE "Province" (
    "id" CHAR(2) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Regency ───────────────────────────────────────────────
CREATE TABLE "Regency" (
    "id" CHAR(4) NOT NULL,
    "provinceId" CHAR(2) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "RegencyType" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Regency_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable District ──────────────────────────────────────────────
CREATE TABLE "District" (
    "id" CHAR(6) NOT NULL,
    "regencyId" CHAR(4) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Village ───────────────────────────────────────────────
CREATE TABLE "Village" (
    "id" CHAR(10) NOT NULL,
    "districtId" CHAR(6) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Village_pkey" PRIMARY KEY ("id")
);

-- ── Lookup indexes (FK columns) ───────────────────────────────────────
CREATE INDEX "Regency_provinceId_idx" ON "Regency"("provinceId");
CREATE INDEX "District_regencyId_idx" ON "District"("regencyId");
CREATE INDEX "Village_districtId_idx" ON "Village"("districtId");

-- ── Trigram GIN on Village.name (autocomplete in p2 admission form) ───
-- pg_trgm extension is installed by 00_extensions. Index lives here so the
-- seed populates against an indexed table — no later REINDEX needed.
CREATE INDEX "Village_name_trgm_idx" ON "Village" USING GIN ("name" gin_trgm_ops);

-- ── Foreign keys (Restrict on parent delete; Cascade on rename) ───────
ALTER TABLE "Regency"
  ADD CONSTRAINT "Regency_provinceId_fkey"
  FOREIGN KEY ("provinceId") REFERENCES "Province"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "District"
  ADD CONSTRAINT "District_regencyId_fkey"
  FOREIGN KEY ("regencyId") REFERENCES "Regency"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Village"
  ADD CONSTRAINT "Village_districtId_fkey"
  FOREIGN KEY ("districtId") REFERENCES "District"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security — public read (intentional deviation from §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- Region tables are global reference data with no PII and no tenant scope.
-- Public admission form (/daftar) lands p2 and requires anon SELECT; all
-- mutations go through service-role (seed + future Kemendagri refresh cron).
-- The no_writes_via_postgrest policy explicitly closes PostgREST write paths
-- for both anon and authenticated. Service-role bypasses RLS by default — do
-- NOT add ALTER TABLE ... FORCE ROW LEVEL SECURITY in any future migration
-- touching these tables, or seed re-apply will silently fail.

-- Province
ALTER TABLE "Province" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "Province" FROM anon, authenticated;
GRANT SELECT ON "Province" TO authenticated, anon;
CREATE POLICY "public_read" ON "Province"
  FOR SELECT TO authenticated, anon
  USING (true);
CREATE POLICY "no_writes_via_postgrest" ON "Province"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Regency
ALTER TABLE "Regency" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "Regency" FROM anon, authenticated;
GRANT SELECT ON "Regency" TO authenticated, anon;
CREATE POLICY "public_read" ON "Regency"
  FOR SELECT TO authenticated, anon
  USING (true);
CREATE POLICY "no_writes_via_postgrest" ON "Regency"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- District
ALTER TABLE "District" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "District" FROM anon, authenticated;
GRANT SELECT ON "District" TO authenticated, anon;
CREATE POLICY "public_read" ON "District"
  FOR SELECT TO authenticated, anon
  USING (true);
CREATE POLICY "no_writes_via_postgrest" ON "District"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Village
ALTER TABLE "Village" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "Village" FROM anon, authenticated;
GRANT SELECT ON "Village" TO authenticated, anon;
CREATE POLICY "public_read" ON "Village"
  FOR SELECT TO authenticated, anon
  USING (true);
CREATE POLICY "no_writes_via_postgrest" ON "Village"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
