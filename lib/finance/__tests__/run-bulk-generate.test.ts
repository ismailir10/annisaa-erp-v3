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
    // Auto-sweep gate (T7): 0 pending → no sweep, no extra fetches.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

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
      expect(out.final.sweepRan).toBe(false);
      expect(out.final.pendingAfterSweep).toBe(0);
    }

    // Plan + 1 batch + 1 count-only sweep gate = 3 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const planCall = fetchMock.mock.calls[0];
    expect(planCall[0]).toBe("/api/invoices/generate/plan");
    const batchCall = fetchMock.mock.calls[1];
    expect(batchCall[0]).toBe("/api/invoices/generate/batch");
    const batchBody = JSON.parse(batchCall[1].body);
    expect(batchBody.studentIds).toHaveLength(5);
    expect(batchBody.periodLabel).toBe("April 2026");
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/invoices/pending-payment-link?count-only=true",
    );

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
    // Auto-sweep gate (T7): 0 pending → no sweep.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const progressSnapshots: BatchProgressSnapshot[] = [];
    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      onProgress: (s) => progressSnapshots.push({ ...s }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(BATCH_SIZE).toBe(25); // sanity — chunking constant must match spec §6
    expect(fetchMock).toHaveBeenCalledTimes(5); // plan + 3 batches + 1 sweep gate

    // Verify each batch posted the right slice.
    // calls[0] is the plan POST, calls[1..3] are the 3 batches, calls[4] is the sweep gate GET.
    const batchBodies = fetchMock.mock.calls
      .slice(1, 4)
      .map((c) => JSON.parse(c[1].body));
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

// --------------------------------------------------------------------------
// Auto-sweep (T7) — orchestrator-level "Coba Lagi Link" between chunks-done
// and final summary. Spec: docs/cycles/2026-04-27-invoice-create-auto-retry.md
// §Task 7.
// --------------------------------------------------------------------------

describe("runBulkGenerate — auto-sweep clears transient failures", () => {
  it("fires runBulkRetry once when pending > 0 + signal not aborted; transients clear → pendingAfterSweep=0", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(25);
    // 1) plan
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    // 2) batch — 22 SENT + 3 PENDING_PAYMENT_LINK (transient)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeBatchResponse(plan.eligibleStudentIds, [5, 11, 18])),
    );
    // 3) auto-sweep gate — count-only=true returns 3 pending
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 3 }));
    // 4) runBulkRetry's pending list (full payload, not count-only)
    const pendingIds = ["s-6", "s-12", "s-19"];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: pendingIds.map((id) => ({
          id,
          studentName: `Student ${id}`,
          periodLabel: "April 2026",
          totalDue: "500000",
          paymentLinkError: "5xx: Xendit 503",
        })),
        total: 3,
      }),
    );
    // 5) runBulkRetry's retry-payment-links call — all 3 succeed
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        retried: 3,
        succeeded: 3,
        stillFailed: 0,
        results: pendingIds.map((id) => ({
          invoiceId: id,
          invoiceNumber: `INV-${id}`,
          studentId: id,
          status: "SENT" as const,
          paymentUrl: `https://xendit.local/pay/${id}`,
        })),
      }),
    );
    // 6) post-sweep re-count — 0 pending
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const phases: string[] = [];
    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      onProgress: (s) => phases.push(s.phase),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.sweepRan).toBe(true);
      expect(out.final.pendingAfterSweep).toBe(0);
      // Chunk counters are intentionally frozen during sweep (see
      // BatchProgressPhase doc). xenditFailed reflects the post-chunk
      // pre-sweep count; pendingAfterSweep is the source of truth.
      expect(out.final.xenditFailed).toBe(3);
      expect(out.final.xenditOk).toBe(22);
    }

    // Phase transitions: running → sweeping → done.
    expect(phases).toContain("running");
    expect(phases).toContain("sweeping");
    expect(phases[phases.length - 1]).toBe("done");

    // Sanity: count-only=true was used, not the full list (twice — pre + post sweep).
    const countCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/invoices/pending-payment-link?count-only=true"),
    );
    expect(countCalls).toHaveLength(2);
  });
});

describe("runBulkGenerate — auto-sweep cannot clear hard failures", () => {
  it("fires sweep but pendingAfterSweep > 0 surfaces the manual button", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(25);
    // 1) plan
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));
    // 2) batch — 23 SENT + 2 PENDING (401 hard failures)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeBatchResponse(plan.eligibleStudentIds, [10, 20])),
    );
    // 3) pre-sweep count
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2 }));
    // 4) runBulkRetry pending list
    const hardIds = ["s-11", "s-21"];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: hardIds.map((id) => ({
          id,
          studentName: `Student ${id}`,
          periodLabel: "April 2026",
          totalDue: "500000",
          paymentLinkError: "401: Xendit auth failed",
        })),
        total: 2,
      }),
    );
    // 5) retry-payment-links — HTTP 200 but Xendit still fails for 401s
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        retried: 2,
        succeeded: 0,
        stillFailed: 2,
        results: hardIds.map((id) => ({
          invoiceId: id,
          invoiceNumber: `INV-${id}`,
          studentId: id,
          status: "PENDING_PAYMENT_LINK" as const,
          error: "401: Xendit auth failed",
        })),
      }),
    );
    // 6) post-sweep count — still 2
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2 }));

    const out = await runBulkGenerate({
      planRequest: { periodLabel: "April 2026", dueDate: "2026-04-30", academicYearId: "y1" },
      onPlan: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.sweepRan).toBe(true);
      expect(out.final.pendingAfterSweep).toBe(2);
    }
  });
});

describe("runBulkGenerate — user-abort skips auto-sweep", () => {
  it("does not fetch pending-payment-link when user cancels mid-run", async () => {
    const fetchMock = vi.fn();
    const plan = makePlan(60); // 3 chunks
    fetchMock.mockResolvedValueOnce(jsonResponse(plan));

    const c1 = plan.eligibleStudentIds.slice(0, 25);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeBatchResponse(c1)));

    const controller = new AbortController();
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
      // sweepRan stays undefined — sweep gate never reached on user-abort.
      expect(out.final.sweepRan).toBeUndefined();
      expect(out.final.pendingAfterSweep).toBeUndefined();
    }

    // Plan + 1 batch only — no pending-payment-link, no retry-payment-links.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("pending-payment-link"))).toBe(false);
    expect(urls.some((u) => u.includes("retry-payment-links"))).toBe(false);
  });
});
