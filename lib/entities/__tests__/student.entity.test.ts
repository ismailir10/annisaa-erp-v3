// Student registry tests — schema validation + EntityDef shape + policy
// scope mapping. Also covers the type-level `defineEntityPolicy` round-trip
// per cycle T1's _types.test.ts fold (spec-time review N1).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Stub `lib/db` so importing entity.ts (which closes over `prisma`) does not
// instantiate PrismaPg / require DATABASE_URL at test time. Same hoisted-mock
// pattern as `lib/audit/__tests__/write.test.ts`.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { AuditAction, FileKind } from "@/lib/generated/prisma/client";
import {
  defineEntityPolicy,
  type CrudAction,
  type EntityPolicy,
} from "../_types";
import studentEntity from "../student/entity";
import { policy as studentPolicy } from "../student/policy";
import { schema as studentSchema } from "../student/schema";

const VALID_INPUT = {
  fullName: "Budi Setiawan",
  gender: "MALE" as const,
  householdId: "ckabcdefghijklmnopqrstuvw",
  programId: "ckabcdefghijklmnopqrstuvw",
  nis: "PAUD-A-25-0001",
  nik: "1234567890123456",
  nickname: "Budi",
  birthPlace: "Bekasi",
  birthDate: "2020-05-12",
  enrolledAt: "2026-07-15",
};

describe("Student schema", () => {
  it("accepts canonical valid input", () => {
    const parsed = studentSchema.parse(VALID_INPUT);
    expect(parsed.fullName).toBe("Budi Setiawan");
    expect(parsed.gender).toBe("MALE");
    expect(parsed.birthDate).toBeInstanceOf(Date);
  });

  it("rejects 15-digit NIK", () => {
    expect(() =>
      studentSchema.parse({ ...VALID_INPUT, nik: "123456789012345" }),
    ).toThrow(/NIK harus 16 digit/);
  });

  it("rejects 17-digit NIK", () => {
    expect(() =>
      studentSchema.parse({ ...VALID_INPUT, nik: "12345678901234567" }),
    ).toThrow(/NIK harus 16 digit/);
  });

  it("rejects gender outside CHECK list", () => {
    expect(() =>
      studentSchema.parse({ ...VALID_INPUT, gender: "OTHER" as never }),
    ).toThrow();
  });

  it("rejects empty fullName", () => {
    expect(() =>
      studentSchema.parse({ ...VALID_INPUT, fullName: "" }),
    ).toThrow(/Nama lengkap wajib diisi/);
  });
});

describe("Student EntityDef shape", () => {
  it("has registry-required scalar fields", () => {
    expect(studentEntity.key).toBe("student");
    expect(studentEntity.label).toBe("Siswa");
    expect(studentEntity.labelSingular).toBe("Siswa");
    expect(studentEntity.icon).toBe("Users");
    expect(studentEntity.resource).toBe("Student");
  });

  it("excludes nik from listColumns (PII per Shared dataFetcher contract clause 8)", () => {
    const fields = studentEntity.listColumns.map((c) => c.field);
    expect(fields).not.toContain("nik");
  });

  it("excludes nik from searchFields (PII minimisation per spec-time N7)", () => {
    expect(studentEntity.searchFields).not.toContain("nik");
  });

  it("declares dataFetcher as a function", () => {
    expect(typeof studentEntity.dataFetcher).toBe("function");
  });
});

describe("Student EntityPolicy", () => {
  it("matches Prisma model name", () => {
    expect(studentPolicy.resource).toBe("Student");
  });

  it("declares softDelete: true (deletedAt-aware)", () => {
    expect(studentPolicy.softDelete).toBe(true);
  });

  it("excludes AuditAction.DELETE from auditActions (soft-delete entity per spec-time C2)", () => {
    expect(studentPolicy.auditActions).not.toContain(AuditAction.DELETE);
    expect(studentPolicy.auditActions).toContain(AuditAction.SOFT_DELETE);
  });

  it("grants parent role OWN_STUDENT scope on read", () => {
    const parentRead = studentPolicy.scopes.read.find(
      (g) => g.role === "parent",
    );
    expect(parentRead).toBeDefined();
    expect(parentRead?.scope).toBe("OWN_STUDENT");
  });

  it("admin fileKindAllowlist includes IMAGE + DOCUMENT", () => {
    const adminAllowed = studentPolicy.fileKindAllowlist.admin;
    expect(adminAllowed).toContain(FileKind.IMAGE);
    expect(adminAllowed).toContain(FileKind.DOCUMENT);
  });

  it("parent has no fileKindAllowlist key (read-only role per spec-time #9)", () => {
    expect(studentPolicy.fileKindAllowlist.parent).toBeUndefined();
  });
});

describe("defineEntityPolicy round-trip (folds _types.test.ts per N1)", () => {
  it("preserves literal types through identity helper", () => {
    const sample = defineEntityPolicy({
      resource: "Sample",
      softDelete: false,
      auditActions: [AuditAction.CREATE] as const,
      scopes: {
        create: [{ role: "admin" as const, scope: "ALL" as const }],
        read: [],
        update: [],
        delete: [],
        soft_delete: [],
        restore: [],
      },
      fileKindAllowlist: {},
    });
    // Round-trip preserves the value.
    expect(sample.resource).toBe("Sample");
    expect(sample.scopes.create[0].role).toBe("admin");
    expect(sample.scopes.create[0].scope).toBe("ALL");
  });

  it("CrudAction union covers all six actions", () => {
    const actions: CrudAction[] = [
      "create",
      "read",
      "update",
      "delete",
      "soft_delete",
      "restore",
    ];
    expect(actions).toHaveLength(6);
  });

  it("EntityPolicy interface is structurally compatible with the student policy", () => {
    // Type-level assertion via a `satisfies` shape check at runtime.
    const checked: EntityPolicy = studentPolicy;
    expect(checked.resource).toBe("Student");
  });
});

// Avoid "z is unused" lint warn under strict ESLint config — we import z so
// a future test author can extend with regex/edge cases without adding the
// import; touch it once to anchor the import.
void z;
