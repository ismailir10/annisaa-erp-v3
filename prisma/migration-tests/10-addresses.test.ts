// Migration post-condition tests — static parse of the 10_addresses SQL.
// Mirrors 07-students/08-guardians (readFileSync + regex assertions, no DB).
// Asserts the structural invariants documented in the cycle's Spec / Tasks:
//   * Address tenant-scoped RLS (ENABLE + tenant_isolation_select +
//     no_writes_via_postgrest)
//   * Length CHECK constraints on all 4 BPS code columns
//   * Composite (id, tenantId) unique on Address (FK target shape per §6.4)
//   * Compound FKs from Address to Region tables (chain-validity DB enforcement
//     per Spec §1) — provinceId single-col, regency/district/village compound
//     `(<id>, <parentId>)` references
//   * Region composite-unique constraints generated for FK landing zones
//     (Regency_id_provinceId_key, District_id_regencyId_key, Village_id_districtId_key)
//   * Household.addressId compound FK with column-list `SET NULL ("addressId")`
//     (Postgres 15.4+ syntax; mirrors Guardian.userId precedent per scaffold.md §6 —
//     dodges Prisma issue #25061)
//   * Tenant FK Restrict (never cascade Tenant)
//   * No FORCE ROW LEVEL SECURITY (matches design lock from p1-regions-seed)
//
// Static-only — runs under `npx vitest run` without a live DB.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(
  path.join(ROOT, "prisma/migrations/10_addresses/migration.sql"),
  "utf8",
);

// DDL-only view: strip both /* ... */ block comments and full-line `--`
// comments. Used by negative assertions (e.g. NO FORCE ROW LEVEL SECURITY)
// so prose mentions inside header / inline comments don't false-positive.
// (Mirrors 08-guardians.test.ts SQL_DDL pattern.)
const SQL_DDL = SQL.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");

describe("10_addresses — RLS coverage (spec §6.3)", () => {
  it("Address ENABLE ROW LEVEL SECURITY", () => {
    expect(SQL).toMatch(/ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY/);
  });

  it("Address declares tenant_isolation_select policy gating on tenant_id JWT claim + deletedAt IS NULL", () => {
    expect(SQL).toMatch(
      /CREATE POLICY "tenant_isolation_select" ON "Address"[\s\S]*tenantId[\s\S]*tenant_id[\s\S]*deletedAt[\s\S]*IS NULL/,
    );
  });

  it("Address declares no_writes_via_postgrest policy", () => {
    expect(SQL).toMatch(
      /CREATE POLICY "no_writes_via_postgrest" ON "Address"[\s\S]*USING \(false\) WITH CHECK \(false\)/,
    );
  });

  it("REVOKE ALL FROM anon, authenticated (defense-in-depth + matches §6.3 canonical)", () => {
    expect(SQL).toMatch(/REVOKE ALL ON "Address" FROM anon, authenticated/);
  });

  it("GRANT SELECT TO authenticated", () => {
    expect(SQL).toMatch(/GRANT SELECT ON "Address" TO authenticated/);
  });

  it("does NOT declare FORCE ROW LEVEL SECURITY (design lock from p1-regions-seed)", () => {
    // Use DDL-only view — header/prose comments mention the design lock by
    // name, which would false-positive against the actual ALTER TABLE form.
    expect(SQL_DDL).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });
});

describe("10_addresses — length CHECK constraints on BPS code columns (cycle Spec §1)", () => {
  it.each([
    ["Address_provinceId_check", `LENGTH\\("provinceId"\\)\\s*=\\s*2`],
    ["Address_regencyId_check", `LENGTH\\("regencyId"\\)\\s*=\\s*4`],
    ["Address_districtId_check", `LENGTH\\("districtId"\\)\\s*=\\s*6`],
  ])("%s present", (constraintName, lengthClause) => {
    const re = new RegExp(
      `CONSTRAINT\\s+"${constraintName}"[^,]*CHECK[^,]*${lengthClause}`,
    );
    expect(SQL).toMatch(re);
  });

  it("Address_villageId_check accepts NULL (optional villageId per spec)", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "Address_villageId_check"[^,]*CHECK \("villageId" IS NULL OR LENGTH\("villageId"\) = 10\)/,
    );
  });
});

describe("10_addresses — Address(id, tenantId) composite unique (FK target per §6.4)", () => {
  it("Address_id_tenantId_key UNIQUE INDEX present", () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX "Address_id_tenantId_key" ON "Address"\("id", "tenantId"\)/,
    );
  });
});

describe("10_addresses — chain-validity compound FKs to Region tables (Spec §1)", () => {
  it("Address.regencyId compound FK to Regency(id, provinceId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Address_regencyId_provinceId_fkey"[\s\S]*FOREIGN KEY \("regencyId", "provinceId"\) REFERENCES "Regency"\("id", "provinceId"\)/,
    );
  });

  it("Address.districtId compound FK to District(id, regencyId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Address_districtId_regencyId_fkey"[\s\S]*FOREIGN KEY \("districtId", "regencyId"\) REFERENCES "District"\("id", "regencyId"\)/,
    );
  });

  it("Address.villageId compound FK to Village(id, districtId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Address_villageId_districtId_fkey"[\s\S]*FOREIGN KEY \("villageId", "districtId"\) REFERENCES "Village"\("id", "districtId"\)/,
    );
  });

  it("Address.provinceId single-column FK (Province has no parent)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Address_provinceId_fkey"[\s\S]*FOREIGN KEY \("provinceId"\) REFERENCES "Province"\("id"\)/,
    );
  });

  it("Address.tenantId Restrict (never cascade Tenant per §4.4)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Address_tenantId_fkey"[\s\S]*FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });
});

describe("10_addresses — Region composite-unique landing zones (FK targets)", () => {
  it.each([
    ["Regency_id_provinceId_key", "Regency", `"id", "provinceId"`],
    ["District_id_regencyId_key", "District", `"id", "regencyId"`],
    ["Village_id_districtId_key", "Village", `"id", "districtId"`],
  ])("%s UNIQUE INDEX created", (name, table, cols) => {
    const re = new RegExp(
      `CREATE UNIQUE INDEX "${name}" ON "${table}"\\(${cols.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
    );
    expect(SQL).toMatch(re);
  });
});

describe("10_addresses — Household.addressId compound FK with column-list SET NULL (scaffold.md §6 split-view)", () => {
  it("Household_addressId_tenantId_fkey present with compound (addressId, tenantId) reference", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Household_addressId_tenantId_fkey"[\s\S]*FOREIGN KEY \("addressId", "tenantId"\) REFERENCES "Address"\("id", "tenantId"\)/,
    );
  });

  it("uses Postgres-15.4+ column-list SET NULL targeting ONLY addressId (preserves §6.4 tenant alignment)", () => {
    expect(SQL).toMatch(
      /Household_addressId_tenantId_fkey[\s\S]*ON DELETE SET NULL \("addressId"\)/,
    );
  });

  it("does NOT include tenantId in the SET NULL column-list (would violate Household.tenantId NOT NULL)", () => {
    expect(SQL).not.toMatch(
      /Household_addressId_tenantId_fkey[\s\S]*SET NULL \([^)]*"tenantId"[^)]*\)/,
    );
  });
});

describe("10_addresses — lookup indexes (chain-validity perf + tenant scope)", () => {
  it("Address_tenantId_idx present (tenant-scoped query support)", () => {
    expect(SQL).toMatch(
      /CREATE INDEX "Address_tenantId_idx"\s+ON "Address"\("tenantId"\)/,
    );
  });

  it("Address_districtId_villageId_idx present with NON-NULL leading column (T1 reviewer fix)", () => {
    expect(SQL).toMatch(
      /CREATE INDEX "Address_districtId_villageId_idx"\s+ON "Address"\("districtId", "villageId"\)/,
    );
  });

  it("does NOT carry the original villageId-leading index (reviewer flagged NULL-row bloat)", () => {
    expect(SQL).not.toMatch(
      /CREATE INDEX "Address_villageId_districtId_idx"/,
    );
  });
});
