/**
 * HR permission gate — representative 403/200 coverage per HR domain.
 *
 * Intent: prove `requirePermission()` fires correctly across every HR
 * domain (employees, payroll, salary-components, slips-other, attendance
 * admin, leave admin) rather than mocking each individual endpoint.
 *
 * Shape: SCHOOL_ADMIN with its system-role default permissions misses every
 * `hr.*` code → 403; SUPER_ADMIN short-circuits in `hasPermission()` → 200
 * (or the success path for that handler). The session factory mirrors the
 * real `getSession()` return shape so handlers calling `hasPermission()`
 * downstream also see the correct permission array.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { getSystemRolePermissions } from "@/lib/permissions";

vi.mock("@/lib/db", () => ({
  prisma: {
    payrollRun: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
    },
    attendanceRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    leaveRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
    },
    salaryComponentDef: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    payrollItem: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/auth-guard", () => ({
  verifyTenantOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

function session(role: SessionUser["role"], extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    email: "t@t",
    name: "T",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: null,
    permissions:
      role === "SUPER_ADMIN"
        ? getSystemRolePermissions("SUPER_ADMIN")
        : getSystemRolePermissions(role),
    customRoleCode: null,
    ...extra,
  };
}

async function mockSession(s: SessionUser | null) {
  const { getSession } = await import("@/lib/auth");
  vi.mocked(getSession).mockResolvedValue(s);
}

beforeEach(() => vi.clearAllMocks());

describe("HR permission gate — employees", () => {
  it("403 for SCHOOL_ADMIN on GET /api/employees", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { GET } = await import("../employees/route");
    const res = await GET(new Request("http://localhost/api/employees") as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("hr.view");
  });

  it("200 for SUPER_ADMIN on GET /api/employees", async () => {
    await mockSession(session("SUPER_ADMIN"));
    const { GET } = await import("../employees/route");
    const res = await GET(new Request("http://localhost/api/employees") as never);
    expect(res.status).toBe(200);
  });
});

describe("HR permission gate — payroll", () => {
  it("403 for SCHOOL_ADMIN on GET /api/payroll", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { GET } = await import("../payroll/route");
    const res = await GET(new Request("http://localhost/api/payroll") as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("payroll.view");
  });

  it("200 for SUPER_ADMIN on GET /api/payroll", async () => {
    await mockSession(session("SUPER_ADMIN"));
    const { GET } = await import("../payroll/route");
    const res = await GET(new Request("http://localhost/api/payroll") as never);
    expect(res.status).toBe(200);
  });
});

describe("HR permission gate — salary components", () => {
  it("403 for SCHOOL_ADMIN on GET /api/salary-components", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { GET } = await import("../salary-components/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("200 for SUPER_ADMIN on GET /api/salary-components", async () => {
    await mockSession(session("SUPER_ADMIN"));
    const { GET } = await import("../salary-components/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("HR permission gate — attendance admin", () => {
  it("403 for SCHOOL_ADMIN on GET /api/attendance/today", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { GET } = await import("../attendance/today/route");
    const res = await GET(new Request("http://localhost/api/attendance/today") as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("attendance.view");
  });

  it("200 for SUPER_ADMIN on GET /api/attendance/today", async () => {
    await mockSession(session("SUPER_ADMIN"));
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never);
    const { GET } = await import("../attendance/today/route");
    const res = await GET(new Request("http://localhost/api/attendance/today") as never);
    expect(res.status).toBe(200);
  });
});

describe("HR permission gate — leave admin", () => {
  it("403 for SCHOOL_ADMIN on GET /api/leave/requests", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { GET } = await import("../leave/requests/route");
    const res = await GET(new Request("http://localhost/api/leave/requests") as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.missing).toBe("leave.view");
  });

  it("200 for SUPER_ADMIN on GET /api/leave/requests", async () => {
    await mockSession(session("SUPER_ADMIN"));
    const { GET } = await import("../leave/requests/route");
    const res = await GET(new Request("http://localhost/api/leave/requests") as never);
    expect(res.status).toBe(200);
  });
});

describe("HR permission gate — slips (other-employee access)", () => {
  it("403 for SCHOOL_ADMIN on GET /api/slips/[id]/pdf", async () => {
    await mockSession(session("SCHOOL_ADMIN"));
    const { prisma } = await import("@/lib/db");
    // Minimal fixture: item exists, not the caller's own employee row
    vi.mocked(prisma.payrollItem.findUnique).mockResolvedValue({
      id: "pi-1",
      employee: { id: "other-emp", formalName: null, nama: "X", kode: "X1", jabatan: "Guru", bankName: null, bankAccountNo: null },
      payrollRun: { periodStart: "2026-04-01", periodEnd: "2026-04-30", actualWorkDays: 20, tenantId: "t1" },
      lines: [],
      grossAmount: 0,
      deductions: 0,
      netAmount: 0,
      payrollRunId: "pr-1",
    } as never);
    const { GET } = await import("../slips/[payrollItemId]/pdf/route");
    const res = await GET(new Request("http://localhost/api/slips/pi-1/pdf") as never, {
      params: Promise.resolve({ payrollItemId: "pi-1" }),
    });
    // SCHOOL_ADMIN lacks payroll.view — branch falls through to "Akses ditolak"
    expect(res.status).toBe(403);
  });
});
