import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// POST /api/students/[id]/guardians — link-an-existing-parent branch.
//
// Presence of `parentId` selects a link-only path: no Parent row is created
// or updated. Before this branch existed the only way to add a wali was to
// type a name, and a parent without an email produced a duplicate Parent row
// per child — splitting one family across two profiles and two invoice sets.
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

type ExistingLink = { id: string; status: string } | null;

const state = {
  session: null as Session | null,
  student: null as { id: string; tenantId: string } | null,
  parent: null as { id: string; tenantId: string } | null,
  existingLink: null as ExistingLink,
  activeGuardianCount: 0,
  created: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  lastUpdateMany: null as Record<string, unknown> | null,
  parentUpsertCalls: 0,
  parentCreateCalls: 0,
  forceP2034Once: false,
  txAttempts: 0,
  /** Rows findParentCandidates sees — the tenant's existing ACTIVE parents. */
  existingParents: [] as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    nik: string | null;
    _count: { guardians: number };
  }>,
};

function existingParent(
  partial: Partial<(typeof state.existingParents)[number]> & {
    id: string;
    name: string;
  },
) {
  return {
    email: null,
    phone: null,
    nik: null,
    _count: { guardians: 1 },
    ...partial,
  };
}

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => state.session),
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));

vi.mock("@/lib/generated/prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
      this.clientVersion = opts.clientVersion;
    }
  }
  return {
    Prisma: {
      TransactionIsolationLevel: { Serializable: "Serializable" },
      PrismaClientKnownRequestError,
    },
  };
});

const txProxy = {
  studentGuardian: {
    updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.lastUpdateMany = data;
      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.created = data;
      return { id: "sg-new", ...data, parent: { id: data.parentId, name: "Wali" } };
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.updated = data;
      return { id: state.existingLink?.id, ...data, parent: { id: "p1", name: "Wali" } };
    }),
  },
};

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
    parent: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const p = state.parent;
        if (!p) return null;
        if (where.id && p.id !== where.id) return null;
        if (where.tenantId && p.tenantId !== where.tenantId) return null;
        return { id: p.id };
      }),
      // findParentCandidates issues one narrow SELECT over the tenant's
      // ACTIVE parents and compares in JS.
      findMany: vi.fn(async () => state.existingParents),
      upsert: vi.fn(async () => {
        state.parentUpsertCalls++;
        return { id: "p-upserted" };
      }),
      create: vi.fn(async () => {
        state.parentCreateCalls++;
        return { id: "p-created" };
      }),
    },
    employee: { findFirst: vi.fn(async () => null) },
    studentGuardian: {
      findUnique: vi.fn(async () => state.existingLink),
      count: vi.fn(async () => state.activeGuardianCount),
    },
    $transaction: vi.fn(async (cb: unknown) => {
      state.txAttempts++;
      if (state.forceP2034Once && state.txAttempts === 1) {
        const { Prisma } = await import("@/lib/generated/prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("serialization", {
          code: "P2034",
          clientVersion: "test",
        });
      }
      if (typeof cb === "function") return (cb as (tx: unknown) => unknown)(txProxy);
      return null;
    }),
  },
}));

import { POST } from "../route";

function adminSession(): Session {
  return {
    id: "u1",
    role: "SCHOOL_ADMIN",
    tenantId: "t1",
    email: "admin@example.com",
    name: "Admin",
    employeeId: null,
    parentId: null,
    permissions: [],
    customRoleCode: null,
  };
}

function post(body: Record<string, unknown>, studentId = "s1") {
  const req = new Request("http://localhost/api/students/s1/guardians", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The handler only reads req.json() and the client IP, so a plain Request
  // stands in for NextRequest here.
  return POST(req as never, { params: Promise.resolve({ id: studentId }) });
}

beforeEach(() => {
  state.session = adminSession();
  state.student = { id: "s1", tenantId: "t1" };
  state.parent = { id: "p1", tenantId: "t1" };
  state.existingLink = null;
  state.activeGuardianCount = 0;
  state.created = null;
  state.updated = null;
  state.lastUpdateMany = null;
  state.parentUpsertCalls = 0;
  state.parentCreateCalls = 0;
  state.forceP2034Once = false;
  state.txAttempts = 0;
  state.existingParents = [];
});

describe("POST guardians — link an existing parent", () => {
  it("creates only the junction row and touches no Parent", async () => {
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(201);
    expect(state.created).toMatchObject({
      studentId: "s1",
      parentId: "p1",
      relationship: "IBU",
    });
    expect(state.parentUpsertCalls).toBe(0);
    expect(state.parentCreateCalls).toBe(0);
  });

  it("ignores bio fields smuggled into the link payload", async () => {
    // The whole point of the link path: the parent's own record owns bio, so
    // linking must never overwrite another family's data.
    await post({
      parentId: "p1",
      relationship: "AYAH",
      name: "Nama Lain",
      email: "other@example.com",
      occupation: "Wiraswasta",
    });
    expect(state.parentUpsertCalls).toBe(0);
    expect(state.parentCreateCalls).toBe(0);
    expect(state.created).not.toHaveProperty("name");
    expect(state.created).not.toHaveProperty("email");
  });

  it("persists childOrder on the junction", async () => {
    await post({ parentId: "p1", relationship: "IBU", childOrder: "2" });
    expect(state.created).toMatchObject({ childOrder: 2 });
  });

  it("404s a parent belonging to another tenant", async () => {
    state.parent = { id: "p1", tenantId: "t-other" };
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(404);
    expect(state.created).toBeNull();
  });

  it("404s an unknown parent", async () => {
    state.parent = null;
    const res = await post({ parentId: "ghost", relationship: "IBU" });
    expect(res.status).toBe(404);
  });

  it("409s when the parent is already actively linked", async () => {
    state.existingLink = { id: "sg1", status: "ACTIVE" };
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("GUARDIAN_LINK_EXISTS");
    expect(state.created).toBeNull();
  });

  it("reactivates an INACTIVE link instead of rejecting it", async () => {
    state.existingLink = { id: "sg1", status: "INACTIVE" };
    const res = await post({ parentId: "p1", relationship: "WALI" });
    expect(res.status).toBe(200);
    expect(state.updated).toMatchObject({ status: "ACTIVE", relationship: "WALI" });
    expect(state.created).toBeNull();
  });

  it("auto-flags the first guardian as primary", async () => {
    state.activeGuardianCount = 0;
    await post({ parentId: "p1", relationship: "IBU" });
    expect(state.created).toMatchObject({ isPrimary: true });
  });

  it("does not auto-flag primary when the student already has one", async () => {
    state.activeGuardianCount = 1;
    await post({ parentId: "p1", relationship: "AYAH" });
    expect(state.created).toMatchObject({ isPrimary: false });
    expect(state.lastUpdateMany).toBeNull();
  });

  it("demotes the incumbent primary when linking an explicit primary", async () => {
    state.activeGuardianCount = 1;
    await post({ parentId: "p1", relationship: "AYAH", isPrimary: true });
    expect(state.lastUpdateMany).toMatchObject({ isPrimary: false });
    expect(state.created).toMatchObject({ isPrimary: true });
  });

  it("retries once when Postgres aborts the serializable tx", async () => {
    state.forceP2034Once = true;
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(201);
    expect(state.txAttempts).toBe(2);
  });

  it("rejects a non-admin", async () => {
    state.session = { ...adminSession(), role: "TEACHER" };
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(403);
  });

  it("404s when the student belongs to another tenant", async () => {
    state.student = { id: "s1", tenantId: "t-other" };
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(404);
  });

  it("400s a link payload with no relationship", async () => {
    const res = await post({ parentId: "p1" });
    expect(res.status).toBe(400);
  });
});

describe("POST guardians — duplicate guard on the create path", () => {
  it("409s with the candidate list when a typed name already exists", async () => {
    state.existingParents = [
      existingParent({ id: "p9", name: "Siti Aminah", phone: "081234567890" }),
    ];
    const res = await post({ name: "SITI  AMINAH", relationship: "IBU" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("PARENT_CANDIDATES");
    expect(body.candidates).toEqual([
      expect.objectContaining({
        id: "p9",
        name: "Siti Aminah",
        matchReason: "name",
        childCount: 1,
      }),
    ]);
    expect(state.parentCreateCalls).toBe(0);
    expect(state.parentUpsertCalls).toBe(0);
  });

  it("409s on a phone match written in a different format", async () => {
    state.existingParents = [
      existingParent({ id: "p9", name: "Budi", phone: "0812-3456-7890" }),
    ];
    const res = await post({
      name: "Nama Berbeda",
      relationship: "AYAH",
      phone: "+62 812 3456 7890",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).candidates[0].matchReason).toBe("phone");
  });

  it("409s on an email match rather than silently upserting the parent", async () => {
    // Pre-cycle behaviour was an upsert, which quietly rewrote the existing
    // parent's bio with whatever this form happened to contain.
    state.existingParents = [
      existingParent({ id: "p9", name: "Siti", email: "siti@example.com" }),
    ];
    const res = await post({
      name: "Siti Yang Lain",
      relationship: "IBU",
      email: "siti@example.com",
    });
    expect(res.status).toBe(409);
    expect(state.parentUpsertCalls).toBe(0);
  });

  it("creates the parent when confirmNew is set", async () => {
    state.existingParents = [
      existingParent({ id: "p9", name: "Siti Aminah" }),
    ];
    const res = await post({
      name: "Siti Aminah",
      relationship: "IBU",
      confirmNew: true,
    });
    expect(res.status).toBe(201);
    expect(state.parentCreateCalls).toBe(1);
  });

  it("creates straight through when nothing matches", async () => {
    state.existingParents = [existingParent({ id: "p9", name: "Orang Lain" })];
    const res = await post({ name: "Siti Aminah", relationship: "IBU" });
    expect(res.status).toBe(201);
    expect(state.parentCreateCalls).toBe(1);
  });

  it("skips the duplicate guard entirely on the link path", async () => {
    // The picker already made the choice explicit; re-confirming would be noise.
    state.existingParents = [existingParent({ id: "p1", name: "Siti Aminah" })];
    const res = await post({ parentId: "p1", relationship: "IBU" });
    expect(res.status).toBe(201);
  });
});
