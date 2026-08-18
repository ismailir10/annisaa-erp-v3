/**
 * Client-side orchestration for the Billing Run wizard's commit step.
 *
 * Glue between the wizard's step 3 (`step-3-commit.tsx`) and
 * `POST /api/billing-runs/[id]/commit`. Extracted to a non-React module so
 * the orchestration logic — chunking, retry/backoff, inter-chunk pacing,
 * abort, auto-sweep — can be unit-tested without RTL setup.
 *
 * History: this module originally drove the retired two-step
 * `/api/invoices/generate/plan` + `/api/invoices/generate/batch` flow behind
 * the old "Buat Tagihan Bulanan" dialog. Cycle B1 (bulk invoice wizard arc,
 * docs/cycles/2026-08-14-billing-run-wizard.md) Task T10 retired that dialog
 * and both routes in favour of the persisted-draft wizard. Per the cycle's
 * spec Assumption 7, this file was *repointed* at the new commit endpoint
 * rather than deleted and re-derived inline in the wizard — the chunk/retry/
 * backoff/pacing/auto-sweep behaviour here is battle-tested (originally from
 * cycle 2026-04-25/2026-04-28) and re-earning it in a fresh implementation
 * would be a regression risk. There is no more "plan" step: the billing run
 * is already materialized server-side by the time step 3 runs, so the
 * plan → confirm → batch shape collapses to a single committable-rowIds →
 * commit-chunk-loop shape. `runBulkGenerate`/`PlanResponse`/`onPlan` are
 * gone; `runBulkCommit` takes the already-known `rowIds` directly.
 *
 * Why client-driven (not server background job)? See cycle doc
 * `docs/cycles/2026-04-25-tagihan-fixes-async-bulk-manual-create.md` Spec §6-9:
 * Vercel free tier has a 60s function ceiling and ~500-1500ms per Xendit call;
 * sequential 25-row chunks fit comfortably under that ceiling. The browser
 * drives the chain so the server stays stateless.
 *
 * Three-strike chunk failure auto-aborts: if a chunk's commit call fails
 * after the initial try + 2 backoff retries, it's a real infrastructure
 * issue (Vercel timeout, DB contention, 5xx) — clicking Continue would just
 * hit it again. A 4xx fails fast without retrying — it's a validation/config
 * error retrying can't fix. Either way the caller can resume: the commit
 * route's row claim (see app/api/billing-runs/[id]/commit/route.ts) makes
 * re-sending an already-committed rowId a no-op, never a duplicate.
 */

import { runBulkRetry } from "./run-bulk-retry";

export const BATCH_SIZE = 25;
export const RETRY_BACKOFFS_MS = [1000, 3000];
/**
 * Cross-chunk pacing — sleeps between successive chunk dispatches to keep the
 * sustained outbound rate under the Xendit sandbox quota (~30-60 req/min).
 * Concurrency cap inside the commit route is 2 (carried over from the
 * retired batch route); paired with this 1s gap, the worst-case sustained
 * outbound is well below 60 req/min.
 *
 * Fires on every iteration of the chunk loop (success path AND failure path —
 * regression guard for the M2 leak in the 2026-04-28 spec review). Skipped only
 * on the last chunk or on `signal.aborted`. Today's three-strike chunk failure
 * terminates the loop, so the failure-path sleep is functionally moot, but
 * placing it at the iteration boundary keeps the throttle correct if loop
 * semantics ever change.
 */
export const INTER_CHUNK_DELAY_MS = 1000;

/**
 * Phase enum for the orchestrator's progress snapshot.
 *
 * - `idle` / `running` / `done` / `aborted` — the chunk-loop lifecycle.
 * - `sweeping` — auto-sweep is firing (post-chunk, pre-done). The UI shows
 *   "Memeriksa link gagal..." while `runBulkRetry` drains residual
 *   `PENDING_PAYMENT_LINK` invoices left by transient Xendit blips. The
 *   underlying chunk counters (`xenditOk` / `xenditFailed`) are intentionally
 *   frozen during sweep — `pendingAfterSweep` is the source of truth for
 *   the post-sweep summary, so leaving the counters untouched avoids
 *   double-counting.
 */
export type BatchProgressPhase = "running" | "sweeping" | "done" | "idle" | "aborted";

export type FailureRow = {
  studentId: string;
  studentName: string;
  error: string;
};

export type BatchProgressSnapshot = {
  done: number;
  total: number;
  created: number;
  /** Rows resolved as already-invoiced duplicates at commit time (Assumption "trust the draft" does NOT extend to duplicates — the commit route always re-checks). */
  skipped: number;
  xenditOk: number;
  xenditFailed: number;
  phase: BatchProgressPhase;
  /** Per-student error rows; populated as failures accumulate across chunks. */
  failures: FailureRow[];
  /** Set on `phase: "aborted"` from three-strike chunk failure (HTTP message). Absent when the abort came from the caller's own `signal` (user cancel). */
  lastError?: string;
  /**
   * Whether the post-chunk auto-sweep ran. Undefined until chunks complete;
   * `true` when pending count > 0 + signal not aborted; `false` when chunks
   * landed clean (no sweep needed). User-aborted runs leave this undefined.
   */
  sweepRan?: boolean;
  /**
   * Pending-payment-link count after the auto-sweep (or pre-sweep count if
   * the sweep itself aborted). UI uses this to decide whether to surface the
   * manual "Coba Lagi Link (N)" button. Undefined until chunks complete;
   * `0` when no sweep was needed.
   */
  pendingAfterSweep?: number;
};

export type CommitResultRow =
  | { rowId: string; studentId: string; studentName: string; status: "SKIPPED_ALREADY_INVOICED" }
  | {
      rowId: string;
      studentId: string;
      studentName: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "SENT";
      paymentUrl: string;
    }
  | {
      rowId: string;
      studentId: string;
      studentName: string;
      invoiceId: string;
      invoiceNumber: string;
      status: "PENDING_PAYMENT_LINK";
      error: string;
    };

/** Mirrors `POST /api/billing-runs/[id]/commit`'s response — one chunk's result. */
export type CommitBillingRunResponse = {
  created: number;
  skipped: number;
  results: CommitResultRow[];
};

export type RunBulkCommitInput = {
  runId: string;
  /** The full set of committable `BillingRunRow` ids for this run (or resume attempt) — chunked internally. */
  rowIds: string[];
  /** Called after every chunk (and at start/end/sweep) with the running totals. */
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  /**
   * Optional. AbortSignal for mid-run cancellation. The orchestrator checks
   * `signal.aborted` before starting each chunk and short-circuits to
   * `phase: "aborted"`. Wired by step 3's "Batalkan" button.
   */
  signal?: AbortSignal;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to global `setTimeout`. Returns a cancel-able timer. */
  sleepImpl?: (ms: number) => Promise<void>;
};

export type RunBulkCommitOutcome =
  | { phase: "aborted"; final: BatchProgressSnapshot }
  | { phase: "done"; final: BatchProgressSnapshot };

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Drive the commit chunk loop end-to-end against a Billing Run. Pure logic;
 * the React caller (step-3-commit.tsx) is responsible for translating
 * `onProgress` into UI state and computing which rowIds remain committable
 * from `final.done` (chunk() preserves input order, and `done` only advances
 * past a chunk once it has fully succeeded — so `rowIds.slice(final.done)`
 * is exactly the still-committable tail, safe to retry on "Lanjutkan Komit").
 */
export async function runBulkCommit(input: RunBulkCommitInput): Promise<RunBulkCommitOutcome> {
  // Bind native `fetch` to the global scope explicitly. A bare `fetch`
  // reference assigned to `fetchImpl` works at top level but throws
  // "Illegal invocation" when called as `obj.fetchImpl(...)` because the
  // browser's WHATWG fetch requires `this === window` (or globalThis).
  const fetchImpl = input.fetchImpl ?? fetch.bind(globalThis);
  const sleep = input.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const chunks = chunk(input.rowIds, BATCH_SIZE);
  const snapshot: BatchProgressSnapshot = {
    done: 0,
    total: input.rowIds.length,
    created: 0,
    skipped: 0,
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
      return { phase: "aborted", final: { ...snapshot, failures: [...snapshot.failures] } };
    }

    const rowIds = chunks[cursor];
    const result = await callCommitWithRetry({
      runId: input.runId,
      rowIds,
      fetchImpl,
      sleep,
    });

    const isLastChunk = cursor === chunks.length - 1;

    if (!result.ok) {
      // Three-strike chunk failure → real infrastructure issue. Surface and
      // stop; the caller's "Lanjutkan Komit" re-sends the un-advanced tail.
      // MUST fire onProgress so the UI transitions out of "running" —
      // otherwise the progress card freezes mid-spinner.
      snapshot.phase = "aborted";
      snapshot.lastError = result.lastError;
      input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });

      // Inter-chunk pace fires on the failure path too (cycle 2026-04-28 T2 /
      // M2 fix). Today the loop terminates here so the sleep is moot, but
      // keeping it at the iteration boundary preserves throttle correctness
      // if a future change continues past a chunk failure.
      if (!isLastChunk && !input.signal?.aborted) {
        await sleep(INTER_CHUNK_DELAY_MS);
      }
      return { phase: "aborted", final: { ...snapshot, failures: [...snapshot.failures] } };
    }

    const body = result.value;
    snapshot.done += rowIds.length;
    snapshot.created += body.created;
    snapshot.skipped += body.skipped;
    for (const r of body.results) {
      if (r.status === "SENT") snapshot.xenditOk += 1;
      else if (r.status === "PENDING_PAYMENT_LINK") {
        snapshot.xenditFailed += 1;
        snapshot.failures.push({
          studentId: r.studentId,
          studentName: r.studentName ?? r.studentId,
          error: r.error,
        });
      }
      // SKIPPED_ALREADY_INVOICED rows are already reflected in body.skipped;
      // no per-row tally needed beyond that.
    }
    input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });

    // Inter-chunk pace before the next chunk dispatches. Skipped on last
    // chunk (no next dispatch) and on aborted signal (caller wants out fast).
    if (!isLastChunk && !input.signal?.aborted) {
      await sleep(INTER_CHUNK_DELAY_MS);
    }
    cursor += 1;
  }

  // Auto-sweep — orchestrator-level "Coba Lagi Link" so the admin doesn't
  // have to click it in the normal case. Runs ONCE if the chunk loop landed
  // any invoices in PENDING_PAYMENT_LINK and the user did not cancel. The
  // sweep is single-shot by design: if it itself fails (3-strike abort
  // inside runBulkRetry), the residual count stays > 0 and the manual
  // button surfaces — looping the sweep would just hit the same upstream
  // issue.
  if (!input.signal?.aborted) {
    await runAutoSweep(snapshot, fetchImpl, input.signal, input.onProgress);
  }

  snapshot.phase = "done";
  input.onProgress?.({ ...snapshot, failures: [...snapshot.failures] });
  return { phase: "done", final: { ...snapshot, failures: [...snapshot.failures] } };
}

/**
 * Post-chunk auto-sweep. Mutates `snapshot` in place:
 * - sets `snapshot.sweepRan` (true if sweep fired, false if no pending)
 * - sets `snapshot.pendingAfterSweep` (post-sweep count, or pre-sweep count
 *   on a sweep abort, or 0 when the sweep was skipped)
 * - flips `snapshot.phase = "sweeping"` while the sweep runs (UI shows
 *   "Memeriksa link gagal..."). Caller bumps phase back to "done" after.
 *
 * The sweep's own `runBulkRetry` snapshots are deliberately NOT translated
 * back into the parent's chunk counters — see `BatchProgressPhase` doc above
 * for rationale. Only the phase transition + final `pendingAfterSweep` count
 * matter to the UI.
 */
async function runAutoSweep(
  snapshot: BatchProgressSnapshot,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  onProgress: ((s: BatchProgressSnapshot) => void) | undefined,
): Promise<void> {
  // Cheap pre-check — the count-only branch on /pending-payment-link
  // returns just `{ total: N }` so we don't pay for the row payload.
  // Network blip → fallback 0 (skip sweep gracefully; admin can still hit
  // the manual button if anything's actually pending).
  const pendingCount = await fetchPendingCount(fetchImpl, signal, 0);

  if (pendingCount === 0) {
    snapshot.sweepRan = false;
    snapshot.pendingAfterSweep = 0;
    return;
  }

  snapshot.sweepRan = true;
  snapshot.phase = "sweeping";
  onProgress?.({ ...snapshot, failures: [...snapshot.failures] });

  try {
    await runBulkRetry({
      signal,
      fetchImpl,
      // Auto-sweep cannot prompt the user — if there are >1000 pending we
      // bail rather than silently process a destructive batch. The UI's
      // manual button is still available as the explicit-consent path.
      onOverflow: () => false,
      // Intentionally no-op: see runAutoSweep doc above for why we don't
      // translate runBulkRetry's snapshot into the parent's counters.
      onProgress: () => {},
    });
  } catch {
    // 3-strike sweep abort or unexpected throw — fall through to the
    // re-count below; whatever's still pending will surface the manual
    // button via `pendingAfterSweep > 0`.
  }

  // Re-query post-sweep so the UI summary knows whether to surface the
  // manual "Coba Lagi Link (N)" button. Fallback to the pre-sweep count
  // on re-query failure — better to over-report than silently drop the
  // manual surface.
  snapshot.pendingAfterSweep = await fetchPendingCount(fetchImpl, signal, pendingCount);
}

/**
 * Private helper: GET `?count-only=true` and return `total`, or `fallback`
 * on any failure (non-ok response, network throw, unparseable JSON).
 * Intentionally not exported — only `runAutoSweep` needs this shape.
 */
async function fetchPendingCount(
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  fallback: number,
): Promise<number> {
  try {
    const res = await fetchImpl("/api/invoices/pending-payment-link?count-only=true", {
      method: "GET",
      signal,
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { total?: number };
    return json.total ?? 0;
  } catch {
    return fallback;
  }
}

type CallCommitInput = {
  runId: string;
  rowIds: string[];
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

async function callCommitWithRetry(
  input: CallCommitInput,
): Promise<{ ok: true; value: CommitBillingRunResponse } | { ok: false; lastError: string }> {
  const attempts = RETRY_BACKOFFS_MS.length + 1; // first try + 2 retries
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await input.fetchImpl(`/api/billing-runs/${input.runId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: input.rowIds }),
      });
      if (res.ok) {
        const body = (await res.json()) as CommitBillingRunResponse;
        return { ok: true, value: body };
      }
      // 5xx → retry. 4xx → fail fast (validation/config error, retrying won't help).
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
