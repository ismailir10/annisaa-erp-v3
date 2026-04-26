/**
 * Client-side orchestration for the bulk-invoice flow.
 *
 * Glue between admin/invoices page and the two server endpoints
 * (`/api/invoices/generate/plan` + `/api/invoices/generate/batch`). Extracted
 * to a non-React module so the orchestration logic — chunking, retry/backoff,
 * progress totals — can be unit-tested without RTL setup.
 *
 * Why client-driven (not server background job)? See cycle doc
 * `docs/cycles/2026-04-25-tagihan-fixes-async-bulk-manual-create.md` Spec §6-9:
 * Vercel free tier has a 60s function ceiling and ~500-1500ms per Xendit call;
 * sequential 25-invoice chunks fit comfortably under that ceiling. The browser
 * drives the chain so the server stays stateless.
 *
 * Three-strike batch failure auto-aborts (architect simplification 2026-04-26):
 * if a chunk's batch endpoint fails after the initial try + 2 backoff retries,
 * it's a real infrastructure issue (Vercel timeout, Xendit 5xx) — clicking
 * Continue would just hit it again. Surface the error and stop.
 */

export const BATCH_SIZE = 25;
export const RETRY_BACKOFFS_MS = [1000, 3000];

export type BatchProgressPhase = "running" | "done" | "idle" | "aborted";

export type FailureRow = {
  studentId: string;
  studentName: string;
  error: string;
};

export type BatchProgressSnapshot = {
  done: number;
  total: number;
  created: number;
  xenditOk: number;
  xenditFailed: number;
  phase: BatchProgressPhase;
  /** Per-student error rows; populated as failures accumulate across chunks. */
  failures: FailureRow[];
  /** Set on `phase: "aborted"` from three-strike chunk failure (HTTP message). */
  lastError?: string;
};

export type PlanResponse = {
  eligibleStudentIds: string[];
  skippedAlreadyInvoiced: number;
  skippedNoFeeStructure: number;
  total: number;
  eligible: number;
};

export type BatchResultRow =
  | {
      studentId: string;
      studentName?: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      studentId: string;
      studentName?: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "PENDING_PAYMENT_LINK";
      error: string;
    };

export type BatchResponse = {
  created: number;
  skipped: number;
  results: BatchResultRow[];
};

export type RunBulkGenerateInput = {
  planRequest: { periodLabel: string; dueDate: string; academicYearId: string };
  /** Hook to ask the user whether to proceed once eligibility is known. Returning false aborts cleanly. */
  onPlan: (plan: PlanResponse) => boolean | Promise<boolean>;
  /** Called after every batch (and at start/end) with the running totals. */
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  /**
   * Optional. AbortSignal for mid-run cancellation. The orchestrator checks
   * `signal.aborted` before starting each chunk and short-circuits to
   * `phase: "aborted"`. Wired by the BatchProgressCard "Batalkan" button.
   */
  signal?: AbortSignal;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to global `setTimeout`. Returns a cancel-able timer. */
  sleepImpl?: (ms: number) => Promise<void>;
};

export type RunBulkGenerateOutcome =
  | { phase: "no-eligible"; plan: PlanResponse }
  | { phase: "user-cancelled"; plan: PlanResponse }
  | { phase: "aborted"; plan: PlanResponse; final: BatchProgressSnapshot }
  | { phase: "done"; plan: PlanResponse; final: BatchProgressSnapshot };

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Drive the plan -> batch loop end-to-end. Pure logic; the React caller is
 * responsible for translating `onPlan` / `onPauseDecision` into UI prompts.
 */
export async function runBulkGenerate(input: RunBulkGenerateInput): Promise<RunBulkGenerateOutcome> {
  // Bind native `fetch` to the global scope explicitly. A bare `fetch`
  // reference assigned to `fetchImpl` works at top level but throws
  // "Illegal invocation" when called as `obj.fetchImpl(...)` because the
  // browser's WHATWG fetch requires `this === window` (or globalThis).
  // The batch loop forwards fetchImpl into callBatchWithRetry which
  // invokes it as `input.fetchImpl(...)` — property-access binds this.
  const fetchImpl = input.fetchImpl ?? fetch.bind(globalThis);
  const sleep = input.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // 1) Plan call — never writes, always cheap.
  const planRes = await fetchImpl("/api/invoices/generate/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.planRequest),
  });
  if (!planRes.ok) {
    const err = await planRes.json().catch(() => ({}));
    throw new Error(err?.error || "Gagal merencanakan tagihan");
  }
  const plan = (await planRes.json()) as PlanResponse;

  if (!plan.eligibleStudentIds || plan.eligibleStudentIds.length === 0) {
    return { phase: "no-eligible", plan };
  }

  // 2) Confirmation hook.
  const proceed = await input.onPlan(plan);
  if (!proceed) {
    return { phase: "user-cancelled", plan };
  }

  // 3) Batch loop.
  const chunks = chunk(plan.eligibleStudentIds, BATCH_SIZE);
  const snapshot: BatchProgressSnapshot = {
    done: 0,
    total: plan.eligibleStudentIds.length,
    created: 0,
    xenditOk: 0,
    xenditFailed: 0,
    phase: "running",
    failures: [],
  };
  input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });

  let cursor = 0;
  while (cursor < chunks.length) {
    // Cancellation check — fires before each chunk so an in-flight chunk
    // completes naturally but no new HTTP calls are dispatched.
    if (input.signal?.aborted) {
      snapshot.phase = "aborted";
      input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });
      return { phase: "aborted", plan, final: { ...snapshot, failures: [...snapshot.failures] } };
    }

    const studentIds = chunks[cursor];
    const result = await callBatchWithRetry({
      studentIds,
      planRequest: input.planRequest,
      fetchImpl,
      sleep,
    });

    if (!result.ok) {
      // Three-strike batch failure → real infrastructure issue (Vercel
      // timeout, Xendit 5xx). Surface and stop; the operator can re-run
      // the cycle once the upstream stabilises. MUST fire onProgress so
      // the UI transitions out of "running" — otherwise the progress
      // card freezes mid-spinner with the Batalkan button stuck on.
      snapshot.phase = "aborted";
      snapshot.lastError = result.lastError;
      input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });
      return { phase: "aborted", plan, final: { ...snapshot, failures: [...snapshot.failures] } };
    }

    const body = result.value;
    snapshot.done += studentIds.length;
    snapshot.created += body.created;
    for (const r of body.results) {
      if (r.status === "SENT") snapshot.xenditOk += 1;
      else {
        snapshot.xenditFailed += 1;
        snapshot.failures.push({
          studentId: r.studentId,
          studentName: r.studentName ?? r.studentId,
          error: r.error,
        });
      }
    }
    input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });
    cursor += 1;
  }

  snapshot.phase = "done";
  input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });
  return { phase: "done", plan, final: { ...snapshot, failures: [...snapshot.failures] } };
}

type CallBatchInput = {
  studentIds: string[];
  planRequest: { periodLabel: string; dueDate: string; academicYearId: string };
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

async function callBatchWithRetry(
  input: CallBatchInput,
): Promise<{ ok: true; value: BatchResponse } | { ok: false; lastError: string }> {
  const attempts = RETRY_BACKOFFS_MS.length + 1; // first try + 2 retries
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await input.fetchImpl("/api/invoices/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: input.studentIds,
          ...input.planRequest,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as BatchResponse;
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
