import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTenantFindFirst = vi.fn();
const mockUserRoleFindFirst = vi.fn();
const mockSetDemoSessionCookie = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: { findFirst: (...args: unknown[]) => mockTenantFindFirst(...args) },
    userRole: { findFirst: (...args: unknown[]) => mockUserRoleFindFirst(...args) },
  },
}));

vi.mock("@/lib/auth/demo-cookie", () => ({
  DEMO_SUPABASE_PREFIX: "demo:",
  setDemoSessionCookie: (...args: unknown[]) => mockSetDemoSessionCookie(...args),
}));

import { POST } from "../route";

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/_demo/login${query}`, { method: "POST" });
}

beforeEach(() => {
  mockTenantFindFirst.mockReset();
  mockUserRoleFindFirst.mockReset();
  mockSetDemoSessionCookie.mockReset();
  // Default: a single seeded tenant exists. Specific tests override.
  mockTenantFindFirst.mockResolvedValue({ id: "tenant_a1" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/_demo/login — production guard", () => {
  it("returns 404 (no body) when DEMO_MODE is unset", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const res = await POST(makeRequest("?role=admin") as never);
    expect(res.status).toBe(404);
    expect(mockSetDemoSessionCookie).not.toHaveBeenCalled();
    expect(mockUserRoleFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when DEMO_MODE is anything other than literal 'true'", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const res = await POST(makeRequest("?role=admin") as never);
    expect(res.status).toBe(404);
  });
});

describe("/api/_demo/login — input validation", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
  });

  it("rejects missing ?role= with 400", async () => {
    const res = await POST(makeRequest("") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_role");
  });

  it("rejects unknown role values with 400", async () => {
    const res = await POST(makeRequest("?role=superuser") as never);
    expect(res.status).toBe(400);
  });
});

describe("/api/_demo/login — happy path", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
  });

  it("looks up by role=admin → admin code, signs + writes cookie, returns 200 + payload", async () => {
    mockUserRoleFindFirst.mockResolvedValue({
      tenantId: "tenant_a1",
      user: { id: "user_admin_1", supabaseUserId: null },
    });

    const res = await POST(makeRequest("?role=admin") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      role: "admin",
      userId: "user_admin_1",
      tenantId: "tenant_a1",
    });

    expect(mockUserRoleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_a1",
          role: { code: { in: ["admin"] }, deletedAt: null },
        }),
      }),
    );
    expect(mockSetDemoSessionCookie).toHaveBeenCalledWith({
      tenantId: "tenant_a1",
      userId: "user_admin_1",
      // Synthetic prefix for demo (no real Supabase login).
      supabaseUserId: "demo:user_admin_1",
    });
  });

  it("maps role=teacher to homeroom_teacher OR sentra_teacher codes", async () => {
    mockUserRoleFindFirst.mockResolvedValue({
      tenantId: "tenant_a1",
      user: { id: "user_teacher_1", supabaseUserId: "sup_real" },
    });

    const res = await POST(makeRequest("?role=teacher") as never);

    expect(res.status).toBe(200);
    expect(mockUserRoleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: {
            code: { in: ["homeroom_teacher", "sentra_teacher"] },
            deletedAt: null,
          },
        }),
      }),
    );
    // Real supabaseUserId preserved when present (not synthetic demo:...).
    expect(mockSetDemoSessionCookie).toHaveBeenCalledWith(
      expect.objectContaining({ supabaseUserId: "sup_real" }),
    );
  });

  it("returns 500 when no User exists for the requested role", async () => {
    mockUserRoleFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest("?role=parent") as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("no_seed_user");
    expect(mockSetDemoSessionCookie).not.toHaveBeenCalled();
  });

  it("returns 500 + no_tenant when no tenant exists", async () => {
    mockTenantFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest("?role=admin") as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("no_tenant");
    expect(mockUserRoleFindFirst).not.toHaveBeenCalled();
    expect(mockSetDemoSessionCookie).not.toHaveBeenCalled();
  });
});
