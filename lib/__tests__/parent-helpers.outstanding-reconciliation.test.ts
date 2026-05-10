// Reconciliation regression tests for getParentOutstandingForStudents.
//
// NOTE: this suite calls the helper FRESH (no cache layer). It cannot catch
// cache-staleness divergence between /parent and /parent/invoices — that
// regression vector is owned by the Playwright cross-page assertion in
// e2e/parent.spec.ts (Task 5 of cycle docs/cycles/2026-05-04-parent-balance-reconcile.md).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getParentOutstandingForStudents } from "../parent-helpers";
import { prisma } from "@/lib/db";

// Mock next/cache so unstable_cache is a no-op (no Next.js incrementalCache runtime in Vitest)
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Mock Prisma client
vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

describe("getParentOutstandingForStudents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero summary and skips Prisma when studentIds is empty", async () => {
    const result = await getParentOutstandingForStudents([], "tenant-a");

    expect(result).toEqual({ count: 0, total: 0, nearestDue: null, items: [] });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it("returns zero summary when no rows are returned (all-paid household)", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    const result = await getParentOutstandingForStudents(["s1"], "tenant-a");

    expect(result).toEqual({ count: 0, total: 0, nearestDue: null, items: [] });
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
  });

  it("aggregates mixed statuses across one student and excludes the remaining=0 boundary case", async () => {
    // Three rows that count + one PARTIALLY_PAID with totalPaid === totalDue
    // (remaining 0; status flip to PAID lagging) which must be excluded.
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        studentId: "s1",
        dueDate: "2026-06-30",
        totalDue: 1_000_000,
        totalPaid: 0,
        // status SENT — implicit via mock; helper relies on Prisma where
      },
      {
        studentId: "s1",
        dueDate: "2026-05-31",
        totalDue: 1_000_000,
        totalPaid: 400_000,
      },
      {
        studentId: "s1",
        dueDate: "2026-07-15",
        totalDue: 500_000,
        totalPaid: 0,
      },
      {
        // Boundary case — remaining 0, must be excluded by the post-filter.
        studentId: "s1",
        dueDate: "2026-04-30",
        totalDue: 750_000,
        totalPaid: 750_000,
      },
    ] as never);

    const result = await getParentOutstandingForStudents(["s1"], "tenant-a");

    expect(result.count).toBe(3);
    expect(result.total).toBe(1_000_000 + 600_000 + 500_000); // 2_100_000
    expect(result.nearestDue).toBe("2026-05-31");
    expect(result.items).toHaveLength(3);
    // Remaining=0 row must not appear in items.
    expect(result.items.some((i) => i.remaining === 0)).toBe(false);
  });

  it("aggregates household-wide across multiple students and passes studentId IN clause", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        studentId: "s1",
        dueDate: "2026-05-31",
        totalDue: 1_000_000,
        totalPaid: 0,
      },
      {
        studentId: "s2",
        dueDate: "2026-06-15",
        totalDue: 800_000,
        totalPaid: 200_000,
      },
    ] as never);

    const result = await getParentOutstandingForStudents(["s1", "s2"], "tenant-a");

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          studentId: { in: ["s1", "s2"] },
          status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        }),
      })
    );

    expect(result.count).toBe(2);
    expect(result.total).toBe(1_000_000 + 600_000); // 1_600_000
    expect(result.nearestDue).toBe("2026-05-31");
  });

  it("multi-student additivity — sum of per-student calls equals combined call (regression)", async () => {
    const fixtureS1 = [
      {
        studentId: "s1",
        dueDate: "2026-05-31",
        totalDue: 1_000_000,
        totalPaid: 0,
      },
      {
        studentId: "s1",
        dueDate: "2026-06-30",
        totalDue: 500_000,
        totalPaid: 100_000,
      },
    ];
    const fixtureS2 = [
      {
        studentId: "s2",
        dueDate: "2026-06-15",
        totalDue: 800_000,
        totalPaid: 200_000,
      },
    ];

    // Combined call returns both students' rows.
    vi.mocked(prisma.invoice.findMany).mockResolvedValueOnce([
      ...fixtureS1,
      ...fixtureS2,
    ] as never);
    const combined = await getParentOutstandingForStudents(["s1", "s2"], "tenant-a");

    // Per-student calls return matching subset only.
    vi.mocked(prisma.invoice.findMany).mockResolvedValueOnce(fixtureS1 as never);
    const onlyS1 = await getParentOutstandingForStudents(["s1"], "tenant-a");

    vi.mocked(prisma.invoice.findMany).mockResolvedValueOnce(fixtureS2 as never);
    const onlyS2 = await getParentOutstandingForStudents(["s2"], "tenant-a");

    expect(onlyS1.count + onlyS2.count).toBe(combined.count);
    expect(onlyS1.total + onlyS2.total).toBe(combined.total);
  });

  it("Prisma where.status.in is exactly [SENT, PARTIALLY_PAID, OVERDUE] — never CANCELLED, PAID, DRAFT, PENDING_PAYMENT_LINK", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await getParentOutstandingForStudents(["s1"], "tenant-a");

    const call = vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as {
      where: { status: { in: string[] } };
    };
    expect(call.where.status.in).toEqual(["SENT", "PARTIALLY_PAID", "OVERDUE"]);
    expect(call.where.status.in).not.toContain("CANCELLED");
    expect(call.where.status.in).not.toContain("PAID");
    expect(call.where.status.in).not.toContain("DRAFT");
    expect(call.where.status.in).not.toContain("PENDING_PAYMENT_LINK");
  });

  it("nearestDue picks the earliest YYYY-MM-DD across rows", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([
      {
        studentId: "s1",
        dueDate: "2026-06-15",
        totalDue: 1_000_000,
        totalPaid: 0,
      },
      {
        studentId: "s1",
        dueDate: "2026-05-31",
        totalDue: 1_000_000,
        totalPaid: 0,
      },
      {
        studentId: "s1",
        dueDate: "2026-07-01",
        totalDue: 1_000_000,
        totalPaid: 0,
      },
    ] as never);

    const result = await getParentOutstandingForStudents(["s1"], "tenant-a");

    expect(result.nearestDue).toBe("2026-05-31");
  });

  it("passes tenantId through to Prisma where clause exactly (defense in depth)", async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([] as never);

    await getParentOutstandingForStudents(["s1"], "tenant-x");

    const call = vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as {
      where: { tenantId: string };
    };
    expect(call.where.tenantId).toBe("tenant-x");
  });
});
