// Migration post-condition tests — static parse of the 11_admission SQL.
// Mirrors 08-guardians/10-addresses (readFileSync + regex assertions, no DB).
// Asserts the structural invariants documented in p2-admission-funnel-schema:
//   * 3 enums declared (AdmissionStatus 8 values + AdmissionSource 3 values + MplsCohortStatus 3 values)
//   * 5 tenant-scoped tables ENABLE ROW LEVEL SECURITY
//   * 10 RLS policies (2 per table — tenant_isolation_select + no_writes_via_postgrest)
//   * Soft-delete-aware tables (Admission + MplsCohort) include `deletedAt IS NULL` in
//     tenant_isolation_select USING; non-soft-delete tables (InitialAssessment +
//     MplsMember + MplsAttendance) omit the deletedAt clause
//   * Composite (id, tenantId) UNIQUE per table (FK target shape per §6.4)
//   * Composite-FK column-list SET NULL (Postgres 15.4+) for both nullable
//     SET NULL FKs on Admission (acceptedStudentId + siblingDetectedFromHouseholdId)
//   * Composite FK chain: Admission → Program/AcademicYear/Address; InitialAssessment
//     → Admission/Employee; MplsCohort → AcademicYear; MplsMember → MplsCohort/Admission;
//     MplsAttendance → MplsMember
//   * CHECK constraints: Admission.applicantGender ∈ {MALE,FEMALE} or NULL,
//     InitialAssessment.score 0..100 or NULL, MplsAttendance.cohortDay 1..30,
//     MplsCohort.endDate >= startDate
//   * Tenant FK Restrict (never cascade Tenant per §4.4)
//   * No FORCE ROW LEVEL SECURITY (matches design lock from p1-regions-seed)
//   * 5 PII annotations live in schema.prisma (parsed separately for completeness):
//     applicantNik / fatherNik / motherNik (redact); fatherPhone / motherPhone (mask:last4)
//
// Static-only — runs under `npx vitest run` without a live DB.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(
  path.join(ROOT, "prisma/migrations/11_admission/migration.sql"),
  "utf8",
);
const SCHEMA = readFileSync(
  path.join(ROOT, "prisma/schema.prisma"),
  "utf8",
);

// DDL-only view — strip block + line comments. Used by negative assertions
// so prose mentions inside header / inline comments don't false-positive.
const SQL_DDL = SQL.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");

// Helper — extract the model block from schema.prisma so PII assertions run
// scoped to the right model.
function extractModelBlock(model: string): string {
  const re = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m");
  const m = SCHEMA.match(re);
  return m ? m[1] : "";
}

describe("11_admission — enum types declared (cycle Spec §State Transitions)", () => {
  it("CREATE TYPE AdmissionStatus with 8 values", () => {
    expect(SQL).toMatch(
      /CREATE TYPE "AdmissionStatus" AS ENUM[\s\S]*'DRAFT'[\s\S]*'SUBMITTED'[\s\S]*'UNDER_REVIEW'[\s\S]*'INTERVIEW_SCHEDULED'[\s\S]*'OFFER_EXTENDED'[\s\S]*'ACCEPTED'[\s\S]*'REJECTED'[\s\S]*'WITHDRAWN'/,
    );
  });

  it("CREATE TYPE AdmissionSource with 3 values", () => {
    expect(SQL).toMatch(
      /CREATE TYPE "AdmissionSource" AS ENUM[\s\S]*'ONLINE'[\s\S]*'WALK_IN'[\s\S]*'REFERRAL'/,
    );
  });

  it("CREATE TYPE MplsCohortStatus with 3 values", () => {
    expect(SQL).toMatch(
      /CREATE TYPE "MplsCohortStatus" AS ENUM[\s\S]*'PLANNED'[\s\S]*'ACTIVE'[\s\S]*'COMPLETED'/,
    );
  });
});

describe("11_admission — RLS coverage (spec §6.3) — 5 ENABLE + 10 policies", () => {
  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s ENABLE ROW LEVEL SECURITY", (table) => {
    const re = new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    expect(SQL).toMatch(re);
  });

  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s declares tenant_isolation_select policy", (table) => {
    const re = new RegExp(
      `CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*tenantId[\\s\\S]*tenant_id`,
    );
    expect(SQL).toMatch(re);
  });

  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s declares no_writes_via_postgrest policy", (table) => {
    const re = new RegExp(
      `CREATE POLICY "no_writes_via_postgrest" ON "${table}"[\\s\\S]*USING \\(false\\) WITH CHECK \\(false\\)`,
    );
    expect(SQL).toMatch(re);
  });

  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s REVOKE ALL FROM anon, authenticated (defense-in-depth)", (table) => {
    const re = new RegExp(`REVOKE ALL ON "${table}" FROM anon, authenticated`);
    expect(SQL).toMatch(re);
  });

  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s GRANT SELECT TO authenticated", (table) => {
    const re = new RegExp(`GRANT SELECT ON "${table}" TO authenticated`);
    expect(SQL).toMatch(re);
  });

  it("does NOT declare FORCE ROW LEVEL SECURITY (design lock from p1-regions-seed)", () => {
    expect(SQL_DDL).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });
});

describe("11_admission — soft-delete asymmetry on RLS clauses (Assumption 5)", () => {
  it.each(["Admission", "MplsCohort"])(
    "%s tenant_isolation_select gates on deletedAt IS NULL (soft-delete table)",
    (table) => {
      const re = new RegExp(
        `CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*deletedAt[\\s\\S]*IS NULL`,
      );
      expect(SQL).toMatch(re);
    },
  );

  it.each([
    ["InitialAssessment"],
    ["MplsMember"],
    ["MplsAttendance"],
  ])(
    "%s tenant_isolation_select does NOT gate on deletedAt (no soft-delete column)",
    (table) => {
      // Extract the policy block for this table and assert deletedAt absent.
      const policyMatch = SQL.match(
        new RegExp(
          `CREATE POLICY "tenant_isolation_select" ON "${table}"[\\s\\S]*?(?=CREATE POLICY|$)`,
        ),
      );
      expect(policyMatch).not.toBeNull();
      expect(policyMatch![0]).not.toMatch(/deletedAt/);
    },
  );
});

describe("11_admission — composite (id, tenantId) UNIQUE per table (FK target shape per §6.4)", () => {
  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s_id_tenantId_key UNIQUE INDEX present", (table) => {
    // Whitespace between index name and ON is column-aligned padding (\s+),
    // not a fixed single space — mirrors 10_addresses formatting.
    const re = new RegExp(
      `CREATE UNIQUE INDEX "${table}_id_tenantId_key"\\s+ON "${table}"\\("id", "tenantId"\\)`,
    );
    expect(SQL).toMatch(re);
  });
});

describe("11_admission — Admission composite-FK column-list SET NULL (scaffold.md §6 split-view)", () => {
  it("acceptedStudentId compound FK present with column-list SET NULL targeting ONLY acceptedStudentId", () => {
    expect(SQL).toMatch(
      /Admission_acceptedStudentId_tenantId_fkey[\s\S]*FOREIGN KEY \("acceptedStudentId", "tenantId"\) REFERENCES "Student"\("id", "tenantId"\)[\s\S]*ON DELETE SET NULL \("acceptedStudentId"\)/,
    );
  });

  it("acceptedStudentId SET NULL column-list does NOT include tenantId (would violate Admission.tenantId NOT NULL)", () => {
    expect(SQL).not.toMatch(
      /Admission_acceptedStudentId_tenantId_fkey[\s\S]*SET NULL \([^)]*"tenantId"[^)]*\)/,
    );
  });

  it("siblingDetectedFromHouseholdId compound FK present with column-list SET NULL targeting ONLY siblingDetectedFromHouseholdId", () => {
    expect(SQL).toMatch(
      /Admission_siblingDetectedFromHouseholdId_tenantId_fkey[\s\S]*FOREIGN KEY \("siblingDetectedFromHouseholdId", "tenantId"\) REFERENCES "Household"\("id", "tenantId"\)[\s\S]*ON DELETE SET NULL \("siblingDetectedFromHouseholdId"\)/,
    );
  });

  it("siblingDetectedFromHouseholdId SET NULL column-list does NOT include tenantId", () => {
    expect(SQL).not.toMatch(
      /Admission_siblingDetectedFromHouseholdId_tenantId_fkey[\s\S]*SET NULL \([^)]*"tenantId"[^)]*\)/,
    );
  });
});

describe("11_admission — composite FK chain (per §6.4)", () => {
  it("Admission.programId compound FK to Program(id, tenantId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Admission_programId_tenantId_fkey"[\s\S]*FOREIGN KEY \("programId", "tenantId"\) REFERENCES "Program"\("id", "tenantId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });

  it("Admission.academicYearId compound FK to AcademicYear(id, tenantId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Admission_academicYearId_tenantId_fkey"[\s\S]*FOREIGN KEY \("academicYearId", "tenantId"\) REFERENCES "AcademicYear"\("id", "tenantId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });

  it("Admission.addressId compound FK to Address(id, tenantId) (NOT NULL — admission carries captured address)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "Admission_addressId_tenantId_fkey"[\s\S]*FOREIGN KEY \("addressId", "tenantId"\) REFERENCES "Address"\("id", "tenantId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });

  it("InitialAssessment.admissionId compound FK to Admission(id, tenantId) — Cascade", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "InitialAssessment_admissionId_tenantId_fkey"[\s\S]*FOREIGN KEY \("admissionId", "tenantId"\) REFERENCES "Admission"\("id", "tenantId"\)[\s\S]*ON DELETE CASCADE/,
    );
  });

  it("InitialAssessment.assessorEmployeeId compound FK to Employee(id, tenantId) — Restrict", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "InitialAssessment_assessorEmployeeId_tenantId_fkey"[\s\S]*FOREIGN KEY \("assessorEmployeeId", "tenantId"\) REFERENCES "Employee"\("id", "tenantId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });

  it("MplsCohort.academicYearId compound FK to AcademicYear(id, tenantId)", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "MplsCohort_academicYearId_tenantId_fkey"[\s\S]*FOREIGN KEY \("academicYearId", "tenantId"\) REFERENCES "AcademicYear"\("id", "tenantId"\)/,
    );
  });

  it("MplsMember.cohortId compound FK to MplsCohort(id, tenantId) — Cascade", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "MplsMember_cohortId_tenantId_fkey"[\s\S]*FOREIGN KEY \("cohortId", "tenantId"\) REFERENCES "MplsCohort"\("id", "tenantId"\)[\s\S]*ON DELETE CASCADE/,
    );
  });

  it("MplsMember.admissionId compound FK to Admission(id, tenantId) — Cascade", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "MplsMember_admissionId_tenantId_fkey"[\s\S]*FOREIGN KEY \("admissionId", "tenantId"\) REFERENCES "Admission"\("id", "tenantId"\)[\s\S]*ON DELETE CASCADE/,
    );
  });

  it("MplsAttendance.memberId compound FK to MplsMember(id, tenantId) — Cascade", () => {
    expect(SQL).toMatch(
      /ADD CONSTRAINT "MplsAttendance_memberId_tenantId_fkey"[\s\S]*FOREIGN KEY \("memberId", "tenantId"\) REFERENCES "MplsMember"\("id", "tenantId"\)[\s\S]*ON DELETE CASCADE/,
    );
  });
});

describe("11_admission — Tenant FK Restrict (never cascade Tenant per §4.4)", () => {
  it.each([
    "Admission",
    "InitialAssessment",
    "MplsCohort",
    "MplsMember",
    "MplsAttendance",
  ])("%s.tenantId Restrict", (table) => {
    const re = new RegExp(
      `ADD CONSTRAINT "${table}_tenantId_fkey"[\\s\\S]*FOREIGN KEY \\("tenantId"\\) REFERENCES "Tenant"\\("id"\\)[\\s\\S]*ON DELETE RESTRICT`,
    );
    expect(SQL).toMatch(re);
  });
});

describe("11_admission — CHECK constraints (cycle Spec §1)", () => {
  it("Admission.applicantGender CHECK ∈ {MALE,FEMALE} or NULL", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "Admission_applicantGender_check"[\s\S]*CHECK \("applicantGender" IS NULL OR "applicantGender" IN \('MALE', 'FEMALE'\)\)/,
    );
  });

  it("InitialAssessment.score CHECK 0..100 or NULL", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "InitialAssessment_score_check"[\s\S]*CHECK \("score" IS NULL OR \("score" >= 0 AND "score" <= 100\)\)/,
    );
  });

  it("MplsAttendance.cohortDay CHECK 1..30", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "MplsAttendance_cohortDay_check"[\s\S]*CHECK \("cohortDay" >= 1 AND "cohortDay" <= 30\)/,
    );
  });

  it("MplsCohort.endDate >= startDate CHECK", () => {
    expect(SQL).toMatch(
      /CONSTRAINT "MplsCohort_dateRange_check"[\s\S]*CHECK \("endDate" >= "startDate"\)/,
    );
  });
});

describe("11_admission — junction unique constraints (one membership / attendance per scope)", () => {
  it("MplsMember UNIQUE (tenantId, cohortId, admissionId) — one membership per (cohort, admission)", () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX "MplsMember_tenantId_cohortId_admissionId_key"\s+ON "MplsMember"\("tenantId", "cohortId", "admissionId"\)/,
    );
  });

  it("MplsAttendance UNIQUE (tenantId, memberId, cohortDay) — one fact per member per day", () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX "MplsAttendance_tenantId_memberId_cohortDay_key"\s+ON "MplsAttendance"\("tenantId", "memberId", "cohortDay"\)/,
    );
  });
});

describe("11_admission — PII annotations in schema.prisma (cycle Spec AC3)", () => {
  // Parser-format match: `<field>  String?  @db.VarChar(N)  /// @PII <policy>`.
  // Annotation grammar consumed by scripts/generate-audit-redactor.ts.
  it.each([
    ["applicantNik", "redact"],
    ["fatherNik", "redact"],
    ["motherNik", "redact"],
    ["fatherPhone", "mask:last4"],
    ["motherPhone", "mask:last4"],
  ])("Admission.%s carries `/// @PII %s` annotation", (field, policy) => {
    const block = extractModelBlock("Admission");
    expect(block.length).toBeGreaterThan(0);
    const fieldRe = new RegExp(
      `^\\s+${field}\\s+String\\?[^\\n]*///\\s*@PII\\s+${policy.replace(":", ":")}`,
      "m",
    );
    expect(block).toMatch(fieldRe);
  });
});
