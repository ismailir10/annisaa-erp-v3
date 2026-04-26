import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runBulkRetry,
  RETRY_BATCH_SIZE,
  type RetryResponse,
  type BatchProgressSnapshot,
} from "../run-bulk-retry";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRetryResponse(
  invoiceIds: string[],
  failingIndexes: number[] = [],
): RetryResponse {
  const results = invoiceIds.map((id, i) => {
    if (failingIndexes.includes(i)) {
      return {
        invoiceId: id,
        invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
        studentId: `s-${i + 1}`,
        status: "PENDING_PAYMENT_LINK" as const,
        error: "Xendit unavailable",
      };
    }
    return {
      invoiceId: id,
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      studentId: `s-${i + 1}`,
      status: "SENT" as const,
      paymentUrl: `https://xendit.local/pay/${id}`,
    };
  });
  const succeeded = results.filter((r) => r.status === "SENT").length;
  const stillFailed = results.length - succeeded;
  return {
    retried: invoiceIds.length,
    succeeded,
    stillFailed,
    results,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --------------------------------------------------------------------------
// Single chunk
// --------------------------------------------------------------------------

describe("runBulkRetry — single chunk (5 invoices)", () => {
  it("posts exactly ONE retry call, ends with done=5/total=5", async () => {
    const fetchMock = vi.fn();
    const ids = ["i-1", "i-2", "i-3", "i-4", "i-5"];
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(ids)));

    const onProgress = vi.fn();
    const out = await runBulkRetry({
      invoiceIds: ids,
      onProgress,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.done).toBe(5);
      expect(out.final.total).toBe(5);
      expect(out.final.created).toBe(5); // retried
      expect(out.final.xenditOk).toBe(5);
      expect(out.final.xenditFailed).toBe(0);
    }

    // Single retry call — no plan step.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/api/invoices/retry-payment-links");
    const body = JSON.parse(call[1].body);
    expect(body.invoiceIds).toEqual(ids);

    // Final progress phase = done.
    const phases = onProgress.mock.calls.map((c) => (c[0] as BatchProgressSnapshot).phase);
    expect(phases[phases.length - 1]).toBe("done");
  });
});

// --------------------------------------------------------------------------
// Multi chunk
// --------------------------------------------------------------------------

describe("runBulkRetry — multi chunk (60 invoices → 25 + 25 + 10)", () => {
  it("posts 3 retry calls and increments done after each", async () => {
    const fetchMock = vi.fn();
    const ids = Array.from({ length: 60 }, (_, i) => `i-${i + 1}`);
    const c1 = ids.slice(0, 25);
    const c2 = ids.slice(25, 50);
    const c3 = ids.slice(50, 60);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c1)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c2)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c3)));

    const progressSnapshots: BatchProgressSnapshot[] = [];
    const out = await runBulkRetry({
      invoiceIds: ids,
      onProgress: (s) => progressSnapshots.push({ ...s }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(RETRY_BATCH_SIZE).toBe(25); // sanity — chunking constant
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Verify each request posted the right slice.
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0].invoiceIds).toHaveLength(25);
    expect(bodies[1].invoiceIds).toHaveLength(25);
    expect(bodies[2].invoiceIds).toHaveLength(10);

    // Progress monotonic: 0 → 25 → 50 → 60.
    const doneValues = progressSnapshots.map((s) => s.done);
    expect(doneValues[0]).toBe(0);
    expect(doneValues).toContain(25);
    expect(doneValues).toContain(50);
    expect(doneValues[doneValues.length - 1]).toBe(60);

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.xenditOk).toBe(60);
    }
  });
});

// --------------------------------------------------------------------------
// 5xx retry then pause / continue
// --------------------------------------------------------------------------

describe("runBulkRetry — 5xx retry then pause", () => {
  it("retries 2× with backoff, then pauses; cancel ends the run", async () => {
    const fetchMock = vi.fn();
    const ids = ["i-1", "i-2", "i-3"];
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 503 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const onPauseDecision = vi.fn().mockResolvedValue("cancel" as const);

    const out = await runBulkRetry({
      invoiceIds: ids,
      onPauseDecision,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // 1 try + 2 retries = 3 fetch hits.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 3000);

    expect(onPauseDecision).toHaveBeenCalledOnce();
    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.done).toBe(0); // chunk never landed
    }
  });
});

// --------------------------------------------------------------------------
// Pause then continue — admin clicks "Lanjutkan" after a connection blip
// --------------------------------------------------------------------------

describe("runBulkRetry — pause then continue", () => {
  it("re-drives the chunk on continue, lands done with correct tallies", async () => {
    const fetchMock = vi.fn();
    const ids = ["i-1", "i-2", "i-3"];
    // First three calls (initial + 2 retries) fail with 503 → triggers pause.
    // After the user clicks Lanjutkan the chunk is re-driven; this 4th call succeeds.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(ids)));

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const onPauseDecision = vi.fn().mockResolvedValueOnce("continue" as const);

    const out = await runBulkRetry({
      invoiceIds: ids,
      onPauseDecision,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // 3 failed attempts + 1 successful retry after continue = 4 hits.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onPauseDecision).toHaveBeenCalledOnce();

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.done).toBe(3);
      expect(out.final.xenditOk).toBe(3);
      expect(out.final.xenditFailed).toBe(0);
    }
  });
});

// --------------------------------------------------------------------------
// All-succeed in one call
// --------------------------------------------------------------------------

describe("runBulkRetry — 25 invoices, all succeed", () => {
  it("ok counter matches succeeded total", async () => {
    const fetchMock = vi.fn();
    const ids = Array.from({ length: 25 }, (_, i) => `i-${i + 1}`);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(ids)));

    const out = await runBulkRetry({
      invoiceIds: ids,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.xenditOk).toBe(25);
      expect(out.final.xenditFailed).toBe(0);
      expect(out.final.created).toBe(25);
    }
  });
});

// --------------------------------------------------------------------------
// Mixed success / failure
// --------------------------------------------------------------------------

describe("runBulkRetry — mixed succeed + still-failed", () => {
  it("tallies succeeded vs stillFailed per server response", async () => {
    const fetchMock = vi.fn();
    const ids = ["i-1", "i-2", "i-3", "i-4", "i-5"];
    // indexes 1 + 3 still fail.
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(ids, [1, 3])));

    const out = await runBulkRetry({
      invoiceIds: ids,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.created).toBe(5); // total retried
      expect(out.final.xenditOk).toBe(3);
      expect(out.final.xenditFailed).toBe(2);
    }
  });
});

// --------------------------------------------------------------------------
// Empty input
// --------------------------------------------------------------------------

describe("runBulkRetry — empty invoiceIds", () => {
  it("does not post anything and returns no-candidates", async () => {
    const fetchMock = vi.fn();
    const out = await runBulkRetry({
      invoiceIds: [],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(out.phase).toBe("no-candidates");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
