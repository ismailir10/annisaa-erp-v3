/**
 * Minimal concurrency limiter — wrap async functions and ensure no more
 * than `n` are in-flight at once. ~25 lines, no deps.
 *
 * Used by the bulk-create + retry-payment-links endpoints to cap parallel
 * Xendit Checkout Session calls (~500-1500ms each) to a sane number that
 * fits the Vercel free tier 60s budget per request.
 *
 *   const limit = pLimit(5);
 *   await Promise.allSettled(invoiceIds.map(id => limit(() => createSession(id))));
 */
export function pLimit(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (n <= 0) throw new Error("pLimit: n must be > 0");
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= n) return;
    const run = queue.shift();
    if (run) run();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      if (active < n) run();
      else queue.push(run);
    });
}
