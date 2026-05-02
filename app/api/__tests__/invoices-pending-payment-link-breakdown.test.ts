import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/auth` transitively imports `@/lib/db`, which throws at import time
// when DATABASE_URL is unset (vitest env). Stub the db so the auth module
// can be loaded; we override `getSession` below.
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { GET } from "../invoices/pending-payment-link/breakdown/route";

function adminSession() {
  return {
    id: "u-1",
    email: "admin@test.com",
    name: "Admin",
    role: "SUPER_ADMIN" as const,
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
    permissions: [] as string[],
    customRoleCode: null,
  };
}

const ALL_BUCKETS = [
  "5xx",
  "429",
  "408",
  "network",
  "401",
  "403",
  "422",
  "4xx",
  "untagged",
  "unknown",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/invoices/pending-payment-link/breakdown — auth", () => {
  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin role (TEACHER)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin role (GUARDIAN)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "GUARDIAN" as const,
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /api/invoices/pending-payment-link/breakdown — empty state", () => {
  it("returns total=0 with all 10 buckets zero-filled when no PENDING rows", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(0);
    for (const bucket of ALL_BUCKETS) {
      expect(body.byPrefix[bucket]).toBe(0);
    }
    expect(Object.keys(body.byPrefix).sort()).toEqual([...ALL_BUCKETS].sort());
  });
});

describe("GET /api/invoices/pending-payment-link/breakdown — aggregation", () => {
  it("aggregates a 9-row fixture (one per category) into the documented shape", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    // 9 rows — one per category, including "untagged" for pre-cycle data.
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { prefix: "5xx", n: 5n },
      { prefix: "429", n: 1n },
      { prefix: "408", n: 2n },
      { prefix: "network", n: 3n },
      { prefix: "401", n: 4n },
      { prefix: "403", n: 1n },
      { prefix: "422", n: 1n },
      { prefix: "4xx", n: 1n },
      { prefix: "untagged", n: 7n },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(25);
    expect(body.byPrefix).toEqual({
      "5xx": 5,
      "429": 1,
      "408": 2,
      network: 3,
      "401": 4,
      "403": 1,
      "422": 1,
      "4xx": 1,
      untagged: 7,
      unknown: 0,
    });
  });

  it("folds an unknown prefix from older data into the 'unknown' bucket", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { prefix: "5xx", n: 3n },
      // Pre-cycle data with a tag scheme we no longer recognise.
      { prefix: "weirdold", n: 2n },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(5);
    expect(body.byPrefix["5xx"]).toBe(3);
    expect(body.byPrefix.unknown).toBe(2);
    expect(body.byPrefix.untagged).toBe(0);
  });
});

describe("GET /api/invoices/pending-payment-link/breakdown — tenant scoping", () => {
  it("interpolates the session tenantId into the SQL query", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    let capturedValues: unknown[] = [];
    let capturedSql = "";
    vi.mocked(prisma.$queryRaw).mockImplementation(
      // Tagged-template signature: (strings, ...values).
      ((strings: TemplateStringsArray, ...values: unknown[]) => {
        capturedSql = strings.join("?");
        capturedValues = values;
        return Promise.resolve([] as never);
      }) as never,
    );

    await GET();

    // The tenantId is the only interpolated value (status filter is a literal).
    expect(capturedValues).toEqual(["tnt-1"]);
    // Sanity check that the SQL aggregates by prefix and filters by status.
    expect(capturedSql).toMatch(/PENDING_PAYMENT_LINK/);
    expect(capturedSql).toMatch(/paymentLinkError/);
    expect(capturedSql).toMatch(/GROUP BY/i);
  });
});
