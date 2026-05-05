// Migration post-condition tests — static parse of the 04_classes SQL +
// schema.prisma. Mirrors the 09-regions.test.ts + 02-identity.test.ts pattern.
// Asserts the DDL contract from foundation spec §4.1 row "Classes" + §4.4
// conventions + §6.3 RLS + §6.4 composite-FK pattern + p1-regions-seed
// design locks (REVOKE ALL defense-in-depth, NO FORCE ROW LEVEL SECURITY).
//
// Schema-side positive guard: 4 new models MUST carry `tenantId String`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_04 = readFileSync(
  path.join(ROOT, "prisma/migrations/04_classes/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const NEW_TABLES = [
  "ClassSection",
  "Sentra",
  "TeachingDefault",
  "SentraRotation",
] as const;
const SOFT_DELETE_TABLES = new Set<string>(["ClassSection", "Sentra"]);

describe("04_classes — table creation (spec §4.1 Classes row)", () => {
  it.each(NEW_TABLES)("creates table %s", (name) => {
    expect(MIG_04).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it("ClassSection carries audit + version columns per §4.4", () => {
    const block = MIG_04.match(/CREATE TABLE "ClassSection"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"programId" TEXT NOT NULL/);
    expect(block).toMatch(/"academicYearId" TEXT NOT NULL/);
    expect(block).toMatch(/"campusId" TEXT NOT NULL/);
    expect(block).toMatch(/"walasEmployeeId" TEXT(?!,? NOT NULL)/); // nullable
    expect(block).toMatch(/"code" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"displayOrder" INTEGER NOT NULL DEFAULT 0/);
    expect(block).toMatch(/"capacity" INTEGER(?!,? NOT NULL)/);
    expect(block).toMatch(/"version" INTEGER NOT NULL DEFAULT 0/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
  });

  it("Sentra carries catalog columns per §4.3 (CatalogSource enum default SYSTEM)", () => {
    const block = MIG_04.match(/CREATE TABLE "Sentra"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"code" VARCHAR\(50\) NOT NULL/);
    expect(block).toMatch(/"name" VARCHAR\(255\) NOT NULL/);
    expect(block).toMatch(/"source" "CatalogSource" NOT NULL DEFAULT 'SYSTEM'/);
    expect(block).toMatch(/"displayOrder" INTEGER NOT NULL DEFAULT 0/);
    expect(block).toMatch(/"deletedAt" TIMESTAMPTZ/);
  });

  it("TeachingDefault has composite PK (classSectionId, academicTermId, sentraId, tenantId), no soft-delete", () => {
    const block = MIG_04.match(/CREATE TABLE "TeachingDefault"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"employeeId" TEXT NOT NULL/);
    expect(block).toMatch(
      /CONSTRAINT "TeachingDefault_pkey" PRIMARY KEY \("classSectionId", "academicTermId", "sentraId", "tenantId"\)/,
    );
    expect(block).not.toMatch(/"deletedAt"/);
    expect(block).not.toMatch(/"updatedAt"/);
  });

  it("SentraRotation has composite PK + dayOfWeek CHECK constraint inline", () => {
    const block = MIG_04.match(/CREATE TABLE "SentraRotation"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"dayOfWeek" INTEGER NOT NULL/);
    expect(block).toMatch(
      /CONSTRAINT "SentraRotation_pkey" PRIMARY KEY \("classSectionId", "dayOfWeek", "academicTermId", "tenantId"\)/,
    );
    // CHECK declared inline within CREATE TABLE — match the inline form,
    // not the deferred ALTER TABLE form.
    expect(block).toMatch(
      /CONSTRAINT "SentraRotation_dayOfWeek_check" CHECK \("dayOfWeek" BETWEEN 1 AND 7\)/,
    );
    expect(block).not.toMatch(/"deletedAt"/);
  });
});

describe("04_classes — composite uniques + backfills (FK targets per §6.4)", () => {
  it("ClassSection has composite unique (id, tenantId)", () => {
    expect(MIG_04).toMatch(
      /CREATE UNIQUE INDEX "ClassSection_id_tenantId_key" ON "ClassSection"\("id", "tenantId"\)/,
    );
  });

  it("Sentra has composite unique (id, tenantId)", () => {
    expect(MIG_04).toMatch(
      /CREATE UNIQUE INDEX "Sentra_id_tenantId_key" ON "Sentra"\("id", "tenantId"\)/,
    );
  });

  it.each(["Program", "AcademicYear", "AcademicTerm"])(
    "%s composite unique (id, tenantId) backfilled (was missing — predates §6.4)",
    (parent) => {
      expect(MIG_04).toMatch(
        new RegExp(
          `CREATE UNIQUE INDEX "${parent}_id_tenantId_key" ON "${parent}"\\("id", "tenantId"\\)`,
        ),
      );
    },
  );
});

describe("04_classes — partial uniques per §4.4", () => {
  it("class_section_code_active_unique on (tenantId, academicYearId, code) WHERE deletedAt IS NULL", () => {
    expect(MIG_04).toMatch(
      /CREATE UNIQUE INDEX "class_section_code_active_unique"[\s\S]*?ON "ClassSection" \("tenantId", "academicYearId", "code"\)[\s\S]*?WHERE "deletedAt" IS NULL/,
    );
  });

  it("sentra_code_active_unique on (tenantId, code) WHERE deletedAt IS NULL", () => {
    expect(MIG_04).toMatch(
      /CREATE UNIQUE INDEX "sentra_code_active_unique"[\s\S]*?ON "Sentra" \("tenantId", "code"\)[\s\S]*?WHERE "deletedAt" IS NULL/,
    );
  });
});

describe("04_classes — composite-FK chain per §6.4", () => {
  // Direct Tenant FKs on root entities (not join tables)
  it("ClassSection.tenantId → Tenant(id) Restrict (root entity, direct Tenant FK)", () => {
    expect(MIG_04).toMatch(
      /ALTER TABLE "ClassSection"[\s\S]*?ADD CONSTRAINT "ClassSection_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE/,
    );
  });

  it("Sentra.tenantId → Tenant(id) Restrict (root entity, direct Tenant FK)", () => {
    expect(MIG_04).toMatch(
      /ALTER TABLE "Sentra"[\s\S]*?ADD CONSTRAINT "Sentra_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE/,
    );
  });

  // ClassSection → parents Restrict (catalog protection)
  it.each([
    ["ClassSection", "programId", "Program"],
    ["ClassSection", "academicYearId", "AcademicYear"],
    ["ClassSection", "campusId", "Campus"],
  ])("%s.(%s, tenantId) → %s(id, tenantId) Restrict", (child, col, parent) => {
    const fkPattern = new RegExp(
      `ALTER TABLE "${child}"[\\s\\S]*?ADD CONSTRAINT "${child}_${col}_tenantId_fkey"[\\s\\S]*?FOREIGN KEY \\("${col}", "tenantId"\\) REFERENCES "${parent}"\\("id", "tenantId"\\)[\\s\\S]*?ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    expect(MIG_04).toMatch(fkPattern);
  });

  it("ClassSection.walasEmployeeId → Employee(id) SET NULL (single-col, column FK per §6.4)", () => {
    expect(MIG_04).toMatch(
      /ALTER TABLE "ClassSection"[\s\S]*?ADD CONSTRAINT "ClassSection_walasEmployeeId_fkey"[\s\S]*?FOREIGN KEY \("walasEmployeeId"\) REFERENCES "Employee"\("id"\)[\s\S]*?ON DELETE SET NULL ON UPDATE CASCADE/,
    );
  });

  // Join tables → parents Cascade (owned children)
  it.each([
    ["TeachingDefault", "classSectionId", "ClassSection"],
    ["TeachingDefault", "academicTermId", "AcademicTerm"],
    ["TeachingDefault", "sentraId", "Sentra"],
    ["TeachingDefault", "employeeId", "Employee"],
    ["SentraRotation", "classSectionId", "ClassSection"],
    ["SentraRotation", "academicTermId", "AcademicTerm"],
    ["SentraRotation", "sentraId", "Sentra"],
  ])("%s.(%s, tenantId) → %s(id, tenantId) Cascade", (child, col, parent) => {
    const fkPattern = new RegExp(
      `ALTER TABLE "${child}"[\\s\\S]*?ADD CONSTRAINT "${child}_${col}_tenantId_fkey"[\\s\\S]*?FOREIGN KEY \\("${col}", "tenantId"\\) REFERENCES "${parent}"\\("id", "tenantId"\\)[\\s\\S]*?ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    expect(MIG_04).toMatch(fkPattern);
  });

  it.each(["TeachingDefault", "SentraRotation"])(
    "%s has NO separate Tenant FK (composite chain enforces alignment)",
    (table) => {
      expect(MIG_04).not.toMatch(
        new RegExp(`ADD CONSTRAINT "${table}_tenantId_fkey"`),
      );
    },
  );
});

describe("04_classes — RLS coverage (spec §6.3)", () => {
  it.each(NEW_TABLES)("%s ENABLE ROW LEVEL SECURITY", (name) => {
    expect(MIG_04).toMatch(new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`));
  });

  it.each(NEW_TABLES)("%s REVOKE ALL FROM anon, authenticated (defense-in-depth)", (name) => {
    expect(MIG_04).toMatch(
      new RegExp(`REVOKE ALL ON "${name}" FROM anon, authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s GRANT SELECT TO authenticated", (name) => {
    expect(MIG_04).toMatch(
      new RegExp(`GRANT SELECT ON "${name}" TO authenticated(?!,)`),
    );
  });

  it.each(NEW_TABLES)("%s carries tenant_isolation_select policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?FOR SELECT TO authenticated[\\s\\S]*?USING \\([\\s\\S]*?"tenantId" = \\(current_setting\\('request.jwt.claims', true\\)::json->>'tenant_id'\\)`,
    );
    expect(MIG_04).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s carries no_writes_via_postgrest policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${name}"[\\s\\S]*?FOR ALL TO anon, authenticated[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_04).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s tenant_isolation_select includes deletedAt clause iff soft-delete", (name) => {
    const policyBlock = MIG_04.match(
      new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`),
    )?.[0] ?? "";
    if (SOFT_DELETE_TABLES.has(name)) {
      expect(policyBlock).toMatch(/AND "deletedAt" IS NULL/);
    } else {
      expect(policyBlock).not.toMatch(/AND "deletedAt" IS NULL/);
    }
  });

  // Design lock per p1-regions-seed.
  it.each(NEW_TABLES)("%s does NOT FORCE ROW LEVEL SECURITY", (name) => {
    expect(MIG_04).not.toMatch(
      new RegExp(`ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("04_classes — schema guard: positive tenantId presence", () => {
  it.each(NEW_TABLES)("model %s declares a tenantId String field", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\btenantId\s+String\b/);
  });
});

describe("04_classes — section ordering sanity", () => {
  it("CREATE TABLE comes before any ALTER TABLE", () => {
    const lastTable = MIG_04.lastIndexOf("CREATE TABLE ");
    const firstAlter = MIG_04.indexOf("ALTER TABLE ");
    expect(lastTable).toBeGreaterThan(-1);
    expect(firstAlter).toBeGreaterThan(lastTable);
  });

  it.each(["Program", "AcademicYear", "AcademicTerm"])(
    "%s_id_tenantId_key backfill index appears before any ClassSection FK that references it",
    (parent) => {
      const backfillIdx = MIG_04.indexOf(`"${parent}_id_tenantId_key"`);
      // ClassSection composite FK to programId/academicYearId is only one;
      // other parents (campusId backfilled in 03_employees) are in scope here
      // for AcademicTerm via TeachingDefault/SentraRotation FKs.
      const colName = parent === "Program"
        ? "programId"
        : parent === "AcademicYear"
          ? "academicYearId"
          : "academicTermId";
      const fkIdx = MIG_04.indexOf(`_${colName}_tenantId_fkey"`);
      expect(backfillIdx).toBeGreaterThan(-1);
      expect(fkIdx).toBeGreaterThan(backfillIdx);
    },
  );

  it("RLS block comes after all FK constraints", () => {
    const lastFk = MIG_04.lastIndexOf("ADD CONSTRAINT");
    const firstRls = MIG_04.indexOf("ENABLE ROW LEVEL SECURITY");
    expect(lastFk).toBeGreaterThan(-1);
    expect(firstRls).toBeGreaterThan(lastFk);
  });
});
