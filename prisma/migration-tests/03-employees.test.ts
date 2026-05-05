// Migration post-condition tests — static parse of the 03_employees SQL +
// schema.prisma. Mirrors the 09-regions.test.ts + 02-identity.test.ts pattern.
// Asserts the DDL contract from foundation spec §4.1 row "Org" + §4.4
// conventions + §6.3 RLS + §6.4 composite-FK pattern + p1-regions-seed
// design locks (REVOKE ALL defense-in-depth, NO FORCE ROW LEVEL SECURITY).
//
// Schema-side positive guard: Employee + EmployeeCampusAssignment MUST carry
// `tenantId String` so verify-rls-coverage.sh strict-mode picks them up.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_03 = readFileSync(
  path.join(ROOT, "prisma/migrations/03_employees/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const NEW_TABLES = ["Employee", "EmployeeCampusAssignment"] as const;
const SOFT_DELETE_TABLES = new Set<string>(["Employee"]);

describe("03_employees — table creation (spec §4.1 Org row)", () => {
  it.each(NEW_TABLES)("creates table %s", (name) => {
    expect(MIG_03).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it("Employee carries audit + version columns per §4.4", () => {
    const block = MIG_03.match(/CREATE TABLE "Employee"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"email" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"nik" VARCHAR\(16\)/); // PII — nullable
    expect(block).toMatch(/"phone" VARCHAR\(20\)/);
    expect(block).toMatch(/"jobTitle" VARCHAR\(50\)/);
    expect(block).toMatch(/"supabaseUserId" VARCHAR\(255\)/);
    expect(block).toMatch(/"googleSubjectId" VARCHAR\(255\)/);
    expect(block).toMatch(/"isActive" BOOLEAN NOT NULL DEFAULT true/);
    expect(block).toMatch(/"hiredAt" DATE/);
    expect(block).toMatch(/"terminatedAt" DATE/);
    expect(block).toMatch(/"version" INTEGER NOT NULL DEFAULT 0/);
    expect(block).toMatch(/"createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    expect(block).toMatch(/"createdById" TEXT/);
    expect(block).toMatch(/"updatedAt" TIMESTAMPTZ NOT NULL/);
    expect(block).toMatch(/"updatedById" TEXT/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"deletedById" TEXT/);
  });

  it("EmployeeCampusAssignment carries composite PK + assignment columns (no soft-delete)", () => {
    const block = MIG_03.match(/CREATE TABLE "EmployeeCampusAssignment"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"employeeId" TEXT NOT NULL/);
    expect(block).toMatch(/"campusId" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"role" VARCHAR\(50\)/);
    expect(block).toMatch(/"isPrimary" BOOLEAN NOT NULL DEFAULT true/);
    expect(block).toMatch(/"startDate" DATE NOT NULL/);
    expect(block).toMatch(/"endDate" DATE/);
    expect(block).toMatch(
      /CONSTRAINT "EmployeeCampusAssignment_pkey" PRIMARY KEY \("employeeId", "campusId", "tenantId"\)/,
    );
    expect(block).not.toMatch(/"deletedAt"/);
    expect(block).not.toMatch(/"updatedAt"/);
  });
});

describe("03_employees — composite uniques (FK targets per §6.4)", () => {
  it("Employee has composite unique (id, tenantId)", () => {
    expect(MIG_03).toMatch(
      /CREATE UNIQUE INDEX "Employee_id_tenantId_key" ON "Employee"\("id", "tenantId"\)/,
    );
  });

  it("Campus composite unique (id, tenantId) backfilled (was missing — 01_tenancy precedes §6.4)", () => {
    expect(MIG_03).toMatch(
      /CREATE UNIQUE INDEX "Campus_id_tenantId_key" ON "Campus"\("id", "tenantId"\)/,
    );
  });
});

describe("03_employees — lookup indexes", () => {
  it.each([
    ["Employee_tenantId_idx", "Employee", `"tenantId"`],
    ["Employee_tenantId_supabaseUserId_idx", "Employee", `"tenantId", "supabaseUserId"`],
    ["Employee_tenantId_googleSubjectId_idx", "Employee", `"tenantId", "googleSubjectId"`],
    ["Employee_tenantId_isActive_idx", "Employee", `"tenantId", "isActive"`],
    ["EmployeeCampusAssignment_tenantId_idx", "EmployeeCampusAssignment", `"tenantId"`],
    [
      "EmployeeCampusAssignment_campusId_tenantId_idx",
      "EmployeeCampusAssignment",
      `"campusId", "tenantId"`,
    ],
  ])("%s — index on %s(%s)", (idx, table, cols) => {
    const escapedCols = cols.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(MIG_03).toMatch(
      new RegExp(`CREATE INDEX "${idx}" ON "${table}"\\(${escapedCols}\\)`),
    );
  });
});

describe("03_employees — partial uniques per §4.4", () => {
  it("employee_email_active_unique on (tenantId, email) WHERE deletedAt IS NULL", () => {
    expect(MIG_03).toMatch(
      /CREATE UNIQUE INDEX "employee_email_active_unique"[\s\S]*?ON "Employee" \("tenantId", "email"\)[\s\S]*?WHERE "deletedAt" IS NULL/,
    );
  });

  it("employee_nik_active_unique on (tenantId, nik) WHERE deletedAt IS NULL AND nik IS NOT NULL", () => {
    expect(MIG_03).toMatch(
      /CREATE UNIQUE INDEX "employee_nik_active_unique"[\s\S]*?ON "Employee" \("tenantId", "nik"\)[\s\S]*?WHERE "deletedAt" IS NULL AND "nik" IS NOT NULL/,
    );
  });
});

describe("03_employees — foreign keys", () => {
  it("Employee.tenantId → Tenant(id) Restrict + Cascade-update", () => {
    expect(MIG_03).toMatch(
      /ALTER TABLE "Employee"[\s\S]*?ADD CONSTRAINT "Employee_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE/,
    );
  });

  it("EmployeeCampusAssignment.(employeeId, tenantId) → Employee(id, tenantId) Cascade", () => {
    expect(MIG_03).toMatch(
      /ALTER TABLE "EmployeeCampusAssignment"[\s\S]*?ADD CONSTRAINT "EmployeeCampusAssignment_employeeId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("employeeId", "tenantId"\) REFERENCES "Employee"\("id", "tenantId"\)[\s\S]*?ON DELETE CASCADE ON UPDATE CASCADE/,
    );
  });

  it("EmployeeCampusAssignment.(campusId, tenantId) → Campus(id, tenantId) Cascade", () => {
    expect(MIG_03).toMatch(
      /ALTER TABLE "EmployeeCampusAssignment"[\s\S]*?ADD CONSTRAINT "EmployeeCampusAssignment_campusId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("campusId", "tenantId"\) REFERENCES "Campus"\("id", "tenantId"\)[\s\S]*?ON DELETE CASCADE ON UPDATE CASCADE/,
    );
  });

  it("Program.headEmployeeId → Employee(id) SET NULL (wired up — was dangling since 01_tenancy)", () => {
    expect(MIG_03).toMatch(
      /ALTER TABLE "Program"[\s\S]*?ADD CONSTRAINT "Program_headEmployeeId_fkey"[\s\S]*?FOREIGN KEY \("headEmployeeId"\) REFERENCES "Employee"\("id"\)[\s\S]*?ON DELETE SET NULL ON UPDATE CASCADE/,
    );
  });

  it("EmployeeCampusAssignment has NO separate Tenant FK (composite chain enforces alignment per §6.4)", () => {
    expect(MIG_03).not.toMatch(
      /ADD CONSTRAINT "EmployeeCampusAssignment_tenantId_fkey"/,
    );
  });
});

describe("03_employees — RLS coverage (spec §6.3)", () => {
  it.each(NEW_TABLES)("%s ENABLE ROW LEVEL SECURITY", (name) => {
    expect(MIG_03).toMatch(new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`));
  });

  it.each(NEW_TABLES)("%s REVOKE ALL FROM anon, authenticated (defense-in-depth)", (name) => {
    expect(MIG_03).toMatch(
      new RegExp(`REVOKE ALL ON "${name}" FROM anon, authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s GRANT SELECT TO authenticated", (name) => {
    expect(MIG_03).toMatch(
      new RegExp(`GRANT SELECT ON "${name}" TO authenticated(?!,)`),
    );
  });

  it.each(NEW_TABLES)("%s carries tenant_isolation_select policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?FOR SELECT TO authenticated[\\s\\S]*?USING \\([\\s\\S]*?"tenantId" = \\(current_setting\\('request.jwt.claims', true\\)::json->>'tenant_id'\\)`,
    );
    expect(MIG_03).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s carries no_writes_via_postgrest policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${name}"[\\s\\S]*?FOR ALL TO anon, authenticated[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_03).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s tenant_isolation_select includes deletedAt clause iff soft-delete", (name) => {
    const policyBlock = MIG_03.match(
      new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`),
    )?.[0] ?? "";
    if (SOFT_DELETE_TABLES.has(name)) {
      expect(policyBlock).toMatch(/AND "deletedAt" IS NULL/);
    } else {
      expect(policyBlock).not.toMatch(/AND "deletedAt" IS NULL/);
    }
  });

  // Design lock per p1-regions-seed: NO FORCE ROW LEVEL SECURITY (service-role
  // seed must bypass RLS). Mechanically enforce so a future migration cannot
  // silently break the seed at re-apply.
  it.each(NEW_TABLES)("%s does NOT FORCE ROW LEVEL SECURITY", (name) => {
    expect(MIG_03).not.toMatch(
      new RegExp(`ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("03_employees — schema guard: positive tenantId presence", () => {
  // Why: scripts/verify-rls-coverage.sh picks the tenant-scoped model set by
  // grepping `tenantId String` fields from schema.prisma. These tables MUST
  // be tenant-scoped — strict-mode count breaks if any are missed.
  it.each(NEW_TABLES)("model %s declares a tenantId String field", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\btenantId\s+String\b/);
  });
});

describe("03_employees — section ordering sanity", () => {
  it("CREATE TABLE comes before any ALTER TABLE", () => {
    const lastTable = MIG_03.lastIndexOf("CREATE TABLE ");
    const firstAlter = MIG_03.indexOf("ALTER TABLE ");
    expect(lastTable).toBeGreaterThan(-1);
    expect(firstAlter).toBeGreaterThan(lastTable);
  });

  it("Campus_id_tenantId_key backfill comes before EmployeeCampusAssignment composite FK to Campus", () => {
    const backfillIdx = MIG_03.indexOf('"Campus_id_tenantId_key"');
    const fkIdx = MIG_03.indexOf('"EmployeeCampusAssignment_campusId_tenantId_fkey"');
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(fkIdx).toBeGreaterThan(backfillIdx);
  });

  it("RLS block comes after all FK constraints", () => {
    const lastFk = MIG_03.lastIndexOf("ADD CONSTRAINT");
    const firstRls = MIG_03.indexOf("ENABLE ROW LEVEL SECURITY");
    expect(lastFk).toBeGreaterThan(-1);
    expect(firstRls).toBeGreaterThan(lastFk);
  });
});
