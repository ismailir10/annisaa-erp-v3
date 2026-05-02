import { describe, it, expect, vi, beforeEach } from "vitest";

// `@/lib/auth` transitively imports `@/lib/db`, which throws at import time
// when DATABASE_URL is unset (vitest env). Stub the db so the auth module
// can be loaded; we override `getSession` below.
vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
    },
    webhookEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

import { GET } from "../invoices/[id]/webhook-events/route";

function makeReq(id: string) {
  return new Request(
    `http://localhost:3000/api/invoices/${id}/webhook-events`,
  );
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
    permissions: [] as string[],
    customRoleCode: null,
  };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/invoices/[id]/webhook-events — auth", () => {
  it("returns 403 with no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(403);
    expect(prisma.webhookEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(403);
    expect(prisma.webhookEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for GUARDIAN role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "GUARDIAN" as const,
    });

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(403);
    expect(prisma.webhookEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/invoices/[id]/webhook-events — tenant ownership", () => {
  it("returns 404 when invoice does not exist", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(404);
    expect(prisma.webhookEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 when invoice belongs to a different tenant", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      tenantId: "tnt-other",
    } as never);

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(404);
    expect(prisma.webhookEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/invoices/[id]/webhook-events — happy path", () => {
  it("returns events ordered desc with redacted payload + errorLabel + displayFields", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      tenantId: "tnt-1",
    } as never);

    const realprodPayload = {
      event: "payment_session.completed",
      created: "2026-04-26T09:23:19.140Z",
      data: {
        status: "COMPLETED",
        amount: 800000,
        currency: "IDR",
        reference_id: "staging-tagihan-cmodtjyva1g7n7bx7lzpw5oht",
        payment_session_id: "ps-69ec4131991c6b6d61d2e989",
        payment_id: "py-baa5f75a-73b0-4d57-9476-58f1bb160168",
        updated: "2026-04-26T09:23:18.882Z",
      },
      customer: { email: "leak@example.com" },
      billing_information: { country: "ID" },
    };

    vi.mocked(prisma.webhookEvent.findMany).mockResolvedValue([
      {
        id: "evt-1",
        eventType: "payment_session.completed",
        status: "PROCESSED",
        errorMessage: null,
        createdAt: new Date("2026-04-26T09:23:20.000Z"),
        payload: realprodPayload,
      },
      {
        id: "evt-2",
        eventType: "payment_session.completed",
        status: "ERROR",
        errorMessage: "MISSING_AMOUNT",
        createdAt: new Date("2026-04-25T09:23:20.000Z"),
        payload: { event: "payment_session.completed", data: {} },
      },
    ] as never);

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Order desc preserved.
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("evt-1");
    expect(body[1].id).toBe("evt-2");

    // Redaction.
    expect(body[0].payload.customer).toEqual({ REDACTED: true });
    expect(body[0].payload.billing_information).toEqual({ REDACTED: true });
    // Non-PII fields preserved.
    expect(body[0].payload.event).toBe("payment_session.completed");
    expect(body[0].payload.data.amount).toBe(800000);

    // displayFields parsed.
    expect(body[0].displayFields.amount).toBe(800000);
    expect(body[0].displayFields.paymentMethod).toBeNull();
    expect(body[0].displayFields.sessionId).toBe("ps-69ec4131991c6b6d61d2e989");

    // errorLabel humanized for ERROR row, null for success.
    expect(body[0].errorLabel).toBeNull();
    expect(body[1].errorLabel).toBe(
      "Jumlah pembayaran tidak tercatat di webhook. Verifikasi manual.",
    );

    // Query was scoped + ordered.
    const arg = vi.mocked(prisma.webhookEvent.findMany).mock.calls[0][0];
    expect(arg?.where).toEqual({ invoiceId: "inv-1" });
    expect(arg?.orderBy).toEqual({ createdAt: "desc" });
  });

  it("returns empty array when invoice has no events", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(adminSession());
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      id: "inv-1",
      tenantId: "tnt-1",
    } as never);
    vi.mocked(prisma.webhookEvent.findMany).mockResolvedValue([] as never);

    const res = await GET(makeReq("inv-1") as never, makeParams("inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
