// Combined tests for the 4 Student CRUD server actions + the assertScope
// helper. Mocks: @/lib/db (prisma), @/lib/auth/session (getSession),
// @/lib/audit/write (writeAuditLog), next/cache (revalidatePath).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages.md (T4)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRevalidatePath = vi.fn();
const mockStudentCreate = vi.fn();
const mockStudentUpdate = vi.fn();
const mockStudentFindFirst = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    student: { create: mockStudentCreate, update: mockStudentUpdate },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    student: {
      findFirst: (...a: unknown[]) => mockStudentFindFirst(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
}));
vi.mock("@/lib/audit/write", () => ({
  writeAuditLog: (...a: unknown[]) => mockWriteAuditLog(...a),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a),
}));

import { createStudent } from "../create";
import { updateStudent } from "../update";
import { softDeleteStudent } from "../soft-delete";
import { restoreStudent } from "../restore";
import { assertScope } from "@/lib/scaffold/server-action";
import { policy as studentPolicy } from "@/lib/entities/student/policy";
import { AuditAction } from "@/lib/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/session";

const ADMIN_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_admin",
  supabaseUserId: "sup_admin",
  role: "admin",
  currentTermId: "term_1",
};
const PARENT_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_parent",
  supabaseUserId: "sup_parent",
  role: "parent",
  currentTermId: "term_1",
};
const HOMEROOM_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_ht",
  supabaseUserId: "sup_ht",
  role: "homeroom_teacher",
  currentTermId: "term_1",
};

const VALID_INPUT = {
  fullName: "Ahmad Rifai",
  gender: "MALE" as const,
  householdId: "ckabcdefghijklmnopqrstuvw",
  programId: "ckabcdefghijklmnopqrstuvw",
};

const STUDENT_ROW = {
  id: "stu_1",
  tenantId: "tenant_a1",
  fullName: "Ahmad Rifai",
  gender: "MALE",
  householdId: "ckabcdefghijklmnopqrstuvw",
  programId: "ckabcdefghijklmnopqrstuvw",
  nis: null,
  nik: null,
  nickname: null,
  birthPlace: null,
  birthDate: null,
  enrolledAt: null,
  deletedAt: null,
};

beforeEach(() => {
  mockGetSession.mockReset();
  mockWriteAuditLog.mockReset();
  mockRevalidatePath.mockReset();
  mockStudentCreate.mockReset();
  mockStudentUpdate.mockReset();
  mockStudentFindFirst.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("assertScope", () => {
  it("passes for admin role on read (presence-only check)", () => {
    expect(() => assertScope(ADMIN_SESSION, studentPolicy, "read")).not.toThrow();
  });

  it("passes for parent role on read (OWN_STUDENT scope present)", () => {
    expect(() => assertScope(PARENT_SESSION, studentPolicy, "read")).not.toThrow();
  });

  it("passes for admin role on create (ALL scope present)", () => {
    expect(() => assertScope(ADMIN_SESSION, studentPolicy, "create")).not.toThrow();
  });

  it("throws FORBIDDEN for parent role on create (no scope grant)", () => {
    expect(() => assertScope(PARENT_SESSION, studentPolicy, "create")).toThrow(/FORBIDDEN/);
  });

  it("throws FORBIDDEN for homeroom_teacher on update (OWN_CLASS != ALL strict-write posture)", () => {
    expect(() => assertScope(HOMEROOM_SESSION, studentPolicy, "update")).toThrow(/FORBIDDEN/);
  });

  it("throws FORBIDDEN for homeroom_teacher on soft_delete (no grant)", () => {
    expect(() => assertScope(HOMEROOM_SESSION, studentPolicy, "soft_delete")).toThrow(/FORBIDDEN/);
  });
});

describe("createStudent", () => {
  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createStudent(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
  });

  it("returns FORBIDDEN for parent role", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    const result = await createStudent(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("admin role: parses input, creates row with tenantId injection, emits CREATE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentCreate.mockResolvedValue(STUDENT_ROW);
    const result = await createStudent(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(STUDENT_ROW);
    expect(mockStudentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant_a1", fullName: "Ahmad Rifai" }),
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        resource: "Student",
        resourceId: "stu_1",
        actorUserId: "user_admin",
        before: null,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/siswa");
  });

  it("returns INVALID_INPUT with field path when schema fails (NIK length)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createStudent({ ...VALID_INPUT, nik: "12345" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/NIK harus 16 digit/);
      expect(result.field).toBe("nik");
    }
    expect(mockStudentCreate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe("updateStudent", () => {
  it("returns FORBIDDEN for homeroom_teacher (strict-ALL write posture)", async () => {
    mockGetSession.mockResolvedValue(HOMEROOM_SESSION);
    const result = await updateStudent("stu_1", { nickname: "Adi" });
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("returns NOT_FOUND when student does not exist in tenant", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentFindFirst.mockResolvedValue(null);
    const result = await updateStudent("stu_missing", { nickname: "Adi" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockStudentUpdate).not.toHaveBeenCalled();
  });

  it("returns NO_CHANGES when input is empty (avoids phantom UPDATE audit row)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await updateStudent("stu_1", {});
    expect(result).toEqual({ ok: false, error: "NO_CHANGES" });
    // Critically, no DB read OR write happens — guard fires before findFirst.
    expect(mockStudentFindFirst).not.toHaveBeenCalled();
    expect(mockStudentUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("admin role: updates + emits UPDATE audit with before+after", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentFindFirst.mockResolvedValue(STUDENT_ROW);
    const updatedRow = { ...STUDENT_ROW, nickname: "Adi" };
    mockStudentUpdate.mockResolvedValue(updatedRow);
    const result = await updateStudent("stu_1", { nickname: "Adi" });
    expect(result.ok).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        before: STUDENT_ROW,
        after: updatedRow,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/siswa");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/siswa/stu_1");
  });
});

describe("softDeleteStudent", () => {
  it("returns ALREADY_DELETED when row already has deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentFindFirst.mockResolvedValue({ ...STUDENT_ROW, deletedAt: new Date() });
    const result = await softDeleteStudent("stu_1");
    expect(result).toEqual({ ok: false, error: "ALREADY_DELETED" });
    expect(mockStudentUpdate).not.toHaveBeenCalled();
  });

  it("admin role: sets deletedAt + emits SOFT_DELETE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentFindFirst.mockResolvedValue(STUDENT_ROW);
    const updatedRow = { ...STUDENT_ROW, deletedAt: new Date() };
    mockStudentUpdate.mockResolvedValue(updatedRow);
    const result = await softDeleteStudent("stu_1");
    expect(result.ok).toBe(true);
    expect(mockStudentUpdate).toHaveBeenCalledWith({
      where: { id: "stu_1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SOFT_DELETE }),
      expect.anything(),
    );
  });

  it("returns FORBIDDEN for homeroom_teacher", async () => {
    mockGetSession.mockResolvedValue(HOMEROOM_SESSION);
    const result = await softDeleteStudent("stu_1");
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("restoreStudent", () => {
  it("returns NOT_DELETED when row has no deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockStudentFindFirst.mockResolvedValue(STUDENT_ROW);
    const result = await restoreStudent("stu_1");
    expect(result).toEqual({ ok: false, error: "NOT_DELETED" });
    expect(mockStudentUpdate).not.toHaveBeenCalled();
  });

  it("admin role: clears deletedAt + emits RESTORE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const deletedRow = { ...STUDENT_ROW, deletedAt: new Date() };
    mockStudentFindFirst.mockResolvedValue(deletedRow);
    const restoredRow = { ...STUDENT_ROW, deletedAt: null };
    mockStudentUpdate.mockResolvedValue(restoredRow);
    const result = await restoreStudent("stu_1");
    expect(result.ok).toBe(true);
    expect(mockStudentUpdate).toHaveBeenCalledWith({
      where: { id: "stu_1" },
      data: { deletedAt: null },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.RESTORE }),
      expect.anything(),
    );
  });
});
