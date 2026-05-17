-- Cycle 2026-05-17 — Fix ClassTrack + ClassSession service_all RLS role
--
-- Migration 20260515000000_academic_hierarchy_refactor created the new
-- _service_all policies on these two tables with TO authenticated USING (true).
-- That OR-combines with the per-table _select_own_tenant policies under
-- Postgres PERMISSIVE semantics to grant any authenticated JWT cross-tenant
-- ALL access via PostgREST — a tenant-isolation bypass.
--
-- Every other _service_all policy in this repo uses TO service_role (see
-- 20260421000000_rls_perf_cleanup). Bring these two in line. service_role
-- already bypasses RLS, so the policy itself is functionally a no-op; the
-- value is removing the (table, authenticated, FOR ALL) overlap that grants
-- the bypass.
--
-- Idempotent: DROP IF EXISTS + CREATE.

DROP POLICY IF EXISTS "classtrack_service_all" ON "ClassTrack";
CREATE POLICY "classtrack_service_all" ON "ClassTrack"
  AS PERMISSIVE FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "classsession_service_all" ON "ClassSession";
CREATE POLICY "classsession_service_all" ON "ClassSession"
  AS PERMISSIVE FOR ALL TO service_role USING (true);
