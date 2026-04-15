import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../attendance/my/route";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  prisma: {
    attendanceRecord: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("GET /api/attendance/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 if session is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 if employeeId is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: null,
      });

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 if tenantId is missing", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: null,
        employeeId: "employee-1",
      });

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

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
        role: "SCHOOL_ADMIN",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Forbidden" });
    });

    it("should return 403 if role is GUARDIAN", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "GUARDIAN",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Forbidden" });
    });

    it("should allow access if role is TEACHER", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);

      const request = new Request("http://localhost:3000/api/attendance/my");
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Tenant Isolation", () => {
    it("should filter attendance records by tenantId via employee relation", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);

      const request = new Request("http://localhost:3000/api/attendance/my");
      await GET(request);

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
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

  describe("Query Parameters", () => {
    it("should use current month and year if not provided", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);

      const request = new Request("http://localhost:3000/api/attendance/my");
      await GET(request);

      const currentDate = new Date();
      const expectedMonth = currentDate.getMonth() + 1;
      const expectedYear = currentDate.getFullYear();

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: `${expectedYear}-${String(expectedMonth).padStart(2, "0")}-01`,
            }),
          }),
        })
      );
    });

    it("should use provided month and year query parameters", async () => {
      const { getSession } = await import("@/lib/auth");
      const { prisma } = await import("@/lib/db");

      vi.mocked(getSession).mockResolvedValue({
        id: "user-1",
        role: "TEACHER",
        tenantId: "tenant-1",
        employeeId: "employee-1",
      });

      vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([]);

      const request = new Request("http://localhost:3000/api/attendance/my?month=2&year=2025");
      await GET(request);

      expect(prisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: "2025-02-01",
              lt: "2025-03-01",
            }),
          }),
        })
      );
    });
  });
});
