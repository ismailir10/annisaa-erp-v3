// Migration post-condition tests — static parse of the 01_tenancy SQL.
// CI runs vitest without a Postgres service, so live-DB asserts are deferred to
// p1-identity-rls (which inherently needs a DB for RLS verification). For now
// these checks ensure the DDL contract from foundation spec §4.4 + §6.1 ships
// intact: length constraints, partial unique indexes, CHECK constraints, FK
// onDelete: Restrict, soft-delete columns where required.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_00 = readFileSync(path.join(ROOT, "prisma/migrations/00_extensions/migration.sql"), "utf8");
const MIG_01 = readFileSync(path.join(ROOT, "prisma/migrations/01_tenancy/migration.sql"), "utf8");

describe("00_extensions migration", () => {
  it("enables pg_trgm + pgcrypto", () => {
    expect(MIG_00).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(MIG_00).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  });
});

describe("01_tenancy — tables", () => {
  it.each(["Tenant", "Campus", "Program", "AcademicYear", "AcademicTerm"])(
    "creates table %s",
    (name) => {
      expect(MIG_01).toMatch(new RegExp(`CREATE TABLE "${name}"`));
    }
  );
});

describe("01_tenancy — length constraints (spec §4.4)", () => {
  it("Tenant.slug VARCHAR(50)", () => {
    expect(MIG_01).toMatch(/"slug" VARCHAR\(50\) NOT NULL/);
  });
  it("Tenant.name VARCHAR(255)", () => {
    expect(MIG_01).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
  });
  it("Campus.code VARCHAR(50)", () => {
    // Campus and Program both use code VARCHAR(50); shared in match.
    expect(MIG_01).toMatch(/"code" VARCHAR\(50\) NOT NULL/);
  });
  it("Campus.phone VARCHAR(20)", () => {
    expect(MIG_01).toMatch(/"phone" VARCHAR\(20\)/);
  });
  it("Campus.email VARCHAR(255)", () => {
    expect(MIG_01).toMatch(/"email" VARCHAR\(255\)/);
  });
  it("Campus.address VARCHAR(500)", () => {
    expect(MIG_01).toMatch(/"address" VARCHAR\(500\)/);
  });
  it("AcademicTerm.code VARCHAR(20)", () => {
    expect(MIG_01).toMatch(/CREATE TABLE "AcademicTerm"[\s\S]*?"code" VARCHAR\(20\) NOT NULL/);
  });
});

describe("01_tenancy — audit columns (spec §4.4)", () => {
  for (const m of ["Campus", "Program", "AcademicYear"]) {
    it(`${m} has createdAt/createdById/updatedAt/updatedById/deletedAt/deletedById`, () => {
      const block = MIG_01.match(new RegExp(`CREATE TABLE "${m}"[^;]+;`, "m"))?.[0] ?? "";
      expect(block).toMatch(/"createdAt" TIMESTAMPTZ/);
      expect(block).toMatch(/"createdById" TEXT/);
      expect(block).toMatch(/"updatedAt" TIMESTAMPTZ/);
      expect(block).toMatch(/"updatedById" TEXT/);
      expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
      expect(block).toMatch(/"deletedById" TEXT/);
    });
  }

  it("AcademicTerm has audit columns but NO deletedAt (terms are immutable)", () => {
    const block = MIG_01.match(/CREATE TABLE "AcademicTerm"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"createdAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"updatedAt" TIMESTAMPTZ/);
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("Tenant has only createdAt + updatedAt (root entity, no soft-delete)", () => {
    const block = MIG_01.match(/CREATE TABLE "Tenant"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"createdAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"updatedAt" TIMESTAMPTZ/);
    expect(block).not.toMatch(/"deletedAt"/);
    expect(block).not.toMatch(/"createdById"/);
  });
});

describe("01_tenancy — partial unique indexes (spec §4.4 + §18.1)", () => {
  it("Tenant.slug full unique index", () => {
    expect(MIG_01).toMatch(/CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"\("slug"\)/);
  });

  it("campus_code_active_unique on (tenantId, code) WHERE deletedAt IS NULL", () => {
    expect(MIG_01).toMatch(
      /CREATE UNIQUE INDEX "campus_code_active_unique"\s+ON "Campus" \("tenantId", "code"\)\s+WHERE "deletedAt" IS NULL/
    );
  });

  it("program_code_active_unique on (tenantId, code) WHERE deletedAt IS NULL", () => {
    expect(MIG_01).toMatch(
      /CREATE UNIQUE INDEX "program_code_active_unique"\s+ON "Program" \("tenantId", "code"\)\s+WHERE "deletedAt" IS NULL/
    );
  });

  it("academic_year_current_unique enforces one isCurrent=true per tenant", () => {
    expect(MIG_01).toMatch(
      /CREATE UNIQUE INDEX "academic_year_current_unique"\s+ON "AcademicYear" \("tenantId"\)\s+WHERE "isCurrent" = true/
    );
  });
});

describe("01_tenancy — CHECK constraints (spec §4.4)", () => {
  it("AcademicYear.startDate < endDate", () => {
    expect(MIG_01).toMatch(
      /CONSTRAINT "academic_year_date_range_check"\s+CHECK \("startDate" < "endDate"\)/
    );
  });

  it("AcademicTerm.startDate < endDate", () => {
    expect(MIG_01).toMatch(
      /CONSTRAINT "academic_term_date_range_check"\s+CHECK \("startDate" < "endDate"\)/
    );
  });
});

describe("01_tenancy — FK cascade rules (spec §4.4 — Restrict for business FKs)", () => {
  it.each([
    ["Campus", "tenantId", "Tenant"],
    ["Program", "tenantId", "Tenant"],
    ["AcademicYear", "tenantId", "Tenant"],
    ["AcademicTerm", "tenantId", "Tenant"],
    ["AcademicTerm", "academicYearId", "AcademicYear"],
  ])("%s.%s → %s ON DELETE RESTRICT", (table, col, ref) => {
    const re = new RegExp(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${col}_fkey" FOREIGN KEY \\("${col}"\\) REFERENCES "${ref}"\\("[^"]+"\\) ON DELETE RESTRICT`
    );
    expect(MIG_01).toMatch(re);
  });
});

describe("01_tenancy — composite indexes (spec §4.4 — tenantId first)", () => {
  it.each([
    ["Campus", "tenantId_code"],
    ["Program", "tenantId_code"],
  ])("%s has %s composite index", (table, suffix) => {
    expect(MIG_01).toMatch(new RegExp(`CREATE INDEX "${table}_${suffix}_idx" ON "${table}"`));
  });
});
