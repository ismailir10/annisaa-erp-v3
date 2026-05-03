/**
 * Coverage for `GET /api/payroll/[id]` — payroll run detail with items + lines.
 * Verifies tenant scoping (404 when row's tenantId mismatches session) and
 * the permission gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: { findUnique },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

function makeSession(role: SessionUser["role"] = "SUPER_ADMIN"): SessionUser {
  return {
    id: "u1",
    email: "a@a",
    name: "A",
    role,
    tenantId: "t-1",
    employeeId: null,
    parentId: null,
    permissions: getSystemRolePermissions(role),
    customRoleCode: null,
  };
}

async function mockSession(s: SessionUser | null) {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(s);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq() {
  return new Request("http://localhost/api/payroll/p1");
}

describe("GET /api/payroll/[id]", () => {
  it("returns the run with nested items + lines for own tenant", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    const row = {
      id: "p1",
      tenantId: "t-1",
      status: "DRAFT",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      items: [],
    };
    findUnique.mockResolvedValueOnce(row);

    const { GET } = await import("../payroll/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: "p1", tenantId: "t-1" });
    // Eager-load shape: items → employee + lines (sorted by component sortOrder).
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        include: expect.objectContaining({
          items: expect.objectContaining({
            include: expect.objectContaining({
              employee: expect.any(Object),
              lines: expect.any(Object),
            }),
          }),
        }),
      }),
    );
  });

  it("404 when row exists but belongs to a different tenant", async () => {
    await mockSession(makeSession("SUPER_ADMIN")); // tenantId t-1
    findUnique.mockResolvedValueOnce({
      id: "p1",
      tenantId: "t-other",
      status: "DRAFT",
      items: [],
    });

    const { GET } = await import("../payroll/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(404);
  });

  it("404 when row is missing", async () => {
    await mockSession(makeSession("SUPER_ADMIN"));
    findUnique.mockResolvedValueOnce(null);

    const { GET } = await import("../payroll/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 when no session", async () => {
    await mockSession(null);

    const { GET } = await import("../payroll/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin (TEACHER lacks payroll.view)", async () => {
    await mockSession(makeSession("TEACHER"));

    const { GET } = await import("../payroll/[id]/route");
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "p1" }),
    });

    expect(res.status).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
