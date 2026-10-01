import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Teacher picker for class admins. The REAL requirePermission and the REAL
 * getSystemRolePermissions run; only the session source (getSession) and
 * prisma are mocked. Regression: SCHOOL_ADMIN lacks hr.view, so the picker
 * must be served under academic.edit instead.
 */
const { getSession, classFindFirst, employeeFindMany, employeeCount } = vi.hoisted(() => ({
  getSession: vi.fn(),
  classFindFirst: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    classSection: { findFirst: classFindFirst },
    employee: { findMany: employeeFindMany, count: employeeCount },
  },
}));
vi.mock("@/lib/auth", () => ({ getSession }));

import { GET } from "../route";
import { getSystemRolePermissions } from "@/lib/permissions";

const ctx = { params: Promise.resolve({ id: "class-1" }) };
const get = (qs = "") =>
  GET(new NextRequest(`http://localhost/api/admin/classes/class-1/teacher-options${qs}`), ctx);

const sessionFor = (role: string) => ({
  id: `u_${role}`,
  tenantId: "t-1",
  role,
  permissions: getSystemRolePermissions(role),
});

const rows = [
  { id: "e1", nama: "Ahmad", formalName: "Ustadz Ahmad" },
  { id: "e2", nama: "Siti", formalName: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(sessionFor("SCHOOL_ADMIN"));
  classFindFirst.mockResolvedValue({ id: "class-1" });
  employeeFindMany.mockResolvedValue(rows);
  employeeCount.mockResolvedValue(rows.length);
});

describe("GET /api/admin/classes/[id]/teacher-options", () => {
  it("SCHOOL_ADMIN (real permission set) gets 200 with minimal, tenant+ACTIVE-scoped rows", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(rows);
    expect(body.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });

    expect(employeeFindMany).toHaveBeenCalledTimes(1);
    const args = employeeFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: "t-1", status: "ACTIVE" });
    expect(args.select).toEqual({ id: true, nama: true, formalName: true });
    expect(args.orderBy).toEqual({ nama: "asc" });
    expect(employeeCount).toHaveBeenCalledWith({ where: { tenantId: "t-1", status: "ACTIVE" } });
  });

  it("TEACHER (no academic.edit) gets 403 and no employee query runs", async () => {
    getSession.mockResolvedValue(sessionFor("TEACHER"));
    const res = await get();
    expect(res.status).toBe(403);
    expect(employeeFindMany).not.toHaveBeenCalled();
    expect(classFindFirst).not.toHaveBeenCalled();
  });

  it("no session gets 401", async () => {
    getSession.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(employeeFindMany).not.toHaveBeenCalled();
  });

  it("class outside the session tenant gets 404 and no employee query runs", async () => {
    classFindFirst.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Kelas tidak ditemukan" });
    expect(classFindFirst.mock.calls[0][0].where).toEqual({ id: "class-1", tenantId: "t-1" });
    expect(employeeFindMany).not.toHaveBeenCalled();
    expect(employeeCount).not.toHaveBeenCalled();
  });

  it("?search= filters on nama, case-insensitive, trimmed", async () => {
    await get("?search=%20sit%20");
    expect(employeeFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "t-1",
      status: "ACTIVE",
      nama: { contains: "sit", mode: "insensitive" },
    });
  });

  it("?pageSize=500 is capped at 100", async () => {
    const res = await get("?pageSize=500");
    expect(res.status).toBe(200);
    expect(employeeFindMany.mock.calls[0][0].take).toBe(100);
    expect((await res.json()).pagination.pageSize).toBe(100);
  });
});
