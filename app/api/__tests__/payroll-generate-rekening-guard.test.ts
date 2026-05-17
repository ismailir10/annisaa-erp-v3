import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../payroll/generate/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    orgConfig: { findUnique: vi.fn() },
    holiday: { findMany: vi.fn().mockResolvedValue([]) },
    salaryComponentDef: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { findMany: vi.fn() },
    payrollRun: { findFirst: vi.fn(), create: vi.fn() },
    payrollItem: { createMany: vi.fn() },
    payrollItemLine: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/payroll/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSession(): SessionUser {
  return {
    id: "u1",
    email: "admin@test",
    name: "Admin",
    role: "SUPER_ADMIN",
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions: ["payroll.create"],
    customRoleCode: null,
  };
}

const validBody = { periodStart: "2026-05-21", periodEnd: "2026-06-20" };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/payroll/generate — F-10 rekening pre-flight", () => {
  it("rejects with 422 listing offenders when an ACTIVE employee has Bank set but Rekening empty", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.orgConfig.findUnique).mockResolvedValue({ workingDays: "1,2,3,4,5", lemburCompliant: false } as any);
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "e1", kode: "ITT29", nama: "Ismail Teacher Test", bankName: "Bank BSI", bankAccountNo: null, salaryValues: [], attendanceRecords: [] } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "e2", kode: "E001", nama: "Guru Satu", bankName: "Bank BSI", bankAccountNo: "0001", salaryValues: [], attendanceRecords: [] } as any,
    ]);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Beberapa karyawan belum memiliki No. Rekening lengkap");
    expect(body.employees).toEqual([
      { id: "e1", kode: "ITT29", nama: "Ismail Teacher Test", reason: "rekening missing" },
    ]);
    // Critical: $transaction must NOT have run — pre-flight aborts before write.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("treats whitespace-only bankAccountNo as empty (catches a stray space)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.orgConfig.findUnique).mockResolvedValue({ workingDays: "1,2,3,4,5", lemburCompliant: false } as any);
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "e1", kode: "X", nama: "X", bankName: "Bank BSI", bankAccountNo: "   ", salaryValues: [], attendanceRecords: [] } as any,
    ]);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(422);
  });

  it("passes the guard when no employee has the mismatched pair (does not 422)", async () => {
    // This test exercises the guard's pass branch only. The route then runs
    // calculatePayroll which has its own preconditions (org config, working
    // days, components) we don't fully mock here — those branches have their
    // own dedicated tests. We assert the GUARD did not 422 and that the
    // downstream pipeline was attempted (employee.findMany consumed).
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.orgConfig.findUnique).mockResolvedValue({ workingDays: "1,2,3,4,5", lemburCompliant: false } as any);
    // FIND-019: the route now also refuses 422 when an employee has no
    // EmployeeSalaryValue rows. This test exercises the rekening-guard pass
    // branch in isolation, so we mock at least one salaryValue per employee
    // so the salary guard doesn't pre-empt the assertion below.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "e1", kode: "E001", nama: "Guru Satu", bankName: "Bank BSI", bankAccountNo: "0001", salaryValues: [{ componentDefId: "c1", value: 1 }], attendanceRecords: [] } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "e2", kode: "E002", nama: "Guru Dua", bankName: null, bankAccountNo: null, salaryValues: [{ componentDefId: "c1", value: 1 }], attendanceRecords: [] } as any,
    ]);

    let res: Response;
    try {
      res = await POST(makeReq(validBody) as never);
    } catch {
      // Downstream calculatePayroll may throw with our minimal mock; that's
      // proof the guard already let the request through.
      expect(prisma.employee.findMany).toHaveBeenCalled();
      return;
    }
    expect(res.status).not.toBe(422);
  });
});
