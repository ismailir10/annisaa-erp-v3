// Tests for updateAddress server action.
// Mocks: @/lib/db (prisma), @/lib/auth/session (getSession),
// @/lib/audit/write (writeAuditLog), next/cache (revalidatePath).
//
// AC6 coverage per cycle spec:
//   - UPDATE audit row emitted on partial PATCH
//   - NO_CHANGES guard: empty input → { ok: false, error: "NO_CHANGES" }
//   - NOT_FOUND when id doesn't exist or row is soft-deleted
//   - FORBIDDEN role gates (HT/SentraTeacher/FO/parent)
//   - UNAUTHENTICATED when no session
//   - Partial chain update succeeds at app layer (no Zod chain error on partial)
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T4)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRevalidatePath = vi.fn();
const mockAddressUpdate = vi.fn();
const mockAddressFindFirst = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    address: { update: mockAddressUpdate },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
    address: {
      findFirst: (...a: unknown[]) => mockAddressFindFirst(...a),
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

import { updateAddress } from "../update";
import { AuditAction } from "@/lib/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/session";

// -- Session fixtures --------------------------------------------------------

const ADMIN_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_admin",
  supabaseUserId: "sup_admin",
  role: "admin",
  currentTermId: "term_1",
};
const PRINCIPAL_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_principal",
  supabaseUserId: "sup_principal",
  role: "principal",
  currentTermId: "term_1",
};
const HT_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_ht",
  supabaseUserId: "sup_ht",
  role: "head_teacher",
  currentTermId: "term_1",
};
const FINANCE_OFFICER_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_fo",
  supabaseUserId: "sup_fo",
  role: "finance_officer",
  currentTermId: "term_1",
};
const PARENT_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_parent",
  supabaseUserId: "sup_parent",
  role: "parent",
  currentTermId: "term_1",
};
const SENTRA_TEACHER_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_st",
  supabaseUserId: "sup_st",
  role: "sentra_teacher",
  currentTermId: "term_1",
};

// -- Data fixtures -----------------------------------------------------------

const ADDRESS_ROW = {
  id: "addr_1",
  tenantId: "tenant_a1",
  provinceId: "31",
  regencyId: "3171",
  districtId: "317101",
  villageId: null,
  streetLine: "Jalan Merdeka No. 1",
  rt: null,
  rw: null,
  postalCode: null,
  notes: null,
  createdById: "user_admin",
  updatedById: "user_admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  deletedById: null,
};

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  mockGetSession.mockReset();
  mockWriteAuditLog.mockReset();
  mockRevalidatePath.mockReset();
  mockAddressUpdate.mockReset();
  mockAddressFindFirst.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

// -- Tests -------------------------------------------------------------------

describe("updateAddress — UNAUTHENTICATED", () => {
  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await updateAddress("addr_1", { streetLine: "New Street" });
    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    expect(mockAddressUpdate).not.toHaveBeenCalled();
  });
});

describe("updateAddress — FORBIDDEN role gates", () => {
  it.each([
    ["head_teacher", HT_SESSION],
    ["sentra_teacher", SENTRA_TEACHER_SESSION],
    ["finance_officer", FINANCE_OFFICER_SESSION],
    ["parent", PARENT_SESSION],
  ])("%s returns FORBIDDEN", async (_role, session) => {
    mockGetSession.mockResolvedValue(session);
    const result = await updateAddress("addr_1", { streetLine: "New Street" });
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mockAddressUpdate).not.toHaveBeenCalled();
  });
});

describe("updateAddress — NO_CHANGES guard", () => {
  it("returns NO_CHANGES when input is empty object", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await updateAddress("addr_1", {});
    expect(result).toEqual({ ok: false, error: "NO_CHANGES" });
    // Should NOT hit the DB at all
    expect(mockAddressFindFirst).not.toHaveBeenCalled();
    expect(mockAddressUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe("updateAddress — NOT_FOUND", () => {
  it("returns NOT_FOUND when address does not exist in tenant", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(null);
    const result = await updateAddress("addr_missing", { streetLine: "New" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockAddressUpdate).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when row is soft-deleted (findFirst returns null for deletedAt: null filter)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    // The action queries { deletedAt: null } — a soft-deleted row won't match
    mockAddressFindFirst.mockResolvedValue(null);
    const result = await updateAddress("addr_deleted", { streetLine: "New" });
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mockAddressUpdate).not.toHaveBeenCalled();
  });
});

describe("updateAddress — happy path", () => {
  it("admin: partial PATCH updates row, emits UPDATE audit, revalidates list (no Address-detail-by-id route)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    const updatedRow = { ...ADDRESS_ROW, streetLine: "Jalan Sudirman No. 5", updatedById: "user_admin" };
    mockAddressUpdate.mockResolvedValue(updatedRow);

    const result = await updateAddress("addr_1", { streetLine: "Jalan Sudirman No. 5" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.streetLine).toBe("Jalan Sudirman No. 5");

    expect(mockAddressUpdate).toHaveBeenCalledWith({
      where: { id: "addr_1" },
      data: expect.objectContaining({
        streetLine: "Jalan Sudirman No. 5",
        updatedById: "user_admin",
      }),
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        resource: "Address",
        resourceId: "addr_1",
        actorUserId: "user_admin",
        before: ADDRESS_ROW,
        after: updatedRow,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/keluarga");
    // Address has no standalone detail route — Address id is NOT a Household
    // route key. Only the list path is revalidated. (End-of-cycle reviewer fix.)
    expect(mockRevalidatePath).not.toHaveBeenCalledWith("/admin/akademik/keluarga/addr_1");
  });

  it("principal: permitted to update", async () => {
    mockGetSession.mockResolvedValue(PRINCIPAL_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    const updatedRow = { ...ADDRESS_ROW, notes: "Dekat sekolah" };
    mockAddressUpdate.mockResolvedValue(updatedRow);

    const result = await updateAddress("addr_1", { notes: "Dekat sekolah" });
    expect(result.ok).toBe(true);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.UPDATE }),
      expect.anything(),
    );
  });

  it("partial chain update — only updating streetLine (no chain fields) succeeds without Zod chain error", async () => {
    // This tests that .partial() correctly strips the chain-validity superRefine.
    // Sending only streetLine (no provinceId/regencyId/districtId) should pass Zod.
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    const updatedRow = { ...ADDRESS_ROW, streetLine: "Jalan Baru No. 99" };
    mockAddressUpdate.mockResolvedValue(updatedRow);

    const result = await updateAddress("addr_1", { streetLine: "Jalan Baru No. 99" });
    // Should succeed — no chain fields present, partial schema does not trigger superRefine
    expect(result.ok).toBe(true);
    expect(mockAddressUpdate).toHaveBeenCalled();
  });

  it("partial chain update — updating regencyId alone would fail full schema but passes partial (DB FK is safety net)", async () => {
    // Sending regencyId="3271" without provinceId — the full schema superRefine
    // would flag "regency_outside_province" if provinceId were "31". But in a
    // partial update, provinceId is undefined so the guard's length check on
    // provinceId.length === 2 is skipped (the field is not in the input).
    // This is the intentional behavior per spec T4 step 2.
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    const updatedRow = { ...ADDRESS_ROW, regencyId: "3271" };
    mockAddressUpdate.mockResolvedValue(updatedRow);

    const result = await updateAddress("addr_1", { regencyId: "3271" });
    // Passes Zod partial validation — DB compound FK is the safety net
    expect(result.ok).toBe(true);
    expect(mockAddressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "addr_1" } }),
    );
  });

  it("partial PATCH on optional fields (rt, rw, postalCode, notes) succeeds", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    const updatedRow = { ...ADDRESS_ROW, rt: "001", rw: "002", postalCode: "10110", notes: "Dekat pos" };
    mockAddressUpdate.mockResolvedValue(updatedRow);

    const result = await updateAddress("addr_1", { rt: "001", rw: "002", postalCode: "10110", notes: "Dekat pos" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rt).toBe("001");
      expect(result.data.rw).toBe("002");
      expect(result.data.postalCode).toBe("10110");
    }
  });
});

describe("updateAddress — findFirst predicate", () => {
  it("queries with tenant isolation and deletedAt: null", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressFindFirst.mockResolvedValue(ADDRESS_ROW);
    mockAddressUpdate.mockResolvedValue(ADDRESS_ROW);

    await updateAddress("addr_1", { streetLine: "Any Street" });

    expect(mockAddressFindFirst).toHaveBeenCalledWith({
      where: { id: "addr_1", tenantId: "tenant_a1", deletedAt: null },
    });
  });
});
