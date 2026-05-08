// Tests for createAddress server action.
// Mocks: @/lib/db (prisma), @/lib/auth/session (getSession),
// @/lib/audit/write (writeAuditLog), next/cache (revalidatePath).
//
// AC6 coverage per cycle spec:
//   - chain-validity rejection (province/regency mismatch)
//   - chain-validity rejection (regency/district mismatch)
//   - chain-validity rejection (district/village mismatch)
//   - optional villageId: omitting still passes
//   - role gates: admin/principal/kadiv/admission_officer succeed
//   - role gates: HT/sentra_teacher/finance_officer/parent return FORBIDDEN
//   - UNAUTHENTICATED when session is null
//   - happy-path: returns { ok: true, data } and emits CREATE audit row
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T4)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockRevalidatePath = vi.fn();
const mockAddressCreate = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    address: { create: mockAddressCreate },
  }),
);

vi.mock("@/lib/db", () => ({
  prisma: {
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

import { createAddress } from "../create";
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
const KADIV_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_kadiv",
  supabaseUserId: "sup_kadiv",
  role: "kadiv",
  currentTermId: "term_1",
};
const ADMISSION_OFFICER_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_ao",
  supabaseUserId: "sup_ao",
  role: "admission_officer",
  currentTermId: "term_1",
};
const HT_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_ht",
  supabaseUserId: "sup_ht",
  role: "head_teacher",
  currentTermId: "term_1",
};
const SENTRA_TEACHER_SESSION: SessionContext = {
  tenantId: "tenant_a1",
  userId: "user_st",
  supabaseUserId: "sup_st",
  role: "sentra_teacher",
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

// -- Input fixtures ----------------------------------------------------------

// Valid DKI Jakarta chain: province 31, regency 3171, district 317101, village 3171010001
const VALID_INPUT = {
  provinceId: "31",
  regencyId: "3171",
  districtId: "317101",
  streetLine: "Jalan Merdeka No. 1",
};

const VALID_INPUT_WITH_VILLAGE = {
  ...VALID_INPUT,
  villageId: "3171010001",
};

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
  mockAddressCreate.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

// -- Tests -------------------------------------------------------------------

describe("createAddress — UNAUTHENTICATED", () => {
  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createAddress(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });
});

describe("createAddress — role gates (FORBIDDEN)", () => {
  it.each([
    ["head_teacher", HT_SESSION],
    ["sentra_teacher", SENTRA_TEACHER_SESSION],
    ["finance_officer", FINANCE_OFFICER_SESSION],
    ["parent", PARENT_SESSION],
  ])("%s returns FORBIDDEN", async (_role, session) => {
    mockGetSession.mockResolvedValue(session);
    const result = await createAddress(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });
});

describe("createAddress — chain-validity rejections", () => {
  it("rejects when regencyId does not start with provinceId (province 31 + regency 3271)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createAddress({
      ...VALID_INPUT,
      regencyId: "3271",
      // districtId must start with regencyId — use matching prefix for regency 3271
      districtId: "327101",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("regency_outside_province");
      expect(result.field).toBe("regencyId");
    }
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });

  it("rejects when districtId does not start with regencyId (regency 3171 + district 327101)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createAddress({
      ...VALID_INPUT,
      districtId: "327101",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("district_outside_regency");
      expect(result.field).toBe("districtId");
    }
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });

  it("rejects when villageId does not start with districtId (district 317101 + village 3271010001)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const result = await createAddress({
      ...VALID_INPUT,
      villageId: "3271010001",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("village_outside_district");
      expect(result.field).toBe("villageId");
    }
    expect(mockAddressCreate).not.toHaveBeenCalled();
  });
});

describe("createAddress — optional villageId", () => {
  it("succeeds when villageId is omitted", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockAddressCreate.mockResolvedValue(ADDRESS_ROW);
    const result = await createAddress(VALID_INPUT); // no villageId
    expect(result.ok).toBe(true);
    expect(mockAddressCreate).toHaveBeenCalled();
  });
});

describe("createAddress — happy path (permitted roles)", () => {
  it.each([
    ["admin", ADMIN_SESSION],
    ["principal", PRINCIPAL_SESSION],
    ["kadiv", KADIV_SESSION],
    ["admission_officer", ADMISSION_OFFICER_SESSION],
  ])("%s role: creates row with tenantId injection, emits CREATE audit, revalidates", async (_role, session) => {
    mockGetSession.mockResolvedValue(session);
    const rowForSession = { ...ADDRESS_ROW, tenantId: session.tenantId, createdById: session.userId, updatedById: session.userId };
    mockAddressCreate.mockResolvedValue(rowForSession);

    const result = await createAddress(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(rowForSession);

    expect(mockAddressCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: session.tenantId,
        createdById: session.userId,
        updatedById: session.userId,
        provinceId: "31",
        regencyId: "3171",
        districtId: "317101",
        streetLine: "Jalan Merdeka No. 1",
      }),
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        resource: "Address",
        resourceId: rowForSession.id,
        actorUserId: session.userId,
        before: null,
        after: rowForSession,
      }),
      expect.anything(),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/akademik/keluarga");
  });

  it("succeeds with villageId included in valid chain", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const rowWithVillage = { ...ADDRESS_ROW, villageId: "3171010001" };
    mockAddressCreate.mockResolvedValue(rowWithVillage);

    const result = await createAddress(VALID_INPUT_WITH_VILLAGE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.villageId).toBe("3171010001");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE }),
      expect.anything(),
    );
  });
});
