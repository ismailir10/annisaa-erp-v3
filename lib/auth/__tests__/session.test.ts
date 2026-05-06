import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies BEFORE importing getSession.
const mockGetUser = vi.fn();
const mockFindMany = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
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
    mockCookieGet.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns session when Supabase user resolves to exactly 1 row", async () => {
    mockGetUser.mockResolvedValue({ data: { user: SUPABASE_USER }, error: null });
    mockFindMany.mockResolvedValue([USER_ROW]);

    const session = await getSession();

    expect(session).toEqual({
      tenantId: "tenant_a1",
      userId: "user_u1",
      supabaseUserId: "sup_x9",
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supabaseUserId: "sup_x9", isActive: true, deletedAt: null },
        take: 2,
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
});

describe("getSession — demo-cookie path", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_COOKIE_SECRET", VALID_SECRET);
    mockGetUser.mockReset();
    mockFindMany.mockReset();
    mockCookieGet.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns synthetic session when DEMO_MODE=true + valid signed cookie", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const payload = {
      tenantId: "tenant_demo",
      userId: "user_demo",
      supabaseUserId: "sup_demo",
    };
    mockCookieGet.mockReturnValue({ value: signDemoCookie(payload) });

    const session = await getSession();

    expect(session).toEqual(payload);
    // Supabase path NOT touched.
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
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
