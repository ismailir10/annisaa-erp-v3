/**
 * Per-student invoice roll-up, shared by any surface that has to answer
 * "does this family owe us anything".
 *
 * Pure on purpose: the admin student dossier computes it in the browser from
 * the rows `GET /api/invoices?studentId=` already returns, rather than paying
 * for a second aggregate round-trip. `lib/parent-helpers.ts` does the same sum
 * server-side against Prisma — the two MUST agree, so the status allow-list
 * lives here and both import it.
 */

/**
 * The only statuses that represent money still owed.
 *
 * `DRAFT` is not billed yet, `PENDING_PAYMENT_LINK` failed to get a payment
 * session and is an admin's problem rather than a family's, `CANCELLED` was
 * voided, `PAID` is settled. Counting any of those as outstanding is how the
 * UAT-2026-05-03 INV-01 disagreement started — one surface said "N belum
 * lunas", another said "Lunas semua".
 */
export const UNPAID_INVOICE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

const UNPAID_SET: ReadonlySet<string> = new Set(UNPAID_INVOICE_STATUSES);

/**
 * The subset of an invoice row this roll-up reads. Deliberately structural —
 * the API serialises `Decimal` as a string, Prisma hands back `Decimal`, and
 * tests pass numbers, so every amount goes through `Number()`.
 */
export type SummarisableInvoice = {
  status: string;
  dueDate?: string | null;
  totalDue: number | string;
  totalPaid: number | string;
};

export type StudentInvoiceSummary = {
  /** Every invoice on the record, including CANCELLED and DRAFT. */
  invoiceCount: number;
  /** Billed, excluding CANCELLED — a voided invoice was never really charged. */
  totalBilled: number;
  /** Received, excluding CANCELLED. */
  totalPaid: number;
  /** Still owed, by the allow-list above. */
  outstanding: number;
  /** How many invoices make up `outstanding`. */
  unpaidCount: number;
  /** Earliest `dueDate` among the unpaid ones, or null. `YYYY-MM-DD`. */
  nearestDue: string | null;
  /** Unpaid invoices already flagged OVERDUE by the server. */
  overdueCount: number;
};

export const EMPTY_INVOICE_SUMMARY: StudentInvoiceSummary = {
  invoiceCount: 0,
  totalBilled: 0,
  totalPaid: 0,
  outstanding: 0,
  unpaidCount: 0,
  nearestDue: null,
  overdueCount: 0,
};

/** `Decimal | string | number | null` → finite number, never NaN. */
function amount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function summarizeStudentInvoices(
  invoices: readonly SummarisableInvoice[],
): StudentInvoiceSummary {
  const summary: StudentInvoiceSummary = { ...EMPTY_INVOICE_SUMMARY, invoiceCount: invoices.length };

  for (const inv of invoices) {
    const due = amount(inv.totalDue);
    const paid = amount(inv.totalPaid);

    // A cancelled invoice is not a charge and not a receipt. Leaving it in
    // "total ditagih" makes the section's own arithmetic (ditagih − dibayar)
    // disagree with the outstanding figure beside it.
    if (inv.status !== "CANCELLED") {
      summary.totalBilled += due;
      summary.totalPaid += paid;
    }

    if (!UNPAID_SET.has(inv.status)) continue;

    // Post-filter on remaining, exactly as the parent portal does: a
    // PARTIALLY_PAID row whose payment settled it but whose status has not
    // flipped to PAID yet owes nothing.
    const remaining = Math.max(0, due - paid);
    if (remaining <= 0) continue;

    summary.outstanding += remaining;
    summary.unpaidCount += 1;
    if (inv.status === "OVERDUE") summary.overdueCount += 1;
    // Plain string compare is safe — the column is YYYY-MM-DD.
    if (inv.dueDate && (!summary.nearestDue || inv.dueDate < summary.nearestDue)) {
      summary.nearestDue = inv.dueDate;
    }
  }

  return summary;
}
