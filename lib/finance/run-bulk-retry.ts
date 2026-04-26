/**
 * Client-side orchestration for the bulk Xendit-retry flow.
 *
 * Mirror of `lib/finance/run-bulk-generate.ts` for the
 * `PENDING_PAYMENT_LINK → SENT` recovery path. Glue between admin/invoices
 * page and the two server endpoints (`GET /api/invoices/pending-payment-link`
 * + `POST /api/invoices/retry-payment-links`). Extracted to a non-React
 * module so the orchestration logic — chunking, retry/backoff, progress
 * totals, overflow detection — can be unit-tested without RTL setup.
 *
 * Why client-driven (not server background job)? Same constraint as
 * runBulkGenerate: Vercel free tier has a 60s function ceiling and ~1.5s per
 * Xendit call; sequential 25-invoice chunks fit comfortably. The browser
 * drives the chain so the server stays stateless.
 *
 * Three-strike chunk failure auto-aborts: if a chunk's retry endpoint fails
 * after the initial try + 2 backoff retries, it's a real infrastructure
 * issue (Vercel timeout, Xendit 5xx). Surface and stop.
 *
 * Overflow handling: if more than 1000 invoices are stuck, the orchestrator
 * snapshots a one-shot `phase: "overflow"` event before continuing with the
 * first 1000. The UI shows an `<AlertDialog>` so the operator confirms before
 * processing begins.
 */

export const BATCH_SIZE = 25;
export const RETRY_BACKOFFS_MS = [1000, 3000];
export const MAX_PENDING_FETCH = 1000;

export type BulkRetryPhase =
  | "fetching-pending"
  | "running"
  | "done"
  | "aborted"
  | "overflow";

export type RetryFailureRow = {
  studentId: string;
  studentName: string;
  error: string;
};

export type BulkRetrySnapshot = {
  phase: BulkRetryPhase;
  total: number;
  processed: number;
  fixed: number;
  stillFailed: number;
  message?: string;
  /** Per-student error rows; populated as failures accumulate across chunks. */
  failures: RetryFailureRow[];
};

export type PendingInvoice = {
  id: string;
  studentName: string;
  periodLabel: string;
  totalDue: string;
  paymentLinkError: string | null;
};

export type PendingResponse = {
  data: PendingInvoice[];
  total: number;
};

export type RetryResultRow =
  | {
      invoiceId: string;
      invoiceNumber: string;
      studentId: string;
      studentName?: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      invoiceId: string;
      invoiceNumber: string;
      studentId: string;
      studentName?: string;
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
  /** Called after every progress event with the running totals. */
  onProgress: (snapshot: BulkRetrySnapshot) => void;
  /**
   * Required. Called once when `total > MAX_PENDING_FETCH` to gate the
   * destructive operation behind an explicit user confirmation. Returning
   * false aborts cleanly (caller chose not to proceed). The UI layer wires
   * this to an `<AlertDialog>` per spec — silent processing of 1000
   * invoices without user consent is a UX violation.
   */
  onOverflow: (total: number) => boolean | Promise<boolean>;
  /**
   * Optional. AbortSignal for mid-run cancellation. The orchestrator checks
   * `signal.aborted` before starting each chunk and short-circuits to
   * `phase: "aborted"`. Wired by the BatchProgressCard "Batalkan" button.
   */
  signal?: AbortSignal;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to global `setTimeout`. */
  sleepImpl?: (ms: number) => Promise<void>;
};

export type RunBulkRetryOutcome =
  | { phase: "no-pending"; total: 0 }
  | { phase: "user-cancelled"; total: number }
  | { phase: "aborted"; final: BulkRetrySnapshot; failures: RetryResultRow[] }
  | { phase: "done"; final: BulkRetrySnapshot; failures: RetryResultRow[] };

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const OVERFLOW_MESSAGE =
  "Lebih dari 1000 tagihan tertunda. 1000 akan diproses sekarang. Sisanya bisa di-retry setelah batch ini selesai.";

/**
 * Drive the pending → retry-chunk loop end-to-end. Pure logic; the React
 * caller is responsible for translating `onOverflow` into an AlertDialog
 * prompt and `onProgress` into UI state updates.
 */
export async function runBulkRetry(input: RunBulkRetryInput): Promise<RunBulkRetryOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // 1) Fetch pending invoices.
  input.onProgress({
    phase: "fetching-pending",
    total: 0,
    processed: 0,
    fixed: 0,
    stillFailed: 0,
    failures: [],
  });

  const listRes = await fetchImpl("/api/invoices/pending-payment-link", {
    method: "GET",
  });
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}));
    throw new Error(err?.error || "Gagal memuat tagihan tertunda");
  }
  const pending = (await listRes.json()) as PendingResponse;

  if (!pending.data || pending.data.length === 0) {
    return { phase: "no-pending", total: 0 };
  }

  // 2) Overflow check — surface to UI; allow caller to gate.
  if (pending.total > MAX_PENDING_FETCH) {
    input.onProgress({
      phase: "overflow",
      total: pending.total,
      processed: 0,
      fixed: 0,
      stillFailed: 0,
      message: OVERFLOW_MESSAGE,
      failures: [],
    });
    const proceed = await input.onOverflow(pending.total);
    if (!proceed) {
      return { phase: "user-cancelled", total: pending.total };
    }
  }

  // 3) Chunk + drain loop.
  const ids = pending.data.map((r) => r.id);
  const nameById = new Map(pending.data.map((r) => [r.id, r.studentName]));
  const chunks = chunk(ids, BATCH_SIZE);

  const snapshot: BulkRetrySnapshot = {
    phase: "running",
    total: ids.length,
    processed: 0,
    fixed: 0,
    stillFailed: 0,
    failures: [],
  };
  input.onProgress({ ...snapshot, failures: [...snapshot.failures] });

  const failures: RetryResultRow[] = [];

  for (const invoiceIds of chunks) {
    // Cancellation check — fires before each chunk so an in-flight chunk
    // completes naturally but no new HTTP calls are dispatched.
    if (input.signal?.aborted) {
      snapshot.phase = "aborted";
      input.onProgress({ ...snapshot, failures: [...snapshot.failures] });
      return { phase: "aborted", final: { ...snapshot, failures: [...snapshot.failures] }, failures };
    }

    const result = await callRetryWithRetry({ invoiceIds, fetchImpl, sleep });

    if (!result.ok) {
      // Three-strike chunk failure → real infrastructure issue. Surface
      // and stop; operator can re-run "Coba Lagi Link" once upstream
      // stabilises.
      snapshot.phase = "aborted";
      snapshot.message = result.lastError;
      input.onProgress({ ...snapshot, failures: [...snapshot.failures] });
      return { phase: "aborted", final: { ...snapshot, failures: [...snapshot.failures] }, failures };
    }

    const body = result.value;
    snapshot.processed += invoiceIds.length;
    snapshot.fixed += body.succeeded;
    snapshot.stillFailed += body.stillFailed;
    for (const r of body.results) {
      if (r.status === "PENDING_PAYMENT_LINK") {
        failures.push(r);
        snapshot.failures.push({
          studentId: r.studentId,
          studentName: r.studentName ?? nameById.get(r.invoiceId) ?? r.studentId,
          error: r.error,
        });
      }
    }
    input.onProgress({ ...snapshot, failures: [...snapshot.failures] });
  }

  snapshot.phase = "done";
  input.onProgress({ ...snapshot, failures: [...snapshot.failures] });
  return { phase: "done", final: { ...snapshot, failures: [...snapshot.failures] }, failures };
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
