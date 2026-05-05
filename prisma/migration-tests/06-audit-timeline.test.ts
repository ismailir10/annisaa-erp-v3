// Migration post-condition tests — static parse of the 06_audit_timeline SQL
// + schema.prisma. Mirrors the 05-sessions.test.ts + 09-regions.test.ts
// patterns. Asserts the DDL contract from foundation spec §4.1 row
// "Foundation" + §4.2 enums (AuditAction, TimelineVisibility) + §4.5
// audit-log critical pattern (partitioning + append-only trigger) + §6.3 RLS
// + p1-regions-seed design locks (REVOKE ALL + no FORCE).
//
// Cycle decisions encoded as tests:
//   - AuditLog audit-column deviation: only createdAt + actorUserId.
//     No retentionUntil (partition-drop retention per spec §4.5).
//   - Composite PK (id, "createdAt") required by partitioned-table semantics.
//   - 18 monthly partitions pre-created (2026-05 → 2027-10) — bumped from
//     14 per pre-build reviewer Risk-G.
//   - Append-only trigger SECURITY INVOKER (raise-only function; no
//     elevated privilege needed) per pre-build reviewer Q-B.
//   - AuditLog.actorUserId is non-FK by design (partition-table FK
//     maintenance burden + soft-delete semantics mismatch).
//   - TimelineEvent.actorUserId is single-col FK SET NULL (composite FK
//     reserved for RLS-critical join tables per §6.4 MVP rule).
//   - AuditLog has soft-delete absent; TimelineEvent has soft-delete YES.
//   - Defense-in-depth REVOKE ALL on each of 18 partitions.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_06 = readFileSync(
  path.join(ROOT, "prisma/migrations/06_audit_timeline/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const NEW_TABLES = ["AuditLog", "TimelineEvent"] as const;
const PARTITION_MONTHS = [
  "2026m05", "2026m06", "2026m07", "2026m08", "2026m09", "2026m10",
  "2026m11", "2026m12", "2027m01", "2027m02", "2027m03", "2027m04",
  "2027m05", "2027m06", "2027m07", "2027m08", "2027m09", "2027m10",
] as const;

describe("06_audit_timeline — enums (spec §4.2)", () => {
  it("creates AuditAction enum (8 members covering CRUD + soft-delete + read + import + export)", () => {
    expect(MIG_06).toMatch(
      /CREATE TYPE "AuditAction" AS ENUM \(\s*'CREATE',\s*'UPDATE',\s*'DELETE',\s*'SOFT_DELETE',\s*'RESTORE',\s*'READ',\s*'IMPORT',\s*'EXPORT'\s*\)/,
    );
  });

  it("creates TimelineVisibility enum (PRIVATE, INTERNAL, PARENT_VISIBLE)", () => {
    expect(MIG_06).toMatch(
      /CREATE TYPE "TimelineVisibility" AS ENUM \(\s*'PRIVATE',\s*'INTERNAL',\s*'PARENT_VISIBLE'\s*\)/,
    );
  });
});

describe("06_audit_timeline — AuditLog table + partitioning (spec §4.5)", () => {
  it("creates AuditLog table partitioned by createdAt range", () => {
    const block = MIG_06.match(/CREATE TABLE "AuditLog"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/CREATE TABLE "AuditLog"/);
    expect(block).toMatch(/PARTITION BY RANGE \("createdAt"\)/);
  });

  it("AuditLog has composite PK (id, createdAt) — partitioned-table requirement", () => {
    const block = MIG_06.match(/CREATE TABLE "AuditLog"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(
      /CONSTRAINT "AuditLog_pkey" PRIMARY KEY \("id", "createdAt"\)/,
    );
  });

  it("AuditLog column shape matches §4.5 spec — id-references TEXT, INET ipAddress, no retentionUntil", () => {
    const block = MIG_06.match(/CREATE TABLE "AuditLog"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    // actorUserId is nullable (system actions)
    expect(block).toMatch(/"actorUserId" TEXT(?!\s+NOT NULL)/);
    expect(block).toMatch(/"action" "AuditAction" NOT NULL/);
    expect(block).toMatch(/"resource" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"resourceId" TEXT NOT NULL/);
    expect(block).toMatch(/"before" JSONB(?!\s+NOT NULL)/);
    expect(block).toMatch(/"after" JSONB(?!\s+NOT NULL)/);
    expect(block).toMatch(/"ipAddress" INET/);
    expect(block).toMatch(/"userAgent" VARCHAR\(500\)/);
    expect(block).toMatch(
      /"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/,
    );
    // No retentionUntil column — partition-drop retention per spec §4.5
    // (per pre-build reviewer C1).
    expect(block).not.toMatch(/"retentionUntil"/);
  });

  it("AuditLog has NO updatedAt / deletedAt / *ById columns (append-only deviation from §4.4)", () => {
    const block = MIG_06.match(/CREATE TABLE "AuditLog"[^;]+;/m)?.[0] ?? "";
    expect(block).not.toMatch(/"updatedAt"/);
    expect(block).not.toMatch(/"deletedAt"/);
    expect(block).not.toMatch(/"createdById"/);
    expect(block).not.toMatch(/"updatedById"/);
    expect(block).not.toMatch(/"deletedById"/);
  });

  it("pre-creates 18 monthly partitions (2026-05 → 2027-10)", () => {
    const partitionRe = /CREATE TABLE "AuditLog_y\d{4}m\d{2}" PARTITION OF "AuditLog"/g;
    const matches = MIG_06.match(partitionRe) || [];
    expect(matches.length).toBe(18);
  });

  it.each(PARTITION_MONTHS)("partition AuditLog_y%s declared FOR VALUES FROM/TO matching the month range", (yyyymm) => {
    const year = yyyymm.slice(0, 4);
    const month = yyyymm.slice(5);
    const partitionRe = new RegExp(
      `CREATE TABLE "AuditLog_y${year}m${month}" PARTITION OF "AuditLog" FOR VALUES FROM \\('${year}-${month}-01'\\)`,
    );
    expect(MIG_06).toMatch(partitionRe);
  });

  it("partition CREATE statements appear AFTER the parent CREATE TABLE block — per pre-build reviewer I4", () => {
    const parentIdx = MIG_06.indexOf('CREATE TABLE "AuditLog" (');
    const firstPartitionIdx = MIG_06.indexOf('PARTITION OF "AuditLog"');
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(firstPartitionIdx).toBeGreaterThan(parentIdx);
  });
});

describe("06_audit_timeline — append-only trigger (spec §4.5)", () => {
  it("creates audit_log_block_update_delete() function with LANGUAGE plpgsql + SECURITY INVOKER", () => {
    expect(MIG_06).toMatch(
      /CREATE OR REPLACE FUNCTION audit_log_block_update_delete\(\)/,
    );
    expect(MIG_06).toMatch(/LANGUAGE plpgsql/);
    expect(MIG_06).toMatch(/SECURITY INVOKER/);
  });

  it("function definition does NOT use SECURITY DEFINER — guards against accidental privilege elevation", () => {
    // Defensive negative — per pre-build reviewer Q-B, raise-only function
    // does not need elevated privilege. Match only inside the CREATE FUNCTION
    // block (header comments explaining the choice mention SECURITY DEFINER).
    const fnBlock =
      MIG_06.match(
        /CREATE OR REPLACE FUNCTION audit_log_block_update_delete\(\)[\s\S]*?\$\$;/,
      )?.[0] ?? "";
    expect(fnBlock.length).toBeGreaterThan(0);
    expect(fnBlock).not.toMatch(/SECURITY DEFINER/);
  });

  it("function body raises with append-only message + ERRCODE P0001", () => {
    expect(MIG_06).toMatch(
      /RAISE EXCEPTION 'AuditLog is append-only/,
    );
    expect(MIG_06).toMatch(/ERRCODE = 'P0001'/);
  });

  it("creates BEFORE UPDATE trigger on AuditLog binding the function", () => {
    expect(MIG_06).toMatch(
      /CREATE TRIGGER "audit_log_block_update"\s+BEFORE UPDATE ON "AuditLog"\s+FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete\(\)/,
    );
  });

  it("creates BEFORE DELETE trigger on AuditLog binding the function", () => {
    expect(MIG_06).toMatch(
      /CREATE TRIGGER "audit_log_block_delete"\s+BEFORE DELETE ON "AuditLog"\s+FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete\(\)/,
    );
  });
});

describe("06_audit_timeline — TimelineEvent table (spec §4.1 Foundation row)", () => {
  it("creates TimelineEvent table with id PK + full §4.4 audit columns + soft-delete", () => {
    const block = MIG_06.match(/CREATE TABLE "TimelineEvent"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"actorUserId" TEXT(?!\s+NOT NULL)/);
    expect(block).toMatch(/"subjectKind" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"subjectId" TEXT NOT NULL/);
    expect(block).toMatch(/"kind" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(
      /"visibility" "TimelineVisibility" NOT NULL DEFAULT 'INTERNAL'/,
    );
    expect(block).toMatch(/"payload" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(block).toMatch(
      /"occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/,
    );
    // Full §4.4 audit columns (soft-delete YES per cycle decision).
    expect(block).toMatch(/"createdAt" TIMESTAMPTZ NOT NULL/);
    expect(block).toMatch(/"createdById" TEXT/);
    expect(block).toMatch(/"updatedAt" TIMESTAMPTZ NOT NULL/);
    expect(block).toMatch(/"updatedById" TEXT/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"deletedById" TEXT/);
    expect(block).toMatch(
      /CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY \("id"\)/,
    );
  });
});

describe("06_audit_timeline — composite uniques + lookup indexes", () => {
  it("creates TimelineEvent_id_tenantId_key composite unique", () => {
    expect(MIG_06).toMatch(
      /CREATE UNIQUE INDEX "TimelineEvent_id_tenantId_key" ON "TimelineEvent"\("id", "tenantId"\)/,
    );
  });

  it.each([
    "AuditLog_tenantId_createdAt_idx",
    "AuditLog_tenantId_resource_resourceId_idx",
    "AuditLog_tenantId_actorUserId_createdAt_idx",
    "TimelineEvent_tenantId_idx",
    "TimelineEvent_tenantId_subjectKind_subjectId_occurredAt_idx",
    "TimelineEvent_tenantId_actorUserId_occurredAt_idx",
    "TimelineEvent_tenantId_kind_occurredAt_idx",
  ])("declares lookup index %s", (name) => {
    expect(MIG_06).toMatch(new RegExp(`CREATE INDEX "${name}"`));
  });

  it("creates GIN index on TimelineEvent.payload for admin search", () => {
    expect(MIG_06).toMatch(
      /CREATE INDEX "TimelineEvent_payload_idx" ON "TimelineEvent" USING GIN \("payload"\)/,
    );
  });

  it("does NOT declare an AuditLog_retentionUntil_idx (no retentionUntil column)", () => {
    expect(MIG_06).not.toMatch(/AuditLog_retentionUntil_idx/);
  });
});

describe("06_audit_timeline — foreign keys (spec §6.4)", () => {
  it("AuditLog.tenantId → Tenant FK Restrict (outbound FK from partitioned table)", () => {
    expect(MIG_06).toMatch(
      /ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT/,
    );
  });

  it("AuditLog.actorUserId is NON-FK by design (partition-table maintenance burden)", () => {
    // No FK declared on AuditLog.actorUserId — soft-reference only.
    expect(MIG_06).not.toMatch(
      /ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey"/,
    );
    expect(MIG_06).not.toMatch(/FOREIGN KEY \("actorUserId"\)[^;]*?ON [^;]*?"AuditLog"/);
  });

  it("TimelineEvent.tenantId → Tenant FK Restrict", () => {
    expect(MIG_06).toMatch(
      /ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT/,
    );
  });

  it("TimelineEvent.actorUserId → User FK SET NULL (single-col, §6.4 MVP rule)", () => {
    expect(MIG_06).toMatch(
      /ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_actorUserId_fkey"[\s\S]*?FOREIGN KEY \("actorUserId"\) REFERENCES "User"\("id"\)[\s\S]*?ON DELETE SET NULL/,
    );
  });
});

describe("06_audit_timeline — RLS coverage (spec §6.3)", () => {
  it.each(NEW_TABLES)("%s ENABLE ROW LEVEL SECURITY", (table) => {
    expect(MIG_06).toMatch(
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`),
    );
  });

  it.each(NEW_TABLES)("%s REVOKE ALL FROM anon, authenticated (defense-in-depth, §6.3 canonical form)", (table) => {
    expect(MIG_06).toMatch(
      new RegExp(`REVOKE ALL ON "${table}" FROM anon, authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s GRANT SELECT TO authenticated", (table) => {
    expect(MIG_06).toMatch(
      new RegExp(`GRANT SELECT ON "${table}" TO authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s declares tenant_isolation_select policy", (table) => {
    expect(MIG_06).toMatch(
      new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${table}"`),
    );
  });

  it.each(NEW_TABLES)("%s declares no_writes_via_postgrest policy (USING false WITH CHECK false)", (table) => {
    const policyRe = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${table}"[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_06).toMatch(policyRe);
  });

  it("TimelineEvent tenant_isolation_select retains deletedAt IS NULL clause (soft-delete YES)", () => {
    const block =
      MIG_06.match(
        /CREATE POLICY "tenant_isolation_select" ON "TimelineEvent"[\s\S]*?(?=CREATE POLICY "no_writes_via_postgrest")/,
      )?.[0] ?? "";
    expect(block).toMatch(/AND "deletedAt" IS NULL/);
  });

  it("AuditLog tenant_isolation_select OMITS deletedAt clause (no soft-delete; append-only)", () => {
    const block =
      MIG_06.match(
        /CREATE POLICY "tenant_isolation_select" ON "AuditLog"[\s\S]*?(?=CREATE POLICY "no_writes_via_postgrest")/,
      )?.[0] ?? "";
    expect(block).not.toMatch(/AND "deletedAt" IS NULL/);
  });

  it.each(NEW_TABLES)("%s does NOT use FORCE ROW LEVEL SECURITY (design lock from p1-regions-seed)", (table) => {
    expect(MIG_06).not.toMatch(
      new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("06_audit_timeline — partition defense-in-depth REVOKE", () => {
  it.each(PARTITION_MONTHS)("REVOKEs all on partition AuditLog_y%s from anon + authenticated", (yyyymm) => {
    expect(MIG_06).toMatch(
      new RegExp(`REVOKE ALL ON "AuditLog_y${yyyymm}" FROM anon, authenticated`),
    );
  });
});

describe("06_audit_timeline — schema-side positive guard", () => {
  it.each(NEW_TABLES)("model %s declares a `tenantId String` field in schema.prisma", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\btenantId\s+String\b/);
  });

  it("AuditLog model declares composite PK via @@id([id, createdAt])", () => {
    const block = SCHEMA.match(/model AuditLog\s*\{[^}]+\}/s)?.[0] ?? "";
    expect(block).toMatch(/@@id\(\[id, createdAt\]\)/);
  });
});

describe("06_audit_timeline — section-ordering sanity", () => {
  it("CREATE TYPE precedes CREATE TABLE", () => {
    const firstType = MIG_06.indexOf('CREATE TYPE "AuditAction"');
    const firstTable = MIG_06.indexOf('CREATE TABLE "AuditLog"');
    expect(firstType).toBeGreaterThanOrEqual(0);
    expect(firstTable).toBeGreaterThan(firstType);
  });

  it("CREATE TABLE precedes CREATE OR REPLACE FUNCTION (table must exist before triggers reference it)", () => {
    const firstTable = MIG_06.indexOf('CREATE TABLE "AuditLog"');
    const fnIdx = MIG_06.indexOf("CREATE OR REPLACE FUNCTION audit_log_block_update_delete");
    expect(fnIdx).toBeGreaterThan(firstTable);
  });

  it("CREATE FUNCTION precedes CREATE TRIGGER (triggers reference the function)", () => {
    const fnIdx = MIG_06.indexOf("CREATE OR REPLACE FUNCTION audit_log_block_update_delete");
    const triggerIdx = MIG_06.indexOf('CREATE TRIGGER "audit_log_block_update"');
    expect(triggerIdx).toBeGreaterThan(fnIdx);
  });

  it("CREATE TABLE precedes ALTER TABLE FK + RLS sections", () => {
    const firstTable = MIG_06.indexOf('CREATE TABLE "AuditLog"');
    const firstFk = MIG_06.indexOf('ADD CONSTRAINT "AuditLog_tenantId_fkey"');
    const firstRls = MIG_06.indexOf('ENABLE ROW LEVEL SECURITY');
    expect(firstFk).toBeGreaterThan(firstTable);
    expect(firstRls).toBeGreaterThan(firstTable);
  });
});
