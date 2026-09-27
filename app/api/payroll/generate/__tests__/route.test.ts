/**
 * POST /api/payroll/generate — F-15 (cycle 2026-09-27-admin-finish-standard):
 * a misordered PCT_OF_BASE component used to make `calculatePayroll` throw
 * uncaught (500). It is now caught and returned as a 400 naming the
 * offending component(s).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requirePermission, db } = vi.hoisted(() => {
  const db = {
    orgConfig: { findUnique: vi.fn() },
    holiday: { findMany: vi.fn() },
    salaryComponentDef: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    payrollRun: { findFirst: vi.fn(), create: vi.fn() },
    payrollItem: { createMany: vi.fn() },
    payrollItemLine: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { requirePermission: vi.fn(), db };
});

vi.mock("@/lib/auth-guards", () => ({ requirePermission }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "../route";

const ALLOW = { session: { tenantId: "t1", id: "u1", role: "SCHOOL_ADMIN" } };

function req(body: unknown) {
  return new Request("http://t/api/payroll/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const EMPLOYEE = {
  id: "emp1",
  kode: "E1",
  nama: "Karyawan Satu",
  bankName: null,
  bankAccountNo: null,
  salaryValues: [{ componentDefId: "gp1", value: 5_000_000 }],
  attendanceRecords: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue(ALLOW);
  db.orgConfig.findUnique.mockResolvedValue({
    tenantId: "t1",
    workingDays: '["MON","TUE","WED","THU","FRI"]',
    lemburCompliant: false,
  });
  db.holiday.findMany.mockResolvedValue([]);
  db.employee.findMany.mockResolvedValue([EMPLOYEE]);
  db.payrollRun.findFirst.mockResolvedValue(null);
});

describe("POST /api/payroll/generate — F-15 ordering guard", () => {
  it("returns 400 naming the component instead of throwing 500 on a misordered PCT_OF_BASE", async () => {
    db.salaryComponentDef.findMany.mockResolvedValue([
      { id: "gp1", code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 1 },
      { id: "pct1", code: "insentif_persen", label: "Insentif Persen", category: "INCOME", calcType: "PCT_OF_BASE", isProRated: false, sortOrder: 1 },
    ]);

    const res = await POST(req({ periodStart: "2026-09-01", periodEnd: "2026-09-10" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Insentif Persen");
    expect(body.error).toContain("Gaji Pokok");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("generates normally when PCT_OF_BASE is correctly ordered after gaji_pokok", async () => {
    db.salaryComponentDef.findMany.mockResolvedValue([
      { id: "gp1", code: "gaji_pokok", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: 1 },
      { id: "pct1", code: "insentif_persen", label: "Insentif Persen", category: "INCOME", calcType: "PCT_OF_BASE", isProRated: false, sortOrder: 2 },
    ]);
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        payrollRun: { findFirst: vi.fn().mockResolvedValue(null), create: db.payrollRun.create.mockResolvedValue({ id: "run1" }) },
        payrollItem: { createMany: db.payrollItem.createMany },
        payrollItemLine: { createMany: db.payrollItemLine.createMany },
      })
    );

    const res = await POST(req({ periodStart: "2026-09-01", periodEnd: "2026-09-10" }));

    expect(res.status).toBe(201);
  });
});
