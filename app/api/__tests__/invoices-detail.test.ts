/**
 * Coverage for `GET /api/invoices/[id]` — admin invoice detail.
 * Verifies tenant scoping (cross-tenant returns 404) and the role gate.
 *
 * Note: this route returns `NextResponse.json(null, { status: 403 })` for
 * unauth/wrong-role rather than the `{ error: "Forbidden" }` shape used
 * elsewhere — the assertions below match the actual route behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { findUnique },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function adminSession() {
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
  };
}

function makeReq() {
  return new Request("http://localhost/api/invoices/inv-1");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/invoices/[id]", () => {
  it("returns the invoice when it belongs to the session's tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    findUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-1",
      status: "DRAFT",
      totalDue: 100_000,
      lines: [],
      payments: [],
      student: { guardians: [] },
    });

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: "inv-1", tenantId: "tnt-1" });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        include: expect.any(Object),
      }),
    );
  });

  it("404 when the row exists but for another tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession()); // tnt-1
    findUnique.mockResolvedValueOnce({
      id: "inv-1",
      tenantId: "tnt-other",
      status: "DRAFT",
      lines: [],
      payments: [],
      student: { guardians: [] },
    });

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("404 when the row does not exist", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    findUnique.mockResolvedValueOnce(null);

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("403 when no session", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("403 for TEACHER (non-admin role)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("403 for GUARDIAN (non-admin role)", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "GUARDIAN" as const,
    });

    const { GET } = await import("../invoices/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
