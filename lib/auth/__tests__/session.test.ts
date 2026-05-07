import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE importing getSession.
const mockGetUser = vi.fn();
const mockFindMany = vi.fn();
const mockUserRoleFindFirst = vi.fn();
const mockAcademicTermFindFirst = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    userRole: { findFirst: (...a: unknown[]) => mockUserRoleFindFirst(...a) },
    academicTerm: { findFirst: (...a: unknown[]) => mockAcademicTermFindFirst(...a) },
  },
}));

import { getSession } from "../session";
import { signDemoCookie } from "../demo-cookie";

const VALID_SECRET = "x".repeat(48);
const SUPABASE_USER = { id: "sup_x9", email: "alice@example.com" };
const USER_ROW = { id: "user_u1", tenantId: "tenant_a1" };

describe("getSession — production (Supabase) path", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("SESSION_COOKIE_SECRET", VALID_SECRET);
    mockGetUser.mockReset();
    mockFindMany.mockReset();
    mockUserRoleFindFirst.mockReset();
    mockAcademicTermFindFirst.mockReset();
    mockCookieGet.mockReset();
    // Default happy-path: role + active term resolve. Individual tests override.
    mockUserRoleFindFirst.mockResolvedValue({ role: { code: "admin" } });
    mockAcademicTermFindFirst.mockResolvedValue({ id: "term_active_1" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns widened session when Supabase user resolves + role + active term", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);

    const session = await getSession();

    expect(session).toEqual({
      tenantId: "tenant_a1",
      userId: "user_u1",
      supabaseUserId: "sup_x9",
      role: "admin",
      currentTermId: "term_active_1",
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supabaseUserId: "sup_x9", isActive: true, deletedAt: null },
        take: 2,
      }),
    );
    expect(mockUserRoleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_u1", tenantId: "tenant_a1" },
        orderBy: { createdAt: "asc" },
      }),
    );
    expect(mockAcademicTermFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant_a1", isActive: true },
        orderBy: { startDate: "asc" },
      }),
    );
  });

  it("returns null when Supabase getUser errors", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    expect(await getSession()).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns null when Supabase user resolves but no User row exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([]);
    expect(await getSession()).toBeNull();
  });

  it("returns null fail-closed when 2+ User rows share the same supabaseUserId", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW, { id: "user_u2", tenantId: "tenant_evil" }]);
    expect(await getSession()).toBeNull();
  });

  it("returns null when no UserRole row exists for the resolved User", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);
    mockUserRoleFindFirst.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });

  it("returns null when no active AcademicTerm exists for the tenant", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);
    mockAcademicTermFindFirst.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
  });
});

describe("getSession — demo-cookie path", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_COOKIE_SECRET", VALID_SECRET);
    mockGetUser.mockReset();
    mockFindMany.mockReset();
    mockUserRoleFindFirst.mockReset();
    mockAcademicTermFindFirst.mockReset();
    mockCookieGet.mockReset();
    mockUserRoleFindFirst.mockResolvedValue({ role: { code: "admin" } });
    mockAcademicTermFindFirst.mockResolvedValue({ id: "term_active_1" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns synthetic session when DEMO_MODE=true + valid signed cookie (carries widened payload)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const payload = {
      tenantId: "tenant_demo",
      userId: "user_demo",
      supabaseUserId: "sup_demo",
      role: "admin" as const,
      currentTermId: "term_demo_1",
    };
    mockCookieGet.mockReturnValue({ value: signDemoCookie(payload) });

    const session = await getSession();

    expect(session).toEqual(payload);
    // Supabase path NOT touched.
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUserRoleFindFirst).not.toHaveBeenCalled();
    expect(mockAcademicTermFindFirst).not.toHaveBeenCalled();
  });

  it("HMAC mismatch falls through to Supabase path (same shape as no cookie)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mockCookieGet.mockReturnValue({ value: "tampered.signature" });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);

    const session = await getSession();

    expect(session).toEqual({
      tenantId: "tenant_a1",
      userId: "user_u1",
      supabaseUserId: "sup_x9",
      role: "admin",
      currentTermId: "term_active_1",
    });
    // Fall-through proven: Supabase path WAS touched.
    expect(mockGetUser).toHaveBeenCalledOnce();
  });

  it("DEMO_MODE unset skips demo path entirely", async () => {
    vi.stubEnv("DEMO_MODE", "");
    const payload = {
      tenantId: "tenant_demo",
      userId: "user_demo",
      supabaseUserId: "sup_demo",
      role: "admin" as const,
      currentTermId: "term_demo_1",
    };
    mockCookieGet.mockReturnValue({ value: signDemoCookie(payload) });
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);

    const session = await getSession();

    // Supabase path wins; demo cookie ignored despite being valid.
    expect(session?.tenantId).toBe("tenant_a1");
    expect(mockGetUser).toHaveBeenCalledOnce();
  });
});
