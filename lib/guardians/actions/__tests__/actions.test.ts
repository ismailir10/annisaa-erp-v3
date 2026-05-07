// Combined tests for the 4 Guardian CRUD server actions + assertScope coverage
// across Guardian policy. Mocks: @/lib/db (prisma), @/lib/auth/session
// (getSession), @/lib/audit/write (writeAuditLog), next/cache (revalidatePath).
//
// Mirrors lib/students/actions/__tests__/actions.test.ts shape.
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T1)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGuardianCreate = vi.fn();
const mockGuardianUpdate = vi.fn();
const mockGuardianFindFirst = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    guardian: { create: mockGuardianCreate, update: mockGuardianUpdate },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    guardian: {
      findFirst: (...a: unknown[]) => mockGuardianFindFirst(...a),
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

import { createGuardian } from "../create";
import { updateGuardian } from "../update";
import { softDeleteGuardian } from "../soft-delete";
import { restoreGuardian } from "../restore";
import { assertScope } from "@/lib/scaffold/server-action";
import { policy as guardianPolicy } from "@/lib/entities/guardian/policy";
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
const KADIV_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_kadiv",
  supabaseUserId: "sup_kadiv",
  role: "kadiv",
  currentTermId: "term_1",
};

const VALID_INPUT = {
  fullName: "Bu Sari",
  email: "sari@example.com",
  nik: "3201010101010001",
  phone: "08123456789",
};

const GUARDIAN_ROW = {
  id: "g_1",
  tenantId: "tenant_a1",
  userId: null,
  fullName: "Bu Sari",
  email: "sari@example.com",
  nik: "3201010101010001",
  phone: "08123456789",
  deletedAt: null,
};

beforeEach(() => {
  mockGetSession.mockReset();
  mockWriteAuditLog.mockReset();
  mockRevalidatePath.mockReset();
  mockGuardianCreate.mockReset();
  mockGuardianUpdate.mockReset();
  mockGuardianFindFirst.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("assertScope (Guardian policy)", () => {
  it("passes for admin role on read (presence-only check)", () => {
    expect(() => assertScope(ADMIN_SESSION, guardianPolicy, "read")).not.toThrow();
  });

  it("passes for parent role on read (OWN_STUDENT scope present in Guardian read)", () => {
    expect(() => assertScope(PARENT_SESSION, guardianPolicy, "read")).not.toThrow();
  });

  it("passes for admin role on create (ALL scope present)", () => {
    expect(() => assertScope(ADMIN_SESSION, guardianPolicy, "create")).not.toThrow();
  });

  it("throws FORBIDDEN for parent role on create (no scope grant)", () => {
    expect(() => assertScope(PARENT_SESSION, guardianPolicy, "create")).toThrow(/FORBIDDEN/);
  });

  it("throws FORBIDDEN for kadiv on soft_delete (Guardian soft_delete grants A/P only)", () => {
    expect(() => assertScope(KADIV_SESSION, guardianPolicy, "soft_delete")).toThrow(/FORBIDDEN/);
  });

  it("passes for parent role on update — SELF widening per p2-portal-shell-sidebar T4", () => {
    expect(() => assertScope(PARENT_SESSION, guardianPolicy, "update")).not.toThrow();
  });
});

describe("createGuardian", () => {
  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createGuardian(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
  });

  it("returns FORBIDDEN for parent role", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    const result = await createGuardian(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("admin role: parses input, creates row with tenantId injection, emits CREATE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianCreate.mockResolvedValue(GUARDIAN_ROW);
    const result = await createGuardian(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(GUARDIAN_ROW);
    expect(mockGuardianCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant_a1", fullName: "Bu Sari" }),
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        resource: "Guardian",
        resourceId: "g_1",
        actorUserId: "user_admin",
        before: null,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/wali");
  });

  it("returns INVALID_INPUT with field path when phone fails regex", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createGuardian({ ...VALID_INPUT, phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Nomor HP tidak valid/);
      expect(result.field).toBe("phone");
    }
    expect(mockGuardianCreate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe("updateGuardian", () => {
  it("returns NOT_FOUND when guardian does not exist in tenant", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue(null);
    const result = await updateGuardian("g_missing", { fullName: "X" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it("parent SELF: precheck where-clause includes userId predicate (row-level guard)", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    // Row matches the SELF predicate — Guardian belongs to this parent.
    const ownGuardian = { ...GUARDIAN_ROW, userId: "user_parent" };
    mockGuardianFindFirst.mockResolvedValue(ownGuardian);
    mockGuardianUpdate.mockResolvedValue({ ...ownGuardian, phone: "08111111111" });
    const result = await updateGuardian("g_1", { phone: "08111111111" });
    expect(result.ok).toBe(true);
    // Verify the precheck where-clause carried the SELF predicate.
    expect(mockGuardianFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "g_1",
          tenantId: "tenant_a1",
          deletedAt: null,
          userId: "user_parent",
        }),
      }),
    );
  });

  it("parent SELF: NOT_FOUND when row exists but userId does NOT match — wrong-row attempt", async () => {
    mockGetSession.mockResolvedValue(PARENT_SESSION);
    // Mock returns null because the userId clause filters the row out —
    // mirrors what real Prisma would return for a guardian belonging to
    // someone else.
    mockGuardianFindFirst.mockResolvedValue(null);
    const result = await updateGuardian("g_other_parents_row", { phone: "08111111111" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
    // The precheck still went out with the userId clause — assert it.
    expect(mockGuardianFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "g_other_parents_row",
          userId: "user_parent",
        }),
      }),
    );
  });

  it("admin ALL: precheck where-clause omits userId predicate (regression — ALL grants unaffected)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue(GUARDIAN_ROW);
    mockGuardianUpdate.mockResolvedValue({ ...GUARDIAN_ROW, fullName: "X" });
    const result = await updateGuardian("g_1", { fullName: "X" });
    expect(result.ok).toBe(true);
    const callArg = mockGuardianFindFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).not.toHaveProperty("userId");
  });

  it("returns NO_CHANGES when input is empty (avoids phantom UPDATE audit row)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await updateGuardian("g_1", {});
    expect(result).toEqual({ ok: false, error: "NO_CHANGES" });
    expect(mockGuardianFindFirst).not.toHaveBeenCalled();
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("admin role: updates + emits UPDATE audit with before+after + revalidates list+detail", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue(GUARDIAN_ROW);
    const updatedRow = { ...GUARDIAN_ROW, fullName: "Bu Sari Baru" };
    mockGuardianUpdate.mockResolvedValue(updatedRow);
    const result = await updateGuardian("g_1", { fullName: "Bu Sari Baru" });
    expect(result.ok).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        before: GUARDIAN_ROW,
        after: updatedRow,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/wali");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/wali/g_1");
  });
});

describe("softDeleteGuardian", () => {
  it("returns ALREADY_DELETED when row already has deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue({ ...GUARDIAN_ROW, deletedAt: new Date() });
    const result = await softDeleteGuardian("g_1");
    expect(result).toEqual({ ok: false, error: "ALREADY_DELETED" });
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it("admin role: sets deletedAt + emits SOFT_DELETE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue(GUARDIAN_ROW);
    const updatedRow = { ...GUARDIAN_ROW, deletedAt: new Date() };
    mockGuardianUpdate.mockResolvedValue(updatedRow);
    const result = await softDeleteGuardian("g_1");
    expect(result.ok).toBe(true);
    expect(mockGuardianUpdate).toHaveBeenCalledWith({
      where: { id: "g_1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SOFT_DELETE }),
      expect.anything(),
    );
  });

  it("returns FORBIDDEN for kadiv (Guardian soft_delete grants A/P only)", async () => {
    mockGetSession.mockResolvedValue(KADIV_SESSION);
    const result = await softDeleteGuardian("g_1");
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("restoreGuardian", () => {
  it("returns NOT_DELETED when row has no deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockGuardianFindFirst.mockResolvedValue(GUARDIAN_ROW);
    const result = await restoreGuardian("g_1");
    expect(result).toEqual({ ok: false, error: "NOT_DELETED" });
    expect(mockGuardianUpdate).not.toHaveBeenCalled();
  });

  it("admin role: clears deletedAt + emits RESTORE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const deletedRow = { ...GUARDIAN_ROW, deletedAt: new Date() };
    mockGuardianFindFirst.mockResolvedValue(deletedRow);
    const restoredRow = { ...GUARDIAN_ROW, deletedAt: null };
    mockGuardianUpdate.mockResolvedValue(restoredRow);
    const result = await restoreGuardian("g_1");
    expect(result.ok).toBe(true);
    expect(mockGuardianUpdate).toHaveBeenCalledWith({
      where: { id: "g_1" },
      data: { deletedAt: null },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.RESTORE }),
      expect.anything(),
    );
  });
});
