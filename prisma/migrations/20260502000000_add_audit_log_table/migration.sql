-- AuditLog: append-only history of mutating actions on sensitive entities.
-- Tenant-scoped. actorId is User.id but kept as TEXT (no FK) so deleted
-- users do not cascade-purge their history. before/after capture the
-- pre/post mutation JSON shape so reviewers can reconstruct intent.

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorId_createdAt_idx" ON "AuditLog"("tenantId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS. Service role (Prisma) always has full access.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY auditlog_service_all ON "AuditLog" AS PERMISSIVE FOR ALL TO service_role USING (true);
