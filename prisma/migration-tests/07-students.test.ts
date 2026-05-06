// Migration post-condition tests — static parse of the 07_students SQL.
// Mirrors the 16-scaffold.test.ts pattern (readFileSync + regex assertions,
// no DB). Asserts the structural invariants documented in the cycle's
// Spec / Tasks (T1 + cycle assumptions 11 + 12):
//   * 4 ENABLE ROW LEVEL SECURITY calls (Household / Student /
//     StudentIdentifier / StudentIdentifierSequence)
//   * >=1 CREATE POLICY per table
//   * Partial-unique guard on StudentIdentifier with verbatim
//     `WHERE "isPrimary" = true AND "deletedAt" IS NULL` clause (assumption 11)
//   * Composite FK shape (id, tenantId) on Student/StudentIdentifier/
//     StudentIdentifierSequence cross-row references (spec §6.4)
//   * storage.objects RLS folded inline: tenant_scoped_storage_select +
//     no_writes_via_postgrest_storage
//   * NO advisory-lock SQL helper function — lock is purely app-layer per
//     assumption 12; lock semantics covered by T3 vitest cases.
//
// Static-only — runs under `npx vitest run` without a live DB.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(
  path.join(ROOT, "prisma/migrations/07_students/migration.sql"),
  "utf8",
);

const TENANT_TABLES = [
  "Household",
  "Student",
  "StudentIdentifier",
  "StudentIdentifierSequence",
] as const;

describe("07_students — RLS coverage (spec §6.3)", () => {
  it.each(TENANT_TABLES)("%s ENABLE ROW LEVEL SECURITY", (table) => {
    expect(SQL).toMatch(
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`),
    );
  });

  it.each(TENANT_TABLES)("%s declares at least one CREATE POLICY", (table) => {
    expect(SQL).toMatch(
      new RegExp(`CREATE POLICY [^\\n]+ ON "${table}"`),
    );
  });

  it("declares exactly 4 ENABLE ROW LEVEL SECURITY calls (one per tenant table)", () => {
    const matches = SQL.match(/ENABLE ROW LEVEL SECURITY/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

describe("07_students — partial-unique PRIMARY guard on StudentIdentifier (assumption 11)", () => {
  it("declares a unique index on StudentIdentifier with the verbatim deletedAt-aware WHERE clause", () => {
    // Assumption 11: WHERE "isPrimary" = true AND "deletedAt" IS NULL —
    // diverges from SessionTeacher's `WHERE "role" = 'PRIMARY'` precedent
    // because soft-deleted primaries must free the slot for re-issue per
    // spec §4.5 NIS history rule.
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?ON "StudentIdentifier"[\s\S]*?WHERE "isPrimary" = true AND "deletedAt" IS NULL/,
    );
  });
});

describe("07_students — composite FK shape (spec §6.4)", () => {
  it("Student → Household uses (id, tenantId) composite", () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \("householdId", "tenantId"\) REFERENCES "Household"\("id", "tenantId"\)/,
    );
  });

  it("Student → Program uses (id, tenantId) composite", () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \("programId", "tenantId"\) REFERENCES "Program"\("id", "tenantId"\)/,
    );
  });

  it("StudentIdentifier → Student uses (id, tenantId) composite", () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \("studentId", "tenantId"\) REFERENCES "Student"\("id", "tenantId"\)/,
    );
  });

  it("StudentIdentifierSequence → AcademicYear uses (id, tenantId) composite", () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \("academicYearId", "tenantId"\) REFERENCES "AcademicYear"\("id", "tenantId"\)/,
    );
  });

  it("StudentIdentifierSequence → Program uses (id, tenantId) composite", () => {
    expect(SQL).toMatch(
      /FOREIGN KEY \("programId", "tenantId"\) REFERENCES "Program"\("id", "tenantId"\)/,
    );
  });
});

describe("07_students — storage.objects policies (folded inline)", () => {
  it("declares tenant_scoped_storage_select on storage.objects", () => {
    expect(SQL).toMatch(
      /CREATE POLICY "tenant_scoped_storage_select" ON storage\.objects/,
    );
  });

  it("declares no_writes_via_postgrest_storage on storage.objects", () => {
    expect(SQL).toMatch(
      /CREATE POLICY "no_writes_via_postgrest_storage" ON storage\.objects/,
    );
  });
});

describe("07_students — no advisory-lock SQL helper (assumption 12)", () => {
  it("does NOT define a pg_advisory_xact_lock wrapper function", () => {
    // The advisory-lock call lives in lib/students/nis-allocator.ts (T3),
    // not in the migration. Asserting absence prevents future drift where
    // someone "helpfully" adds a SQL function that duplicates app-layer logic.
    expect(SQL).not.toMatch(
      /CREATE [^\n]*FUNCTION[^\n]*pg_advisory_xact_lock/i,
    );
  });
});
