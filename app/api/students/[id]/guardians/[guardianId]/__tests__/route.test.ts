import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// T7 — PUT /api/students/[id]/guardians/[guardianId]
//
// Locks the address + childrenTotal pass-through that was silently dropped
// before T7 (the unified GuardianForm sends both, the schema permits both,
// the handler now writes both).
// ──────────────────────────────────────────────────────────────────────────

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

type ParentRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  nik: string | null;
  education: string | null;
  occupation: string | null;
  employer: string | null;
  employerAddress: string | null;
  employerCity: string | null;
  incomeRange: string | null;
  address: string | null;
  childrenTotal: number | null;
};

type GuardianRow = {
  id: string;
  studentId: string;
  parentId: string;
  relationship: string;
  isPrimary: boolean;
  status: string;
  parent: ParentRow;
};

const state = {
  session: null as Session | null,
  student: null as { id: string; tenantId: string } | null,
  guardian: null as GuardianRow | null,
  lastParentUpdate: null as Record<string, unknown> | null,
  lastJunctionUpdate: null as Record<string, unknown> | null,
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => state.session),
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    student: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const s = state.student;
        if (!s) return null;
        if (where.id && s.id !== where.id) return null;
        if (where.tenantId && s.tenantId !== where.tenantId) return null;
        return { ...s };
      }),
    },
    studentGuardian: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const g = state.guardian;
        if (!g) return null;
        if (where.id && g.id !== where.id) return null;
        if (where.studentId && g.studentId !== where.studentId) return null;
        return { ...g, parent: { ...g.parent } };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.lastJunctionUpdate = data;
        const g = state.guardian;
        if (!g) throw new Error("no guardian");
        const merged: GuardianRow = { ...g, parent: { ...g.parent } };
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) (merged as Record<string, unknown>)[k] = v as unknown;
        }
        state.guardian = merged;
        return { ...merged };
      }),
    },
    parent: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.lastParentUpdate = data;
        const g = state.guardian;
        if (!g) throw new Error("no guardian");
        const merged: ParentRow = { ...g.parent };
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) (merged as Record<string, unknown>)[k] = v as unknown;
        }
        state.guardian = { ...g, parent: merged };
        return { ...merged };
      }),
    },
  },
}));

import { PUT } from "../route";

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

function freshGuardian(overrides: Partial<ParentRow> = {}): GuardianRow {
  return {
    id: "sg1",
    studentId: "s1",
    parentId: "p1",
    relationship: "AYAH",
    isPrimary: true,
    status: "ACTIVE",
    parent: {
      id: "p1",
      name: "Pak Budi",
      phone: "08111",
      email: "budi@x",
      whatsapp: "08111",
      nik: null,
      education: null,
      occupation: null,
      employer: null,
      employerAddress: null,
      employerCity: null,
      incomeRange: null,
      address: "Jl. Lama 1",
      childrenTotal: 2,
      ...overrides,
    },
  };
}

function putReq(body: unknown): Request {
  return new Request("http://x/api/students/s1/guardians/sg1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "s1", guardianId: "sg1" });

beforeEach(() => {
  state.session = adminSession();
  state.student = { id: "s1", tenantId: "t1" };
  state.guardian = freshGuardian();
  state.lastParentUpdate = null;
  state.lastJunctionUpdate = null;
});

describe("PUT /api/students/[id]/guardians/[guardianId] — address + childrenTotal (T7)", () => {
  it("writes address + childrenTotal when supplied", async () => {
    const res = await PUT(putReq({ address: "Jl. Baru 99", childrenTotal: 4 }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastParentUpdate?.address).toBe("Jl. Baru 99");
    expect(state.lastParentUpdate?.childrenTotal).toBe(4);
  });

  it("preserves existing address + childrenTotal when omitted from payload", async () => {
    const res = await PUT(putReq({ name: "Pak Budi Baru" }) as never, { params });
    expect(res.status).toBe(200);
    // Both fields fall through as `undefined`, which Prisma treats as "do not
    // touch the column". The pre-T7 silent-drop bug surfaced because the
    // field was simply absent from the `data` object — assert presence via
    // `undefined`, not via a missing key, so a future refactor that flips
    // back to omission also fails.
    expect(state.lastParentUpdate).not.toBeNull();
    expect("address" in (state.lastParentUpdate ?? {})).toBe(true);
    expect("childrenTotal" in (state.lastParentUpdate ?? {})).toBe(true);
    expect(state.lastParentUpdate?.address).toBeUndefined();
    expect(state.lastParentUpdate?.childrenTotal).toBeUndefined();
    // And the in-memory parent row stays at its prior values.
    expect(state.guardian?.parent.address).toBe("Jl. Lama 1");
    expect(state.guardian?.parent.childrenTotal).toBe(2);
  });

  it("clears address to null when sent as an empty string (trim-or-null contract)", async () => {
    const res = await PUT(putReq({ address: "   " }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastParentUpdate?.address).toBeNull();
  });

  it("clears childrenTotal to null when sent as null", async () => {
    const res = await PUT(putReq({ childrenTotal: null }) as never, { params });
    expect(res.status).toBe(200);
    expect(state.lastParentUpdate?.childrenTotal).toBeNull();
  });
});
