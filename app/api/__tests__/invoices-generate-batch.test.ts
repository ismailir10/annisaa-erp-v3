import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory tx mock factory — each test rewires the per-call return values.
const txMock = {
  $queryRaw: vi.fn(),
  invoice: {
    findFirst: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  invoiceLine: {
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    studentEnrollment: { findMany: vi.fn() },
    programFeeStructure: { findMany: vi.fn() },
    invoice: { findMany: vi.fn(), update: vi.fn() },
    studentGuardian: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getSession: vi.fn() };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 99 })),
  getClientIp: vi.fn(() => "test-ip"),
}));

// Mock the helper at the boundary the route imports it from. The helper's
// internal Xendit + DB write is out of scope here; we control its outcomes
// directly to exercise success / failure / TOCTOU branches.
vi.mock("@/lib/xendit/helpers", () => ({
  createXenditSessionForInvoice: vi.fn(),
}));

import { POST } from "../invoices/generate/batch/route";

function makeReq(body: unknown) {
  return new Request("http://localhost:3000/api/invoices/generate/batch", {
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

const validBody = {
  studentIds: ["s-1"],
  periodLabel: "April 2026",
  dueDate: "2026-04-30",
  academicYearId: "ay-1",
};

/**
 * Wire the tx mock for a happy-path createMany → findMany pattern.
 * Returns sequential invoice numbers and ids matching the studentIds order.
 */
function wireHappyTx(studentIds: string[], { startingNumber = 1 }: { startingNumber?: number } = {}) {
  // nextInvoiceNumber issues two $queryRaw calls:
  //   1. advisory-lock acquisition  → []
  //   2. SELECT last invoice number → [{ invoiceNumber }] or []
  // Subsequent invoice numbers in the batch are computed locally (no more queries).
  txMock.$queryRaw.mockResolvedValueOnce([]); // lock
  txMock.$queryRaw.mockResolvedValueOnce(
    startingNumber === 1
      ? []
      : [{ invoiceNumber: `INV-2026-${String(startingNumber - 1).padStart(4, "0")}` }]
  );

  txMock.invoice.createMany.mockResolvedValueOnce({ count: studentIds.length });

  // Mirror the invoice rows the route would have written.
  const created = studentIds.map((sid, i) => ({
    id: `inv-${sid}`,
    invoiceNumber: `INV-2026-${String(startingNumber + i).padStart(4, "0")}`,
    studentId: sid,
  }));
  txMock.invoice.findMany.mockResolvedValueOnce(created);
  txMock.invoiceLine.createMany.mockResolvedValueOnce({ count: studentIds.length });

  return created;
}

/**
 * Wire the eligibility query + dedup query trio. By default every studentId is
 * fully eligible (active enrollment, has program fees, not previously invoiced).
 */
function wireFullEligibility(
  studentIds: string[],
  {
    alreadyInvoicedIds = [] as string[],
    noEnrollmentIds = [] as string[],
    noFeesProgramIds = [] as string[],
  } = {}
) {
  const enrollments = studentIds
    .filter((sid) => !noEnrollmentIds.includes(sid))
    .map((sid) => {
      // s-X students go to program-A unless explicitly assigned to a no-fee program
      const programId = noFeesProgramIds.length > 0 && sid === "s-noFee" ? "p-noFee" : "p-A";
      return {
        student: { id: sid, name: `Student ${sid}` },
        classSection: { programId },
      };
    });

  // Program p-A always has a fee structure; p-noFee never does.
  const feeStructures = [
    {
      programId: "p-A",
      feeComponentId: "fc-1",
      amount: 100_000,
      feeComponent: { label: "SPP" },
    },
  ];

  const studentGuardians = studentIds.map((sid) => ({
    studentId: sid,
    parentId: `parent-of-${sid}`,
  }));

  return { enrollments, feeStructures, studentGuardians, alreadyInvoicedIds };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockReset();
  txMock.invoice.findFirst.mockReset();
  txMock.invoice.createMany.mockReset();
  txMock.invoice.findMany.mockReset();
  txMock.invoiceLine.createMany.mockReset();
});

describe("POST /api/invoices/generate/batch — auth & validation", () => {
  it("returns 403 when there is no session", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for TEACHER role", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({
      ...adminSession(),
      role: "TEACHER" as const,
    });

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(403);
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when studentIds missing", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({
        periodLabel: "April 2026",
        dueDate: "2026-04-30",
        academicYearId: "ay-1",
      }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("returns 400 when studentIds.length > 25", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const overCap = Array.from({ length: 26 }, (_, i) => `s-${i}`);
    const res = await POST(
      makeReq({ ...validBody, studentIds: overCap }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when dueDate format is wrong", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const res = await POST(
      makeReq({ ...validBody, dueDate: "30/04/2026" }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const { getSession } = await import("@/lib/auth");
    vi.mocked(rateLimit).mockReturnValueOnce({ success: false, remaining: 0 });

    const res = await POST(makeReq(validBody) as never);
    expect(res.status).toBe(429);
    // Rate-limit short-circuits before auth.
    expect(getSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoices/generate/batch — happy path", () => {
  it("creates 5 invoices, all Xendit succeed → 5 SENT, created=5, skipped=0", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const studentIds = ["s-1", "s-2", "s-3", "s-4", "s-5"];
    const { enrollments, feeStructures, studentGuardians } = wireFullEligibility(studentIds);

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue(enrollments as never);
    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue(feeStructures as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.studentGuardian.findMany).mockResolvedValue(studentGuardians as never);

    wireHappyTx(studentIds);

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);
    vi.mocked(createXenditSessionForInvoice).mockImplementation(async (id) => ({
      paymentUrl: `https://checkout.xendit.co/web/${id}`,
    }));

    const res = await POST(
      makeReq({ ...validBody, studentIds }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(5);
    expect(body.skipped).toBe(0);
    expect(body.results).toHaveLength(5);
    for (const r of body.results) {
      expect(r.status).toBe("SENT");
      expect(r.paymentUrl).toMatch(/^https:\/\/checkout\.xendit\.co\/web\/inv-/);
    }

    // Each successful invoice gets a SENT/sentAt/paymentLinkError-null update.
    expect(vi.mocked(prisma.invoice.update)).toHaveBeenCalledTimes(5);
    const updateCalls = vi.mocked(prisma.invoice.update).mock.calls;
    for (const [arg] of updateCalls) {
      expect(arg.data).toMatchObject({ status: "SENT", paymentLinkError: null });
      expect(arg.data?.sentAt).toBeInstanceOf(Date);
    }
  });
});

describe("POST /api/invoices/generate/batch — mixed Xendit outcomes", () => {
  it("4 succeed + 1 fails → 4 SENT + 1 PENDING_PAYMENT_LINK with paymentLinkError persisted", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const studentIds = ["s-1", "s-2", "s-3", "s-4", "s-5"];
    const { enrollments, feeStructures, studentGuardians } = wireFullEligibility(studentIds);

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue(enrollments as never);
    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue(feeStructures as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.studentGuardian.findMany).mockResolvedValue(studentGuardians as never);

    wireHappyTx(studentIds);

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    // Helper succeeds for inv-s-1..s-4, throws for inv-s-5.
    vi.mocked(createXenditSessionForInvoice).mockImplementation(async (invoiceId) => {
      if (invoiceId === "inv-s-5") throw new Error("Xendit 503");
      return { paymentUrl: `https://checkout.xendit.co/web/${invoiceId}` };
    });

    const res = await POST(
      makeReq({ ...validBody, studentIds }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(5);
    expect(body.skipped).toBe(0);
    expect(body.results).toHaveLength(5);

    const sent = body.results.filter((r: { status: string }) => r.status === "SENT");
    const pending = body.results.filter(
      (r: { status: string }) => r.status === "PENDING_PAYMENT_LINK"
    );
    expect(sent).toHaveLength(4);
    expect(pending).toHaveLength(1);
    expect(pending[0].error).toBe("Xendit 503");
    expect(pending[0].invoiceId).toBe("inv-s-5");

    // The failure update writes paymentLinkError but does NOT flip status —
    // the status was already PENDING_PAYMENT_LINK when the invoice was created.
    const updateCalls = vi.mocked(prisma.invoice.update).mock.calls.map((c) => c[0]);
    const failureUpdate = updateCalls.find((c) => c.where.id === "inv-s-5");
    expect(failureUpdate?.data).toEqual({ paymentLinkError: "Xendit 503" });
  });
});

describe("POST /api/invoices/generate/batch — skipped students", () => {
  it("3 studentIds (1 eligible, 1 already-invoiced, 1 no-enrollment) → created=1, skipped=2", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    // s-1: eligible. s-2: already-invoiced (same period). s-3: no enrollment.
    const studentIds = ["s-1", "s-2", "s-3"];

    // Only s-1 and s-2 have enrollments; s-3 has none.
    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue([
      { student: { id: "s-1", name: "Student s-1" }, classSection: { programId: "p-A" } },
      { student: { id: "s-2", name: "Student s-2" }, classSection: { programId: "p-A" } },
    ] as never);

    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue([
      {
        programId: "p-A",
        feeComponentId: "fc-1",
        amount: 100_000,
        feeComponent: { label: "SPP" },
      },
    ] as never);

    // s-2 already has an invoice for "April 2026".
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([{ studentId: "s-2" }] as never);

    vi.mocked(prisma.studentGuardian.findMany).mockResolvedValue([
      { studentId: "s-1", parentId: "parent-1" },
    ] as never);

    // Only s-1 makes it into the build list → tx wires for [s-1].
    wireHappyTx(["s-1"]);

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);
    vi.mocked(createXenditSessionForInvoice).mockResolvedValue({
      paymentUrl: "https://checkout.xendit.co/web/inv-s-1",
    });

    const res = await POST(makeReq({ ...validBody, studentIds }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(1);
    expect(body.skipped).toBe(2);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      studentId: "s-1",
      status: "SENT",
      paymentUrl: "https://checkout.xendit.co/web/inv-s-1",
    });
  });
});

describe("POST /api/invoices/generate/batch — concurrency cap", () => {
  it("25-student happy path: helper max-in-flight never exceeds 5", async () => {
    const { getSession } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/db");
    const { createXenditSessionForInvoice } = await import("@/lib/xendit/helpers");
    vi.mocked(getSession).mockResolvedValue(adminSession());

    const studentIds = Array.from({ length: 25 }, (_, i) => `s-${i + 1}`);
    const { enrollments, feeStructures, studentGuardians } = wireFullEligibility(studentIds);

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue(enrollments as never);
    vi.mocked(prisma.programFeeStructure.findMany).mockResolvedValue(feeStructures as never);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.studentGuardian.findMany).mockResolvedValue(studentGuardians as never);

    wireHappyTx(studentIds);

    vi.mocked(prisma.invoice.update).mockResolvedValue({} as never);

    // Track concurrent in-flight calls. Helper resolves on the next microtask
    // so pLimit gets a chance to actually queue past 5 — if there were no cap,
    // peak would be 25.
    let inFlight = 0;
    let peak = 0;
    vi.mocked(createXenditSessionForInvoice).mockImplementation(async (invoiceId) => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      // Yield twice to let pLimit feed more from the queue if the cap allowed.
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
      return { paymentUrl: `https://checkout.xendit.co/web/${invoiceId}` };
    });

    const res = await POST(makeReq({ ...validBody, studentIds }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.created).toBe(25);
    expect(body.results).toHaveLength(25);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(0);
  });
});
