import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../slips/my/route";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  prisma: {
    payrollItem: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("GET /api/slips/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 if session is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 if employeeId is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: null,
        parentId: null,
      });

      const response = await GET();

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 if tenantId is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: null,
        employeeId: "employee-1",
        parentId: null,
      });

      const response = await GET();

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Unauthorized" });
    });
  });

  describe("Role Validation", () => {
    it("should return 403 if role is not TEACHER", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "SCHOOL_ADMIN",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      const response = await GET();

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Forbidden" });
    });

    it("should return 403 if role is GUARDIAN", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "GUARDIAN",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      const response = await GET();

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Forbidden" });
    });

    it("should allow access if role is TEACHER", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      vi.mocked(prisma.payrollItem.findMany).mockResolvedValue([]);

      const response = await GET();

      expect(response.status).toBe(200);
    });
  });

  describe("Tenant Isolation", () => {
    it("should filter payroll items by tenantId via employee relation", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      vi.mocked(prisma.payrollItem.findMany).mockResolvedValue([]);

      await GET();

      expect(prisma.payrollItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: "employee-1",
            employee: {
              tenantId: "tenant-1",
            },
          }),
        })
      );
    });
  });

  describe("Data Filtering", () => {
    it("should only return slips from APPROVED, EXPORTED, or SLIPS_SENT payroll runs", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      vi.mocked(prisma.payrollItem.findMany).mockResolvedValue([]);

      await GET();

      expect(prisma.payrollItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payrollRun: {
              status: {
                in: ["APPROVED", "EXPORTED", "SLIPS_SENT"],
              },
            },
          }),
        })
      );
    });

    it("should include payroll run details in response", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      vi.mocked(prisma.payrollItem.findMany).mockResolvedValue([]);

      await GET();

      expect(prisma.payrollItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            payrollRun: {
              select: expect.objectContaining({
                periodStart: true,
                periodEnd: true,
                status: true,
              }),
            },
          }),
        })
      );
    });
  });

  describe("Ordering", () => {
    it("should order by payroll run period start descending", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: null,
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
        parentId: null,
      });

      vi.mocked(prisma.payrollItem.findMany).mockResolvedValue([]);

      await GET();

      expect(prisma.payrollItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            payrollRun: {
              periodStart: "desc",
            },
          },
        })
      );
    });
  });
});
