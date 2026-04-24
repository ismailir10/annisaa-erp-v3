import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../students/[id]/enroll/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findFirst: vi.fn() },
    classSection: { findUnique: vi.fn() },
    studentEnrollment: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/students/s1/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return { id: "u1", email: "t@t", name: "T", role, tenantId: "t1", employeeId: null, parentId: null, permissions: [], customRoleCode: null };
}

const params = Promise.resolve({ id: "s1" });

describe("POST /api/students/[id]/enroll — error surface returns JSON", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 with JSON error when student already has an ACTIVE enrollment", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findUnique).mockResolvedValue({
      id: "cs1",
      program: { ageMin: null, ageMax: null },
    } as never);
    // Simulate transaction running the callback with a tx that finds an existing enrollment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) => {
      const tx = {
        studentEnrollment: {
          findFirst: vi.fn().mockResolvedValue({ id: "e1" }),
          create: vi.fn(),
        },
        $queryRaw: vi.fn(),
      };
      return cb(tx);
    });

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sudah terdaftar/i);
  });

  it("returns 400 with JSON error when class is full", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findUnique).mockResolvedValue({
      id: "cs1",
      program: { ageMin: null, ageMax: null },
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) => {
      const tx = {
        studentEnrollment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn(),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ id: "cs1", capacity: 10, active_count: BigInt(10) }]),
      };
      return cb(tx);
    });

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/penuh/i);
  });

  it("returns 201 with the created enrollment on success", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "s1", tenantId: "t1", dateOfBirth: null } as never);
    vi.mocked(prisma.classSection.findUnique).mockResolvedValue({
      id: "cs1",
      program: { ageMin: null, ageMax: null },
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: any) => {
      const tx = {
        studentEnrollment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "e1", studentId: "s1", classSectionId: "cs1" }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ id: "cs1", capacity: 10, active_count: BigInt(3) }]),
      };
      return cb(tx);
    });

    const res = await POST(makeReq({ classSectionId: "cs1" }) as never, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("e1");
  });
});
