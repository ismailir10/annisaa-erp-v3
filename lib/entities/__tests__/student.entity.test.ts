// Student registry tests — schema validation + EntityDef shape + policy
// scope mapping. Also covers the type-level `defineEntityPolicy` round-trip
// per cycle T1's _types.test.ts fold (spec-time review N1).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T7)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Stub `lib/db` so importing entity.ts (which closes over `prisma`) does not
// instantiate PrismaPg / require DATABASE_URL at test time. Same hoisted-mock
// pattern as `lib/audit/__tests__/write.test.ts`.
// Mock prisma so importing entity.ts (closure over `prisma`) does NOT
// instantiate PrismaPg. Mock getSession so dataFetcher tests below can stub
// session.role + currentTermId. resolvePermissions is mocked separately to
// drive the OWN_STUDENT branch deterministically.
const mockStudentFindMany = vi.fn();
const mockStudentCount = vi.fn();
const mockGetSession = vi.fn();
const mockResolvePermissions = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    student: {
      findMany: (...a: unknown[]) => mockStudentFindMany(...a),
      count: (...a: unknown[]) => mockStudentCount(...a),
    },
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));
vi.mock("@/lib/scaffold/permission", () => ({
  resolvePermissions: (...a: unknown[]) => mockResolvePermissions(...a),
}));

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

// ─── dataFetcher OWN_STUDENT branch (p2-scaffold-pages T2) ──────────
// Parent role + studentScopeUnresolved → OwnStudentUnresolvedError thrown.
// Parent role + resolved studentIds → where injects { id: { in: [...] } }.
// Non-parent roles skip resolvePermissions entirely (admin tenant filter only).

import { OwnStudentUnresolvedError } from "@/lib/scaffold/errors";

describe("Student dataFetcher OWN_STUDENT branch", () => {
  const ADMIN_SESSION = {
    tenantId: "tenant_a1",
    userId: "user_admin",
    supabaseUserId: "sup_admin",
    role: "admin" as const,
    currentTermId: "term_1",
  };
  const PARENT_SESSION = {
    tenantId: "tenant_a1",
    userId: "user_parent",
    supabaseUserId: "sup_parent",
    role: "parent" as const,
    currentTermId: "term_1",
  };

  beforeEach(() => {
    mockGetSession.mockReset();
    mockStudentFindMany.mockReset();
    mockStudentCount.mockReset();
    mockResolvePermissions.mockReset();
    mockStudentFindMany.mockResolvedValue([]);
    mockStudentCount.mockResolvedValue(0);
  });

  it("admin role: skips resolvePermissions and queries with tenant filter only", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    await studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} });
    expect(mockResolvePermissions).not.toHaveBeenCalled();
    expect(mockStudentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant_a1", deletedAt: null }),
      }),
    );
    expect(mockStudentFindMany.mock.calls[0][0].where).not.toHaveProperty("id");
  });

  it("parent role + studentScopeUnresolved=true: throws OwnStudentUnresolvedError", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    mockResolvePermissions.mockResolvedValue({
      all: false,
      studentScopeUnresolved: true,
      studentIds: new Set<string>(),
      campusIds: new Set<string>(),
      programIds: new Set<string>(),
      classIds: new Set<string>(),
      sessionIds: new Set<string>(),
      overflow: false,
    });
    await expect(
      studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} }),
    ).rejects.toBeInstanceOf(OwnStudentUnresolvedError);
    expect(mockStudentFindMany).not.toHaveBeenCalled();
  });

  it("parent role + resolved studentIds: injects id-IN filter", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    mockResolvePermissions.mockResolvedValue({
      all: false,
      studentScopeUnresolved: false,
      studentIds: new Set(["s_1", "s_2"]),
      campusIds: new Set<string>(),
      programIds: new Set<string>(),
      classIds: new Set<string>(),
      sessionIds: new Set<string>(),
      overflow: false,
    });
    await studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} });
    const callArg = mockStudentFindMany.mock.calls[0][0];
    expect(callArg.where.id).toEqual({ in: expect.arrayContaining(["s_1", "s_2"]) });
    expect(callArg.where.id.in).toHaveLength(2);
  });

  it("parent role + all=true: skips id-IN injection (ALL short-circuits)", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    mockResolvePermissions.mockResolvedValue({
      all: true,
      studentScopeUnresolved: false,
      studentIds: new Set<string>(),
      campusIds: new Set<string>(),
      programIds: new Set<string>(),
      classIds: new Set<string>(),
      sessionIds: new Set<string>(),
      overflow: false,
    });
    await studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} });
    const callArg = mockStudentFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("id");
  });

  // p2-scaffold-canary T5 — additional edge case: resolver now returns
  // resolved-but-empty studentIds when Guardian row exists with zero
  // StudentGuardian links. Previously this case was indistinguishable
  // from "no Guardian row at all" (both returned studentScopeUnresolved=true).
  // Post-T1, empty + Guardian-exists → no throw, empty-IN predicate, no rows.
  it("parent role + resolved-but-empty studentIds (Guardian exists, zero StudentGuardian): id-IN with empty array, no throw", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    mockResolvePermissions.mockResolvedValue({
      all: false,
      studentScopeUnresolved: false,
      studentIds: new Set<string>(),
      campusIds: new Set<string>(),
      programIds: new Set<string>(),
      classIds: new Set<string>(),
      sessionIds: new Set<string>(),
      overflow: false,
    });
    await studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} });
    const callArg = mockStudentFindMany.mock.calls[0][0];
    expect(callArg.where.id).toEqual({ in: [] });
    // Verify NO throw — Prisma WILL return zero rows for `id IN ()`, which
    // is the correct semantic (resolved empty allowlist) and surfaces as the
    // empty-state UI rather than the no-permission UI.
    expect(mockStudentFindMany).toHaveBeenCalledTimes(1);
  });

  it("parent role + resolved studentIds: tenantId still threaded on Student where (defense-in-depth — id IN doesn't waive tenant filter)", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    mockResolvePermissions.mockResolvedValue({
      all: false,
      studentScopeUnresolved: false,
      studentIds: new Set(["s_x"]),
      campusIds: new Set<string>(),
      programIds: new Set<string>(),
      classIds: new Set<string>(),
      sessionIds: new Set<string>(),
      overflow: false,
    });
    await studentEntity.dataFetcher({ page: 1, pageSize: 10, filters: {} });
    const where = mockStudentFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("tenant_a1");
    expect(where.deletedAt).toBeNull();
    expect(where.id).toEqual({ in: ["s_x"] });
  });
});
