import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runBulkGenerate,
  chunk,
  BATCH_SIZE,
  type PlanResponse,
  type BatchResponse,
  type BatchProgressSnapshot,
} from "../run-bulk-generate";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makePlan(eligibleCount: number, overrides?: Partial<PlanResponse>): PlanResponse {
  return {
    eligibleStudentIds: Array.from({ length: eligibleCount }, (_, i) => `s-${i + 1}`),
    skippedAlreadyInvoiced: 0,
    skippedNoFeeStructure: 0,
    total: eligibleCount,
    eligible: eligibleCount,
    ...overrides,
  };
}

function makeBatchResponse(studentIds: string[], failingIndexes: number[] = []): BatchResponse {
  const results = studentIds.map((sid, i) => {
    if (failingIndexes.includes(i)) {
      return {
        studentId: sid,
        invoiceId: `inv-${sid}`,
        invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
        status: "PENDING_PAYMENT_LINK" as const,
        error: "Xendit unavailable",
      };
    }
    return {
      studentId: sid,
      invoiceId: `inv-${sid}`,
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      status: "SENT" as const,
      paymentUrl: `https://xendit.local/pay/${sid}`,
    };
  });
  return {
    created: studentIds.length,
    skipped: 0,
    results,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --------------------------------------------------------------------------
// chunk()
// --------------------------------------------------------------------------

describe("chunk", () => {
  it("slices an array into N-sized buckets", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns [] for an empty array", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("throws on size <= 0", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

// --------------------------------------------------------------------------
// runBulkGenerate — happy paths
// --------------------------------------------------------------------------

describe("runBulkGenerate — single chunk (5 students)", () => {
  it("posts plan, then exactly ONE batch of 5, ends with done=5/total=5", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(5);
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(plan.eligibleStudentIds)));

    const onProgress = vi.fn();
    const onPlan = vi.fn().mockResolvedValue(true);

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan,
      onProgress,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.done).toBe(5);
      expect(out.final.total).toBe(5);
      expect(out.final.created).toBe(5);
      expect(out.final.xenditOk).toBe(5);
      expect(out.final.xenditFailed).toBe(0);
    }

    // Plan + 1 batch = 2 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const planCall = fetchMock.mock.calls[0];
    expect(planCall[0]).toBe("/api/invoices/generate/plan");
    const batchCall = fetchMock.mock.calls[1];
    expect(batchCall[0]).toBe("/api/invoices/generate/batch");
    const batchBody = JSON.parse(batchCall[1].body);
    expect(batchBody.studentIds).toHaveLength(5);
    expect(batchBody.periodLabel).toBe("April 2026");

    // onProgress fires at start (running) + after batch + at done.
    const phases = onProgress.mock.calls.map((c) => (c[0] as BatchProgressSnapshot).phase);
    expect(phases[phases.length - 1]).toBe("done");
  });
});

describe("runBulkGenerate — multi chunk (60 students → 25 + 25 + 10)", () => {
  it("posts 3 batches and increments done after each", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(60);
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    // 3 chunks: 25, 25, 10
    const c1 = plan.eligibleStudentIds.slice(0, 25);
    const c2 = plan.eligibleStudentIds.slice(25, 50);
    const c3 = plan.eligibleStudentIds.slice(50, 60);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c1)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c2)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c3)));

    const progressSnapshots: BatchProgressSnapshot[] = [];
    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      onProgress: (s) => progressSnapshots.push({ ...s }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(BATCH_SIZE).toBe(25); // sanity — chunking constant must match spec §6
    expect(fetchMock).toHaveBeenCalledTimes(4); // plan + 3 batches

    // Verify each batch posted the right slice.
    const batchBodies = fetchMock.mock.calls.slice(1).map((c) => JSON.parse(c[1].body));
    expect(batchBodies[0].studentIds).toHaveLength(25);
    expect(batchBodies[1].studentIds).toHaveLength(25);
    expect(batchBodies[2].studentIds).toHaveLength(10);

    // Progress should monotonically advance: 0 → 25 → 50 → 60.
    const doneValues = progressSnapshots.map((s) => s.done);
    expect(doneValues[0]).toBe(0); // initial running snapshot
    expect(doneValues).toContain(25);
    expect(doneValues).toContain(50);
    expect(doneValues[doneValues.length - 1]).toBe(60);

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.done).toBe(60);
      expect(out.final.created).toBe(60);
      expect(out.final.xenditOk).toBe(60);
    }
  });
});

// --------------------------------------------------------------------------
// runBulkGenerate — pause / retry on 5xx
// --------------------------------------------------------------------------

describe("runBulkGenerate — 5xx retry then auto-abort", () => {
  it("retries 2× with backoff, then aborts when 3rd attempt also fails", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(5);
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    // Batch always 503 → 1 try + 2 retries = 3 fetch hits to /batch.
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 503 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // Plan + 3 batch attempts = 4 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Backoffs: 1000ms, 3000ms (2 sleeps between 3 attempts).
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 3000);

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.done).toBe(0); // chunk never landed
    }
  });
});

// --------------------------------------------------------------------------
// runBulkGenerate — eligibility edge cases
// --------------------------------------------------------------------------

describe("runBulkGenerate — plan returns eligible=0", () => {
  it("does not post any batch and returns no-eligible", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makePlan(0, { skippedAlreadyInvoiced: 12, skippedNoFeeStructure: 3 })),
    );

    const onPlan = vi.fn();
    const onProgress = vi.fn();

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan,
      onProgress,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("no-eligible");
    if (out.phase === "no-eligible") {
      expect(out.plan.skippedAlreadyInvoiced).toBe(12);
      expect(out.plan.skippedNoFeeStructure).toBe(3);
    }
    // Plan only — onPlan never called, no batch posted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onPlan).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("runBulkGenerate — onPlan returns false", () => {
  it("aborts before any batch is posted", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makePlan(5)));

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("user-cancelled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------
// Mixed Xendit success/fail counting
// --------------------------------------------------------------------------

describe("runBulkGenerate — partial Xendit failure tallies xenditOk + xenditFailed", () => {
  it("a chunk with 4 SENT + 1 PENDING_PAYMENT_LINK rolls into the right totals", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(5);
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeBatchResponse(plan.eligibleStudentIds, [2])),
    );

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.xenditOk).toBe(4);
      expect(out.final.xenditFailed).toBe(1);
      expect(out.final.created).toBe(5);
    }
  });
});

// --------------------------------------------------------------------------
// Cancellation via AbortSignal (T4)
// --------------------------------------------------------------------------

describe("runBulkGenerate — cancellation via AbortSignal", () => {
  it("aborts before the next chunk when signal is aborted mid-run", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(60); // 3 chunks
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));

    const c1 = plan.eligibleStudentIds.slice(0, 25);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c1)));

    const controller = new AbortController();
    // Abort after the first chunk lands.
    let chunksObserved = 0;
    const onProgress = (s: BatchProgressSnapshot) => {
      if (s.phase === "running" && s.done === 25 && chunksObserved === 0) {
        chunksObserved++;
        controller.abort();
      }
    };

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      onProgress,
      signal: controller.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      // First chunk landed (25), no further chunks dispatched.
      expect(out.final.done).toBe(25);
      expect(out.final.phase).toBe("aborted");
    }
    // Plan + 1 batch only — chunks 2 & 3 never dispatched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when signal is not provided (back-compat)", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(5);
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(plan.eligibleStudentIds)));

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
  });
});

// --------------------------------------------------------------------------
// Per-student failure rows accumulate on the snapshot (T4)
// --------------------------------------------------------------------------

describe("runBulkGenerate — failure rows on snapshot", () => {
  it("accumulates failures across chunks with studentName + error", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(50); // 2 chunks of 25
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));

    const c1 = plan.eligibleStudentIds.slice(0, 25);
    const c2 = plan.eligibleStudentIds.slice(25, 50);
    // Inject 2 failures in chunk 1 and 1 in chunk 2 (total 3).
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c1, [3, 7])));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c2, [2])));

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.xenditFailed).toBe(3);
      expect(out.final.failures).toHaveLength(3);
      for (const f of out.final.failures) {
        expect(f.studentId).toBeTruthy();
        expect(f.error).toBe("Xendit unavailable");
      }
    }
  });
});
