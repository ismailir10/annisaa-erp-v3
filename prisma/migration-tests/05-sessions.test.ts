// Migration post-condition tests — static parse of the 05_sessions SQL +
// schema.prisma. Mirrors the 09-regions.test.ts + 02-identity.test.ts pattern.
// Asserts the DDL contract from foundation spec §4.1 row "Sessions" + §4.2
// SessionStatus + SessionTeacherRole enums + §4.5 "PRIMARY/SUBSTITUTE/SENTRA/
// ASSISTANT" verbatim + §6.3 RLS + §6.4 composite-FK pattern + p1-regions-seed
// design locks.
//
// Schema-side positive guard: ClassSession + SessionTeacher MUST carry
// `tenantId String`.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const MIG_05 = readFileSync(
  path.join(ROOT, "prisma/migrations/05_sessions/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

const NEW_TABLES = ["ClassSession", "SessionTeacher"] as const;
// Neither ClassSession nor SessionTeacher carries soft-delete (operational +
// owned-child join). Both omit deletedAt clause from tenant_isolation_select.

describe("05_sessions — enums (spec §4.2 + §4.5)", () => {
  it("creates SessionStatus enum (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)", () => {
    expect(MIG_05).toMatch(
      /CREATE TYPE "SessionStatus" AS ENUM \('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'\)/,
    );
  });

  it("creates SessionTeacherRole enum (PRIMARY, SUBSTITUTE, SENTRA, ASSISTANT) — verbatim spec §4.5", () => {
    expect(MIG_05).toMatch(
      /CREATE TYPE "SessionTeacherRole" AS ENUM \('PRIMARY', 'SUBSTITUTE', 'SENTRA', 'ASSISTANT'\)/,
    );
  });
});

describe("05_sessions — table creation (spec §4.1 Sessions row)", () => {
  it.each(NEW_TABLES)("creates table %s", (name) => {
    expect(MIG_05).toMatch(new RegExp(`CREATE TABLE "${name}"`));
  });

  it("ClassSession carries operational + version columns + dayOfWeek CHECK inline", () => {
    const block = MIG_05.match(/CREATE TABLE "ClassSession"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"id" TEXT NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"classSectionId" TEXT NOT NULL/);
    expect(block).toMatch(/"academicTermId" TEXT NOT NULL/);
    expect(block).toMatch(/"sessionDate" DATE NOT NULL/);
    expect(block).toMatch(/"dayOfWeek" INTEGER NOT NULL/);
    expect(block).toMatch(/"sentraId" TEXT(?!,? NOT NULL)/); // nullable denorm
    expect(block).toMatch(/"status" "SessionStatus" NOT NULL DEFAULT 'PLANNED'/);
    expect(block).toMatch(/"startedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"completedAt" TIMESTAMPTZ/);
    expect(block).toMatch(/"notes" VARCHAR\(2000\)/);
    expect(block).toMatch(/"version" INTEGER NOT NULL DEFAULT 0/);
    // CHECK declared inline within CREATE TABLE — match inline form.
    expect(block).toMatch(
      /CONSTRAINT "ClassSession_dayOfWeek_check" CHECK \("dayOfWeek" BETWEEN 1 AND 7\)/,
    );
    // ClassSession is operational — NO soft-delete.
    expect(block).not.toMatch(/"deletedAt"/);
  });

  it("SessionTeacher carries composite PK (sessionId, employeeId, role, tenantId), no soft-delete", () => {
    const block = MIG_05.match(/CREATE TABLE "SessionTeacher"[^;]+;/m)?.[0] ?? "";
    expect(block).toMatch(/"sessionId" TEXT NOT NULL/);
    expect(block).toMatch(/"employeeId" TEXT NOT NULL/);
    expect(block).toMatch(/"role" "SessionTeacherRole" NOT NULL/);
    expect(block).toMatch(/"tenantId" TEXT NOT NULL/);
    expect(block).toMatch(/"assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    expect(block).toMatch(
      /CONSTRAINT "SessionTeacher_pkey" PRIMARY KEY \("sessionId", "employeeId", "role", "tenantId"\)/,
    );
    expect(block).not.toMatch(/"deletedAt"/);
    expect(block).not.toMatch(/"updatedAt"/);
  });
});

describe("05_sessions — composite uniques (FK targets per §6.4)", () => {
  it("ClassSession has composite unique (id, tenantId)", () => {
    expect(MIG_05).toMatch(
      /CREATE UNIQUE INDEX "ClassSession_id_tenantId_key" ON "ClassSession"\("id", "tenantId"\)/,
    );
  });
});

describe("05_sessions — partial + full uniques", () => {
  it("class_session_class_date_active_unique — full unique (no soft-delete on ClassSession)", () => {
    // Full unique (no WHERE clause). Match the index header without WHERE.
    expect(MIG_05).toMatch(
      /CREATE UNIQUE INDEX "class_session_class_date_active_unique"\s+ON "ClassSession" \("tenantId", "classSectionId", "sessionDate"\);/,
    );
  });

  it("session_teacher_primary_unique — partial unique WHERE role = 'PRIMARY' (single-PRIMARY-per-session DB guard)", () => {
    expect(MIG_05).toMatch(
      /CREATE UNIQUE INDEX "session_teacher_primary_unique"[\s\S]*?ON "SessionTeacher" \("sessionId", "tenantId"\)[\s\S]*?WHERE "role" = 'PRIMARY'/,
    );
  });
});

describe("05_sessions — lookup indexes (incl. ClassSession_tenantId_academicTermId_idx fix)", () => {
  it.each([
    ["ClassSession_tenantId_idx", "ClassSession", `"tenantId"`],
    ["ClassSession_tenantId_academicTermId_idx", "ClassSession", `"tenantId", "academicTermId"`],
    ["ClassSession_tenantId_sessionDate_idx", "ClassSession", `"tenantId", "sessionDate"`],
    [
      "ClassSession_tenantId_classSectionId_sessionDate_idx",
      "ClassSession",
      `"tenantId", "classSectionId", "sessionDate"`,
    ],
    ["ClassSession_tenantId_status_idx", "ClassSession", `"tenantId", "status"`],
    ["ClassSession_sentraId_tenantId_idx", "ClassSession", `"sentraId", "tenantId"`],
    ["SessionTeacher_tenantId_idx", "SessionTeacher", `"tenantId"`],
    ["SessionTeacher_employeeId_tenantId_idx", "SessionTeacher", `"employeeId", "tenantId"`],
  ])("%s — index on %s(%s)", (idx, table, cols) => {
    const escapedCols = cols.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(MIG_05).toMatch(
      new RegExp(`CREATE INDEX "${idx}" ON "${table}"\\(${escapedCols}\\)`),
    );
  });
});

describe("05_sessions — foreign keys", () => {
  it("ClassSession.tenantId → Tenant(id) Restrict", () => {
    expect(MIG_05).toMatch(
      /ALTER TABLE "ClassSession"[\s\S]*?ADD CONSTRAINT "ClassSession_tenantId_fkey"[\s\S]*?FOREIGN KEY \("tenantId"\) REFERENCES "Tenant"\("id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE/,
    );
  });

  it.each([
    ["classSectionId", "ClassSection"],
    ["academicTermId", "AcademicTerm"],
  ])("ClassSession.(%s, tenantId) → %s(id, tenantId) Restrict", (col, parent) => {
    const fkPattern = new RegExp(
      `ALTER TABLE "ClassSession"[\\s\\S]*?ADD CONSTRAINT "ClassSession_${col}_tenantId_fkey"[\\s\\S]*?FOREIGN KEY \\("${col}", "tenantId"\\) REFERENCES "${parent}"\\("id", "tenantId"\\)[\\s\\S]*?ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    expect(MIG_05).toMatch(fkPattern);
  });

  it("ClassSession.sentraId → Sentra(id) SET NULL (single-col denorm column FK per §6.4)", () => {
    expect(MIG_05).toMatch(
      /ALTER TABLE "ClassSession"[\s\S]*?ADD CONSTRAINT "ClassSession_sentraId_fkey"[\s\S]*?FOREIGN KEY \("sentraId"\) REFERENCES "Sentra"\("id"\)[\s\S]*?ON DELETE SET NULL ON UPDATE CASCADE/,
    );
  });

  it.each([
    ["sessionId", "ClassSession"],
    ["employeeId", "Employee"],
  ])("SessionTeacher.(%s, tenantId) → %s(id, tenantId) Cascade", (col, parent) => {
    const fkPattern = new RegExp(
      `ALTER TABLE "SessionTeacher"[\\s\\S]*?ADD CONSTRAINT "SessionTeacher_${col}_tenantId_fkey"[\\s\\S]*?FOREIGN KEY \\("${col}", "tenantId"\\) REFERENCES "${parent}"\\("id", "tenantId"\\)[\\s\\S]*?ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    expect(MIG_05).toMatch(fkPattern);
  });

  it("SessionTeacher has NO separate Tenant FK (composite chain enforces alignment per §6.4)", () => {
    expect(MIG_05).not.toMatch(/ADD CONSTRAINT "SessionTeacher_tenantId_fkey"/);
  });
});

describe("05_sessions — RLS coverage (spec §6.3)", () => {
  it.each(NEW_TABLES)("%s ENABLE ROW LEVEL SECURITY", (name) => {
    expect(MIG_05).toMatch(new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`));
  });

  it.each(NEW_TABLES)("%s REVOKE ALL FROM anon, authenticated (defense-in-depth)", (name) => {
    expect(MIG_05).toMatch(
      new RegExp(`REVOKE ALL ON "${name}" FROM anon, authenticated`),
    );
  });

  it.each(NEW_TABLES)("%s GRANT SELECT TO authenticated", (name) => {
    expect(MIG_05).toMatch(
      new RegExp(`GRANT SELECT ON "${name}" TO authenticated(?!,)`),
    );
  });

  it.each(NEW_TABLES)("%s carries tenant_isolation_select policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?FOR SELECT TO authenticated[\\s\\S]*?USING \\([\\s\\S]*?"tenantId" = \\(current_setting\\('request.jwt.claims', true\\)::json->>'tenant_id'\\)`,
    );
    expect(MIG_05).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s carries no_writes_via_postgrest policy", (name) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${name}"[\\s\\S]*?FOR ALL TO anon, authenticated[\\s\\S]*?USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(MIG_05).toMatch(policyPattern);
  });

  it.each(NEW_TABLES)("%s tenant_isolation_select OMITS deletedAt clause (no soft-delete)", (name) => {
    const policyBlock = MIG_05.match(
      new RegExp(`CREATE POLICY "tenant_isolation_select" ON "${name}"[\\s\\S]*?(?=CREATE POLICY "no_writes_via_postgrest")`),
    )?.[0] ?? "";
    expect(policyBlock).not.toMatch(/AND "deletedAt" IS NULL/);
  });

  // Design lock per p1-regions-seed.
  it.each(NEW_TABLES)("%s does NOT FORCE ROW LEVEL SECURITY", (name) => {
    expect(MIG_05).not.toMatch(
      new RegExp(`ALTER TABLE "${name}" FORCE ROW LEVEL SECURITY`),
    );
  });
});

describe("05_sessions — schema guard: positive tenantId presence", () => {
  it.each(NEW_TABLES)("model %s declares a tenantId String field", (name) => {
    const modelPattern = new RegExp(`model ${name}\\s*\\{[^}]+\\}`, "s");
    const block = SCHEMA.match(modelPattern)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\btenantId\s+String\b/);
  });
});

describe("05_sessions — section ordering sanity", () => {
  it("CREATE TYPE comes before CREATE TABLE", () => {
    const lastType = MIG_05.lastIndexOf('CREATE TYPE "SessionTeacherRole"');
    const firstTable = MIG_05.indexOf('CREATE TABLE "ClassSession"');
    expect(lastType).toBeGreaterThan(-1);
    expect(firstTable).toBeGreaterThan(lastType);
  });

  it("CREATE TABLE comes before any ALTER TABLE FK + RLS", () => {
    const lastTable = MIG_05.lastIndexOf('CREATE TABLE "SessionTeacher"');
    const firstFk = MIG_05.indexOf("ADD CONSTRAINT");
    const firstRls = MIG_05.indexOf("ENABLE ROW LEVEL SECURITY");
    expect(firstFk).toBeGreaterThan(lastTable);
    expect(firstRls).toBeGreaterThan(firstFk);
  });

  it("ClassSession_id_tenantId_key index appears before SessionTeacher composite FK to ClassSession", () => {
    const uniqIdx = MIG_05.indexOf('"ClassSession_id_tenantId_key"');
    const fkIdx = MIG_05.indexOf('"SessionTeacher_sessionId_tenantId_fkey"');
    expect(uniqIdx).toBeGreaterThan(-1);
    expect(fkIdx).toBeGreaterThan(uniqIdx);
  });
});
