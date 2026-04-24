-- Tighten EmailLog.tenantId + OrgConfig.tenantId from CASCADE to RESTRICT.
--
-- 20260424000000_explicit_ondelete_actions set both FKs to ON DELETE CASCADE.
-- Acceptable single-tenant; for multi-tenant onboarding a tenant hard-delete
-- would silently wipe the email audit trail (EmailLog) and the per-tenant
-- working-hours / payroll-period config (OrgConfig) with no soft-delete
-- backstop. RESTRICT forces an admin to manually archive (or soft-delete /
-- export) those rows before the tenant row itself can be removed — the
-- correct multi-tenant compliance posture.
--
-- No app-level Tenant hard-delete route exists today (grep: no
-- prisma.tenant.delete in app/** or lib/** outside the generated client),
-- so the only effect of this migration today is a stricter DB-layer guard
-- the next time a hard-delete is added.
--
-- Rollback: DROP CONSTRAINT + ADD CONSTRAINT with ON DELETE CASCADE.

ALTER TABLE "EmailLog" DROP CONSTRAINT "EmailLog_tenantId_fkey";
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgConfig" DROP CONSTRAINT "OrgConfig_tenantId_fkey";
ALTER TABLE "OrgConfig" ADD CONSTRAINT "OrgConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
