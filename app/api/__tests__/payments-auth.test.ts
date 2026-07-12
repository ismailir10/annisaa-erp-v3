import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";
import { GET as getPayments } from "../payments/route";
import { GET as exportPayments } from "../payments/export/route";

const { resolveLedgerRequestMock, buildLedgerCsvMock } = vi.hoisted(() => ({
  resolveLedgerRequestMock: vi.fn(),
  buildLedgerCsvMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => {
  return {
    getSession: vi.fn(),
    isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
  };
});

vi.mock("@/lib/finance/payments-ledger", () => ({
  resolveLedgerRequest: resolveLedgerRequestMock,
  buildLedgerCsv: buildLedgerCsvMock,
}));

function makeSession(
  role: SessionUser["role"],
  permissions: string[] = [],
): SessionUser {
  return {
    id: "u1",
    email: "user@test.local",
    name: "Test User",
    role,
    tenantId: "t1",
    employeeId: null,
    parentId: role === "GUARDIAN" ? "p1" : null,
    permissions,
    customRoleCode: null,
  };
}

function makeReq(path = "/api/payments") {
  return new Request(`http://localhost:3000${path}`);
}

describe("payments ledger auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLedgerRequestMock.mockResolvedValue({
      ok: true,
      rows: [],
      summary: { totalAmount: 0, totalCount: 0, byMethod: [] },
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      dateFrom: "2026-06-23",
      dateTo: "2026-06-23",
    });
    buildLedgerCsvMock.mockReturnValue("Tanggal,Siswa,No. Tagihan,Metode,Referensi,Jumlah\r\n");
  });

  it("rejects guardians even though guardians have invoices.view for their own portal", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN", ["invoices.view"]));

    const res = await getPayments(makeReq() as never);

    expect(res.status).toBe(403);
    expect(resolveLedgerRequestMock).not.toHaveBeenCalled();
  });

  it("rejects admin sessions without finance read permission", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN", []));

    const res = await getPayments(makeReq() as never);

    expect(res.status).toBe(403);
    expect(resolveLedgerRequestMock).not.toHaveBeenCalled();
  });

  it("allows admin sessions with invoices.view", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("SCHOOL_ADMIN", ["invoices.view"]));

    const res = await getPayments(makeReq() as never);

    expect(res.status).toBe(200);
    expect(resolveLedgerRequestMock).toHaveBeenCalledWith(
      "t1",
      expect.any(URLSearchParams),
      expect.any(String),
      { paginate: true },
    );
  });

  it("also rejects guardians from CSV export", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(makeSession("GUARDIAN", ["invoices.view"]));

    const res = await exportPayments(makeReq("/api/payments/export") as never);

    expect(res.status).toBe(403);
    expect(resolveLedgerRequestMock).not.toHaveBeenCalled();
    expect(buildLedgerCsvMock).not.toHaveBeenCalled();
  });
});
