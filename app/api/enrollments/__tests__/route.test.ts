import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { findMany, count, getSession, isAdminRole } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  getSession: vi.fn(),
  isAdminRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { enrollmentApplication: { findMany, count } } }));
vi.mock("@/lib/auth", () => ({ getSession, isAdminRole }));

import { GET } from "../route";

const req = () => new NextRequest("http://localhost/api/enrollments?page=1&pageSize=20");

beforeEach(() => {
  vi.clearAllMocks();
  isAdminRole.mockReturnValue(true);
  findMany.mockResolvedValue([{ id: "ea-1" }]);
  count.mockResolvedValue(1);
});

describe("GET /api/enrollments", () => {
  it("denies custom finance admins without querying records", async () => {
    getSession.mockResolvedValue({ tenantId: "t-1", role: "SCHOOL_ADMIN", permissions: ["invoices.view"] });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("allows admissions.view and preserves tenant filtering", async () => {
    getSession.mockResolvedValue({ tenantId: "t-1", role: "SCHOOL_ADMIN", permissions: ["admissions.view"] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ id: "ea-1" }]);
    expect(findMany.mock.calls[0][0].where.tenantId).toBe("t-1");
    expect(count.mock.calls[0][0].where.tenantId).toBe("t-1");
  });

  it("keeps the base admin-role boundary even if a teacher has a permission grant", async () => {
    getSession.mockResolvedValue({ tenantId: "t-1", role: "TEACHER", permissions: ["admissions.view"] });
    isAdminRole.mockReturnValue(false);
    expect((await GET(req())).status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });
});
