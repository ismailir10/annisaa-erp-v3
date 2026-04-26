/**
 * Inline semaphore — caps concurrent async work at `maxConcurrency`.
 *
 * Per cycle 2026-04-26 spec B3: we don't add `p-limit` as a dep. The principle
 * is "simple, not clever" — ten lines of code beat a transitive npm dep for
 * this use case. Used by the Xendit fan-out in
 * `app/api/invoices/generate/batch/route.ts` and `lib/finance/xendit-retry.ts`
 * to prevent burst-load against the Xendit API + per-merchant rate limits.
 *
 * Each call to `limit(N)` returns a fresh runner — call sites instantiate it
 * per-request, never module-level (module-level would queue across unrelated
 * concurrent HTTP requests).
 *
 * Usage:
 *   const runLimit = limit(5);
 *   const results = await Promise.allSettled(
 *     candidates.map((c) => runLimit(() => createXenditSessionForInvoice(c.id))),
 *   );
 */
export function limit(maxConcurrency: number) {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("limit: maxConcurrency must be a positive integer");
  }
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrency) {
      await new Promise<void>((r) => queue.push(r));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
