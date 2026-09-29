/**
 * HR-12: generation must refuse a period that has not started and must never
 * write a run that contains a negative net slip.
 * HR-3: the 422 for missing salary structure names every employee (the admin
 * page renders them as links, not a vanishing toast).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../payroll/generate/route";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    orgConfig: { findUnique: vi.fn() },
    holiday: { findMany: vi.fn().mockResolvedValue([]) },
    salaryComponentDef: { findMany: vi.fn() },
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

const session: SessionUser = {
  id: "u1", email: "a@t", name: "A", role: "SUPER_ADMIN", tenantId: "t1",
  employeeId: null, parentId: null, permissions: ["payroll.create"], customRoleCode: null,
};
const req = (body: unknown) =>
  new Request("http://localhost/api/payroll/generate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

async function arrange(employees: unknown[], components: unknown[] = []) {
  const { getSession } = await import("@/lib/auth");
  const { prisma } = await import("@/lib/db");
  vi.mocked(getSession).mockResolvedValue(session);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(prisma.orgConfig.findUnique).mockResolvedValue({ workingDays: "MON,TUE,WED,THU,FRI", lemburCompliant: false } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(prisma.salaryComponentDef.findMany).mockResolvedValue(components as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(prisma.employee.findMany).mockResolvedValue(employees as any);
  return prisma;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T03:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/payroll/generate — HR-12", () => {
  it("rejects a period that starts in the future with a field error and writes nothing", async () => {
    const prisma = await arrange([]);
    const res = await POST(req({ periodStart: "2026-11-21", periodEnd: "2026-12-20" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0].field).toBe("periodStart");
    expect(body.errors[0].message).toMatch(/belum dimulai/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks with 422 (naming the employee) when fixed deductions exceed income", async () => {
    const prisma = await arrange(
      [
        {
          id: "e1", kode: "E-HR", nama: "Karyawan Minus", bankName: null, bankAccountNo: null,
          salaryValues: [{ componentDefId: "ded", value: 50000 }],
          attendanceRecords: [],
        },
      ],
      [{ id: "ded", code: "iuran", label: "Iuran", category: "DEDUCTION", calcType: "FIXED", isProRated: false, sortOrder: 5 }],
    );
    const res = await POST(req({ periodStart: "2026-08-21", periodEnd: "2026-09-20" }) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/negatif/i);
    expect(body.employees).toEqual([
      { id: "e1", kode: "E-HR", nama: "Karyawan Minus", reason: "negative net pay" },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("HR-3: lists every employee missing a salary structure in the 422", async () => {
    await arrange([
      { id: "e1", kode: "E1", nama: "Satu", bankName: null, bankAccountNo: null, salaryValues: [], attendanceRecords: [] },
      { id: "e2", kode: "E2", nama: "Dua", bankName: null, bankAccountNo: null, salaryValues: [], attendanceRecords: [] },
    ]);
    const res = await POST(req({ periodStart: "2026-08-21", periodEnd: "2026-09-20" }) as never);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.employees.map((e: { id: string }) => e.id)).toEqual(["e1", "e2"]);
    expect(body.employees[0].reason).toBe("salary structure missing");
  });
});
