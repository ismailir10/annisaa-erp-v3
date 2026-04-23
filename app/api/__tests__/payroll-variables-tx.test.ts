import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: { findUnique: vi.fn() },
    salaryComponentDef: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/payroll/engine", () => ({
  calculateEmployeePayroll: () => ({
    grossAmount: 5000000,
    deductions: 100000,
    netAmount: 4900000,
    lines: [
      {
        componentDefId: "c-1",
        labelSnapshot: "Gaji Pokok",
        categorySnapshot: "INCOME",
        calculatedAmount: 5000000,
        finalAmount: 5000000,
      },
    ],
  }),
}));

vi.mock("@/lib/payroll/working-days", () => ({
  countAttendanceDays: () => ({ daysPresent: 20, daysLeave: 0 }),
}));

function makeSession(role: SessionUser["role"]): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: null,
  };
}

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/payroll/pr-1/items/pi-1/variables", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "pr-1", itemId: "pi-1" });

describe("PUT /api/payroll/[id]/items/[itemId]/variables — atomic rebuild", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps the full sequence in a single $transaction (createMany, not per-line create)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession("SUPER_ADMIN"));
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue({
      id: "pr-1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
      actualWorkDays: 20,
    } as never);
    vi.mocked(prisma.salaryComponentDef.findMany).mockResolvedValue([] as never);

    const calls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        payrollItem: {
          update: vi.fn().mockImplementation(() => {
            calls.push("payrollItem.update");
            return Promise.resolve({
              employeeId: "e-1",
              overtimeHours: 0,
              outdoorDays: 0,
              holidayWorkedDays: 0,
              dcDays: 0,
            });
          }),
        },
        employeeSalaryValue: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        attendanceRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        payrollItemLine: {
          deleteMany: vi.fn().mockImplementation(() => {
            calls.push("payrollItemLine.deleteMany");
            return Promise.resolve({ count: 0 });
          }),
          createMany: vi.fn().mockImplementation(() => {
            calls.push("payrollItemLine.createMany");
            return Promise.resolve({ count: 1 });
          }),
          create: vi.fn().mockImplementation(() => {
            calls.push("payrollItemLine.create");
            return Promise.resolve({});
          }),
        },
      };
      return cb(tx);
    });

    const { PUT } = await import("../payroll/[id]/items/[itemId]/variables/route");
    const res = await PUT(makeReq({ overtimeHours: 5 }) as never, { params });
    expect(res.status).toBe(200);

    // Atomic sequence: update → deleteMany → createMany → update
    expect(calls).toEqual([
      "payrollItem.update",
      "payrollItemLine.deleteMany",
      "payrollItemLine.createMany",
      "payrollItem.update",
    ]);
    // Per-line create loop removed.
    expect(calls).not.toContain("payrollItemLine.create");
    // The whole sequence was wrapped in exactly one $transaction call.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rolls back and surfaces the error when a mid-tx step fails", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(makeSession("SUPER_ADMIN"));
    vi.mocked(prisma.payrollRun.findUnique).mockResolvedValue({
      id: "pr-1",
      tenantId: "t1",
      status: "DRAFT",
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
      actualWorkDays: 20,
    } as never);
    vi.mocked(prisma.salaryComponentDef.findMany).mockResolvedValue([] as never);

    // Simulate $transaction throwing — real Prisma would roll back every
    // nested write. Route surfaces the error; totals untouched.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).mockRejectedValue(new Error("createMany failed"));

    const { PUT } = await import("../payroll/[id]/items/[itemId]/variables/route");
    await expect(PUT(makeReq({ overtimeHours: 5 }) as never, { params })).rejects.toThrow(
      "createMany failed"
    );
  });
});
