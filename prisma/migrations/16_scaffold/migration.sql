-- 16_scaffold — FileAsset, ExportJob, EmailLog, WebhookEvent, OrgConfig,
-- Holiday (spec §4.1 row "Foundation") + 4 enums (FileKind, FileStatus,
-- ExportFormat, ExportJobStatus per §4.2) + SELECT-only RLS (§6.3) +
-- defense-in-depth REVOKE.
--
-- Design locks (per p1-regions-seed + p1-employees-classes-sentra reviewer):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- Soft-delete policy per spec §4.4 + cycle Spec:
--   * YES: FileAsset (uploads correctable), OrgConfig (config edits
--     correctable), Holiday (admin-mutable calendar).
--   * NO:  ExportJob, EmailLog, WebhookEvent (operational records — provider
--     status traces; admin can mark stale but never soft-delete).
--
-- All cross-row FKs are single-col (composite-FK reserved for RLS-critical
-- join tables per §6.4 MVP rule; none of these 6 tables are join tables).
-- Tenant alignment enforced by tenantId denorm + app-layer guard.
--
-- OrgConfig singleton-per-tenant via column-level UNIQUE on tenantId
-- (cleaner than @@unique([tenantId]); same effect; documented drift in Ship
-- Notes — `migrate dev --create-only` would emit a separate CREATE UNIQUE
-- INDEX).
--
-- ExportJob.requestedByUserId is RESTRICT — operational records require
-- attributable requester; admin must clean up before User hard-delete.
-- Operational caveat: §16.1a does not yet list export_job.cleanup cron;
-- EXPIRED rows accumulate until p3+ cron lands. Documented in Ship Notes.
--
-- Holiday.kind is plain VARCHAR(20) — set may extend per locale (PAUD-
-- specific). Same precedent as EmailLog.status. WebhookEvent.idempotencyKey
-- gets a full unique on (tenantId, source, idempotencyKey) — no soft-delete
-- on this table, so no WHERE clause needed.

-- ── Enums ─────────────────────────────────────────────────────────────
CREATE TYPE "FileKind" AS ENUM (
  'DOCUMENT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'ARCHIVE'
);

CREATE TYPE "FileStatus" AS ENUM (
  'PENDING_UPLOAD',
  'UPLOADED',
  'COMPRESSED',
  'FAILED',
  'ORPHANED'
);

CREATE TYPE "ExportFormat" AS ENUM (
  'CSV',
  'XLSX',
  'PDF'
);

CREATE TYPE "ExportJobStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

-- ── CreateTable FileAsset ─────────────────────────────────────────────
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "uploaderUserId" TEXT,
    "compressedAt" TIMESTAMPTZ,
    "compressionRatio" DECIMAL(5,2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable ExportJob ─────────────────────────────────────────────
-- ExportJob references FileAsset (resultFileAssetId), so FileAsset comes
-- first.
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "entityKind" VARCHAR(50) NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "filterPayload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "resultFileAssetId" TEXT,
    "errorMessage" VARCHAR(2000),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable EmailLog ──────────────────────────────────────────────
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "template" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "messageId" VARCHAR(255),
    "errorMessage" VARCHAR(2000),
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable WebhookEvent ──────────────────────────────────────────
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" VARCHAR(255),
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "processedAt" TIMESTAMPTZ,
    "errorMessage" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable OrgConfig ─────────────────────────────────────────────
-- Singleton-per-tenant via column-level UNIQUE on "tenantId".
CREATE TABLE "OrgConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL UNIQUE,
    "lemburCompliant" BOOLEAN NOT NULL DEFAULT false,
    "nisPrefix" VARCHAR(10),
    "currentAcademicYearId" TEXT,
    "autoDropAdmissionDays" INTEGER NOT NULL DEFAULT 30,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'id-ID',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "OrgConfig_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Holiday ───────────────────────────────────────────────
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
-- FileAsset is referenced by ExportJob.resultFileAssetId. Future cycles may
-- reference ExportJob / OrgConfig from join tables. Pre-emptive composite
-- uniques keep §6.4 composite-FK pattern available.
CREATE UNIQUE INDEX "FileAsset_id_tenantId_key" ON "FileAsset"("id", "tenantId");
CREATE UNIQUE INDEX "ExportJob_id_tenantId_key" ON "ExportJob"("id", "tenantId");
CREATE UNIQUE INDEX "OrgConfig_id_tenantId_key" ON "OrgConfig"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
-- FileAsset
CREATE INDEX "FileAsset_tenantId_idx" ON "FileAsset"("tenantId");
CREATE INDEX "FileAsset_tenantId_status_idx" ON "FileAsset"("tenantId", "status");
CREATE INDEX "FileAsset_tenantId_kind_idx" ON "FileAsset"("tenantId", "kind");
CREATE INDEX "FileAsset_uploaderUserId_tenantId_idx" ON "FileAsset"("uploaderUserId", "tenantId");

-- ExportJob
CREATE INDEX "ExportJob_tenantId_idx" ON "ExportJob"("tenantId");
CREATE INDEX "ExportJob_tenantId_status_idx" ON "ExportJob"("tenantId", "status");
CREATE INDEX "ExportJob_tenantId_requestedByUserId_idx" ON "ExportJob"("tenantId", "requestedByUserId");
CREATE INDEX "ExportJob_resultFileAssetId_tenantId_idx" ON "ExportJob"("resultFileAssetId", "tenantId");

-- EmailLog
CREATE INDEX "EmailLog_tenantId_idx" ON "EmailLog"("tenantId");
CREATE INDEX "EmailLog_tenantId_status_idx" ON "EmailLog"("tenantId", "status");
CREATE INDEX "EmailLog_tenantId_recipientEmail_idx" ON "EmailLog"("tenantId", "recipientEmail");

-- WebhookEvent
CREATE INDEX "WebhookEvent_tenantId_idx" ON "WebhookEvent"("tenantId");
CREATE INDEX "WebhookEvent_tenantId_source_eventType_idx" ON "WebhookEvent"("tenantId", "source", "eventType");
CREATE INDEX "WebhookEvent_tenantId_processedAt_idx" ON "WebhookEvent"("tenantId", "processedAt");

-- Holiday
CREATE INDEX "Holiday_tenantId_idx" ON "Holiday"("tenantId");
CREATE INDEX "Holiday_tenantId_date_idx" ON "Holiday"("tenantId", "date");

-- ── Full unique index — WebhookEvent idempotency ──────────────────────
-- Plain unique (no WHERE clause) — no soft-delete on WebhookEvent.
CREATE UNIQUE INDEX "webhook_event_idempotency_unique"
  ON "WebhookEvent" ("tenantId", "source", "idempotencyKey");

-- ── Partial unique index — Holiday active ─────────────────────────────
-- One holiday per (tenant, date) among non-deleted rows.
CREATE UNIQUE INDEX "holiday_tenant_date_active_unique"
  ON "Holiday" ("tenantId", "date")
  WHERE "deletedAt" IS NULL;

-- ── Foreign keys ──────────────────────────────────────────────────────
-- All cross-row FKs are single-col per §6.4 MVP rule. Tenant alignment
-- via tenantId denorm + app-layer guard. SET NULL on user/file refs (denorm
-- columns; soft-delete on parent persists references). RESTRICT on
-- ExportJob.requestedByUserId — operational records require attributable
-- requester (admin must clean up before User hard-delete).

-- FileAsset
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploaderUserId_fkey"
  FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ExportJob
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_resultFileAssetId_fkey"
  FOREIGN KEY ("resultFileAssetId") REFERENCES "FileAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailLog
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- WebhookEvent
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- OrgConfig
ALTER TABLE "OrgConfig" ADD CONSTRAINT "OrgConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgConfig" ADD CONSTRAINT "OrgConfig_currentAcademicYearId_fkey"
  FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Holiday
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
--
-- Soft-delete asymmetry on tenant_isolation_select USING clause:
--   * deletedAt IS NULL clause:    FileAsset, OrgConfig, Holiday (soft-delete tables)
--   * NO deletedAt clause:         ExportJob, EmailLog, WebhookEvent (operational records)

-- FileAsset
ALTER TABLE "FileAsset" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FileAsset" FROM anon, authenticated;
GRANT SELECT ON "FileAsset" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "FileAsset"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "FileAsset"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ExportJob
ALTER TABLE "ExportJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ExportJob" FROM anon, authenticated;
GRANT SELECT ON "ExportJob" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "ExportJob"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "ExportJob"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- EmailLog
ALTER TABLE "EmailLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EmailLog" FROM anon, authenticated;
GRANT SELECT ON "EmailLog" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "EmailLog"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "EmailLog"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- WebhookEvent
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WebhookEvent" FROM anon, authenticated;
GRANT SELECT ON "WebhookEvent" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "WebhookEvent"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "WebhookEvent"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- OrgConfig
ALTER TABLE "OrgConfig" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "OrgConfig" FROM anon, authenticated;
GRANT SELECT ON "OrgConfig" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "OrgConfig"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "OrgConfig"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Holiday
ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Holiday" FROM anon, authenticated;
GRANT SELECT ON "Holiday" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Holiday"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Holiday"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
