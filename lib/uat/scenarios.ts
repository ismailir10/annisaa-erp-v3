/**
 * UAT scenario registry.
 *
 * Each scenario stages a cross-role precondition so a single-persona UAT run
 * can exercise a JTBD end-to-end without needing a human to log in as admin
 * first. Example: a parent can only test paying an invoice if that invoice
 * has a live Xendit payment URL — which only admin-side code produces.
 *
 * Scenarios are idempotent: running twice is a no-op the second time.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";

export type UatScenarioResult = {
  /** Whether the scenario completed without a fatal error. Partial failures still return ok=true with detail in actions. */
  ok: boolean;
  /** Human-readable log of what happened — surfaced in the API response for UAT reports. */
  actions: string[];
};

export type UatScenarioContext = {
  tenantId: string;
  prisma: PrismaClient;
};

export type UatScenario = {
  key: string;
  description: string;
  prep: (ctx: UatScenarioContext) => Promise<UatScenarioResult>;
};

/**
 * parent-payment: ensure every payable invoice in the tenant has a real
 * Xendit payment URL. Fixes the blocker where parents open an invoice and
 * see "Link pembayaran sedang disiapkan" with no Bayar CTA because the row
 * was created before the payment-link seed fix.
 *
 * Only touches invoices that would otherwise show the blocker: SENT,
 * PARTIALLY_PAID, OVERDUE with a null xenditPaymentUrl. Chunks Xendit calls
 * to avoid rate limits.
 */
const BACKFILL_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;
const CHUNK_SIZE = 5;
const CHUNK_PAUSE_MS = 200;

async function prepParentPayment(ctx: UatScenarioContext): Promise<UatScenarioResult> {
  const { tenantId, prisma } = ctx;
  const candidates = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: [...BACKFILL_STATUSES] },
      xenditPaymentUrl: null,
    },
    select: { id: true, invoiceNumber: true },
  });

  const actions: string[] = [];
  if (candidates.length === 0) {
    actions.push("no payable invoices missing a payment link; nothing to do");
    return { ok: true, actions };
  }

  let created = 0;
  let failed = 0;
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (inv) => {
        try {
          const result = await createXenditSessionForInvoice(inv.id, tenantId);
          return { invoiceNumber: inv.invoiceNumber, ok: result !== null };
        } catch (err) {
          return {
            invoiceNumber: inv.invoiceNumber,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    for (const r of results) {
      if (r.ok) {
        created++;
      } else {
        failed++;
        actions.push(
          `skipped ${r.invoiceNumber}${"error" in r && r.error ? `: ${r.error}` : ""}`,
        );
      }
    }
    if (i + CHUNK_SIZE < candidates.length) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_PAUSE_MS));
    }
  }

  actions.unshift(
    `processed ${candidates.length} candidate invoice(s): ${created} Xendit links created, ${failed} failed`,
  );
  return { ok: true, actions };
}

export const uatScenarios: Record<string, UatScenario> = {
  "parent-payment": {
    key: "parent-payment",
    description:
      "Backfill Xendit payment URLs on every SENT/PARTIALLY_PAID/OVERDUE invoice missing one. Unblocks JTBD-PARENT-INV-01.",
    prep: prepParentPayment,
  },
};

export function getScenario(key: string): UatScenario | undefined {
  return uatScenarios[key];
}

export function listScenarioKeys(): string[] {
  return Object.keys(uatScenarios);
}
