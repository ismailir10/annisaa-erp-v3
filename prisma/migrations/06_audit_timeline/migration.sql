-- 06_audit_timeline — AuditLog (partitioned, append-only) + TimelineEvent
-- (spec §4.1 row "Foundation") + 2 enums (AuditAction, TimelineVisibility per
-- §4.2) + month-partitioning per §4.5 + append-only trigger + SELECT-only RLS
-- (§6.3) + defense-in-depth REVOKE.
--
-- Design locks (per p1-regions-seed + p1-employees-classes-sentra reviewer):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- AuditLog deviates from §4.4 audit-column convention:
--   * Composite PK (id, "createdAt") — Postgres declarative partitioning
--     requires the partition key in any UNIQUE / PK; an id-only PK is
--     rejected at DDL time.
--   * Only "createdAt" + "actorUserId" — no updatedAt / deletedAt / *ById
--     columns. Append-only by design; the §4.4 convention is for operational
--     entities, not the audit log itself. RaisE on UPDATE/DELETE via trigger
--     (defense in depth on top of REVOKE; even service-role does not bypass).
--   * No "retentionUntil" column. Retention is partition-drop in O(1) per
--     §4.5 ("drop partitions in O(1) at retention"); a per-row retentionUntil
--     would be unused (no query keys off it). Drop-cron deferred to p3+ per
--     §16.1a (audit.retention_cleanup daily 02:00).
--
-- AuditLog FKs:
--   * "tenantId" → Tenant Restrict (outbound FK from partitioned table is
--     supported PG 14+; constraint applies across all partitions).
--   * "actorUserId" is NON-FK by design. Inbound composite-FK to User across
--     a partitioned table requires per-partition FK declaration that the
--     auto-create cron (deferred to p3+) would have to replicate; soft-delete
--     semantics on User (rows persist past User soft-delete; the FK SET NULL
--     would only fire on User hard-delete, which is rare). Soft reference
--     via plain TEXT matches actual cascade semantics; null-on-hard-delete
--     enforced app-layer.
--
-- Partitioning:
--   * 18 monthly partitions pre-created inline (2026-05 → 2027-10). Covers
--     MVP launch window (June 2026 cutover per spec §9.1) + first ~16 months
--     + 2-month buffer. 4 extra over the spec's nominal 12-month minimum
--     (zero storage cost when empty) to absorb potential auto-create cron
--     slippage from the deferred p3+ partition cron.
--   * Each partition gets REVOKE ALL FROM anon, authenticated to block
--     direct PostgREST queries (e.g. /rest/v1/AuditLog_y2026m05). RLS on
--     parent gates queries-via-parent; REVOKE on partitions gates
--     queries-direct-to-child.
--
-- Append-only trigger:
--   * SECURITY INVOKER (default) — function only RAISEs an exception, no
--     elevated privilege needed. The Supabase advisory lint fires on
--     SECURITY DEFINER without locked search_path, NOT on INVOKER, so
--     INVOKER is simpler and equally safe. Per pre-build reviewer Q-B.
--   * Triggers fire on partitioned parent; PG 15+ propagates row-level
--     triggers to all partitions automatically. Supabase runs PG 15+.
--
-- TimelineEvent:
--   * Soft-delete YES — typo correction parity with v1 buku-penghubung.
--     AuditLog records SOFT_DELETE / RESTORE actions for regulatory trail.
--   * "actorUserId" single-col FK SET NULL (column FK, not join — composite
--     FK reserved for RLS-critical join tables per §6.4 MVP rule).
--   * GIN index on payload JSONB for admin search (Prisma 7 lacks DSL for
--     GIN, hence raw SQL here).

-- ── Enums ─────────────────────────────────────────────────────────────
CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'SOFT_DELETE',
  'RESTORE',
  'READ',
  'IMPORT',
  'EXPORT'
);

CREATE TYPE "TimelineVisibility" AS ENUM (
  'PRIVATE',
  'INTERNAL',
  'PARENT_VISIBLE'
);

-- ── CreateTable AuditLog (partitioned) ────────────────────────────────
-- Append-only via trigger (declared after partitions). Partitioned by month
-- on "createdAt" — composite PK includes partition key per Postgres
-- declarative-partitioning constraint.
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" INET,
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- ── Pre-create 18 monthly partitions (2026-05 → 2027-10) ──────────────
-- Auto-create cron deferred to p3+ per §16.1a. Each partition is an empty
-- table; storage cost is zero until rows are inserted.
CREATE TABLE "AuditLog_y2026m05" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "AuditLog_y2026m06" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "AuditLog_y2026m07" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "AuditLog_y2026m08" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "AuditLog_y2026m09" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "AuditLog_y2026m10" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "AuditLog_y2026m11" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "AuditLog_y2026m12" PARTITION OF "AuditLog" FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE "AuditLog_y2027m01" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE "AuditLog_y2027m02" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE "AuditLog_y2027m03" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE "AuditLog_y2027m04" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE "AuditLog_y2027m05" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE "AuditLog_y2027m06" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE "AuditLog_y2027m07" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE "AuditLog_y2027m08" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE "AuditLog_y2027m09" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE "AuditLog_y2027m10" PARTITION OF "AuditLog" FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

-- ── CreateTable TimelineEvent ─────────────────────────────────────────
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "subjectKind" VARCHAR(50) NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "visibility" "TimelineVisibility" NOT NULL DEFAULT 'INTERNAL',
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- ── Composite unique on (id, tenantId) — required for any future FK ───
CREATE UNIQUE INDEX "TimelineEvent_id_tenantId_key" ON "TimelineEvent"("id", "tenantId");

-- ── Lookup indexes — AuditLog (partitioned indexes propagate to children) ─
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_resource_resourceId_idx" ON "AuditLog"("tenantId", "resource", "resourceId");
CREATE INDEX "AuditLog_tenantId_actorUserId_createdAt_idx" ON "AuditLog"("tenantId", "actorUserId", "createdAt");

-- ── Lookup indexes — TimelineEvent ────────────────────────────────────
CREATE INDEX "TimelineEvent_tenantId_idx" ON "TimelineEvent"("tenantId");
CREATE INDEX "TimelineEvent_tenantId_subjectKind_subjectId_occurredAt_idx" ON "TimelineEvent"("tenantId", "subjectKind", "subjectId", "occurredAt");
CREATE INDEX "TimelineEvent_tenantId_actorUserId_occurredAt_idx" ON "TimelineEvent"("tenantId", "actorUserId", "occurredAt");
CREATE INDEX "TimelineEvent_tenantId_kind_occurredAt_idx" ON "TimelineEvent"("tenantId", "kind", "occurredAt");
CREATE INDEX "TimelineEvent_payload_idx" ON "TimelineEvent" USING GIN ("payload");

-- ── Append-only trigger function ──────────────────────────────────────
-- Raises on UPDATE/DELETE for ALL roles (no service-role bypass). Only
-- legitimate row-removal path is DROP TABLE on a whole partition (executed
-- by audit.retention_cleanup cron, deferred to p3+); DROP TABLE bypasses
-- row-level triggers entirely. SECURITY INVOKER per pre-build reviewer Q-B.
CREATE OR REPLACE FUNCTION audit_log_block_update_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only; UPDATE/DELETE rejected by trigger %', TG_OP
        USING ERRCODE = 'P0001';
END;
$$;

-- Triggers on partitioned parent — PG 15+ propagates row-level triggers to
-- all partitions automatically. Supabase runs PG 15+.
CREATE TRIGGER "audit_log_block_update"
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete();

CREATE TRIGGER "audit_log_block_delete"
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete();

-- ── Foreign keys ──────────────────────────────────────────────────────
-- AuditLog: outbound FK to Tenant only (actorUserId NON-FK by design).
-- TimelineEvent: Tenant Restrict + actorUserId single-col SET NULL.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
--
-- AuditLog: SELECT policy keyed on tenantId (no deletedAt clause — no
-- soft-delete on AuditLog). Append-only enforced by trigger, not RLS — RLS
-- alone would let service-role mutate; the trigger blocks all roles.
--
-- TimelineEvent: standard SELECT policy with `AND "deletedAt" IS NULL`
-- (soft-deletable per cycle decision).

-- AuditLog (parent — policies cover queries-via-parent)
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AuditLog" FROM anon, authenticated;
GRANT SELECT ON "AuditLog" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "AuditLog"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "AuditLog"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- AuditLog partitions — REVOKE ALL to block direct PostgREST queries to
-- /rest/v1/AuditLog_y2026m05. Defense-in-depth on top of parent RLS.
-- Partitions inherit the trigger from parent; explicit REVOKE on each is
-- the access barrier (no GRANT SELECT — direct-to-child queries forbidden).
REVOKE ALL ON "AuditLog_y2026m05" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m06" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m07" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m08" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m09" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m10" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m11" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2026m12" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m01" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m02" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m03" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m04" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m05" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m06" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m07" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m08" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m09" FROM anon, authenticated;
REVOKE ALL ON "AuditLog_y2027m10" FROM anon, authenticated;

-- TimelineEvent
ALTER TABLE "TimelineEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TimelineEvent" FROM anon, authenticated;
GRANT SELECT ON "TimelineEvent" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "TimelineEvent"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "TimelineEvent"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
