-- 02_identity — User / Role / Permission / UserRole / RolePermission +
-- composite FK pattern (spec §6.4) + SELECT-only RLS (spec §6.3) + Supabase
-- Custom Access Token Hook (spec §6.5). Activates RLS on the 4 tenant-scoped
-- tenancy tables landed in 01_tenancy (retroactive coverage).

-- ── Enums ─────────────────────────────────────────────────────────────
-- Per spec §4.2. PermissionScope drives RBAC scope predicates; CatalogSource
-- distinguishes engineer-seeded SYSTEM rows from admin-extensible ADMIN rows;
-- TenantBootstrapStatus replaces the VARCHAR(20) placeholder from 01_tenancy.
CREATE TYPE "PermissionScope" AS ENUM (
  'ALL', 'OWN_CAMPUS', 'OWN_PROGRAM', 'OWN_CLASS', 'OWN_SESSION', 'OWN_STUDENT', 'SELF'
);

CREATE TYPE "CatalogSource" AS ENUM ('SYSTEM', 'ADMIN');

CREATE TYPE "TenantBootstrapStatus" AS ENUM ('PENDING', 'COMPLETE');

-- ── Convert Tenant.bootstrapStatus VARCHAR → enum ─────────────────────
-- Single ALTER TABLE statement: drop default, change type with cast, restore
-- default. Safe because seed leaves only 1 row with value 'PENDING'.
ALTER TABLE "Tenant"
  ALTER COLUMN "bootstrapStatus" DROP DEFAULT,
  ALTER COLUMN "bootstrapStatus" TYPE "TenantBootstrapStatus"
    USING "bootstrapStatus"::"TenantBootstrapStatus",
  ALTER COLUMN "bootstrapStatus" SET DEFAULT 'PENDING';

-- ── CreateTable User ──────────────────────────────────────────────────
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "googleSubjectId" VARCHAR(255),
    "supabaseUserId" VARCHAR(255),
    "lastLoginAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Role ──────────────────────────────────────────────────
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source" "CatalogSource" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable Permission ────────────────────────────────────────────
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable UserRole ──────────────────────────────────────────────
-- Composite PK (userId, roleId, tenantId) per spec §6.4. No soft-delete.
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId", "tenantId")
);

-- ── CreateTable RolePermission ────────────────────────────────────────
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId", "tenantId")
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ──────
-- Per spec §6.4: composite FKs from join tables reference (id, tenantId)
-- of the parent. The composite uniqueness is what makes this referenceable.
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");
CREATE UNIQUE INDEX "Role_id_tenantId_key" ON "Role"("id", "tenantId");
CREATE UNIQUE INDEX "Permission_id_tenantId_key" ON "Permission"("id", "tenantId");

-- ── Lookup indexes ────────────────────────────────────────────────────
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "User_tenantId_supabaseUserId_idx" ON "User"("tenantId", "supabaseUserId");
CREATE INDEX "User_tenantId_googleSubjectId_idx" ON "User"("tenantId", "googleSubjectId");

CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

CREATE INDEX "Permission_tenantId_idx" ON "Permission"("tenantId");

CREATE INDEX "UserRole_tenantId_idx" ON "UserRole"("tenantId");
CREATE INDEX "UserRole_roleId_tenantId_idx" ON "UserRole"("roleId", "tenantId");

CREATE INDEX "RolePermission_tenantId_idx" ON "RolePermission"("tenantId");
CREATE INDEX "RolePermission_permissionId_tenantId_idx" ON "RolePermission"("permissionId", "tenantId");

-- ── Partial unique indexes (codes unique among non-deleted rows) ──────
-- Per spec §4.4. Deleted rows free up the slot for re-creation.
CREATE UNIQUE INDEX "user_email_active_unique"
  ON "User" ("tenantId", "email")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "role_code_active_unique"
  ON "Role" ("tenantId", "code")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "permission_resource_action_scope_active_unique"
  ON "Permission" ("tenantId", "resource", "action", "scope")
  WHERE "deletedAt" IS NULL;

-- ── Foreign keys — Tenant (Restrict) + composite (Cascade) ───────────
-- User/Role/Permission carry direct Tenant FK with Restrict per §4.4 (never
-- cascade Tenant). UserRole/RolePermission rely on composite FK chain to
-- enforce tenant alignment — separate tenant FK omitted per §6.4.
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Permission" ADD CONSTRAINT "Permission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_tenantId_fkey"
  FOREIGN KEY ("roleId", "tenantId") REFERENCES "Role"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_tenantId_fkey"
  FOREIGN KEY ("roleId", "tenantId") REFERENCES "Role"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_tenantId_fkey"
  FOREIGN KEY ("permissionId", "tenantId") REFERENCES "Permission"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. All writes go through the service-role key (which
-- bypasses RLS); REVOKE strips PostgREST write paths from anon + authenticated
-- roles. Tenant isolation derives tenantId from JWT claim injected by the
-- custom_access_token_hook function defined below.

-- ── Identity tables (5 new) ──────────────────────────────────────────

-- User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "User" FROM anon, authenticated;
GRANT SELECT ON "User" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "User"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "User"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Role
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Role" FROM anon, authenticated;
GRANT SELECT ON "Role" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Role"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Role"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Permission
ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Permission" FROM anon, authenticated;
GRANT SELECT ON "Permission" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Permission"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Permission"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- UserRole — no soft-delete, omit deletedAt clause
ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "UserRole" FROM anon, authenticated;
GRANT SELECT ON "UserRole" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "UserRole"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "UserRole"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- RolePermission — no soft-delete
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RolePermission" FROM anon, authenticated;
GRANT SELECT ON "RolePermission" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "RolePermission"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "RolePermission"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ── Retroactive RLS for tenancy tables landed in 01_tenancy ──────────
-- Per spec §6.3 + verify-rls-coverage.sh strict mode resumes the moment the
-- first CREATE POLICY merges. Cover Campus / Program / AcademicYear / AcademicTerm.
-- (Tenant has no tenantId, so it is not tenant-scoped and intentionally has no RLS.)

-- Campus
ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Campus" FROM anon, authenticated;
GRANT SELECT ON "Campus" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Campus"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Campus"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Program
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Program" FROM anon, authenticated;
GRANT SELECT ON "Program" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Program"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Program"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- AcademicYear
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AcademicYear" FROM anon, authenticated;
GRANT SELECT ON "AcademicYear" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "AcademicYear"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "AcademicYear"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- AcademicTerm — no soft-delete
ALTER TABLE "AcademicTerm" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AcademicTerm" FROM anon, authenticated;
GRANT SELECT ON "AcademicTerm" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "AcademicTerm"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "AcademicTerm"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ══════════════════════════════════════════════════════════════════════
-- Supabase Custom Access Token Hook (spec §6.5)
-- ══════════════════════════════════════════════════════════════════════
-- Injects tenant_id + role into the JWT claims so RLS policies can read
-- current_setting('request.jwt.claims', true)::json->>'tenant_id'.
-- The hook function ships in this migration; binding the function as the
-- access-token hook in the Supabase project is a one-time dashboard step
-- (Auth → Hooks → Custom Access Token Hook), documented in cycle Ship Notes.
-- Supabase does not expose ALTER ... HOOK DDL — the dashboard write is the
-- supported registration path.
--
-- Resolution: find User row by supabaseUserId; primary role is the first
-- UserRole.role.code (deterministic via ORDER BY createdAt). For users with
-- multiple roles a future cycle will inject a roles[] array; MVP single-role.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  resolved_tenant_id text;
  resolved_role_code text;
BEGIN
  claims := event->'claims';

  SELECT u."tenantId", r."code"
  INTO resolved_tenant_id, resolved_role_code
  FROM "User" u
  LEFT JOIN "UserRole" ur
    ON ur."userId" = u."id" AND ur."tenantId" = u."tenantId"
  LEFT JOIN "Role" r
    ON r."id" = ur."roleId" AND r."tenantId" = u."tenantId" AND r."deletedAt" IS NULL
  WHERE u."supabaseUserId" = (event->>'user_id')
    AND u."deletedAt" IS NULL
    AND u."isActive" = true
  ORDER BY ur."createdAt" ASC NULLS LAST
  LIMIT 1;

  IF resolved_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(resolved_tenant_id));
  END IF;

  IF resolved_role_code IS NOT NULL THEN
    claims := jsonb_set(claims, '{role}', to_jsonb(resolved_role_code));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Lock down execution: only Supabase auth admin (the role that runs hooks)
-- may execute the function. Public/authenticated/anon must not be able to
-- spoof tenant_id by calling the function directly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON "User", "Role", "UserRole" TO supabase_auth_admin;
