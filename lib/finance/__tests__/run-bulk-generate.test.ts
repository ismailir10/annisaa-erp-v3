import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runBulkCommit,
  chunk,
  BATCH_SIZE,
  INTER_CHUNK_DELAY_MS,
  type CommitBillingRunResponse,
  type CommitResultRow,
  type BatchProgressSnapshot,
} from "../run-bulk-generate";

// --------------------------------------------------------------------------
// This suite replaces the pre-Task-T10 version, which drove the retired
// `/api/invoices/generate/{plan,batch}` two-step flow. Cycle B1
// (docs/cycles/2026-08-14-billing-run-wizard.md) Task T10 repointed this
// module at `POST /api/billing-runs/[id]/commit` (spec Assumption 7) — there
// is no more "plan" step, so `runBulkGenerate`/`PlanResponse`/`onPlan` are
// gone and `runBulkCommit` takes the already-known committable `rowIds`
// directly. Every chunking / retry / pacing / abort / auto-sweep behaviour
// the old suite asserted is re-asserted here against the new endpoint and
// response shape; the "plan returns eligible=0" / "onPlan returns false"
// describes are gone because that concept moved server-side (eligibility is
// decided when the draft is built — lib/finance/__tests__/build-billing-run.
// test.ts — and re-checked at commit time — app/api/__tests__/
// billing-runs-commit.test.ts), not by this client orchestrator anymore.
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRowIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i + 1}`);
}

function makeCommitResponse(
  rowIds: string[],
  opts?: { failingIndexes?: number[]; skippedIndexes?: number[] },
): CommitBillingRunResponse {
  const failing = new Set(opts?.failingIndexes ?? []);
  const skippedIdx = new Set(opts?.skippedIndexes ?? []);
  const results: CommitResultRow[] = rowIds.map((rowId, i) => {
    const studentId = `s-${rowId}`;
    if (skippedIdx.has(i)) {
      return {
        rowId,
        studentId,
        studentName: `Student ${studentId}`,
        status: "SKIPPED_ALREADY_INVOICED" as const,
      };
    }
    if (failing.has(i)) {
      return {
        rowId,
        studentId,
        studentName: `Student ${studentId}`,
        invoiceId: `inv-${rowId}`,
        invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
        status: "PENDING_PAYMENT_LINK" as const,
        error: "Xendit unavailable",
      };
    }
    return {
      rowId,
      studentId,
      studentName: `Student ${studentId}`,
      invoiceId: `inv-${rowId}`,
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      status: "SENT" as const,
      paymentUrl: `https://xendit.local/pay/${rowId}`,
    };
  });
  const skipped = results.filter((r) => r.status === "SKIPPED_ALREADY_INVOICED").length;
  return { created: results.length - skipped, skipped, results };
}

const RUN_ID = "run-1";

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
// runBulkCommit — happy paths / chunking
// --------------------------------------------------------------------------

describe("runBulkCommit — single chunk (5 rows)", () => {
  it("posts exactly ONE commit call, ends with done=5/total=5", async () => {
    const rowIds = makeRowIds(5);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds)));
    // Auto-sweep gate: 0 pending → no sweep, no extra fetches.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const onProgress = vi.fn();

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
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

    // 1 commit call + 1 count-only sweep gate = 2 fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const commitCall = fetchMock.mock.calls[0];
    expect(commitCall[0]).toBe(`/api/billing-runs/${RUN_ID}/commit`);
    const commitBody = JSON.parse(commitCall[1].body);
    expect(commitBody.rowIds).toHaveLength(5);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/invoices/pending-payment-link?count-only=true",
    );

    // onProgress fires at start (running) + after chunk + at done.
    const phases = onProgress.mock.calls.map((c) => (c[0] as BatchProgressSnapshot).phase);
    expect(phases[phases.length - 1]).toBe("done");
  });
});

describe("runBulkCommit — multi chunk (60 rows → 25 + 25 + 10)", () => {
  it("posts 3 commit calls and increments done after each", async () => {
    const rowIds = makeRowIds(60);
    const fetchMock = vi.fn();
    const c1 = rowIds.slice(0, 25);
    const c2 = rowIds.slice(25, 50);
    const c3 = rowIds.slice(50, 60);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c1)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c2)));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c3)));
    // Auto-sweep gate: 0 pending → no sweep.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const progressSnapshots: BatchProgressSnapshot[] = [];
    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      onProgress: (s) => progressSnapshots.push({ ...s }),
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: vi.fn().mockResolvedValue(undefined),
    });

    expect(BATCH_SIZE).toBe(25); // sanity — chunking constant must match commitBillingRunSchema's cap
    expect(fetchMock).toHaveBeenCalledTimes(4); // 3 commit chunks + 1 sweep gate

    const commitBodies = fetchMock.mock.calls.slice(0, 3).map((c) => JSON.parse(c[1].body));
    expect(commitBodies[0].rowIds).toHaveLength(25);
    expect(commitBodies[1].rowIds).toHaveLength(25);
    expect(commitBodies[2].rowIds).toHaveLength(10);

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
// runBulkCommit — retry on 5xx / fail-fast on 4xx
// --------------------------------------------------------------------------

describe("runBulkCommit — 5xx retry then auto-abort", () => {
  it("retries 2× with backoff, then aborts when 3rd attempt also fails", async () => {
    const rowIds = makeRowIds(5);
    const fetchMock = vi.fn();
    // Commit always 503 → 1 try + 2 retries = 3 fetch hits.
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 503 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Backoffs: 1000ms, 3000ms (2 sleeps between 3 attempts).
    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 3000);

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.done).toBe(0); // chunk never landed
      expect(out.final.lastError).toBe("HTTP 503");
    }
  });
});

describe("runBulkCommit — 4xx fails fast without retrying", () => {
  it("stops after a single attempt on a 400, with no backoff sleep", async () => {
    const rowIds = makeRowIds(5);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Maksimal 25 baris per batch" }, { status: 400 }),
    );

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    // Exactly one attempt — a 4xx is a validation/config error, not
    // something retrying can fix.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      expect(out.final.done).toBe(0);
      expect(out.final.lastError).toBe("Maksimal 25 baris per batch");
    }
  });
});

// --------------------------------------------------------------------------
// runBulkCommit — inter-chunk pacing (cycle 2026-04-28 T2, carried over)
// --------------------------------------------------------------------------

describe("runBulkCommit — inter-chunk pacing", () => {
  it("sleeps INTER_CHUNK_DELAY_MS exactly N-1 times for N successful chunks", async () => {
    const rowIds = makeRowIds(60); // 3 chunks: 25 + 25 + 10
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds.slice(0, 25))));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds.slice(25, 50))));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds.slice(50, 60))));
    // Auto-sweep gate: 0 pending → no sweep.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    expect(out.phase).toBe("done");
    // 3 chunks → 2 inter-chunk sleeps. No retry sleeps because no 5xx.
    const interChunkCalls = sleepMock.mock.calls.filter((c) => c[0] === INTER_CHUNK_DELAY_MS);
    expect(interChunkCalls).toHaveLength(2);
  });

  it("does not sleep after the final chunk", async () => {
    const rowIds = makeRowIds(25); // exactly 1 chunk
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds)));
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    const interChunkCalls = sleepMock.mock.calls.filter((c) => c[0] === INTER_CHUNK_DELAY_MS);
    expect(interChunkCalls).toHaveLength(0);
  });

  it("paces on chunk-failure path before the loop terminates (M2 regression guard)", async () => {
    // Three chunks. First succeeds; second three-strikes on 503. The pacing
    // call site fires on the failure path too — the spec's M2 fix guards
    // against a future change that keeps the loop running past a chunk
    // failure. Today the loop terminates on three-strike, but the sleep
    // call site is still hit because the failing chunk is NOT the last
    // chunk in the loop.
    const rowIds = makeRowIds(75); // 3 chunks: 25 + 25 + 25
    const fetchMock = vi.fn();
    // Chunk 1 succeeds.
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds.slice(0, 25))));
    // Chunk 2 three-strikes on 503 → 3 fetch calls return 503.
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, { status: 503 }));

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    expect(out.phase).toBe("aborted");
    // Sleep call sequence:
    //   index 0 — 1000ms inter-chunk (after chunk 1 success, before chunk 2)
    //   index 1 — 1000ms retry backoff (chunk 2 attempt 1 → 2)
    //   index 2 — 3000ms retry backoff (chunk 2 attempt 2 → 3)
    //   index 3 — 1000ms inter-chunk (failure path, after chunk 2 abort)
    // RETRY_BACKOFFS_MS[0] equals INTER_CHUNK_DELAY_MS (both 1000) so we
    // cannot disambiguate by value alone. Assert both the full ordered
    // sequence (proves the 3000 retry-backoff sandwich) AND the total count
    // (proves no extra/missing sleep) — together they make the test
    // falsifiable for the M2 regression: removing the failure-path sleep
    // would drop the count from 4 to 3.
    expect(sleepMock.mock.calls.map((c) => c[0])).toEqual([1000, 1000, 3000, 1000]);
    expect(sleepMock).toHaveBeenCalledTimes(4);
  });

  it("skips inter-chunk sleep when signal is already aborted", async () => {
    const rowIds = makeRowIds(50); // 2 chunks
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds.slice(0, 25))));

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const ctrl = new AbortController();

    // Abort right after the first chunk completes by intercepting onProgress.
    let chunksCompleted = 0;
    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      onProgress: (s) => {
        if (s.done >= 25 && chunksCompleted === 0) {
          chunksCompleted += 1;
          ctrl.abort();
        }
      },
      signal: ctrl.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: sleepMock,
    });

    expect(out.phase).toBe("aborted");
    // After chunk 1, signal is aborted → inter-chunk sleep skipped.
    const interChunkCalls = sleepMock.mock.calls.filter((c) => c[0] === INTER_CHUNK_DELAY_MS);
    expect(interChunkCalls).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// Mixed Xendit success/fail + already-invoiced skip counting
// --------------------------------------------------------------------------

describe("runBulkCommit — partial Xendit failure tallies xenditOk + xenditFailed", () => {
  it("a chunk with 4 SENT + 1 PENDING_PAYMENT_LINK rolls into the right totals", async () => {
    const rowIds = makeRowIds(5);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeCommitResponse(rowIds, { failingIndexes: [2] })),
    );
    // Auto-sweep gate: explicit 0 pending so the sweep is skipped by design
    // rather than by relying on an unmocked-fetch try/catch swallow.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.xenditOk).toBe(4);
      expect(out.final.xenditFailed).toBe(1);
      expect(out.final.created).toBe(5);
      expect(out.final.skipped).toBe(0);
    }
  });
});

describe("runBulkCommit — already-invoiced duplicates tally into `skipped`, not xendit counters", () => {
  it("3 SKIPPED_ALREADY_INVOICED rows among 10 land in skipped, not xenditOk/xenditFailed", async () => {
    const rowIds = makeRowIds(10);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeCommitResponse(rowIds, { skippedIndexes: [0, 1, 2] })),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.skipped).toBe(3);
      expect(out.final.created).toBe(7);
      expect(out.final.xenditOk).toBe(7);
      expect(out.final.xenditFailed).toBe(0);
    }
  });
});

// --------------------------------------------------------------------------
// Cancellation via AbortSignal
// --------------------------------------------------------------------------

describe("runBulkCommit — cancellation via AbortSignal", () => {
  it("aborts before the next chunk when signal is aborted mid-run", async () => {
    const rowIds = makeRowIds(60); // 3 chunks
    const fetchMock = vi.fn();
    const c1 = rowIds.slice(0, 25);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c1)));

    const controller = new AbortController();
    // Abort after the first chunk lands.
    let chunksObserved = 0;
    const onProgress = (s: BatchProgressSnapshot) => {
      if (s.phase === "running" && s.done === 25 && chunksObserved === 0) {
        chunksObserved++;
        controller.abort();
      }
    };

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      onProgress,
      signal: controller.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("aborted");
    if (out.phase === "aborted") {
      // First chunk landed (25), no further chunks dispatched.
      expect(out.final.done).toBe(25);
      expect(out.final.phase).toBe("aborted");
      // A user-triggered abort (not a chunk failure) carries no lastError.
      expect(out.final.lastError).toBeUndefined();
    }
    // 1 commit call only — chunks 2 & 3 never dispatched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("completes normally when no signal is provided", async () => {
    const rowIds = makeRowIds(5);
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(rowIds)));
    // Auto-sweep gate: explicit 0 pending so the sweep is skipped by design
    // rather than by relying on an unmocked-fetch try/catch swallow.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
  });
});

// --------------------------------------------------------------------------
// Per-student failure rows accumulate on the snapshot
// --------------------------------------------------------------------------

describe("runBulkCommit — failure rows on snapshot", () => {
  it("accumulates failures across chunks with studentName + error", async () => {
    const rowIds = makeRowIds(50); // 2 chunks of 25
    const fetchMock = vi.fn();

    const c1 = rowIds.slice(0, 25);
    const c2 = rowIds.slice(25, 50);
    // Inject 2 failures in chunk 1 and 1 in chunk 2 (total 3).
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c1, { failingIndexes: [3, 7] })));
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c2, { failingIndexes: [2] })));
    // Auto-sweep gate: explicit 0 pending so the sweep is skipped by design
    // rather than by relying on an unmocked-fetch try/catch swallow.
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
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
// Auto-sweep — orchestrator-level "Coba Lagi Link" between chunks-done and
// final summary. Spec: docs/cycles/2026-04-27-invoice-create-auto-retry.md
// §Task 7. Behaviour carried over unchanged by Task T10 — only the chunk
// loop feeding it was repointed.
// --------------------------------------------------------------------------

describe("runBulkCommit — auto-sweep clears transient failures", () => {
  it("fires runBulkRetry once when pending > 0 + signal not aborted; transients clear → pendingAfterSweep=0", async () => {
    const rowIds = makeRowIds(25);
    const fetchMock = vi.fn();
    // 1) commit — 22 SENT + 3 PENDING_PAYMENT_LINK (transient)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeCommitResponse(rowIds, { failingIndexes: [5, 11, 18] })),
    );
    // 2) auto-sweep gate — count-only=true returns 3 pending
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 3 }));
    // 3) runBulkRetry's pending list (full payload, not count-only)
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
    // 4) runBulkRetry's retry-payment-links call — all 3 succeed
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
    // 5) post-sweep re-count — 0 pending
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }));

    const phases: string[] = [];
    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
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

describe("runBulkCommit — auto-sweep cannot clear hard failures", () => {
  it("fires sweep but pendingAfterSweep > 0 surfaces the manual button", async () => {
    const rowIds = makeRowIds(25);
    const fetchMock = vi.fn();
    // 1) commit — 23 SENT + 2 PENDING (401 hard failures)
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeCommitResponse(rowIds, { failingIndexes: [10, 20] })),
    );
    // 2) pre-sweep count
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2 }));
    // 3) runBulkRetry pending list
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
    // 4) retry-payment-links — HTTP 200 but Xendit still fails for 401s
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
    // 5) post-sweep count — still 2
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 2 }));

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(out.phase).toBe("done");
    if (out.phase === "done") {
      expect(out.final.sweepRan).toBe(true);
      expect(out.final.pendingAfterSweep).toBe(2);
    }
  });
});

describe("runBulkCommit — user-abort skips auto-sweep", () => {
  it("does not fetch pending-payment-link when user cancels mid-run", async () => {
    const rowIds = makeRowIds(60); // 3 chunks
    const fetchMock = vi.fn();
    const c1 = rowIds.slice(0, 25);
    fetchMock.mockResolvedValueOnce(jsonResponse(makeCommitResponse(c1)));

    const controller = new AbortController();
    let chunksObserved = 0;
    const onProgress = (s: BatchProgressSnapshot) => {
      if (s.phase === "running" && s.done === 25 && chunksObserved === 0) {
        chunksObserved++;
        controller.abort();
      }
    };

    const out = await runBulkCommit({
      runId: RUN_ID,
      rowIds,
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

    // 1 commit call only — no pending-payment-link, no retry-payment-links.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("pending-payment-link"))).toBe(false);
    expect(urls.some((u) => u.includes("retry-payment-links"))).toBe(false);
  });
});
