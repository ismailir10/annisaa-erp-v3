import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import type { SessionUser } from "@/lib/auth";

/**
 * Coverage for PUT /api/guardians/[id] hardening:
 *
 * P1 — prisma.parent.update can throw P2002 on the tenant-unique email
 * (two guardians sharing an edited email). Must surface 409 with
 * Indonesian copy, not bubble as an unhandled 500.
 *
 * P0 — isPrimary:true must run inside a serializable transaction that
 * demotes any existing primary sibling (`id: { not: <this guardian> }`)
 * before writing the new primary, porting the race-safe pattern from
 * app/api/students/[id]/guardians/[guardianId]/route.ts.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    studentGuardian: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    parent: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/guardians/g-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(): SessionUser {
  return {
    id: "u1",
    email: "admin@t.com",
    name: "Admin",
    role: "SUPER_ADMIN",
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function baseGuardian() {
  return {
    id: "g-1",
    studentId: "st-1",
    parentId: "p-1",
    relationship: "AYAH",
    isPrimary: false,
    status: "ACTIVE",
    student: { tenantId: "tnt-1" },
    parent: {
      id: "p-1",
      name: "Ayah",
      phone: null,
      email: "old@x.com",
      whatsapp: null,
      nik: null,
      education: null,
      occupation: null,
      employer: null,
      employerAddress: null,
      employerCity: null,
      incomeRange: null,
      address: null,
      childrenTotal: null,
    },
  };
}

describe("PUT /api/guardians/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 409 when parent.update rejects with P2002 (duplicate email)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue(baseGuardian() as never);

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`tenantId`,`email`)",
      { code: "P2002", clientVersion: "test", meta: { target: ["tenantId", "email"] } },
    );
    vi.mocked(prisma.parent.update).mockRejectedValue(p2002);

    const { PUT } = await import("../guardians/[id]/route");
    const res = await PUT(makeReq({ email: "dupe@x.com" }) as never, {
      params: Promise.resolve({ id: "g-1" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Email sudah digunakan oleh wali lain.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses a transaction and demotes sibling primaries when isPrimary:true", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.studentGuardian.findFirst).mockResolvedValue(baseGuardian() as never);
    vi.mocked(prisma.parent.update).mockResolvedValue({} as never);

    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const txUpdateMock = vi.fn().mockResolvedValue({ id: "g-1", isPrimary: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) => {
      const tx = {
        studentGuardian: {
          updateMany: updateManyMock,
          update: txUpdateMock,
        },
      };
      return cb(tx);
    });

    const { PUT } = await import("../guardians/[id]/route");
    const res = await PUT(makeReq({ isPrimary: true }) as never, {
      params: Promise.resolve({ id: "g-1" }),
    });

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { studentId: "st-1", isPrimary: true, id: { not: "g-1" } },
      data: { isPrimary: false },
    });
    expect(txUpdateMock).toHaveBeenCalledTimes(1);
  });
});
