import { prisma } from "@/lib/db";
import { createXenditSessionForInvoice } from "@/lib/xendit/helpers";

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

export type RetryOutcome = {
  retried: number;
  succeeded: number;
  stillFailed: number;
  results: RetryResultRow[];
};

/**
 * Retry Xendit Checkout Session creation for invoices in PENDING_PAYMENT_LINK.
 *
 * If `invoiceIds` is null: retries ALL PENDING_PAYMENT_LINK invoices for the
 * tenant (capped at 25 per call — client iterates if more are needed).
 * Otherwise: retries only the specified ids (also capped at 25).
 *
 * Concurrency: all candidates fire in parallel via Promise.allSettled.
 * At 25 invoices × ~1.5s Xendit latency = ~1.5s wall time, well under the
 * Vercel 60s function ceiling.
 * Per-outcome write-back: on success → status=SENT + sentAt + paymentLinkError=null
 * (the helper already wrote `xenditSessionId` + `xenditPaymentUrl`); on failure
 * → paymentLinkError=<message> (status stays PENDING_PAYMENT_LINK).
 *
 * Shared by:
 *   - POST /api/invoices/retry-payment-links (admin retry endpoint)
 *   - POST /api/invoices (manual single-invoice creation, Task 13 inline retry)
 */
export async function retryPaymentLinks(
  tenantId: string,
  invoiceIds: string[] | null
): Promise<RetryOutcome> {
  const where = {
    tenantId,
    status: "PENDING_PAYMENT_LINK",
    ...(invoiceIds && invoiceIds.length > 0 ? { id: { in: invoiceIds } } : {}),
  };

  const candidates = await prisma.invoice.findMany({
    where,
    select: { id: true, invoiceNumber: true, studentId: true },
    take: 25, // hard cap matches batch endpoint shape
  });

  if (candidates.length === 0) {
    return { retried: 0, succeeded: 0, stillFailed: 0, results: [] };
  }

  const settled = await Promise.allSettled(
    candidates.map((c) =>
      createXenditSessionForInvoice(c.id, tenantId).then((res) => ({ row: c, result: res }))
    )
  );

  const results: RetryResultRow[] = [];
  let succeeded = 0;
  let stillFailed = 0;

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    const row = candidates[i];

    if (outcome.status === "fulfilled" && outcome.value.result) {
      // Helper already flipped status:SENT atomically inside its own
      // advisory-lock tx; nothing to write here.
      results.push({
        invoiceId: row.id,
        invoiceNumber: row.invoiceNumber,
        studentId: row.studentId,
        status: "SENT",
        paymentUrl: outcome.value.result.paymentUrl,
      });
      succeeded++;
    } else {
      // Two failure shapes:
      //   - rejected: helper threw (Xendit 4xx/5xx, network error, etc.)
      //   - fulfilled with null: TOCTOU guard tripped (PAID/CANCELLED mid-flight,
      //     or remaining went to 0). Surface a diagnostic so admin can retry.
      const msg =
        outcome.status === "rejected"
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : "Unknown error"
          : "Gagal membuat sesi pembayaran";
      try {
        await prisma.invoice.update({
          where: { id: row.id },
          data: { paymentLinkError: msg },
        });
      } catch {
        // best-effort write-back; result row still surfaces failure below.
      }
      results.push({
        invoiceId: row.id,
        invoiceNumber: row.invoiceNumber,
        studentId: row.studentId,
        status: "PENDING_PAYMENT_LINK",
        error: msg,
      });
      stillFailed++;
    }
  }

  return { retried: candidates.length, succeeded, stillFailed, results };
}
