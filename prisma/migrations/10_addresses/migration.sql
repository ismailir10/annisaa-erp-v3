-- 10_addresses — Address model (idn-area-data chain) + Household.addressId FK
-- (deferred from p1-regions-seed per foundation §4.1 / §6.4 composite-FK pattern)
-- Cycle: p2-addresses-idn-chain (2026-05-08)
--
-- Design locks (per p1-regions-seed reviewer + p2-addresses-idn-chain design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- Soft-delete: YES on Address (admin-correctable; relationship history retained).
-- FileKind allowlist: NONE (no upload in this cycle).
--
-- Chain-validity: app-layer Zod superRefine (BPS-code prefix) + DB compound FK
-- (cycle Spec §1). Address-side FKs hand-written as compound (id, parentId)
-- targeting Region tables — enforces BPS prefix hierarchy at DB layer.
-- Prisma schema uses SINGLE-column relations on all Region FKs (NOT composite) to
-- avoid migrate dev regenerating composite REFERENCES mismatched to column-list
-- ordering — drift is intentional; REJECT regeneration in PR review.
--
-- Household.addressId FK: hand-written as compound (addressId, tenantId) with
-- column-list `SET NULL ("addressId")` per scaffold.md §6 split-view pattern
-- (Prisma issue #25061 trap — mirrors Guardian.userId precedent in 08_guardians).
-- Column-list SET NULL requires Postgres 15.4+ (Supabase 15.6+ confirmed compatible).
--
-- Region composite-unique constraints added here (Regency/District/Village
-- @@unique from schema step 2): `Regency_id_provinceId_key`,
-- `District_id_regencyId_key`, `Village_id_districtId_key` — these are required
-- as FK targets for Address compound FKs (`Address_regencyId_provinceId_fkey`,
-- `Address_districtId_regencyId_fkey`, `Address_villageId_districtId_fkey`).
--
-- Address FK on Household.addressId was deferred in 07_students migration
-- (comment: "Address FK on Household.addressId DEFERRED to p2-addresses-idn-chain").
-- This migration closes that deferral.

-- ── Region composite-unique constraints (required as FK targets for Address) ──
-- Regency(id, provinceId): FK target for Address_regencyId_provinceId_fkey
CREATE UNIQUE INDEX "Regency_id_provinceId_key" ON "Regency"("id", "provinceId");

-- District(id, regencyId): FK target for Address_districtId_regencyId_fkey
CREATE UNIQUE INDEX "District_id_regencyId_key" ON "District"("id", "regencyId");

-- Village(id, districtId): FK target for Address_villageId_districtId_fkey
CREATE UNIQUE INDEX "Village_id_districtId_key" ON "Village"("id", "districtId");

-- ── CreateTable Address ──────────────────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit per §4.4. Region chain (provinceId /
-- regencyId / districtId / villageId) enforced via compound FKs at DB layer.
-- villageId is OPTIONAL — District precision sufficient for Indonesian PAUD
-- admission where village granularity is unknown at intake.
-- LENGTH CHECKs mirror BPS administrative code lengths (Province=2, Regency=4,
-- District=6, Village=10).
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provinceId" CHAR(2) NOT NULL,
    "regencyId" CHAR(4) NOT NULL,
    "districtId" CHAR(6) NOT NULL,
    "villageId" CHAR(10),
    "streetLine" VARCHAR(500) NOT NULL,
    "rt" VARCHAR(3),
    "rw" VARCHAR(3),
    "postalCode" VARCHAR(5),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Address_provinceId_check" CHECK (LENGTH("provinceId") = 2),
    CONSTRAINT "Address_regencyId_check"  CHECK (LENGTH("regencyId")  = 4),
    CONSTRAINT "Address_districtId_check" CHECK (LENGTH("districtId") = 6),
    CONSTRAINT "Address_villageId_check"  CHECK ("villageId" IS NULL OR LENGTH("villageId") = 10)
);

-- ── Composite unique on (id, tenantId) — required as FK target for ───────────
-- Household.addressId composite-FK chain (§6.4 pattern).
CREATE UNIQUE INDEX "Address_id_tenantId_key" ON "Address"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────────────
CREATE INDEX "Address_tenantId_idx"             ON "Address"("tenantId");
CREATE INDEX "Address_provinceId_idx"           ON "Address"("provinceId");
CREATE INDEX "Address_regencyId_provinceId_idx" ON "Address"("regencyId", "provinceId");
CREATE INDEX "Address_districtId_regencyId_idx" ON "Address"("districtId", "regencyId");
-- villageId is nullable — leading non-null `districtId` keeps the index useful for
-- "filter by district" queries and avoids NULL-row index bloat.
CREATE INDEX "Address_districtId_villageId_idx" ON "Address"("districtId", "villageId");

-- ── Foreign keys ──────────────────────────────────────────────────────────────
-- Tenant FK: Restrict per §4.4 (never cascade Tenant).
ALTER TABLE "Address" ADD CONSTRAINT "Address_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Province FK: single-column (Province has no composite unique needed — its PK
-- is the BPS code itself; no parent to chain).
ALTER TABLE "Address" ADD CONSTRAINT "Address_provinceId_fkey"
  FOREIGN KEY ("provinceId") REFERENCES "Province"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regency FK: compound (regencyId, provinceId) → Regency(id, provinceId).
-- Enforces that the regency belongs to the stated province (BPS prefix chain).
ALTER TABLE "Address" ADD CONSTRAINT "Address_regencyId_provinceId_fkey"
  FOREIGN KEY ("regencyId", "provinceId") REFERENCES "Regency"("id", "provinceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- District FK: compound (districtId, regencyId) → District(id, regencyId).
-- Enforces that the district belongs to the stated regency.
ALTER TABLE "Address" ADD CONSTRAINT "Address_districtId_regencyId_fkey"
  FOREIGN KEY ("districtId", "regencyId") REFERENCES "District"("id", "regencyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Village FK: compound (villageId, districtId) → Village(id, districtId).
-- Optional (villageId is nullable); Postgres evaluates compound FK as NULL-safe
-- when the leading column is NULL (no constraint violation when villageId IS NULL).
ALTER TABLE "Address" ADD CONSTRAINT "Address_villageId_districtId_fkey"
  FOREIGN KEY ("villageId", "districtId") REFERENCES "Village"("id", "districtId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Household.addressId FK (deferred from migration 07) ──────────────────────
-- Compound (addressId, tenantId) → Address(id, tenantId).
-- Column-list SET NULL ("addressId"): only addressId is nulled on Address hard-
-- delete; tenantId stays bound to Household (preserves §6.4 tenant alignment).
-- Postgres 15.4+ column-list SET NULL syntax; Supabase 15.6+ compatible.
-- Prisma schema uses SINGLE-column relation (NOT composite) to dodge issue #25061.
ALTER TABLE "Household" ADD CONSTRAINT "Household_addressId_tenantId_fkey"
  FOREIGN KEY ("addressId", "tenantId") REFERENCES "Address"("id", "tenantId")
  ON DELETE SET NULL ("addressId") ON UPDATE CASCADE;

-- ── Row-Level Security (spec §6.3) ───────────────────────────────────────────
-- SELECT-only policy. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
--
-- Soft-delete: YES — deletedAt IS NULL in tenant_isolation_select USING clause.

ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Address" FROM anon, authenticated;
GRANT SELECT ON "Address" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Address"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Address"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
