import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findFirst: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    feeComponentDef: { findFirst: vi.fn() },
    studentFeeAdjustment: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

// Rate limiting is exercised elsewhere (lib/rate-limit itself); stub it out
// here so many POST/PUT calls in one test file never collide on the shared
// in-memory bucket, mirroring the mock style used across app/api/__tests__.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { GET, POST } from "../student-fee-adjustments/route";
import { PUT } from "../student-fee-adjustments/[id]/route";

function makeReq(url: string, body?: unknown, method: "GET" | "POST" = body ? "POST" : "GET") {
  return new Request(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function adminSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u-1",
    email: "admin@test.com",
    name: "Admin",
    role: "SUPER_ADMIN" as const,
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
    permissions: [] as string[],
    customRoleCode: null,
    ...overrides,
  };
}

const validCreateBody = {
  studentId: "student-1",
  academicYearId: "year-1",
  feeComponentId: "component-1",
  type: "DISCOUNT",
  mode: "PERCENT",
  value: 20,
  reason: "Diskon anak kedua",
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function primeAdminSession(role: string = "SUPER_ADMIN") {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(adminSession({ role }) as never);
}

describe("student-fee-adjustments — auth guard", () => {
  it("POST returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });

  it("POST returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession({ role: "TEACHER" }) as never);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(403);
    // Assert the write never happened, not just the status code. Today the
    // guard runs before any Prisma call, but a status-only assertion would
    // keep passing if that order were ever refactored.
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });

  it("GET returns 403 for GUARDIAN (parent) role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession({ role: "GUARDIAN" }) as never);

    const res = await GET(makeReq("http://localhost/api/student-fee-adjustments") as never);
    expect(res.status).toBe(403);
    expect(prisma.studentFeeAdjustment.findMany).not.toHaveBeenCalled();
  });

  it("POST returns 403 for GUARDIAN (parent) role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession({ role: "GUARDIAN" }) as never);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised status filter rather than returning an empty list", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession() as never);

    const res = await GET(
      makeReq("http://localhost/api/student-fee-adjustments?status=DELETED") as never
    );
    expect(res.status).toBe(400);
    expect(prisma.studentFeeAdjustment.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/student-fee-adjustments — validation", () => {
  it("returns 400 with a { error, issues } envelope on an invalid body", async () => {
    await primeAdminSession();

    const res = await POST(
      makeReq("http://localhost/api/student-fee-adjustments", {
        ...validCreateBody,
        mode: "PERCENT",
        value: 150, // over the 100% cap
      }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects a studentId that does not belong to the tenant", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.student.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({ id: "year-1" } as never);
    vi.mocked(prisma.feeComponentDef.findFirst).mockResolvedValue({ id: "component-1" } as never);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(404);
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });

  it("rejects an academicYearId that does not belong to the tenant", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "student-1" } as never);
    vi.mocked(prisma.academicYear.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.feeComponentDef.findFirst).mockResolvedValue({ id: "component-1" } as never);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(404);
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });

  it("rejects a feeComponentId that does not belong to the tenant", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "student-1" } as never);
    vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({ id: "year-1" } as never);
    vi.mocked(prisma.feeComponentDef.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq("http://localhost/api/student-fee-adjustments", validCreateBody) as never);
    expect(res.status).toBe(404);
    expect(prisma.studentFeeAdjustment.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/student-fee-adjustments — session-derived fields", () => {
  it("takes tenantId and createdBy from the session even when the body tries to override them", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.student.findFirst).mockResolvedValue({ id: "student-1" } as never);
    vi.mocked(prisma.academicYear.findFirst).mockResolvedValue({ id: "year-1" } as never);
    vi.mocked(prisma.feeComponentDef.findFirst).mockResolvedValue({ id: "component-1" } as never);
    vi.mocked(prisma.studentFeeAdjustment.create).mockResolvedValue({ id: "adj-1" } as never);

    const res = await POST(
      makeReq("http://localhost/api/student-fee-adjustments", {
        ...validCreateBody,
        tenantId: "attacker-tenant",
        createdBy: "attacker-user",
      }) as never
    );
    expect(res.status).toBe(201);

    const createCall = vi.mocked(prisma.studentFeeAdjustment.create).mock.calls[0][0];
    expect(createCall.data.tenantId).toBe("tnt-1");
    expect(createCall.data.createdBy).toBe("u-1");
  });
});

describe("GET /api/student-fee-adjustments — tenant scope, filters, pagination", () => {
  it("scopes to tenant and passes each filter + pagination through to prisma", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.studentFeeAdjustment.count).mockResolvedValue(0);

    const url =
      "http://localhost/api/student-fee-adjustments" +
      "?studentId=student-1&academicYearId=year-1&feeComponentId=component-1" +
      "&status=ACTIVE&search=Budi&page=2&pageSize=5";
    const res = await GET(makeReq(url) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ page: 2, pageSize: 5, total: 0, totalPages: 0 });

    const findManyCall = vi.mocked(prisma.studentFeeAdjustment.findMany).mock.calls[0]![0]!;
    expect(findManyCall.where).toMatchObject({
      tenantId: "tnt-1",
      studentId: "student-1",
      academicYearId: "year-1",
      feeComponentId: "component-1",
      status: "ACTIVE",
    });
    expect(findManyCall.where!.student!.OR).toEqual([
      { name: { contains: "Budi", mode: "insensitive" } },
      { nis: { contains: "Budi", mode: "insensitive" } },
    ]);
    expect(findManyCall.skip).toBe(5); // (page 2 - 1) * pageSize 5
    expect(findManyCall.take).toBe(5);

    const countCall = vi.mocked(prisma.studentFeeAdjustment.count).mock.calls[0]![0]!;
    expect(countCall.where).toMatchObject({ tenantId: "tnt-1", studentId: "student-1" });
  });

  it("includes student/feeComponent/academicYear relation data for the admin table", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.studentFeeAdjustment.count).mockResolvedValue(0);

    await GET(makeReq("http://localhost/api/student-fee-adjustments") as never);

    const findManyCall = vi.mocked(prisma.studentFeeAdjustment.findMany).mock.calls[0]![0]!;
    expect(findManyCall.include).toMatchObject({
      student: { select: { name: true, nis: true } },
      feeComponent: { select: { label: true } },
      academicYear: { select: { name: true } },
    });
  });
});

describe("PUT /api/student-fee-adjustments/[id]", () => {
  it("returns 404 for an id belonging to another tenant", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue(null);

    const res = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { status: "INACTIVE" }) as never,
      makeParams("adj-1")
    );
    expect(res.status).toBe(404);
    expect(prisma.studentFeeAdjustment.update).not.toHaveBeenCalled();
  });

  it("soft-deletes then reactivates in a roundtrip", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    const existing = {
      id: "adj-1",
      tenantId: "tnt-1",
      mode: "FIXED",
      value: 50000,
      status: "ACTIVE",
    };
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.studentFeeAdjustment.update).mockResolvedValue({
      ...existing,
      status: "INACTIVE",
    } as never);

    const deactivateRes = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { status: "INACTIVE" }) as never,
      makeParams("adj-1")
    );
    expect(deactivateRes.status).toBe(200);
    const deactivated = await deactivateRes.json();
    expect(deactivated.status).toBe("INACTIVE");

    // Reactivate — restart from the now-inactive stored row.
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue({
      ...existing,
      status: "INACTIVE",
    } as never);
    vi.mocked(prisma.studentFeeAdjustment.update).mockResolvedValue({
      ...existing,
      status: "ACTIVE",
    } as never);

    const reactivateRes = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { status: "ACTIVE" }) as never,
      makeParams("adj-1")
    );
    expect(reactivateRes.status).toBe(200);
    const reactivated = await reactivateRes.json();
    expect(reactivated.status).toBe("ACTIVE");
  });

  it("rejects { value: 150 } alone when the stored row has mode: PERCENT — cannot be pushed over 100 one field at a time", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue({
      id: "adj-1",
      tenantId: "tnt-1",
      mode: "PERCENT",
      value: 50,
      status: "ACTIVE",
    } as never);

    const res = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { value: 150 }) as never,
      makeParams("adj-1")
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/persentase/i);
    expect(prisma.studentFeeAdjustment.update).not.toHaveBeenCalled();
  });

  it("accepts { value: 150 } when the stored row has mode: FIXED", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue({
      id: "adj-1",
      tenantId: "tnt-1",
      mode: "FIXED",
      value: 50,
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.studentFeeAdjustment.update).mockResolvedValue({
      id: "adj-1",
      mode: "FIXED",
      value: 150,
      status: "ACTIVE",
    } as never);

    const res = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { value: 150 }) as never,
      makeParams("adj-1")
    );
    expect(res.status).toBe(200);
    expect(prisma.studentFeeAdjustment.update).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(prisma.studentFeeAdjustment.update).mock.calls[0][0];
    expect(updateCall.data.value).toBe(150);
  });

  it("clears a validity bound back to open-ended when sent an explicit null", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue({
      id: "adj-1",
      tenantId: "tnt-1",
      mode: "PERCENT",
      value: 20,
      validFrom: "2026-01-01",
      validTo: "2026-06-30",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.studentFeeAdjustment.update).mockResolvedValue({ id: "adj-1" } as never);

    const res = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", { validTo: null }) as never,
      makeParams("adj-1")
    );
    expect(res.status).toBe(200);
    // null must survive to Prisma. An omitted key would mean "unchanged",
    // leaving the grant permanently bounded once a date had been set.
    const call = vi.mocked(prisma.studentFeeAdjustment.update).mock.calls[0][0];
    expect(call.data.validTo).toBeNull();
  });

  it("rejects a validFrom that lands after the stored validTo", async () => {
    await primeAdminSession();
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.studentFeeAdjustment.findFirst).mockResolvedValue({
      id: "adj-1",
      tenantId: "tnt-1",
      mode: "PERCENT",
      value: 20,
      validFrom: "2026-01-01",
      validTo: "2026-06-30",
      status: "ACTIVE",
    } as never);

    const res = await PUT(
      makeReq("http://localhost/api/student-fee-adjustments/adj-1", {
        validFrom: "2026-09-01",
      }) as never,
      makeParams("adj-1")
    );
    expect(res.status).toBe(400);
    expect(prisma.studentFeeAdjustment.update).not.toHaveBeenCalled();
  });
});
