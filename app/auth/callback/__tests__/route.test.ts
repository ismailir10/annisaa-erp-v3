import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies BEFORE importing the route handler.
const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();
const mockUserFindMany = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserRoleCount = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserUpdateMany = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockSetAll = vi.fn();

let lastSupabaseConfig: { setAll?: (cookies: { name: string; value: string; options: unknown }[]) => void } = {};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    config: {
      cookies: {
        setAll: (cookies: { name: string; value: string; options: unknown }[]) => void;
      };
    },
  ) => {
    lastSupabaseConfig = config.cookies;
    // Simulate exchangeCodeForSession writing a cookie via setAll callback.
    return {
      auth: {
        exchangeCodeForSession: async (code: string) => {
          // Trigger setAll w/ a fake refresh-cookie to exercise the pending-array
          // capture pattern.
          config.cookies.setAll([
            {
              name: "sb-test-token",
              value: `session-for-code-${code}`,
              options: { httpOnly: true, path: "/" },
            },
          ]);
          return mockExchangeCodeForSession(code);
        },
        getUser: () => mockGetUser(),
      },
    };
  },
}));

vi.mock("@/lib/auth/callback-origin", () => ({
  resolveCallbackOrigin: () => "http://localhost:3000",
}));

vi.mock("@/lib/audit/write", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
      updateMany: (...args: unknown[]) => mockUserUpdateMany(...args),
    },
    userRole: { count: (...args: unknown[]) => mockUserRoleCount(...args) },
  },
}));

vi.mock("@/lib/generated/prisma/client", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    SOFT_DELETE: "SOFT_DELETE",
    RESTORE: "RESTORE",
    READ: "READ",
    IMPORT: "IMPORT",
    EXPORT: "EXPORT",
  },
}));

import { GET } from "../route";

const SUPABASE_USER = { id: "sup_x9", email: "alice@example.com" };
const USER_ROW = { id: "user_u1", tenantId: "tenant_a1", supabaseUserId: null };

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3000/auth/callback${query}`);
}

function expectRedirectTo(res: Response, expectedPath: string): void {
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toContain(expectedPath);
}

beforeEach(() => {
  mockExchangeCodeForSession.mockReset();
  mockGetUser.mockReset();
  mockUserFindMany.mockReset();
  mockUserFindUnique.mockReset();
  mockUserRoleCount.mockReset();
  mockUserUpdate.mockReset();
  mockUserUpdateMany.mockReset();
  mockWriteAuditLog.mockReset();
  mockSetAll.mockReset();
  lastSupabaseConfig = {};
  // Suppress noisy console.error from rejection paths in tests.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/auth/callback — happy path", () => {
  it("exchanges code, finds 1-row, has 1+ roles, redirects to /admin and writes Set-Cookie", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([USER_ROW]);
    mockUserRoleCount.mockResolvedValue(2);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockWriteAuditLog.mockResolvedValue(undefined);

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/admin");
    // PKCE-cookie pending pattern: refresh-token cookie carried over via pending array.
    expect(res.headers.get("set-cookie")).toContain("sb-test-token=session-for-code-abc");
    // Idle-timeout cookie reset present (portal path).
    expect(res.headers.get("set-cookie")).toContain("school-erp-last-active=");
  });

  it("backfills supabaseUserId via CAS updateMany + writes UPDATE audit on race-winner", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: null }]);
    mockUserRoleCount.mockResolvedValue(1);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    await GET(makeRequest("?code=abc") as never);

    // CAS update: where: { id, supabaseUserId: null } — only writes if still null.
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ROW.id, supabaseUserId: null },
        data: expect.objectContaining({ supabaseUserId: SUPABASE_USER.id }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        resource: "User",
        resourceId: USER_ROW.id,
        before: { supabaseUserId: null },
        after: { supabaseUserId: SUPABASE_USER.id },
      }),
    );
  });

  it("skips audit when supabaseUserId already matches (lastLoginAt-only update)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: SUPABASE_USER.id }]);
    mockUserRoleCount.mockResolvedValue(1);

    await GET(makeRequest("?code=abc") as never);

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastLoginAt: expect.any(Date) },
      }),
    );
    // CAS not invoked on the already-matches path.
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe("/auth/callback — race + non-fatal audit", () => {
  it("CAS lost race + concurrent winner stamped same supabaseUserId → bump lastLoginAt only", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: null }]);
    mockUserRoleCount.mockResolvedValue(1);
    // CAS finds 0 matching rows because concurrent callback already set it.
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    // Refetch shows the SAME Supabase user — race winner was the same actor.
    mockUserFindUnique.mockResolvedValue({ supabaseUserId: SUPABASE_USER.id });

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/admin");
    expect(mockUserFindUnique).toHaveBeenCalledOnce();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastLoginAt: expect.any(Date) } }),
    );
    // No audit write on the loser side — we didn't make the state change.
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("CAS lost race + concurrent winner stamped DIFFERENT supabaseUserId → identity_collision", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: null }]);
    mockUserRoleCount.mockResolvedValue(1);
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    mockUserFindUnique.mockResolvedValue({ supabaseUserId: "sup_OTHER_user" });

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=identity_collision");
  });

  it("writeAuditLog throw is non-fatal — backfill committed, user proceeds to /admin", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: null }]);
    mockUserRoleCount.mockResolvedValue(1);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockWriteAuditLog.mockRejectedValue(new Error("partition for current month not provisioned"));

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/admin");
    expect(mockWriteAuditLog).toHaveBeenCalledOnce();
  });
});

describe("/auth/callback — rejection paths", () => {
  it("redirects identity_collision when supabaseUserId mismatch", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([{ ...USER_ROW, supabaseUserId: "sup_OTHER" }]);

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=identity_collision");
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("redirects cross_tenant_email when 2 rows match by email", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([USER_ROW, { ...USER_ROW, id: "user_u2", tenantId: "tenant_b2" }]);

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=cross_tenant_email");
  });

  it("redirects no_invitation when 0 rows match by email", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=no_invitation");
  });

  it("redirects no_role_assigned when User has 0 UserRole rows", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([USER_ROW]);
    mockUserRoleCount.mockResolvedValue(0);

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=no_role_assigned");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("redirects oauth_provider_declined on provider error", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: null,
      error: { message: "user denied consent" },
    });

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=oauth_provider_declined");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("redirects oauth_provider_declined on PKCE invalid_grant (code reuse)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: null,
      error: { message: "invalid_grant: code already used" },
    });

    const res = await GET(makeRequest("?code=abc") as never);

    expectRedirectTo(res, "/auth/error?reason=oauth_provider_declined");
  });

  it("redirects missing_code when ?code= is absent", async () => {
    const res = await GET(makeRequest("") as never);

    expectRedirectTo(res, "/auth/error?reason=missing_code");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("/auth/callback — ?next= validation", () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockUserFindMany.mockResolvedValue([USER_ROW]);
    mockUserRoleCount.mockResolvedValue(1);
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("safe ?next=/teacher/attendance redirects there + sets idle-timeout cookie", async () => {
    const res = await GET(makeRequest("?code=abc&next=/teacher/attendance") as never);
    expectRedirectTo(res, "/teacher/attendance");
    expect(res.headers.get("set-cookie")).toContain("school-erp-last-active=");
  });

  it("rejects all open-redirect bypass variants and falls back to /admin", async () => {
    const evil = [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "//evil.com",
      "https://evil.com",
      "/%2Fevil.com",      // single-encoded slash bypass
      "/%252Fevil.com",    // double-encoded slash bypass (post-decode → %2F)
      "/%5Cevil.com",      // single-encoded backslash bypass
      "\\evil.com",
      "//evil.com/path",
    ];
    for (const next of evil) {
      const res = await GET(makeRequest(`?code=abc&next=${encodeURIComponent(next)}`) as never);
      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location.endsWith("/admin")).toBe(true);
    }
  });
});
