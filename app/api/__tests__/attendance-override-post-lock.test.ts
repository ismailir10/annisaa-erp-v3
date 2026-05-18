/**
 * Blocker B4 (2026-05-17 review): the PUT handler on
 * `/api/attendance/[id]/override` correctly rejects updates when the existing
 * record's `isLocked` is true (payroll already approved), but the POST handler
 * — which `upsert`s by the `{employeeId, date}` composite key — was missing
 * the same guard. A caller could overwrite a payroll-locked record by hitting
 * POST instead of PUT, breaking the payroll audit trail.
 *
 * This test pins the new pre-upsert `findUnique({...isLocked...})` guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

const attendanceFindUnique = vi.fn();
const attendanceUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    attendanceRecord: {
      findUnique: attendanceFindUnique,
      upsert: attendanceUpsert,
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

const verifyTenantOwnership = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: (...args: unknown[]) => verifyTenantOwnership(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function makeSession(): SessionUser {
  return {
    id: "user-1",
    email: "admin@school.test",
    name: "Admin",
    role: "SCHOOL_ADMIN",
    tenantId: "tenant-1",
    employeeId: null,
    parentId: null,
    permissions: ["attendance.override"],
    customRoleCode: null,
  };
}

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/attendance/emp-1/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  date: "2026-04-20",
  status: "PRESENT",
  reason: "Manual override test",
};

describe("POST /api/attendance/[id]/override — payroll-lock guard (B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyTenantOwnership.mockResolvedValue(true);
  });

  it("rejects with 400 when the existing record is payroll-locked", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    attendanceFindUnique.mockResolvedValue({
      id: "att-1",
      employeeId: "emp-1",
      date: "2026-04-20",
      isLocked: true,
    });

    const { POST } = await import("../attendance/[id]/override/route");
    const res = await POST(makeReq(validBody) as never, {
      params: Promise.resolve({ id: "emp-1" }),
    } as never);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "Record terkunci (payroll sudah disetujui)" });
    expect(attendanceUpsert).not.toHaveBeenCalled();
  });

  it("proceeds with upsert when no existing record blocks", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    attendanceFindUnique.mockResolvedValue(null);
    attendanceUpsert.mockResolvedValue({
      id: "att-new",
      employeeId: "emp-1",
      date: "2026-04-20",
      status: "PRESENT",
    });

    const { POST } = await import("../attendance/[id]/override/route");
    const res = await POST(makeReq(validBody) as never, {
      params: Promise.resolve({ id: "emp-1" }),
    } as never);

    expect(res.status).toBe(200);
    expect(attendanceUpsert).toHaveBeenCalledOnce();
  });

  it("proceeds with upsert when existing record is not locked", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    attendanceFindUnique.mockResolvedValue({
      id: "att-2",
      employeeId: "emp-1",
      date: "2026-04-20",
      isLocked: false,
    });
    attendanceUpsert.mockResolvedValue({
      id: "att-2",
      employeeId: "emp-1",
      date: "2026-04-20",
      status: "LATE",
    });

    const { POST } = await import("../attendance/[id]/override/route");
    const res = await POST(
      makeReq({ ...validBody, status: "LATE" }) as never,
      { params: Promise.resolve({ id: "emp-1" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(attendanceUpsert).toHaveBeenCalledOnce();
  });
});
