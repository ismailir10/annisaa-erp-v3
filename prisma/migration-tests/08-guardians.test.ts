// Migration post-condition tests — static parse of the 08_guardians SQL.
// Mirrors the 07-students.test.ts pattern (readFileSync + regex assertions,
// no DB). Asserts the structural invariants documented in the cycle's
// Spec / Tasks (T1 + cycle assumptions 1, 2, 5, 7, 8, 9, 11):
//   * 3 ENABLE ROW LEVEL SECURITY calls (Guardian / StudentGuardian /
//     GuardianInvitation)
//   * >=1 CREATE POLICY per table
//   * Partial-unique PRIMARY guard on StudentGuardian — relationship-scoped
//     `("studentId", "tenantId", "relationship")` + verbatim
//     `WHERE "isPrimary" = true AND "deletedAt" IS NULL` (assumption 8)
//   * Composite FK shape (id, tenantId) per spec §6.4 — Guardian → User,
//     StudentGuardian → Student/Guardian, GuardianInvitation → Student/Guardian
//   * Column-list `SET NULL ("userId")` on Guardian.userId composite FK
//     (assumption 5; Postgres 15.4+ syntax)
//   * Token global unique — `CREATE UNIQUE INDEX
//     "GuardianInvitation_token_key" ON "GuardianInvitation"("token")` —
//     no partial WHERE (assumption 2)
//   * storage.objects RLS NOT re-added (assumption 11) — DDL-shape negative
//     assertions only (header comment block intentionally references
//     storage.objects as prose, so a bare-mention regex would false-positive)
//   * NO advisory-lock SQL helper function (assumption 9)
//
// Static-only — runs under `npx vitest run` without a live DB.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(
  path.join(ROOT, "prisma/migrations/08_guardians/migration.sql"),
  "utf8",
);

// DDL-only view: strips both `/* ... */` block comments and full-line `--`
// comments. Used by the storage.objects negative assertions so prose references
// inside any comment form don't false-positive against regexes designed to
// detect actual DDL statements. (The current migration uses only `--` line
// comments, but block-comment stripping closes a latent gap if a future editor
// switches forms.)
const SQL_DDL = SQL.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");

const TENANT_TABLES = [
  "Guardian",
  "StudentGuardian",
  "GuardianInvitation",
] as const;

describe("08_guardians — RLS coverage (spec §6.3)", () => {
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

  it("declares exactly 3 ENABLE ROW LEVEL SECURITY calls (one per tenant table)", () => {
    const matches = SQL.match(/ENABLE ROW LEVEL SECURITY/g) ?? [];
    expect(matches.length).toBe(3);
  });
});

describe("08_guardians — relationship-scoped partial-unique PRIMARY guard on StudentGuardian (assumption 8)", () => {
  it("declares index name + scope + WHERE clause as one chained statement", () => {
    // Single chained regex (mirrors migration 07's `StudentIdentifier_singlePrimary_key`
    // assertion shape) — binds index name, scope columns, and partial WHERE
    // clause to the same CREATE UNIQUE INDEX statement so a future migration
    // can't satisfy them via scattered fragments across separate statements.
    //
    // Relationship-scoped form (per assumption 8) — diverges from migration
    // 07's StudentIdentifier global-PRIMARY guard so PRIMARY FATHER + PRIMARY
    // MOTHER coexist for two-parent families. deletedAt-aware so an ended
    // relationship's PRIMARY slot frees up.
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX "StudentGuardian_singlePrimaryPerRelationship_key"[\s\S]*?ON "StudentGuardian" \("studentId", "tenantId", "relationship"\)[\s\S]*?WHERE "isPrimary" = true AND "deletedAt" IS NULL/,
    );
  });
});

describe("08_guardians — composite FK shape (spec §6.4)", () => {
  it("Guardian → User uses (userId, tenantId) composite", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "Guardian_userId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("userId", "tenantId"\) REFERENCES "User"\("id", "tenantId"\)/,
    );
  });

  it("StudentGuardian → Student uses (studentId, tenantId) composite", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "StudentGuardian_studentId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("studentId", "tenantId"\) REFERENCES "Student"\("id", "tenantId"\)/,
    );
  });

  it("StudentGuardian → Guardian uses (guardianId, tenantId) composite", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "StudentGuardian_guardianId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("guardianId", "tenantId"\) REFERENCES "Guardian"\("id", "tenantId"\)/,
    );
  });

  it("GuardianInvitation → Student uses (studentId, tenantId) composite", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "GuardianInvitation_studentId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("studentId", "tenantId"\) REFERENCES "Student"\("id", "tenantId"\)/,
    );
  });

  it("GuardianInvitation → Guardian uses (guardianId, tenantId) composite", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "GuardianInvitation_guardianId_tenantId_fkey"[\s\S]*?FOREIGN KEY \("guardianId", "tenantId"\) REFERENCES "Guardian"\("id", "tenantId"\)/,
    );
  });
});

describe("08_guardians — column-list SET NULL on Guardian.userId (assumption 5)", () => {
  it("uses the Postgres-15.4+ column-list SET NULL syntax, not bare SET NULL", () => {
    // The composite FK on Guardian.userId must specify which column is
    // nulled on User hard-delete — bare `ON DELETE SET NULL` would null
    // BOTH userId and tenantId, which fails the Guardian.tenantId NOT NULL
    // constraint. Column-list form `SET NULL ("userId")` nulls only userId.
    expect(SQL).toMatch(
      /CONSTRAINT "Guardian_userId_tenantId_fkey"[\s\S]*?ON DELETE SET NULL \("userId"\)/,
    );
  });
});

describe("08_guardians — token global unique (assumption 2)", () => {
  it("declares a global unique index on GuardianInvitation.token (no partial WHERE)", () => {
    // 256-bit entropy → collision astronomically unlikely. Global unique
    // (not partial-WHERE) because invitations are append-only by status,
    // not soft-deleted; the token itself is immutable across the row's
    // lifecycle.
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX "GuardianInvitation_token_key" ON "GuardianInvitation"\("token"\);/,
    );
  });

  it("does NOT declare a partial-WHERE clause on the token unique index", () => {
    // Negative assertion: line containing `GuardianInvitation_token_key`
    // must not be followed by a `WHERE` clause on the same statement.
    const tokenIdxMatch = SQL.match(
      /CREATE UNIQUE INDEX "GuardianInvitation_token_key"[^;]*;/,
    );
    expect(tokenIdxMatch).not.toBeNull();
    expect(tokenIdxMatch?.[0]).not.toMatch(/WHERE/);
  });
});

describe("08_guardians — storage.objects NOT re-added (assumption 11)", () => {
  // DDL-shape negative assertions only — header comment block intentionally
  // references `storage.objects` as prose to document that those policies
  // already shipped in migration 07; a bare-mention regex would false-positive.
  it("does NOT declare a CREATE POLICY targeting storage.objects (in DDL — comments excluded)", () => {
    expect(SQL_DDL).not.toMatch(/CREATE POLICY[^\n]*storage\.objects/);
  });

  it("does NOT declare an ALTER TABLE on storage.objects (in DDL — comments excluded)", () => {
    expect(SQL_DDL).not.toMatch(/ALTER TABLE\s+["]?storage\.objects["]?/);
  });
});

describe("08_guardians — no advisory-lock SQL helper (assumption 9)", () => {
  it("does NOT define a pg_advisory_xact_lock wrapper function", () => {
    // Guardian has no allocator (no NIS-equivalent counter). Asserting
    // absence prevents future drift where someone "helpfully" adds a SQL
    // function that duplicates app-layer logic.
    expect(SQL).not.toMatch(
      /CREATE [^\n]*FUNCTION[^\n]*pg_advisory_xact_lock/i,
    );
  });
});
