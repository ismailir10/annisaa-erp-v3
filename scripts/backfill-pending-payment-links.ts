/**
 * Backfill: clear PENDING_PAYMENT_LINK accumulation by re-running the manual
 * retry orchestrator directly (server-side, no HTTP / no session cookie).
 *
 * Usage:
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts --tenant <id> --confirm
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-pending-payment-links.ts --tenant <id> --dry-run
 *
 * Without `--confirm`, prints the initial breakdown and exits without firing
 * Xendit (safe default). `--dry-run` is an explicit alias for the no-confirm
 * mode; if both are passed, the last flag wins.
 *
 * Iterates `retryPaymentLinks(tenantId, null)` (which already chunks at 25
 * invoices and fans out 5-wide) until:
 *   - pending count is 0, OR
 *   - no progress between iterations (all remaining are hard-fail like 401 /
 *     422 — needs ops attention, not retry), OR
 *   - the hard iteration cap (`MAX_ITERATIONS`) trips (belt-and-suspenders).
 *
 * Per-attempt structured logs come for free from `withXenditRetry` inside
 * `createXenditSessionForInvoice`; this script adds a per-iteration summary
 * line `[XENDIT BACKFILL] tenantId=... iteration=... retried=... succeeded=...
 * stillFailed=... pendingTotal=... categoryBreakdown=<json>`.
 *
 * NEXT_PUBLIC_APP_URL must be set in `.env.local` so `createXenditSession()`
 * has return URLs (no req.url available in CLI context — see
 * `lib/xendit/helpers.ts:resolveAppOrigin`).
 */

import { prisma } from "@/lib/db";
import { retryPaymentLinks, type RetryOutcome } from "@/lib/finance/xendit-retry";
import {
  getPendingPaymentLinkBreakdown,
  type PendingPaymentLinkBreakdown,
} from "@/lib/finance/pending-breakdown";

export const MAX_ITERATIONS = 50;

export interface BackfillArgs {
  tenantId: string | null;
  confirm: boolean;
}

export function parseArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = { tenantId: null, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant") {
      args.tenantId = argv[++i] ?? null;
    } else if (a === "--confirm") {
      args.confirm = true;
    } else if (a === "--dry-run") {
      args.confirm = false;
    }
  }
  return args;
}

export interface BackfillDeps {
  retry: (tenantId: string, ids: string[] | null) => Promise<RetryOutcome>;
  fetchBreakdown: (tenantId: string) => Promise<PendingPaymentLinkBreakdown>;
  log: (msg: string) => void;
}

export interface BackfillResult {
  exitCode: number;
  iterations: number;
  cleared: number;
  finalBreakdown: PendingPaymentLinkBreakdown | null;
  stalled: boolean;
}

/**
 * Pure orchestrator — accepts dependencies for testability. The CLI wrapper at
 * the bottom of this file injects the real implementations. Tests inject mocks
 * and never touch Prisma or Xendit.
 */
export async function runBackfill(
  args: BackfillArgs,
  deps: BackfillDeps,
): Promise<BackfillResult> {
  const { retry, fetchBreakdown, log } = deps;

  if (!args.tenantId) {
    log("ERROR: --tenant <id> is required");
    return { exitCode: 2, iterations: 0, cleared: 0, finalBreakdown: null, stalled: false };
  }

  log(
    `[XENDIT BACKFILL] tenantId=${args.tenantId} mode=${args.confirm ? "live" : "dry-run"}`,
  );

  const initial = await fetchBreakdown(args.tenantId);
  log(
    `[XENDIT BACKFILL] initial pendingTotal=${initial.total} categoryBreakdown=${JSON.stringify(initial.byPrefix)}`,
  );

  if (!args.confirm) {
    log(
      "[XENDIT BACKFILL] DRY-RUN — no Xendit calls fired. Re-run with --confirm to live retry.",
    );
    return { exitCode: 0, iterations: 0, cleared: 0, finalBreakdown: initial, stalled: false };
  }

  if (initial.total === 0) {
    log("[XENDIT BACKFILL] nothing to do — pending count is 0");
    return { exitCode: 0, iterations: 0, cleared: 0, finalBreakdown: initial, stalled: false };
  }

  let iteration = 0;
  let prevCount = initial.total;
  const startCount = initial.total;
  let last: PendingPaymentLinkBreakdown = initial;

  while (iteration < MAX_ITERATIONS) {
    iteration += 1;
    const outcome = await retry(args.tenantId, null);

    last = await fetchBreakdown(args.tenantId);
    log(
      `[XENDIT BACKFILL] tenantId=${args.tenantId} iteration=${iteration} retried=${outcome.retried} succeeded=${outcome.succeeded} stillFailed=${outcome.stillFailed} pendingTotal=${last.total} categoryBreakdown=${JSON.stringify(last.byPrefix)}`,
    );

    if (last.total === 0) {
      log("[XENDIT BACKFILL] DONE — all cleared");
      return {
        exitCode: 0,
        iterations: iteration,
        cleared: startCount,
        finalBreakdown: last,
        stalled: false,
      };
    }

    if (last.total >= prevCount) {
      log(
        `[XENDIT BACKFILL] STALLED — no progress (prev=${prevCount}, after=${last.total}). Remaining are hard-fail; check breakdown for 401/422 ops issues.`,
      );
      return {
        exitCode: 0,
        iterations: iteration,
        cleared: startCount - last.total,
        finalBreakdown: last,
        stalled: true,
      };
    }

    prevCount = last.total;
  }

  log(
    `[XENDIT BACKFILL] HALTED — hit MAX_ITERATIONS=${MAX_ITERATIONS} cap with ${last.total} still pending. Re-run if needed.`,
  );
  return {
    exitCode: 0,
    iterations: iteration,
    cleared: startCount - last.total,
    finalBreakdown: last,
    stalled: false,
  };
}

// CLI entry point — only runs when this file is executed directly via tsx,
// not when imported by tests.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /backfill-pending-payment-links\.ts$/.test(process.argv[1]);

if (isDirectRun) {
  void (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      const result = await runBackfill(args, {
        retry: (tenantId, ids) => retryPaymentLinks(tenantId, ids),
        fetchBreakdown: (tenantId) => getPendingPaymentLinkBreakdown(tenantId),
        log: (msg) => console.log(msg),
      });
      await prisma.$disconnect();
      process.exit(result.exitCode);
    } catch (e) {
      console.error("[XENDIT BACKFILL] fatal error", e);
      try {
        await prisma.$disconnect();
      } catch {
        // best-effort
      }
      process.exit(1);
    }
  })();
}
