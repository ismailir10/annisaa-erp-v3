-- Fix emaillog_select_own_tenant RLS policy: scope by tenantId (not just authenticated-existence).
-- Previous policy in 20260421000000_rls_perf_cleanup allowed any authenticated user to SELECT any
-- tenant's EmailLog rows (salary slip delivery metadata). Align with sibling per-tenant policies.

DROP POLICY IF EXISTS emaillog_select_own_tenant ON "EmailLog";
CREATE POLICY emaillog_select_own_tenant ON "EmailLog" AS PERMISSIVE FOR SELECT TO authenticated
USING ("tenantId" IN (SELECT "User"."tenantId" FROM "User" WHERE "User".id = ((SELECT auth.uid()))::text));
