// Migration post-condition tests — static parse of the 16_scaffold SQL +
// schema.prisma. Mirrors the 05-sessions.test.ts + 09-regions.test.ts
// patterns. Asserts the DDL contract from foundation spec §4.1 row
// "Foundation" + §4.2 enums (FileKind, FileStatus, ExportFormat,
// ExportJobStatus) + §6.3 RLS + p1-regions-seed design locks (REVOKE ALL +
// no FORCE).
//
// Cycle decisions encoded as tests:
//   - Soft-delete asymmetry on tenant_isolation_select USING clause:
//     deletedAt IS NULL clause on FileAsset / OrgConfig / Holiday only;
//     absent on ExportJob / EmailLog / WebhookEvent (operational records).
//   - All cross-row FKs single-col (composite FK reserved for RLS-critical
//     join tables per §6.4 MVP rule).
//   - ExportJob.requestedByUserId is RESTRICT (operational attributability).
//   - OrgConfig singleton via column-level UNIQUE on tenantId.
//   - WebhookEvent full unique on (tenantId, source, idempotencyKey).
//   - Holiday partial unique on (tenantId, date) WHERE deletedAt IS NULL.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_16 = readFileSync(
  path.join(ROOT, "prisma/migrations/16_scaffold/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const NEW_TABLES = [
  "FileAsset",
  "ExportJob",
  "EmailLog",
  "WebhookEvent",
  "OrgConfig",
  "Holiday",
] as const;

const SOFT_DELETE_TABLES = new Set(["FileAsset", "OrgConfig", "Holiday"]);

describe("16_scaffold — enums (spec §4.2)", () => {
  it("creates FileKind enum (DOCUMENT, IMAGE, VIDEO, AUDIO, ARCHIVE)", () => {
    expect(MIG_16).toMatch(
      /CREATE TYPE "FileKind" AS ENUM \(\s*'DOCUMENT',\s*'IMAGE',\s*'VIDEO',\s*'AUDIO',\s*'ARCHIVE'\s*\)/,
    );
  });

  it("creates FileStatus enum (PENDING_UPLOAD, UPLOADED, COMPRESSED, FAILED, ORPHANED)", () => {
    expect(MIG_16).toMatch(
      /CREATE TYPE "FileStatus" AS ENUM \(\s*'PENDING_UPLOAD',\s*'UPLOADED',\s*'COMPRESSED',\s*'FAILED',\s*'ORPHANED'\s*\)/,
    );
  });

  it("creates ExportFormat enum (CSV, XLSX, PDF)", () => {
    expect(MIG_16).toMatch(
      /CREATE TYPE "ExportFormat" AS ENUM \(\s*'CSV',\s*'XLSX',\s*'PDF'\s*\)/,
    );
  });

  it("creates ExportJobStatus enum (PENDING, RUNNING, COMPLETED, FAILED, EXPIRED)", () => {
    expect(MIG_16).toMatch(
      /CREATE TYPE "ExportJobStatus" AS ENUM \(\s*'PENDING',\s*'RUNNING',\s*'COMPLETED',\s*'FAILED',\s*'EXPIRED'\s*\)/,
    );
  });
});

describe("16_scaffold — table creation (spec §4.1 Foundation row)", () => {
  it.each(NEW_TABLES)("creates table %s", (name) => {
    expect(MIG_16).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it("FileAsset column shape — full §4.4 audit + soft-delete + Decimal compressionRatio", () => {
    const block = MIG_16.match(/CREATE TABLE "FileAsset"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"storagePath" VARCHAR\(500\) NOT NULL/);
    expect(block).toMatch(/"originalName" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"mimeType" VARCHAR\(100\) NOT NULL/);
    expect(block).toMatch(/"sizeBytes" BIGINT NOT NULL/);
    expect(block).toMatch(/"kind" "FileKind" NOT NULL/);
    expect(block).toMatch(
      /"status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD'/,
    );
    expect(block).toMatch(/"uploaderUserId" TEXT/);
    expect(block).toMatch(/"compressedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"compressionRatio" DECIMAL\(5,2\)/);
    // Full §4.4 audit columns (soft-delete YES).
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"deletedById" TEXT/);
  });

  it("ExportJob column shape — audit minus soft-delete + RESTRICT-keyed requestedByUserId NOT NULL", () => {
    const block = MIG_16.match(/CREATE TABLE "ExportJob"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"requestedByUserId" TEXT NOT NULL/);
    expect(block).toMatch(/"entityKind" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"format" "ExportFormat" NOT NULL/);
    expect(block).toMatch(/"status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING'/);
    expect(block).toMatch(/"filterPayload" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(block).toMatch(/"resultFileAssetId" TEXT/);
    expect(block).toMatch(/"errorMessage" VARCHAR\(2000\)/);
    expect(block).toMatch(/"expiresAt" TIMESTAMPTZ NOT NULL/);
    // No soft-delete on ExportJob.
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("EmailLog column shape — audit minus soft-delete + plain VARCHAR status", () => {
    const block = MIG_16.match(/CREATE TABLE "EmailLog"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"recipientEmail" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"subject" VARCHAR\(500\) NOT NULL/);
    expect(block).toMatch(/"template" VARCHAR\(100\) NOT NULL/);
    expect(block).toMatch(/"status" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"messageId" VARCHAR\(255\)/);
    expect(block).toMatch(/"sentAt" TIMESTAMPTZ/);
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("WebhookEvent column shape — audit only createdAt/updatedAt (no *ById)", () => {
    const block = MIG_16.match(/CREATE TABLE "WebhookEvent"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"source" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"eventType" VARCHAR\(100\) NOT NULL/);
    expect(block).toMatch(/"payload" JSONB NOT NULL/);
    expect(block).toMatch(/"signature" VARCHAR\(255\)/);
    expect(block).toMatch(/"idempotencyKey" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"processedAt" TIMESTAMPTZ/);
    // System-driven — no *ById columns.
    expect(block).not.toMatch(/"createdById"/);
    expect(block).not.toMatch(/"updatedById"/);
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("OrgConfig column shape — column-level UNIQUE on tenantId (singleton) + full §4.4 audit + soft-delete", () => {
    const block = MIG_16.match(/CREATE TABLE "OrgConfig"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"tenantId" TEXT NOT NULL UNIQUE/);
    expect(block).toMatch(/"lemburCompliant" BOOLEAN NOT NULL DEFAULT false/);
    expect(block).toMatch(/"nisPrefix" VARCHAR\(10\)/);
    expect(block).toMatch(/"currentAcademicYearId" TEXT/);
    expect(block).toMatch(
      /"autoDropAdmissionDays" INTEGER NOT NULL DEFAULT 30/,
    );
    expect(block).toMatch(
      /"timezone" VARCHAR\(50\) NOT NULL DEFAULT 'Asia\/Jakarta'/,
    );
    expect(block).toMatch(/"locale" VARCHAR\(10\) NOT NULL DEFAULT 'id-ID'/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
  });

  it("Holiday column shape — VARCHAR kind (not enum) + full §4.4 audit + soft-delete", () => {
    const block = MIG_16.match(/CREATE TABLE "Holiday"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"date" DATE NOT NULL/);
    expect(block).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"kind" VARCHAR\(20\) NOT NULL/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
  });
});

describe("16_scaffold — composite uniques + lookup indexes", () => {
  it.each(["FileAsset", "ExportJob", "OrgConfig"])("%s has composite (id, tenantId) unique for FK-target friendliness", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(
        `CREATE UNIQUE INDEX "${table}_id_tenantId_key" ON "${table}"\\("id", "tenantId"\\)`,
      ),
    );
  });

  it.each([
    "FileAsset_tenantId_idx",
    "FileAsset_tenantId_status_idx",
    "FileAsset_tenantId_kind_idx",
    "FileAsset_uploaderUserId_tenantId_idx",
    "ExportJob_tenantId_idx",
    "ExportJob_tenantId_status_idx",
    "ExportJob_tenantId_requestedByUserId_idx",
    "ExportJob_resultFileAssetId_tenantId_idx",
    "EmailLog_tenantId_idx",
    "EmailLog_tenantId_status_idx",
    "EmailLog_tenantId_recipientEmail_idx",
    "WebhookEvent_tenantId_idx",
    "WebhookEvent_tenantId_source_eventType_idx",
    "WebhookEvent_tenantId_processedAt_idx",
    "Holiday_tenantId_idx",
    "Holiday_tenantId_date_idx",
  ])("declares lookup index %s", (name) => {
    expect(MIG_16).toMatch(new RegExp(`CREATE INDEX "${name}"`));
  });

  it("WebhookEvent declares full unique on (tenantId, source, idempotencyKey) — NO WHERE clause", () => {
    expect(MIG_16).toMatch(
      /CREATE UNIQUE INDEX "webhook_event_idempotency_unique"\s+ON "WebhookEvent" \("tenantId", "source", "idempotencyKey"\);/,
    );
  });

  it("Holiday declares partial unique on (tenantId, date) WHERE deletedAt IS NULL", () => {
    expect(MIG_16).toMatch(
      /CREATE UNIQUE INDEX "holiday_tenant_date_active_unique"[\s\S]*?ON "Holiday" \("tenantId", "date"\)[\s\S]*?WHERE "deletedAt" IS NULL/,
    );
  });
});

describe("16_scaffold — foreign keys (spec §6.4 MVP rule: single-col cross-row)", () => {
  it.each(NEW_TABLES)("%s.tenantId → Tenant FK Restrict (root-entity tenant scope)", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenantId_fkey"[\\s\\S]*?FOREIGN KEY \\("tenantId"\\) REFERENCES "Tenant"\\("id"\\)[\\s\\S]*?ON DELETE RESTRICT`,
      ),
    );
  });

  it("FileAsset.uploaderUserId → User FK SET NULL (single-col, denorm column)", () => {
    expect(MIG_16).toMatch(
      /ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploaderUserId_fkey"[\s\S]*?FOREIGN KEY \("uploaderUserId"\) REFERENCES "User"\("id"\)[\s\S]*?ON DELETE SET NULL/,
    );
  });

  it("ExportJob.requestedByUserId → User FK RESTRICT (operational attributability)", () => {
    expect(MIG_16).toMatch(
      /ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedByUserId_fkey"[\s\S]*?FOREIGN KEY \("requestedByUserId"\) REFERENCES "User"\("id"\)[\s\S]*?ON DELETE RESTRICT/,
    );
  });

  it("ExportJob.resultFileAssetId → FileAsset FK SET NULL (denorm, file may be cleaned up)", () => {
    expect(MIG_16).toMatch(
      /ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_resultFileAssetId_fkey"[\s\S]*?FOREIGN KEY \("resultFileAssetId"\) REFERENCES "FileAsset"\("id"\)[\s\S]*?ON DELETE SET NULL/,
    );
  });

  it("OrgConfig.currentAcademicYearId → AcademicYear FK SET NULL", () => {
    expect(MIG_16).toMatch(
      /ALTER TABLE "OrgConfig" ADD CONSTRAINT "OrgConfig_currentAcademicYearId_fkey"[\s\S]*?FOREIGN KEY \("currentAcademicYearId"\) REFERENCES "AcademicYear"\("id"\)[\s\S]*?ON DELETE SET NULL/,
    );
  });

  it("no composite FK declarations on cross-row references (single-col per §6.4 MVP rule)", () => {
    // Negative guard — composite FK pattern reserved for RLS-critical join
    // tables (UserRole, RolePermission, EmployeeCampusAssignment,
    // TeachingDefault, SentraRotation, SessionTeacher). None of mig 16's
    // tables are join tables; cross-row FKs are single-col only.
    expect(MIG_16).not.toMatch(/FOREIGN KEY \("uploaderUserId", "tenantId"\)/);
    expect(MIG_16).not.toMatch(/FOREIGN KEY \("requestedByUserId", "tenantId"\)/);
    expect(MIG_16).not.toMatch(/FOREIGN KEY \("resultFileAssetId", "tenantId"\)/);
    expect(MIG_16).not.toMatch(
      /FOREIGN KEY \("currentAcademicYearId", "tenantId"\)/,
    );
  });
});

describe("16_scaffold — RLS coverage (spec §6.3)", () => {
  it.each(NEW_TABLES)("%s ENABLE ROW LEVEL SECURITY", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`),
    );
  });

  it.each(NEW_TABLES)("%s REVOKE ALL FROM anon, authenticated (defense-in-depth, §6.3 canonical form)", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(`REVOKE ALL ON "${table}" FROM anon, authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s GRANT SELECT TO authenticated", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(`GRANT SELECT ON "${table}" TO authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s declares tenant_isolation_select policy", (table) => {
    expect(MIG_16).toMatch(
      new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${table}"`),
    );
  });

  it.each(NEW_TABLES)("%s declares no_writes_via_postgrest policy (USING false WITH CHECK false)", (table) => {
    const policyRe = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${table}"[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_16).toMatch(policyRe);
  });

  it.each(NEW_TABLES.filter((t) => SOFT_DELETE_TABLES.has(t)))("%s tenant_isolation_select retains deletedAt IS NULL clause (soft-delete)", (table) => {
    const block =
      MIG_16.match(
        new RegExp(
          `CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`,
        ),
      )?.[0] ?? "";
    expect(block).toMatch(/AND "deletedAt" IS NULL/);
  });

  it.each(NEW_TABLES.filter((t) => !SOFT_DELETE_TABLES.has(t)))("%s tenant_isolation_select OMITS deletedAt clause (no soft-delete)", (table) => {
    const block =
      MIG_16.match(
        new RegExp(
          `CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`,
        ),
      )?.[0] ?? "";
    expect(block).not.toMatch(/AND "deletedAt" IS NULL/);
  });

  it.each(NEW_TABLES)("%s does NOT use FORCE ROW LEVEL SECURITY (design lock from p1-regions-seed)", (table) => {
    expect(MIG_16).not.toMatch(
      new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("16_scaffold — schema-side positive guard", () => {
  it.each(NEW_TABLES)("model %s declares a `tenantId String` field in schema.prisma", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\btenantId\s+String\b/);
  });

  it("OrgConfig schema declares tenantId String @unique (singleton)", () => {
    const block = SCHEMA.match(/model OrgConfig\s*\{[^}]+\}/s)?.[0] ?? "";
    expect(block).toMatch(/tenantId\s+String\s+@unique/);
  });
});

describe("16_scaffold — section-ordering sanity", () => {
  it("CREATE TYPE precedes CREATE TABLE", () => {
    const firstType = MIG_16.indexOf('CREATE TYPE "FileKind"');
    const firstTable = MIG_16.indexOf('CREATE TABLE "FileAsset"');
    expect(firstType).toBeGreaterThanOrEqual(0);
    expect(firstTable).toBeGreaterThan(firstType);
  });

  it("FileAsset CREATE TABLE precedes ExportJob CREATE TABLE (FK target)", () => {
    const fileIdx = MIG_16.indexOf('CREATE TABLE "FileAsset"');
    const exportIdx = MIG_16.indexOf('CREATE TABLE "ExportJob"');
    expect(exportIdx).toBeGreaterThan(fileIdx);
  });

  it("CREATE TABLE precedes ALTER TABLE FK + RLS sections", () => {
    const firstTable = MIG_16.indexOf('CREATE TABLE "FileAsset"');
    const firstFk = MIG_16.indexOf('ADD CONSTRAINT "FileAsset_tenantId_fkey"');
    const firstRls = MIG_16.indexOf('ENABLE ROW LEVEL SECURITY');
    expect(firstFk).toBeGreaterThan(firstTable);
    expect(firstRls).toBeGreaterThan(firstTable);
  });
});
