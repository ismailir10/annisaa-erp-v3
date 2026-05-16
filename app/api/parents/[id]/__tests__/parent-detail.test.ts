import { describe, it, expect, vi, beforeEach } from "vitest";

const { parentFindFirst } = vi.hoisted(() => ({
  parentFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    parent: { findFirst: parentFindFirst },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    id: "u-1",
    tenantId: "t-1",
    role: "SUPER_ADMIN",
    email: "admin@test.com",
    name: "Admin",
    permissions: [],
    customRoleCode: null,
    employeeId: null,
    parentId: null,
  }),
  isAdminRole: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 19 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { GET } from "../route";

function makeParent(overrides: Record<string, unknown> = {}) {
  return {
    id: "par-1",
    tenantId: "t-1",
    name: "Ibu Fatimah",
    email: "fatimah@test.com",
    phone: "081234567890",
    whatsapp: "081234567890",
    address: "Jl. Mawar 10",
    nik: "3201234567890001",
    education: "S1",
    occupation: "Guru",
    employer: "SDN 1 Jakarta",
    employerAddress: "Jl. Merdeka 1",
    employerCity: "Jakarta",
    incomeRange: "Rp 3-5 Juta",
    childrenTotal: 2,
    status: "ACTIVE",
    guardians: [
      {
        id: "sg-1",
        relationship: "IBU",
        isPrimary: true,
        status: "ACTIVE",
        student: { id: "stu-1", name: "Aisyah", status: "ACTIVE", gender: "P" },
      },
    ],
    invoices: [
      { id: "inv-1", invoiceNumber: "INV-2026-0001", periodLabel: "Mei 2026", totalDue: 500000, totalPaid: 0, status: "SENT" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/parents/[id]", () => {
  it("returns full parent with linked students and invoices", async () => {
    parentFindFirst.mockResolvedValue(makeParent());
    const req = new Request("http://localhost/api/parents/par-1");
    const res = await GET(req, { params: Promise.resolve({ id: "par-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Ibu Fatimah");
    expect(body.education).toBe("S1");
    expect(body.guardians).toHaveLength(1);
    expect(body.invoices).toHaveLength(1);
  });

  it("returns 404 for wrong tenant", async () => {
    parentFindFirst.mockResolvedValue(null);
    const req = new Request("http://localhost/api/parents/par-999");
    const res = await GET(req, { params: Promise.resolve({ id: "par-999" }) });
    expect(res.status).toBe(404);
  });
});
