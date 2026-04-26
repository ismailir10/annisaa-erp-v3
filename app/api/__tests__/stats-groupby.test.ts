import { describe, it, expect, vi, beforeEach } from "vitest";

// Stats endpoints contract:
// - Single Prisma `groupBy` per endpoint (no N×count / N×findMany)
// - Tenant-scoped (where: { tenantId } or where: { student: { tenantId } })
// - Missing status buckets default to 0
// - Admin-only (403 for non-admin)

const invoiceGroupBy = vi.fn();
const enrollmentGroupBy = vi.fn();
const studentGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: { groupBy: invoiceGroupBy },
    studentEnrollment: { groupBy: enrollmentGroupBy },
    student: { groupBy: studentGroupBy },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

const adminSession = {
  id: "u1",
  email: "a@a",
  name: "A",
  role: "SUPER_ADMIN" as const,
  tenantId: "t-1",
  employeeId: null,
  parentId: null,
  permissions: [],
  customRoleCode: null,
};

const teacherSession = {
  ...adminSession,
  role: "TEACHER" as const,
  tenantId: "t-1",
};

function makeReq(url: string) {
  return new Request(url) as never;
}

describe("stats endpoints — single GROUP BY contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/invoices/stats", () => {
    it("returns correct counts when all four buckets present", async () => {
      invoiceGroupBy.mockResolvedValue([
        { status: "DRAFT", _count: { _all: 3 }, _sum: { totalDue: 0, totalPaid: 0 } },
        { status: "SENT", _count: { _all: 5 }, _sum: { totalDue: 0, totalPaid: 0 } },
        { status: "PAID", _count: { _all: 7 }, _sum: { totalDue: 0, totalPaid: 0 } },
        { status: "OVERDUE", _count: { _all: 2 }, _sum: { totalDue: 0, totalPaid: 0 } },
      ]);
      const { GET } = await import("../invoices/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/invoices/stats"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({ total: 17, draft: 3, sent: 5, paid: 7, overdue: 2 });
      expect(invoiceGroupBy).toHaveBeenCalledTimes(1);
    });

    it("missing status buckets default to 0", async () => {
      invoiceGroupBy.mockResolvedValue([
        { status: "PAID", _count: { _all: 4 }, _sum: { totalDue: 0, totalPaid: 0 } },
      ]);
      const { GET } = await import("../invoices/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/invoices/stats"));
      const json = await res.json();

      expect(json).toMatchObject({ total: 4, draft: 0, sent: 0, paid: 4, overdue: 0 });
    });

    it("scopes the groupBy to the caller's tenantId", async () => {
      invoiceGroupBy.mockResolvedValue([]);
      const { GET } = await import("../invoices/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      await GET(makeReq("http://localhost/api/invoices/stats"));

      expect(invoiceGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["status"],
          where: { tenantId: "t-1" },
        }),
      );
    });

    it("returns 403 for non-admin role (no cross-tenant or unscoped read)", async () => {
      const { GET } = await import("../invoices/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(teacherSession);

      const res = await GET(makeReq("http://localhost/api/invoices/stats"));

      expect(res.status).toBe(403);
      expect(invoiceGroupBy).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/enrollments/stats", () => {
    it("returns correct counts and scopes via student.tenantId", async () => {
      enrollmentGroupBy.mockResolvedValue([
        { status: "ACTIVE", _count: { status: 12 } },
        { status: "WITHDRAWN", _count: { status: 3 } },
      ]);
      const { GET } = await import("../enrollments/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/enrollments/stats"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ total: 15, active: 12, withdrawn: 3 });
      expect(enrollmentGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["status"],
          where: { student: { tenantId: "t-1" } },
        }),
      );
    });

    it("missing status buckets default to 0", async () => {
      enrollmentGroupBy.mockResolvedValue([]);
      const { GET } = await import("../enrollments/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/enrollments/stats"));
      const json = await res.json();

      expect(json).toEqual({ total: 0, active: 0, withdrawn: 0 });
    });
  });

  describe("GET /api/students/stats", () => {
    it("returns correct counts when displayed buckets present", async () => {
      // Student.status enum: ACTIVE | INACTIVE | GRADUATED | WITHDRAWN.
      // Displayed cards: active + graduated.
      studentGroupBy.mockResolvedValue([
        { status: "ACTIVE", _count: { status: 8 } },
        { status: "GRADUATED", _count: { status: 6 } },
      ]);
      const { GET } = await import("../students/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/students/stats"));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ total: 14, active: 8, graduated: 6 });
    });

    it("excludes non-displayed buckets (INACTIVE, WITHDRAWN) from total", async () => {
      // INACTIVE and WITHDRAWN are not part of the displayed cards; total
      // must match the pre-refactor sum of (active + graduated) only.
      studentGroupBy.mockResolvedValue([
        { status: "ACTIVE", _count: { status: 8 } },
        { status: "INACTIVE", _count: { status: 99 } },
        { status: "WITHDRAWN", _count: { status: 5 } },
      ]);
      const { GET } = await import("../students/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      const res = await GET(makeReq("http://localhost/api/students/stats"));
      const json = await res.json();

      expect(json).toEqual({ total: 8, active: 8, graduated: 0 });
    });

    it("scopes the groupBy to the caller's tenantId", async () => {
      studentGroupBy.mockResolvedValue([]);
      const { GET } = await import("../students/stats/route");
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(adminSession);

      await GET(makeReq("http://localhost/api/students/stats"));

      expect(studentGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["status"],
          where: { tenantId: "t-1" },
        }),
      );
    });
  });
});
