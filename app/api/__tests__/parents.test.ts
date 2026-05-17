import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    parent: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

// Rate limit module is in-process and stateful; clear between tests so each
// case starts at quota.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

function makeReq(body: unknown, method = "PUT") {
  return new Request("http://localhost:3000/api/parents/p1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

const params = Promise.resolve({ id: "p1" });

const baseParent = {
  id: "p1",
  tenantId: "t1",
  name: "Existing Parent",
  email: "x@y.com",
  phone: "0810",
  whatsapp: "0810",
  address: null,
  status: "ACTIVE",
  nik: null,
  education: null,
  occupation: null,
  employer: null,
  employerAddress: null,
  employerCity: null,
  incomeRange: null,
  childrenTotal: null,
};

// Cold-start can take >5s to resolve the dynamic imports in this file under
// CI; bump the per-suite timeout so the first dynamic-import doesn't time out
// before the mock chain runs.
describe("PUT /api/parents/[id]", { timeout: 30_000 }, () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates parent fields and returns the updated row", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { PUT } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(baseParent as never);
    vi.mocked(prisma.parent.update).mockResolvedValue({
      ...baseParent,
      name: "Updated Name",
      email: "new@y.com",
    } as never);

    const res = await PUT(
      makeReq({ name: "Updated Name", email: "new@y.com" }) as never,
      { params },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");
    expect(body.email).toBe("new@y.com");
    expect(prisma.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ name: "Updated Name", email: "new@y.com" }),
      }),
    );
  });

  it("returns 404 when parent belongs to a different tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { PUT } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(null);

    const res = await PUT(makeReq({ name: "x" }) as never, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ditemukan/i);
    expect(prisma.parent.update).not.toHaveBeenCalled();
    // Prove tenant isolation is enforced in the query, not just that a null
    // lookup yields 404 — a regression dropping tenantId would pass otherwise.
    expect(prisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", tenantId: "t1" } }),
    );
  });

  it("returns 403 for non-admin caller", async () => {
    const { getSession } = await import("@/lib/auth");
    const { PUT } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession("TEACHER" as SessionUser["role"]));

    const res = await PUT(makeReq({ name: "x" }) as never, { params });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/parents/[id]", { timeout: 30_000 }, () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggles status from ACTIVE to INACTIVE", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { PATCH } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(baseParent as never);
    vi.mocked(prisma.parent.update).mockResolvedValue({
      ...baseParent,
      status: "INACTIVE",
    } as never);

    const res = await PATCH(makeReq({ status: "INACTIVE" }, "PATCH") as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("INACTIVE");
    expect(prisma.parent.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "INACTIVE" },
    });
  });

  it("returns 400 when status is not in the enum", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { PATCH } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(baseParent as never);

    const res = await PATCH(makeReq({ status: "BANNED" }, "PATCH") as never, { params });
    expect(res.status).toBe(400);
    expect(prisma.parent.update).not.toHaveBeenCalled();
  });

  it("returns 404 when parent belongs to a different tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { PATCH } = await import("../parents/[id]/route");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    vi.mocked(prisma.parent.findFirst).mockResolvedValue(null);

    const res = await PATCH(makeReq({ status: "INACTIVE" }, "PATCH") as never, { params });
    expect(res.status).toBe(404);
    expect(prisma.parent.update).not.toHaveBeenCalled();
    expect(prisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", tenantId: "t1" } }),
    );
  });
});
