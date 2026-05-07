// Combined tests for the 4 Household CRUD server actions + assertScope coverage
// across Household policy. Mocks: @/lib/db (prisma), @/lib/auth/session
// (getSession), @/lib/audit/write (writeAuditLog), next/cache (revalidatePath).
//
// Cycle: docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md (T2)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRevalidatePath = vi.fn();
const mockHouseholdCreate = vi.fn();
const mockHouseholdUpdate = vi.fn();
const mockHouseholdFindFirst = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    household: { create: mockHouseholdCreate, update: mockHouseholdUpdate },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    household: {
      findFirst: (...a: unknown[]) => mockHouseholdFindFirst(...a),
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

import { createHousehold } from "../create";
import { updateHousehold } from "../update";
import { softDeleteHousehold } from "../soft-delete";
import { restoreHousehold } from "../restore";
import { assertScope } from "@/lib/scaffold/server-action";
import { policy as householdPolicy } from "@/lib/entities/household/policy";
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
const FINANCE_OFFICER_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_fo",
  supabaseUserId: "sup_fo",
  role: "finance_officer",
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
  code: "KEL-001",
  notes: "Keluarga Pak Budi",
};

const HOUSEHOLD_ROW = {
  id: "h_1",
  tenantId: "tenant_a1",
  code: "KEL-001",
  notes: "Keluarga Pak Budi",
  addressId: null,
  deletedAt: null,
};

beforeEach(() => {
  mockGetSession.mockReset();
  mockWriteAuditLog.mockReset();
  mockRevalidatePath.mockReset();
  mockHouseholdCreate.mockReset();
  mockHouseholdUpdate.mockReset();
  mockHouseholdFindFirst.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("assertScope (Household policy)", () => {
  it("passes for admin role on read (presence-only check)", () => {
    expect(() => assertScope(ADMIN_SESSION, householdPolicy, "read")).not.toThrow();
  });

  it("passes for finance_officer on read (sibling-discount queries — Household read FO ALL)", () => {
    expect(() => assertScope(FINANCE_OFFICER_SESSION, householdPolicy, "read")).not.toThrow();
  });

  it("throws FORBIDDEN for parent on read (no parent grant on Household)", () => {
    expect(() => assertScope(PARENT_SESSION, householdPolicy, "read")).toThrow(/FORBIDDEN/);
  });

  it("passes for admin on create (ALL scope)", () => {
    expect(() => assertScope(ADMIN_SESSION, householdPolicy, "create")).not.toThrow();
  });

  it("throws FORBIDDEN for finance_officer on create (FO has no create grant — read-only on Household)", () => {
    expect(() => assertScope(FINANCE_OFFICER_SESSION, householdPolicy, "create")).toThrow(/FORBIDDEN/);
  });

  it("throws FORBIDDEN for kadiv on soft_delete (Household soft_delete grants A/P only)", () => {
    expect(() => assertScope(KADIV_SESSION, householdPolicy, "soft_delete")).toThrow(/FORBIDDEN/);
  });
});

describe("createHousehold", () => {
  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createHousehold(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
  });

  it("returns FORBIDDEN for finance_officer (read-only on Household)", async () => {
    mockGetSession.mockResolvedValue(FINANCE_OFFICER_SESSION);
    const result = await createHousehold(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("admin role: parses input, creates row with tenantId injection, emits CREATE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdCreate.mockResolvedValue(HOUSEHOLD_ROW);
    const result = await createHousehold(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(HOUSEHOLD_ROW);
    expect(mockHouseholdCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "tenant_a1", code: "KEL-001" }),
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        resource: "Household",
        resourceId: "h_1",
        actorUserId: "user_admin",
        before: null,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/keluarga");
  });

  it("returns INVALID_INPUT with field path when notes exceed 2000 chars", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createHousehold({ ...VALID_INPUT, notes: "a".repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("notes");
    expect(mockHouseholdCreate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe("updateHousehold", () => {
  it("returns FORBIDDEN for finance_officer (no update grant)", async () => {
    mockGetSession.mockResolvedValue(FINANCE_OFFICER_SESSION);
    const result = await updateHousehold("h_1", { code: "KEL-002" });
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("returns NOT_FOUND when household does not exist in tenant", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdFindFirst.mockResolvedValue(null);
    const result = await updateHousehold("h_missing", { code: "KEL-X" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockHouseholdUpdate).not.toHaveBeenCalled();
  });

  it("returns NO_CHANGES when input is empty", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await updateHousehold("h_1", {});
    expect(result).toEqual({ ok: false, error: "NO_CHANGES" });
    expect(mockHouseholdFindFirst).not.toHaveBeenCalled();
    expect(mockHouseholdUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("admin role: updates + emits UPDATE audit + revalidates list+detail", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdFindFirst.mockResolvedValue(HOUSEHOLD_ROW);
    const updatedRow = { ...HOUSEHOLD_ROW, notes: "Catatan baru" };
    mockHouseholdUpdate.mockResolvedValue(updatedRow);
    const result = await updateHousehold("h_1", { notes: "Catatan baru" });
    expect(result.ok).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        before: HOUSEHOLD_ROW,
        after: updatedRow,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/keluarga");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/keluarga/h_1");
  });
});

describe("softDeleteHousehold", () => {
  it("returns ALREADY_DELETED when row already has deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdFindFirst.mockResolvedValue({ ...HOUSEHOLD_ROW, deletedAt: new Date() });
    const result = await softDeleteHousehold("h_1");
    expect(result).toEqual({ ok: false, error: "ALREADY_DELETED" });
    expect(mockHouseholdUpdate).not.toHaveBeenCalled();
  });

  it("admin role: sets deletedAt + emits SOFT_DELETE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdFindFirst.mockResolvedValue(HOUSEHOLD_ROW);
    const updatedRow = { ...HOUSEHOLD_ROW, deletedAt: new Date() };
    mockHouseholdUpdate.mockResolvedValue(updatedRow);
    const result = await softDeleteHousehold("h_1");
    expect(result.ok).toBe(true);
    expect(mockHouseholdUpdate).toHaveBeenCalledWith({
      where: { id: "h_1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.SOFT_DELETE }),
      expect.anything(),
    );
  });

  it("returns FORBIDDEN for kadiv (Household soft_delete grants A/P only)", async () => {
    mockGetSession.mockResolvedValue(KADIV_SESSION);
    const result = await softDeleteHousehold("h_1");
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("restoreHousehold", () => {
  it("returns NOT_DELETED when row has no deletedAt", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockHouseholdFindFirst.mockResolvedValue(HOUSEHOLD_ROW);
    const result = await restoreHousehold("h_1");
    expect(result).toEqual({ ok: false, error: "NOT_DELETED" });
    expect(mockHouseholdUpdate).not.toHaveBeenCalled();
  });

  it("admin role: clears deletedAt + emits RESTORE audit", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const deletedRow = { ...HOUSEHOLD_ROW, deletedAt: new Date() };
    mockHouseholdFindFirst.mockResolvedValue(deletedRow);
    const restoredRow = { ...HOUSEHOLD_ROW, deletedAt: null };
    mockHouseholdUpdate.mockResolvedValue(restoredRow);
    const result = await restoreHousehold("h_1");
    expect(result.ok).toBe(true);
    expect(mockHouseholdUpdate).toHaveBeenCalledWith({
      where: { id: "h_1" },
      data: { deletedAt: null },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.RESTORE }),
      expect.anything(),
    );
  });
});
