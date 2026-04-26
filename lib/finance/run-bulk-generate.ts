/**
 * Client-side orchestration for the bulk-invoice flow.
 *
 * Glue between admin/invoices page and the two server endpoints
 * (`/api/invoices/generate/plan` + `/api/invoices/generate/batch`). Extracted
 * to a non-React module so the orchestration logic — chunking, retry/backoff,
 * progress totals, pause/cancel — can be unit-tested without RTL setup.
 *
 * Why client-driven (not server background job)? See cycle doc
 * `docs/cycles/2026-04-25-tagihan-fixes-async-bulk-manual-create.md` Spec §6-9:
 * Vercel free tier has a 60s function ceiling and ~500-1500ms per Xendit call;
 * sequential 25-invoice chunks fit comfortably under that ceiling. The browser
 * drives the chain so the server stays stateless.
 *
 *   await runBulkGenerate({
 *     planRequest: { periodLabel, dueDate, academicYearId },
 *     onPlan: ({ eligible, skippedAlreadyInvoiced, skippedNoFeeStructure }) => {
 *       // show confirm dialog; if user cancels, return false to abort
 *       return await userConfirmed();
 *     },
 *     onProgress: (snapshot) => setProgressState(snapshot),
 *     onPauseDecision: () => askUserContinueOrCancel(), // returns "continue" | "cancel"
 *   });
 */

export const BATCH_SIZE = 25;
export const RETRY_BACKOFFS_MS = [1000, 3000];

export type BatchProgressPhase = "running" | "done" | "paused" | "idle";

export type BatchProgressSnapshot = {
  done: number;
  total: number;
  created: number;
  xenditOk: number;
  xenditFailed: number;
  phase: BatchProgressPhase;
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
      invoiceId: string;
      invoiceNumber: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      studentId: string;
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
   * Called when 2 consecutive retries of the same batch fail. Caller decides
   * whether to retry once more from the current chunk index or bail out.
   */
  onPauseDecision?: () => Promise<"continue" | "cancel">;
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
 * Drive the plan -> batch loop end-to-end. Pure logic; the React caller is
 * responsible for translating `onPlan` / `onPauseDecision` into UI prompts.
 */
export async function runBulkGenerate(input: RunBulkGenerateInput): Promise<RunBulkGenerateOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleepImpl ?? defaultSleep;

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
  };
  input.onProgress?.({ ...snapshot });

  let cursor = 0;
  while (cursor < chunks.length) {
    const studentIds = chunks[cursor];
    const result = await callBatchWithRetry({
      studentIds,
      planRequest: input.planRequest,
      fetchImpl,
      sleep,
    });

    if (!result.ok) {
      // Retries exhausted. Pause and ask the caller what to do.
      snapshot.phase = "paused";
      input.onProgress?.({ ...snapshot });

      const decision = input.onPauseDecision ? await input.onPauseDecision() : "cancel";
      if (decision === "cancel") {
        return { phase: "aborted", plan, final: { ...snapshot } };
      }
      // Continue: retry the same chunk again from scratch.
      snapshot.phase = "running";
      input.onProgress?.({ ...snapshot });
      continue;
    }

    const body = result.value;
    snapshot.done += studentIds.length;
    snapshot.created += body.created;
    for (const r of body.results) {
      if (r.status === "SENT") snapshot.xenditOk += 1;
      else snapshot.xenditFailed += 1;
    }
    input.onProgress?.({ ...snapshot });
    cursor += 1;
  }

  snapshot.phase = "done";
  input.onProgress?.({ ...snapshot });
  return { phase: "done", plan, final: { ...snapshot } };
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
