/**
 * Client-side orchestration for bulk-retry of PENDING_PAYMENT_LINK invoices.
 *
 * Mirror image of `run-bulk-generate.ts` but specialised for the retry flow:
 * one chunk = one POST to `/api/invoices/retry-payment-links`, retry endpoint
 * caps each call at 25 invoice ids. We reuse the same `BatchProgressSnapshot`
 * shape so the existing `<BatchProgressCard>` works untouched.
 *
 * Why a separate orchestrator (instead of folding into runBulkGenerate)?
 *   - Different request body (`invoiceIds` vs. `studentIds + plan fields`)
 *   - Different response keys (`succeeded/stillFailed/results` vs.
 *     `created/skipped/results`)
 *   - No plan step (caller already has the invoice id list from a `?status=…`
 *     fetch on the page)
 * Two contracts that look superficially similar but diverge on every key —
 * unifying them would mean a generic-soup signature that's harder to read.
 */
export const RETRY_BATCH_SIZE = 25;
export const RETRY_BACKOFFS_MS = [1000, 3000];

import type {
  BatchProgressPhase,
  BatchProgressSnapshot,
} from "./run-bulk-generate";

export type { BatchProgressPhase, BatchProgressSnapshot };

export type RetryResultRow =
  | {
      invoiceId: string;
      invoiceNumber: string;
      studentId: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      invoiceId: string;
      invoiceNumber: string;
      studentId: string;
      status: "PENDING_PAYMENT_LINK";
      error: string;
    };

export type RetryResponse = {
  retried: number;
  succeeded: number;
  stillFailed: number;
  results: RetryResultRow[];
};

export type RunBulkRetryInput = {
  invoiceIds: string[];
  /** Called after every chunk (and at start/end) with the running totals. */
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  /**
   * Called when 2 consecutive retries of the same chunk fail. Caller decides
   * whether to retry the chunk again or bail out.
   */
  onPauseDecision?: () => Promise<"continue" | "cancel">;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to global `setTimeout`. */
  sleepImpl?: (ms: number) => Promise<void>;
};

export type RunBulkRetryOutcome =
  | { phase: "no-candidates" }
  | { phase: "aborted"; final: BatchProgressSnapshot }
  | { phase: "done"; final: BatchProgressSnapshot };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Drive the chunk -> retry loop end-to-end. Pure logic; the React caller is
 * responsible for translating `onPauseDecision` into a UI prompt.
 *
 * Snapshot-key remapping:
 *   - `created`     → number of invoices retried so far (chunk-size sum)
 *   - `xenditOk`    → number that flipped to SENT
 *   - `xenditFailed`→ number that stayed PENDING_PAYMENT_LINK
 * This reuses the BatchProgressCard's existing labels ("link berhasil",
 * "link gagal") which already happen to fit retry semantics.
 */
export async function runBulkRetry(input: RunBulkRetryInput): Promise<RunBulkRetryOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleepImpl ?? defaultSleep;

  if (input.invoiceIds.length === 0) {
    return { phase: "no-candidates" };
  }

  const chunks = chunk(input.invoiceIds, RETRY_BATCH_SIZE);
  const snapshot: BatchProgressSnapshot = {
    done: 0,
    total: input.invoiceIds.length,
    created: 0,
    xenditOk: 0,
    xenditFailed: 0,
    phase: "running",
  };
  input.onProgress?.({ ...snapshot });

  let cursor = 0;
  while (cursor < chunks.length) {
    const invoiceIds = chunks[cursor];
    const result = await callRetryWithRetry({ invoiceIds, fetchImpl, sleep });

    if (!result.ok) {
      // Retries exhausted. Pause and ask the caller what to do.
      snapshot.phase = "paused";
      input.onProgress?.({ ...snapshot });

      const decision = input.onPauseDecision ? await input.onPauseDecision() : "cancel";
      if (decision === "cancel") {
        return { phase: "aborted", final: { ...snapshot } };
      }
      // Continue: retry the same chunk again from scratch.
      snapshot.phase = "running";
      input.onProgress?.({ ...snapshot });
      continue;
    }

    const body = result.value;
    snapshot.done += invoiceIds.length;
    snapshot.created += body.retried;
    snapshot.xenditOk += body.succeeded;
    snapshot.xenditFailed += body.stillFailed;
    input.onProgress?.({ ...snapshot });
    cursor += 1;
  }

  snapshot.phase = "done";
  input.onProgress?.({ ...snapshot });
  return { phase: "done", final: { ...snapshot } };
}

type CallRetryInput = {
  invoiceIds: string[];
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

async function callRetryWithRetry(
  input: CallRetryInput,
): Promise<{ ok: true; value: RetryResponse } | { ok: false; lastError: string }> {
  const attempts = RETRY_BACKOFFS_MS.length + 1; // first try + 2 retries
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await input.fetchImpl("/api/invoices/retry-payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: input.invoiceIds }),
      });
      if (res.ok) {
        const body = (await res.json()) as RetryResponse;
        return { ok: true, value: body };
      }
      // 5xx → retry. 4xx → fail fast (config error or auth, retrying won't help).
      if (res.status >= 500) {
        lastError = `HTTP ${res.status}`;
      } else {
        const err = await res.json().catch(() => ({}));
        lastError = err?.error || `HTTP ${res.status}`;
        return { ok: false, lastError };
      }
    } catch (e) {
      // Network error / timeout — counts as 5xx-equivalent and retries.
      lastError = e instanceof Error ? e.message : "Network error";
    }

    // Backoff before next attempt (skip after the final attempt).
    if (attempt < RETRY_BACKOFFS_MS.length) {
      await input.sleep(RETRY_BACKOFFS_MS[attempt]);
    }
  }
  return { ok: false, lastError };
}
