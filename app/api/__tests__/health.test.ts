import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../health/route";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with ok:true when DB reachable", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty("sha");
  });

  it("includes VERCEL_GIT_COMMIT_SHA when set", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123def");

    const response = await GET();
    const json = await response.json();

    expect(json.sha).toBe("abc123def");
    vi.unstubAllEnvs();
  });

  it("falls back to 'local' sha when VERCEL_GIT_COMMIT_SHA unset", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    const original = process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;

    const response = await GET();
    const json = await response.json();

    expect(json.sha).toBe("local");
    if (original !== undefined) process.env.VERCEL_GIT_COMMIT_SHA = original;
  });

  it("returns 503 with ok:false when DB throws", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection refused"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json).toEqual({ ok: false, error: "db_unreachable" });
    expect(errSpy).toHaveBeenCalledWith("[health] db check failed", expect.any(Error));
    errSpy.mockRestore();
  });
});
