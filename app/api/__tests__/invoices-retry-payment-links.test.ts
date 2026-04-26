import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/auth` transitively imports `@/lib/db`, which throws at import time
// when DATABASE_URL is unset (vitest env). Stub the db so the auth module
// can be loaded; we override `getSession` below.
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99 })),
  getClientIp: vi.fn(() => "test-ip"),
}));

// Mock the helper at the boundary the route imports it from.
vi.mock("@/lib/finance/xendit-retry", () => ({
  retryPaymentLinks: vi.fn(),
}));

import { POST } from "../invoices/retry-payment-links/route";

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/invoices/retry-payment-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminSession() {
  return {
    id: "u-1",
    email: "admin@test.com",
    name: "Admin",
    role: "SUPER_ADMIN" as const,
    tenantId: "tnt-1",
    employeeId: null,
    parentId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/invoices/retry-payment-links — auth", () => {
  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(403);
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });

  it("returns 403 for GUARDIAN role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "GUARDIAN" as const,
    });

    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(403);
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices/retry-payment-links — validation", () => {
  it("returns 400 when invoiceIds.length > 25 (max(25) violation)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const overCap = Array.from({ length: 26 }, (_, i) => `inv-${i}`);
    const res = await POST(makeReq({ invoiceIds: overCap }) as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });

  it("returns 400 when invoiceIds contains an empty string", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(makeReq({ invoiceIds: ["i-1", ""] }) as never);

    expect(res.status).toBe(400);
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });

  it("accepts an empty body (treats as retry-all)", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(retryPaymentLinks).mockResolvedValue({
      retried: 0,
      succeeded: 0,
      stillFailed: 0,
      results: [],
    });

    const res = await POST(makeReq({}) as never);

    expect(res.status).toBe(200);
    expect(retryPaymentLinks).toHaveBeenCalledWith("tnt-1", null);
  });
});

describe("POST /api/invoices/retry-payment-links — rate limit", () => {
  it("returns 429 when rate-limited", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(rateLimit).mockReturnValueOnce({ success: false, remaining: 0 });

    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(429);
    // Rate-limit short-circuits before auth + helper.
    expect(getSession).not.toHaveBeenCalled();
    expect(retryPaymentLinks).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices/retry-payment-links — happy path", () => {
  it("forwards the helper outcome verbatim as JSON", async () => {
    const { getSession } = await import("@/lib/auth");
    const { retryPaymentLinks } = await import("@/lib/finance/xendit-retry");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const mockedOutcome = {
      retried: 3,
      succeeded: 2,
      stillFailed: 1,
      results: [
        {
          invoiceId: "i-1",
          invoiceNumber: "INV-2026-0001",
          studentId: "s-1",
          status: "SENT" as const,
          paymentUrl: "https://checkout.xendit.co/web/i-1",
        },
        {
          invoiceId: "i-2",
          invoiceNumber: "INV-2026-0002",
          studentId: "s-2",
          status: "SENT" as const,
          paymentUrl: "https://checkout.xendit.co/web/i-2",
        },
        {
          invoiceId: "i-3",
          invoiceNumber: "INV-2026-0003",
          studentId: "s-3",
          status: "PENDING_PAYMENT_LINK" as const,
          error: "Xendit 503",
        },
      ],
    };
    vi.mocked(retryPaymentLinks).mockResolvedValue(mockedOutcome);

    const res = await POST(
      makeReq({ invoiceIds: ["i-1", "i-2", "i-3"] }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockedOutcome);
    expect(retryPaymentLinks).toHaveBeenCalledWith("tnt-1", ["i-1", "i-2", "i-3"]);
  });
});
