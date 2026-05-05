// Migration post-condition tests — static parse of the 09_regions SQL +
// schema.prisma. CI runs vitest without a Postgres service, so these checks
// ensure the DDL contract from foundation spec §6.1 (migration 09 regions
// portion) + §4.1 (Regions row) + §4.2 (RegencyType enum) ships intact:
// enum, table shape with BPS-code CHAR(N) PKs, lookup indexes, trigram GIN,
// FK Restrict + Cascade-update on each parent-child pair, public-read RLS
// (anon + authenticated SELECT, all writes blocked).
//
// Schema-side guard: assert region models contain NO tenantId field — the
// verify-rls-coverage.sh script's parser scans `tenantId String` fields to
// pick the tenant-scoped set. If a region model accidentally acquires a
// tenantId, strict-mode coverage would silently break.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_09 = readFileSync(
  path.join(ROOT, "prisma/migrations/09_regions/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const REGION_TABLES = ["Province", "Regency", "District", "Village"] as const;
const PK_WIDTHS: Record<(typeof REGION_TABLES)[number], number> = {
  Province: 2,
  Regency: 4,
  District: 6,
  Village: 10,
};

describe("09_regions — enum (spec §4.2)", () => {
  it("creates RegencyType enum (KABUPATEN, KOTA)", () => {
    expect(MIG_09).toMatch(
      /CREATE TYPE "RegencyType" AS ENUM \('KABUPATEN', 'KOTA'\)/,
    );
  });
});

describe("09_regions — table creation (spec §4.1 Regions row)", () => {
  it.each(REGION_TABLES)("creates table %s", (name) => {
    expect(MIG_09).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it.each(REGION_TABLES)(
    "%s PK is CHAR with the expected BPS width",
    (name) => {
      const width = PK_WIDTHS[name];
      const block = MIG_09.match(new RegExp(`CREATE TABLE "${name}"[^;]+;`, "m"))?.[0] ?? "";
      expect(block).toMatch(new RegExp(`"id" CHAR\\(${width}\\) NOT NULL`));
      expect(block).toMatch(new RegExp(`CONSTRAINT "${name}_pkey" PRIMARY KEY \\("id"\\)`));
    },
  );

  it("Regency carries provinceId CHAR(2) + type RegencyType", () => {
    const block = MIG_09.match(/CREATE TABLE "Regency"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"provinceId" CHAR\(2\) NOT NULL/);
    expect(block).toMatch(/"type" "RegencyType" NOT NULL/);
  });

  it("District carries regencyId CHAR(4)", () => {
    const block = MIG_09.match(/CREATE TABLE "District"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"regencyId" CHAR\(4\) NOT NULL/);
  });

  it("Village carries districtId CHAR(6) — matches District PK width", () => {
    const block = MIG_09.match(/CREATE TABLE "Village"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"districtId" CHAR\(6\) NOT NULL/);
  });

  it("region tables carry only createdAt + updatedAt audit columns (no audit-by, no soft-delete, no tenantId)", () => {
    for (const name of REGION_TABLES) {
      const block = MIG_09.match(new RegExp(`CREATE TABLE "${name}"[^;]+;`, "m"))?.[0] ?? "";
      expect(block).toMatch(/"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
      expect(block).toMatch(/"updatedAt" TIMESTAMPTZ NOT NULL/);
      expect(block).not.toMatch(/"tenantId"/);
      expect(block).not.toMatch(/"deletedAt"/);
      expect(block).not.toMatch(/"createdById"/);
      expect(block).not.toMatch(/"updatedById"/);
    }
  });

  it("Village does NOT carry postalCode (deferred — idn-area-data v4.0.1 has no postal codes)", () => {
    const block = MIG_09.match(/CREATE TABLE "Village"[^;]+;/m)?.[0] ?? "";
    expect(block).not.toMatch(/postalCode/i);
  });
});

describe("09_regions — lookup indexes", () => {
  it.each([
    ["Regency_provinceId_idx", "Regency", "provinceId"],
    ["District_regencyId_idx", "District", "regencyId"],
    ["Village_districtId_idx", "Village", "districtId"],
  ])("%s — btree index on %s.(%s)", (idx, table, col) => {
    expect(MIG_09).toMatch(
      new RegExp(`CREATE INDEX "${idx}" ON "${table}"\\("${col}"\\)`),
    );
  });
});

describe("09_regions — trigram GIN on Village.name", () => {
  it("creates Village_name_trgm_idx using gin_trgm_ops", () => {
    expect(MIG_09).toMatch(
      /CREATE INDEX "Village_name_trgm_idx" ON "Village" USING GIN \("name" gin_trgm_ops\)/,
    );
  });
});

describe("09_regions — foreign keys (Restrict on delete, Cascade on rename)", () => {
  it.each([
    ["Regency", "provinceId", "Province"],
    ["District", "regencyId", "Regency"],
    ["Village", "districtId", "District"],
  ])("%s.%s → %s.id (FK Restrict)", (child, col, parent) => {
    const fkPattern = new RegExp(
      `ALTER TABLE "${child}"[\\s\\S]*?ADD CONSTRAINT "${child}_${col}_fkey"[\\s\\S]*?FOREIGN KEY \\("${col}"\\) REFERENCES "${parent}"\\("id"\\)[\\s\\S]*?ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    expect(MIG_09).toMatch(fkPattern);
  });
});

describe("09_regions — public-read RLS (intentional deviation from §6.3)", () => {
  it.each(REGION_TABLES)("%s ENABLE ROW LEVEL SECURITY", (name) => {
    expect(MIG_09).toMatch(new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`));
  });

  it.each(REGION_TABLES)("%s REVOKE write privileges from anon + authenticated", (name) => {
    expect(MIG_09).toMatch(
      new RegExp(
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "${name}" FROM anon, authenticated`,
      ),
    );
  });

  it.each(REGION_TABLES)("%s GRANT SELECT to authenticated + anon", (name) => {
    expect(MIG_09).toMatch(
      new RegExp(`GRANT SELECT ON "${name}" TO authenticated, anon`),
    );
  });

  it.each(REGION_TABLES)("%s carries public_read policy (USING true)", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "public_read" ON "${name}"[\\s\\S]*?FOR SELECT TO authenticated, anon[\\s\\S]*?USING \\(true\\)`,
    );
    expect(MIG_09).toMatch(policyPattern);
  });

  it.each(REGION_TABLES)("%s carries no_writes_via_postgrest policy (FOR ALL USING false WITH CHECK false)", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${name}"[\\s\\S]*?FOR ALL TO anon, authenticated[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_09).toMatch(policyPattern);
  });

  it("does NOT carry tenant_isolation_select (regions are non-tenant-scoped reference data)", () => {
    expect(MIG_09).not.toMatch(/CREATE POLICY "tenant_isolation_select" ON "(Province|Regency|District|Village)"/);
  });

  // Design lock: ENABLE (not FORCE) ROW LEVEL SECURITY. FORCE would apply RLS
  // to table owners + superusers, which would block the service-role seed
  // path (prisma db seed runs via the service_role key, which is the table
  // owner on Supabase). Migration header documents this; this test enforces
  // the design choice mechanically so a future migration can't silently add
  // FORCE and break the seed at re-apply.
  it.each(REGION_TABLES)("%s does NOT FORCE ROW LEVEL SECURITY (service-role seed bypass intent)", (name) => {
    expect(MIG_09).not.toMatch(
      new RegExp(`ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("09_regions — schema guard: region models have no tenantId", () => {
  // Why: scripts/verify-rls-coverage.sh picks the tenant-scoped model set by
  // grepping `tenantId String` fields from schema.prisma. If a region model
  // accidentally acquires a tenantId, strict mode would silently fail because
  // these tables don't carry the tenant_isolation_select RLS policy.
  it.each(REGION_TABLES)("model %s does not declare a tenantId field", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/\btenantId\b\s+String/);
  });
});

describe("09_regions — section ordering sanity", () => {
  it("CREATE TYPE comes before CREATE TABLE", () => {
    const typeIdx = MIG_09.indexOf('CREATE TYPE "RegencyType"');
    const tableIdx = MIG_09.indexOf('CREATE TABLE "Province"');
    expect(typeIdx).toBeGreaterThan(-1);
    expect(tableIdx).toBeGreaterThan(typeIdx);
  });

  it("CREATE TABLE comes before ALTER TABLE FK + RLS", () => {
    const lastTable = MIG_09.lastIndexOf('CREATE TABLE "Village"');
    const firstFk = MIG_09.indexOf('ADD CONSTRAINT "Regency_provinceId_fkey"');
    const firstRls = MIG_09.indexOf('ENABLE ROW LEVEL SECURITY');
    expect(firstFk).toBeGreaterThan(lastTable);
    expect(firstRls).toBeGreaterThan(firstFk);
  });
});
