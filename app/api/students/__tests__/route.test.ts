import { describe, it, expect, vi, beforeEach } from "vitest";

type Session = {
  id: string;
  role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN";
  tenantId: string | null;
  email: string;
  name: string | null;
  employeeId: string | null;
  parentId: string | null;
  permissions: string[];
  customRoleCode: string | null;
};

const state = {
  session: null as Session | null,
  lastCreate: null as Record<string, unknown> | null,
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => state.session),
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    student: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.lastCreate = data;
        return { id: "new-student-id", ...data };
      }),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    parent: { upsert: vi.fn(), create: vi.fn() },
    studentGuardian: { createMany: vi.fn(async () => ({ count: 0 })) },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  getClientIp: vi.fn(() => "1.1.1.1"),
}));

import { POST } from "../route";

function adminSession(): Session {
  return {
    id: "u1",
    role: "SCHOOL_ADMIN",
    tenantId: "t1",
    email: "a@x",
    name: "A",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function postReq(body: unknown): Request {
  return new Request("http://x/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.session = adminSession();
  state.lastCreate = null;
});

describe("POST /api/students — full field set (T2)", () => {
  it("persists every supplied schema-editable field, not just the legacy 7", async () => {
    const res = await POST(postReq({
      name: "Aisyah Putri",
      nickname: "Aisyah",
      gender: "P",
      dateOfBirth: "2018-03-15",
      address: "Jl. Mawar No. 12",
      nis: "2026001",
      nisn: "0089998877",
      birthPlace: "Jakarta",
      nik: "3171234567890001",
      kkNumber: "3171234567890002",
      livingWith: "BOTH",
      notes: "Alergi udang",
      status: "ACTIVE",
    }) as never);
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({
      tenantId: "t1",
      name: "Aisyah Putri",
      nickname: "Aisyah",
      gender: "P",
      dateOfBirth: "2018-03-15",
      address: "Jl. Mawar No. 12",
      nis: "2026001",
      nisn: "0089998877",
      birthPlace: "Jakarta",
      nik: "3171234567890001",
      kkNumber: "3171234567890002",
      livingWith: "BOTH",
      notes: "Alergi udang",
      status: "ACTIVE",
    });
  });

  it("defaults status to ACTIVE when not provided", async () => {
    const res = await POST(postReq({ name: "Budi" }) as never);
    expect(res.status).toBe(201);
    expect(state.lastCreate?.status).toBe("ACTIVE");
  });

  it("accepts and persists explicit non-ACTIVE status for backfill", async () => {
    const res = await POST(postReq({ name: "Citra", status: "GRADUATED" }) as never);
    expect(res.status).toBe(201);
    expect(state.lastCreate?.status).toBe("GRADUATED");
  });

  it("rejects an invalid status enum value", async () => {
    const res = await POST(postReq({ name: "Dewi", status: "PENDING" }) as never);
    expect(res.status).toBe(400);
  });
});
