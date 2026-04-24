import { describe, it, expect, vi, beforeEach } from "vitest";

// Cat A soft-delete contract for Campus.
// - DELETE → status: "INACTIVE" (no row removal)
// - GET list → only status: "ACTIVE"
// - PUT { status: "ACTIVE" } → restores a previously deactivated row
// - DELETE blocked when employees still reference the campus
// - PUT rejects unknown status values with 400 (Zod validation)
// - Cross-route write guard: Employee POST against INACTIVE campus → 400

const campusUpdate = vi.fn().mockResolvedValue({ id: "camp1", status: "INACTIVE" });
const campusDelete = vi.fn();
const campusFindMany = vi.fn();
const campusFindUnique = vi.fn();
const campusFindFirst = vi.fn();
const employeeCount = vi.fn();
const employeeCreate = vi.fn();
const userCreate = vi.fn();
const employeeFindFirst = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    campus: {
      update: campusUpdate,
      delete: campusDelete,
      findMany: campusFindMany,
      findUnique: campusFindUnique,
      findFirst: campusFindFirst,
    },
    employee: { count: employeeCount, findFirst: employeeFindFirst, create: employeeCreate },
    user: { create: userCreate },
    $transaction: transaction,
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) =>
  await importOriginal<typeof import("@/lib/rate-limit")>(),
);

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const adminSession = {
  id: "u1",
  email: "a@a",
  name: "A",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-camp",
  employeeId: null,
  parentId: null,
};

describe("Campus Cat A soft-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeCount.mockResolvedValue(0);
    campusUpdate.mockResolvedValue({ id: "camp1", status: "INACTIVE" });
    campusFindMany.mockResolvedValue([]);
  });

  it("DELETE sets status='INACTIVE' instead of removing the row", async () => {
    const { DELETE } = await import("../config/campuses/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const req = new Request("http://localhost/api/config/campuses/camp1", { method: "DELETE" });
    const res = await DELETE(req as never, { params: Promise.resolve({ id: "camp1" }) } as never);

    expect(res.status).toBe(200);
    expect(campusDelete).not.toHaveBeenCalled();
    expect(campusUpdate).toHaveBeenCalledWith({
      where: { id: "camp1" },
      data: { status: "INACTIVE" },
    });
  });

  it("DELETE returns 400 when employees still reference the campus", async () => {
    employeeCount.mockResolvedValue(3);
    const { DELETE } = await import("../config/campuses/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const req = new Request("http://localhost/api/config/campuses/camp1", { method: "DELETE" });
    const res = await DELETE(req as never, { params: Promise.resolve({ id: "camp1" }) } as never);

    expect(res.status).toBe(400);
    expect(campusUpdate).not.toHaveBeenCalled();
    expect(campusDelete).not.toHaveBeenCalled();
  });

  it("GET list filters where status='ACTIVE'", async () => {
    const { GET } = await import("../config/campuses/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    await GET();

    expect(campusFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t-camp", status: "ACTIVE" },
      }),
    );
  });

  it("PUT with { status: 'ACTIVE' } restores a deactivated campus", async () => {
    campusUpdate.mockResolvedValue({ id: "camp1", status: "ACTIVE" });
    const { PUT } = await import("../config/campuses/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const req = new Request("http://localhost/api/config/campuses/camp1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: "camp1" }) } as never);

    expect(res.status).toBe(200);
    expect(campusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "camp1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("PUT rejects unknown status values with 400 (Zod enum guard)", async () => {
    // Contract change: silent drop replaced by hard 400. Mirrors Program/ClassSection
    // PUT — any status outside {ACTIVE, INACTIVE} fails validation up front.
    const { PUT } = await import("../config/campuses/[id]/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const req = new Request("http://localhost/api/config/campuses/camp1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", status: "DELETED" }),
    });
    const res = await PUT(req as never, { params: Promise.resolve({ id: "camp1" }) } as never);

    expect(res.status).toBe(400);
    expect(campusUpdate).not.toHaveBeenCalled();
  });

  it("Employee POST rejects when target campus is INACTIVE (cross-route write guard)", async () => {
    // The campus DELETE endpoint blocks deactivation if employees reference it.
    // This test covers the symmetric guard: an employee cannot be created
    // against an already-INACTIVE campus, so soft-deleted rows can't grow
    // new dependents and undermine the soft-delete invariant.
    campusFindFirst.mockResolvedValue(null); // simulate INACTIVE/cross-tenant lookup miss
    const { POST } = await import("../employees/route");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const req = new Request("http://localhost/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({
        nama: "Test",
        email: "test@example.com",
        jabatan: "Guru",
        campusId: "inactive-camp",
        hireDate: "2026-01-01",
      }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
    expect(campusFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "inactive-camp", status: "ACTIVE" }),
      }),
    );
  });
});
