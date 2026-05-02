import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runBulkRetry,
  chunk,
  BATCH_SIZE,
  MAX_PENDING_FETCH,
  type BulkRetrySnapshot,
  type PendingResponse,
  type RetryResponse,
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

function makePending(count: number, overrides?: Partial<PendingResponse>): PendingResponse {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `inv-${i + 1}`,
      studentName: `Siswa ${i + 1}`,
      periodLabel: "April 2026",
      totalDue: "500000",
      paymentLinkError: null,
    })),
    total: count,
    ...overrides,
  };
}

function makeRetryResponse(invoiceIds: string[], failingIndexes: number[] = []): RetryResponse {
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
  return {
    retried: invoiceIds.length,
    succeeded: invoiceIds.length - failingIndexes.length,
    stillFailed: failingIndexes.length,
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
// Chunking math
// --------------------------------------------------------------------------

describe("runBulkRetry — chunking math (60 invoices = 3 chunks of 25/25/10)", () => {
  it("posts 3 retry chunks and accumulates fixed/stillFailed", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(60);
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));

    const c1 = pending.data.slice(0, 25).map((r) => r.id);
    const c2 = pending.data.slice(25, 50).map((r) => r.id);
    const c3 = pending.data.slice(50, 60).map((r) => r.id);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c1)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c2, [0, 1])));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c3)));

    const snapshots: BulkRetrySnapshot[] = [];
    const out = await runBulkRetry({
      onProgress: (s) => snapshots.push({ ...s }),
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(BATCH_SIZE).toBe(25); // sanity
    // Pending fetch + 3 retry POSTs = 4 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // First call is GET pending, the next three are POSTs to retry-payment-links.
    expect(fetchMock.mock.calls[0][0]).toBe("/api/invoices/pending-payment-link");
    for (let i = 1; i <= 3; i++) {
      expect(fetchMock.mock.calls[i][0]).toBe("/api/invoices/retry-payment-links");
      const body = JSON.parse(fetchMock.mock.calls[i][1].body);
      expect(Array.isArray(body.invoiceIds)).toBe(true);
    }
    // Slice sizes match 25 / 25 / 10.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).invoiceIds).toHaveLength(25);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).invoiceIds).toHaveLength(25);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).invoiceIds).toHaveLength(10);

    // Phase progression: fetching-pending → running (initial) → running (after each chunk) → done.
    const phases = snapshots.map((s) => s.phase);
    expect(phases[0]).toBe("fetching-pending");
    expect(phases[phases.length - 1]).toBe("done");

    // Processed advances 0 → 25 → 50 → 60.
    const processedValues = snapshots.map((s) => s.processed);
    expect(processedValues).toContain(25);
    expect(processedValues).toContain(50);
    expect(processedValues[processedValues.length - 1]).toBe(60);

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.total).toBe(60);
      expect(out.final.processed).toBe(60);
      expect(out.final.fixed).toBe(58); // 60 - 2 failures
      expect(out.final.stillFailed).toBe(2);
      expect(out.failures).toHaveLength(2);
    }
  });
});

// --------------------------------------------------------------------------
// Three-strike abort
// --------------------------------------------------------------------------

describe("runBulkRetry — three-strike abort", () => {
  it("retries 2× with backoff, then aborts when 3rd attempt also fails", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(5);
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));
    // All retry POSTs fail with 503 → 3 attempts.
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 503 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkRetry({
      onProgress: vi.fn(),
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // Pending fetch + 3 retry attempts = 4 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Backoffs: 1000ms, 3000ms.
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 3000);

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.processed).toBe(0); // chunk never landed
      expect(out.final.phase).toBe("aborted");
    }
  });

  it("4xx fails fast (no retries)", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makePending(5)));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Validasi gagal" }, { status: 400 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkRetry({
      onProgress: vi.fn(),
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // Pending fetch + 1 retry attempt (no retries on 4xx).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).not.toHaveBeenCalled();
    expect(out.phase).toBe("aborted");
  });
});

// --------------------------------------------------------------------------
// Overflow detection
// --------------------------------------------------------------------------

describe("runBulkRetry — overflow detection", () => {
  it("emits an overflow snapshot when total > MAX_PENDING_FETCH and proceeds when caller confirms", async () => {
    const fetchMock = vi.fn();
    // The endpoint caps at 1000 rows but the `total` count reflects reality.
    const pending = makePending(MAX_PENDING_FETCH);
    pending.total = 1234;
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));

    // Pre-stage 40 chunks worth of OK responses (1000 / 25 = 40 chunks).
    for (let i = 0; i < 40; i++) {
      const slice = pending.data.slice(i * 25, (i + 1) * 25).map((r) => r.id);
      fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(slice)));
    }

    const snapshots: BulkRetrySnapshot[] = [];
    const onOverflow = vi.fn().mockResolvedValue(true);

    const out = await runBulkRetry({
      onProgress: (s) => snapshots.push({ ...s }),
      onOverflow,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(onOverflow).toHaveBeenCalledWith(1234);

    const overflowSnap = snapshots.find((s) => s.phase === "overflow");
    expect(overflowSnap).toBeDefined();
    expect(overflowSnap?.total).toBe(1234);
    expect(overflowSnap?.message).toContain("Lebih dari 1000 tagihan tertunda");

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.processed).toBe(1000);
    }
  });

  it("user-cancelled when onOverflow returns false", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(MAX_PENDING_FETCH);
    pending.total = 1234;
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));

    const out = await runBulkRetry({
      onProgress: vi.fn(),
      onOverflow: () => false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    // Only the pending fetch — retry POSTs never fire.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.phase).toBe("user-cancelled");
  });
});

// --------------------------------------------------------------------------
// Empty pending → no-pending
// --------------------------------------------------------------------------

describe("runBulkRetry — no-pending edge case", () => {
  it("returns no-pending and posts no retry chunks when nothing is stuck", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));

    const onProgress = vi.fn();
    const out = await runBulkRetry({
      onProgress,
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("no-pending");
    // Only the initial fetching-pending snapshot.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------------------
// Progress snapshots include final counts
// --------------------------------------------------------------------------

describe("runBulkRetry — progress snapshots", () => {
  it("emits running snapshot before any chunk runs and final done snapshot at the end", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(3);
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeRetryResponse(pending.data.map((r) => r.id), [1])),
    );

    const snapshots: BulkRetrySnapshot[] = [];
    const out = await runBulkRetry({
      onProgress: (s) => snapshots.push({ ...s }),
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    // First snapshot is fetching-pending; second is running with processed=0;
    // last is done.
    expect(snapshots[0].phase).toBe("fetching-pending");
    expect(snapshots[1].phase).toBe("running");
    expect(snapshots[1].processed).toBe(0);
    expect(snapshots[snapshots.length - 1].phase).toBe("done");

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.fixed).toBe(2);
      expect(out.final.stillFailed).toBe(1);
      expect(out.failures).toHaveLength(1);
    }
  });
});

// --------------------------------------------------------------------------
// Cancellation via AbortSignal (T4)
// --------------------------------------------------------------------------

describe("runBulkRetry — cancellation via AbortSignal", () => {
  it("aborts before the next chunk when signal is aborted mid-run", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(60); // 3 chunks
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));

    const c1 = pending.data.slice(0, 25).map((r) => r.id);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c1)));

    const controller = new AbortController();
    let chunksObserved = 0;
    const onProgress = (s: BulkRetrySnapshot) => {
      if (s.phase === "running" && s.processed === 25 && chunksObserved === 0) {
        chunksObserved++;
        controller.abort();
      }
    };

    const out = await runBulkRetry({
      onProgress,
      onOverflow: () => true,
      signal: controller.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.processed).toBe(25);
      expect(out.final.phase).toBe("aborted");
    }
    // Pending fetch + 1 retry chunk only.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// --------------------------------------------------------------------------
// Per-student failure rows on snapshot (T4)
// --------------------------------------------------------------------------

describe("runBulkRetry — failure rows on snapshot", () => {
  it("accumulates failures across chunks with studentName + error", async () => {
    const fetchMock = vi.fn();
    const pending = makePending(50);
    fetchMock.mockResolvedValueOnce(jsonResponse(pending));

    const c1 = pending.data.slice(0, 25).map((r) => r.id);
    const c2 = pending.data.slice(25, 50).map((r) => r.id);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c1, [3, 7])));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeRetryResponse(c2, [2])));

    const out = await runBulkRetry({
      onProgress: vi.fn(),
      onOverflow: () => true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.stillFailed).toBe(3);
      expect(out.final.failures).toHaveLength(3);
      for (const f of out.final.failures) {
        expect(f.studentName).toBeTruthy();
        expect(f.error).toBe("Xendit unavailable");
      }
    }
  });
});
