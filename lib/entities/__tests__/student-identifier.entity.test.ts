// StudentIdentifier registry tests. Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";
import studentIdentifierEntity from "../student-identifier/entity";
import { studentIdentifierPolicy } from "../student-identifier/policy";
import { studentIdentifierSchema } from "../student-identifier/schema";

const VALID_INPUT = {
  studentId: "ckabcdefghijklmnopqrstuvw",
  kind: "NIS" as const,
  value: "PAUD-A-25-0001",
  isPrimary: true,
};

describe("StudentIdentifier schema", () => {
  it("accepts canonical valid input", () => {
    const parsed = studentIdentifierSchema.parse(VALID_INPUT);
    expect(parsed.kind).toBe("NIS");
    expect(parsed.value).toBe("PAUD-A-25-0001");
  });

  it("accepts NISN + PREVIOUS_SCHOOL kinds", () => {
    expect(() =>
      studentIdentifierSchema.parse({ ...VALID_INPUT, kind: "NISN" }),
    ).not.toThrow();
    expect(() =>
      studentIdentifierSchema.parse({
        ...VALID_INPUT,
        kind: "PREVIOUS_SCHOOL",
      }),
    ).not.toThrow();
  });

  it("rejects unknown kind value", () => {
    expect(() =>
      studentIdentifierSchema.parse({ ...VALID_INPUT, kind: "OTHER" as never }),
    ).toThrow();
  });

  it("rejects value longer than 100 chars", () => {
    expect(() =>
      studentIdentifierSchema.parse({ ...VALID_INPUT, value: "x".repeat(101) }),
    ).toThrow();
  });
});

describe("StudentIdentifier EntityDef shape", () => {
  it("has registry-required scalar fields", () => {
    expect(studentIdentifierEntity.key).toBe("student-identifier");
    expect(studentIdentifierEntity.label).toBe("Identitas Siswa");
    expect(studentIdentifierEntity.icon).toBe("BadgeCheck");
    expect(studentIdentifierEntity.resource).toBe("StudentIdentifier");
  });

  it("declares 3 chip filters (kind/isPrimary/search)", () => {
    expect(studentIdentifierEntity.filters).toHaveLength(3);
  });
});

describe("StudentIdentifier EntityPolicy", () => {
  it("softDelete=true (NIS history retained per spec §4.5)", () => {
    expect(studentIdentifierPolicy.resource).toBe("StudentIdentifier");
    expect(studentIdentifierPolicy.softDelete).toBe(true);
  });

  it("excludes DELETE from auditActions", () => {
    expect(studentIdentifierPolicy.auditActions).not.toContain(
      AuditAction.DELETE,
    );
  });

  it("admission_officer fileKindAllowlist is [DOCUMENT]", () => {
    expect(studentIdentifierPolicy.fileKindAllowlist.admission_officer).toEqual(
      [FileKind.DOCUMENT],
    );
  });
});
