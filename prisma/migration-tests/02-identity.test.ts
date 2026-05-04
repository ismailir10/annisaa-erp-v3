// Migration post-condition tests — static parse of the 02_identity SQL.
// CI runs vitest without a Postgres service, so these checks ensure the DDL
// contract from foundation spec §6.1 (migration 02) + §6.3 (RLS) + §6.4
// (composite FK) + §6.5 (JWT hook) ships intact: enums, table shape, partial
// uniques, composite uniques + composite FKs, RLS coverage on all 5 new
// identity tables AND retroactively on the 4 tenant-scoped tenancy tables,
// JWT hook function definition + GRANT EXECUTE.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_02 = readFileSync(path.join(ROOT, "prisma/migrations/02_identity/migration.sql"), "utf8");

const NEW_IDENTITY_TABLES = ["User", "Role", "Permission", "UserRole", "RolePermission"];
const RETROACTIVE_TENANCY_TABLES = ["Campus", "Program", "AcademicYear", "AcademicTerm"];
const ALL_RLS_TABLES = [...NEW_IDENTITY_TABLES, ...RETROACTIVE_TENANCY_TABLES];

describe("02_identity — enums (spec §4.2)", () => {
  it("creates PermissionScope enum with all 7 scopes", () => {
    expect(MIG_02).toMatch(
      /CREATE TYPE "PermissionScope" AS ENUM \(\s*'ALL', 'OWN_CAMPUS', 'OWN_PROGRAM', 'OWN_CLASS', 'OWN_SESSION', 'OWN_STUDENT', 'SELF'\s*\)/
    );
  });

  it("creates CatalogSource enum (SYSTEM, ADMIN)", () => {
    expect(MIG_02).toMatch(/CREATE TYPE "CatalogSource" AS ENUM \('SYSTEM', 'ADMIN'\)/);
  });

  it("creates TenantBootstrapStatus enum (PENDING, COMPLETE)", () => {
    expect(MIG_02).toMatch(/CREATE TYPE "TenantBootstrapStatus" AS ENUM \('PENDING', 'COMPLETE'\)/);
  });
});

describe("02_identity — Tenant.bootstrapStatus enum conversion (spec §4.2)", () => {
  it("ALTER TABLE Tenant converts bootstrapStatus to TenantBootstrapStatus enum with USING cast", () => {
    expect(MIG_02).toMatch(
      /ALTER TABLE "Tenant"[\s\S]*?ALTER COLUMN "bootstrapStatus" DROP DEFAULT[\s\S]*?ALTER COLUMN "bootstrapStatus" TYPE "TenantBootstrapStatus"[\s\S]*?USING "bootstrapStatus"::"TenantBootstrapStatus"[\s\S]*?ALTER COLUMN "bootstrapStatus" SET DEFAULT 'PENDING'/
    );
  });
});

describe("02_identity — table creation (spec §4.4 + §6.4)", () => {
  it.each(NEW_IDENTITY_TABLES)("creates table %s", (name) => {
    expect(MIG_02).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it("User has all spec §4.4 columns + soft-delete", () => {
    const block = MIG_02.match(/CREATE TABLE "User"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"email" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"googleSubjectId" VARCHAR\(255\)/);
    expect(block).toMatch(/"supabaseUserId" VARCHAR\(255\)/);
    expect(block).toMatch(/"lastLoginAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"isActive" BOOLEAN NOT NULL DEFAULT true/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"deletedById" TEXT/);
  });

  it("Role.source defaults to SYSTEM (CatalogSource enum)", () => {
    const block = MIG_02.match(/CREATE TABLE "Role"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"source" "CatalogSource" NOT NULL DEFAULT 'SYSTEM'/);
    expect(block).toMatch(/"code" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
  });

  it("Permission.scope defaults to ALL (PermissionScope enum)", () => {
    const block = MIG_02.match(/CREATE TABLE "Permission"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"scope" "PermissionScope" NOT NULL DEFAULT 'ALL'/);
    expect(block).toMatch(/"resource" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"action" VARCHAR\(50\) NOT NULL/);
  });

  it("UserRole composite PK (userId, roleId, tenantId) — no soft-delete", () => {
    const block = MIG_02.match(/CREATE TABLE "UserRole"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(
      /CONSTRAINT "UserRole_pkey" PRIMARY KEY \("userId", "roleId", "tenantId"\)/
    );
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("RolePermission composite PK (roleId, permissionId, tenantId) — no soft-delete", () => {
    const block = MIG_02.match(/CREATE TABLE "RolePermission"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(
      /CONSTRAINT "RolePermission_pkey" PRIMARY KEY \("roleId", "permissionId", "tenantId"\)/
    );
    expect(block).not.toMatch(/"deletedAt"/);
  });
});

describe("02_identity — composite uniques on (id, tenantId) — FK targets per §6.4", () => {
  it.each(["User", "Role", "Permission"])(
    "%s_id_tenantId_key composite unique index",
    (table) => {
      expect(MIG_02).toMatch(
        new RegExp(`CREATE UNIQUE INDEX "${table}_id_tenantId_key" ON "${table}"\\("id", "tenantId"\\)`)
      );
    }
  );
});

describe("02_identity — partial unique indexes (spec §4.4)", () => {
  it("user_email_active_unique on (tenantId, email) WHERE deletedAt IS NULL", () => {
    expect(MIG_02).toMatch(
      /CREATE UNIQUE INDEX "user_email_active_unique"\s+ON "User" \("tenantId", "email"\)\s+WHERE "deletedAt" IS NULL/
    );
  });

  it("role_code_active_unique on (tenantId, code) WHERE deletedAt IS NULL", () => {
    expect(MIG_02).toMatch(
      /CREATE UNIQUE INDEX "role_code_active_unique"\s+ON "Role" \("tenantId", "code"\)\s+WHERE "deletedAt" IS NULL/
    );
  });

  it("permission_resource_action_scope_active_unique on (tenantId, resource, action, scope) WHERE deletedAt IS NULL", () => {
    expect(MIG_02).toMatch(
      /CREATE UNIQUE INDEX "permission_resource_action_scope_active_unique"\s+ON "Permission" \("tenantId", "resource", "action", "scope"\)\s+WHERE "deletedAt" IS NULL/
    );
  });
});

describe("02_identity — FK cascade rules (spec §4.4 + §6.4)", () => {
  it.each([
    ["User", "tenantId"],
    ["Role", "tenantId"],
    ["Permission", "tenantId"],
  ])("%s.%s → Tenant ON DELETE RESTRICT (Restrict for business FKs, never cascade Tenant)", (table, col) => {
    const re = new RegExp(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${col}_fkey"\\s+FOREIGN KEY \\("${col}"\\) REFERENCES "Tenant"\\("id"\\)\\s+ON DELETE RESTRICT`
    );
    expect(MIG_02).toMatch(re);
  });

  it("UserRole.userId+tenantId → User(id, tenantId) composite FK ON DELETE CASCADE", () => {
    expect(MIG_02).toMatch(
      /ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_tenantId_fkey"\s+FOREIGN KEY \("userId", "tenantId"\) REFERENCES "User"\("id", "tenantId"\)\s+ON DELETE CASCADE/
    );
  });

  it("UserRole.roleId+tenantId → Role(id, tenantId) composite FK ON DELETE CASCADE", () => {
    expect(MIG_02).toMatch(
      /ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_tenantId_fkey"\s+FOREIGN KEY \("roleId", "tenantId"\) REFERENCES "Role"\("id", "tenantId"\)\s+ON DELETE CASCADE/
    );
  });

  it("RolePermission.roleId+tenantId → Role(id, tenantId) composite FK ON DELETE CASCADE", () => {
    expect(MIG_02).toMatch(
      /ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_tenantId_fkey"\s+FOREIGN KEY \("roleId", "tenantId"\) REFERENCES "Role"\("id", "tenantId"\)\s+ON DELETE CASCADE/
    );
  });

  it("RolePermission.permissionId+tenantId → Permission(id, tenantId) composite FK ON DELETE CASCADE", () => {
    expect(MIG_02).toMatch(
      /ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_tenantId_fkey"\s+FOREIGN KEY \("permissionId", "tenantId"\) REFERENCES "Permission"\("id", "tenantId"\)\s+ON DELETE CASCADE/
    );
  });
});

describe("02_identity — RLS coverage (spec §6.3)", () => {
  it.each(ALL_RLS_TABLES)("%s ENABLE ROW LEVEL SECURITY", (table) => {
    expect(MIG_02).toMatch(new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  });

  it.each(ALL_RLS_TABLES)("%s REVOKE ALL FROM anon, authenticated", (table) => {
    expect(MIG_02).toMatch(new RegExp(`REVOKE ALL ON "${table}" FROM anon, authenticated`));
  });

  it.each(ALL_RLS_TABLES)("%s GRANT SELECT TO authenticated", (table) => {
    expect(MIG_02).toMatch(new RegExp(`GRANT SELECT ON "${table}" TO authenticated`));
  });

  it.each(ALL_RLS_TABLES)("%s has tenant_isolation_select policy", (table) => {
    const re = new RegExp(
      `CREATE POLICY "tenant_isolation_select" ON "${table}"\\s+FOR SELECT TO authenticated[\\s\\S]*?current_setting\\('request\\.jwt\\.claims', true\\)::json->>'tenant_id'`
    );
    expect(MIG_02).toMatch(re);
  });

  it.each(ALL_RLS_TABLES)("%s has no_writes_via_postgrest policy (false / false)", (table) => {
    const re = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${table}"\\s+FOR ALL TO anon, authenticated\\s+USING \\(false\\) WITH CHECK \\(false\\)`
    );
    expect(MIG_02).toMatch(re);
  });

  it.each(["User", "Role", "Permission", "Campus", "Program", "AcademicYear"])(
    "%s tenant_isolation_select retains deletedAt IS NULL clause (soft-delete tables)",
    (table) => {
      const block =
        MIG_02.match(
          new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`)
        )?.[0] ?? "";
      expect(block).toMatch(/"deletedAt" IS NULL/);
    }
  );

  it.each(["UserRole", "RolePermission", "AcademicTerm"])(
    "%s tenant_isolation_select omits deletedAt clause (no soft-delete)",
    (table) => {
      const block =
        MIG_02.match(
          new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`)
        )?.[0] ?? "";
      expect(block).not.toMatch(/"deletedAt" IS NULL/);
    }
  );
});

describe("02_identity — JWT hook (spec §6.5)", () => {
  it("creates public.custom_access_token_hook(event jsonb) returning jsonb", () => {
    expect(MIG_02).toMatch(
      /CREATE OR REPLACE FUNCTION public\.custom_access_token_hook\(event jsonb\)\s+RETURNS jsonb/
    );
  });

  it("hook function is SECURITY DEFINER with locked search_path", () => {
    expect(MIG_02).toMatch(/SECURITY DEFINER/);
    expect(MIG_02).toMatch(/SET search_path = public/);
  });

  it("hook injects tenant_id into JWT claims", () => {
    expect(MIG_02).toMatch(/jsonb_set\(claims, '\{tenant_id\}', to_jsonb\(resolved_tenant_id\)\)/);
  });

  it("hook injects role into JWT claims", () => {
    expect(MIG_02).toMatch(/jsonb_set\(claims, '\{role\}', to_jsonb\(resolved_role_code\)\)/);
  });

  it("hook resolves user via supabaseUserId + isActive + deletedAt IS NULL", () => {
    expect(MIG_02).toMatch(/u\."supabaseUserId" = \(event->>'user_id'\)/);
    expect(MIG_02).toMatch(/u\."deletedAt" IS NULL/);
    expect(MIG_02).toMatch(/u\."isActive" = true/);
  });

  it("hook EXECUTE granted to supabase_auth_admin only (not authenticated/anon/public)", () => {
    expect(MIG_02).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) FROM public/
    );
    expect(MIG_02).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) FROM authenticated/
    );
    expect(MIG_02).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) FROM anon/
    );
    expect(MIG_02).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.custom_access_token_hook\(jsonb\) TO supabase_auth_admin/
    );
  });

  it("supabase_auth_admin granted SELECT on User, Role, UserRole for hook resolution", () => {
    expect(MIG_02).toMatch(
      /GRANT SELECT ON "User", "Role", "UserRole" TO supabase_auth_admin/
    );
  });
});
