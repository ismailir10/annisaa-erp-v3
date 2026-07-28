import { prisma } from "@/lib/db";
import { getGateway } from "./registry";
import { GatewayApiError, type GatewayPaymentStatus } from "./types";
import {
  processPaymentEvent,
  type NormalizedPaymentEvent,
} from "./webhook-processor";

/**
 * Manual payment reconciliation — the "Perbarui pembayaran" fallback for when
 * a gateway webhook never arrived (cycle 2026-07-28-manual-payment-refresh).
 *
 * Design rule: this module performs NO state transitions of its own. It polls
 * the gateway, normalizes the answer into exactly the `NormalizedPaymentEvent`
 * a webhook route would have built, and hands it to the shared
 * `processPaymentEvent`. Every guard the webhook path enforces — the durable
 * WebhookEvent receipt, the P2002 dedup, the per-invoice advisory lock, the
 * amount/currency/payment-id checks, the overpayment tolerance, the
 * PAID/CANCELLED short-circuits, the cache-tag bust — therefore applies here
 * verbatim. Manual refresh and webhook cannot drift, because there is only one
 * implementation.
 *
 * Idempotency (safe to click repeatedly) comes from three independent layers:
 *   1. `eventId` is a pure function of (provider, invoiceId, state, paymentId).
 *      Clicking twice against an unchanged gateway state hits the
 *      `WebhookEvent.eventId` unique index → P2002 → `{duplicate:true}` noop.
 *   2. `Payment.xenditPaymentId` is unique and checked inside the advisory
 *      lock, so no duplicate Payment row can be inserted for one settlement.
 *   3. The processor returns early on `PAID` / `CANCELLED` invoices, so an
 *      already-settled invoice is never re-credited.
 */

/** Machine-readable result code. The route returns this; the UI branches on it. */
export type ReconcileCode =
  | "UPDATED"
  | "ALREADY_PAID"
  | "NO_CHANGE"
  | "UNAVAILABLE"
  | "GATEWAY_ERROR"
  | "NOT_FOUND";

export type ReconcileResult = {
  code: ReconcileCode;
  /** Indonesian, admin-facing — rendered directly in the toast. */
  message: string;
  provider: string;
  /** Gateway's own status string, for triage. Null when never reached. */
  gatewayStatus: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  /** Outcome string from the shared processor, when it ran. */
  processorStatus?: string;
  /** True when the identical gateway state had already been processed. */
  duplicate?: boolean;
};

/**
 * Build the `eventId` for a manual poll.
 *
 * Deterministic on purpose — the same gateway state must always produce the
 * same id so repeated clicks dedup at the unique index. Deliberately NOT
 * hashed over the raw response body: that carries timestamps, which would
 * mint a fresh id on every click and defeat layer 1 of the idempotency stack.
 *
 * The `manual:` prefix keeps these rows visually distinct from real webhook
 * deliveries in the admin activity panel, and guarantees no collision with a
 * gateway-issued event id.
 *
 * Exported for unit testing.
 */
export function buildManualEventId(
  provider: string,
  invoiceId: string,
  state: string,
  paymentId: string | null,
): string {
  const suffix = paymentId ? `:${paymentId}` : "";
  return `manual:${provider}:${invoiceId}:${state}${suffix}`;
}

/**
 * Map a polled gateway state onto the webhook `kind` vocabulary.
 *
 * Only COMPLETED, EXPIRED and REFUNDED are dispatched to the processor.
 * PENDING and FAILED are pure no-ops and never reach it: nobody has paid, and
 * a failed/voided attempt is not an expiry — reverting on it would destroy a
 * payment link the parent could still retry. Returning null here means "write
 * no audit row, change nothing".
 */
function kindForState(
  status: GatewayPaymentStatus,
): { kind: NormalizedPaymentEvent["kind"]; ignoreReason?: string } | null {
  switch (status.state) {
    case "COMPLETED":
      return { kind: "PAYMENT_COMPLETED" };
    case "EXPIRED":
      return { kind: "SESSION_EXPIRED" };
    case "REFUNDED":
      // Same special-case the DOKU notification route uses — the processor
      // marks the row ERROR so a refund surfaces to an admin (AC-14) instead
      // of being silently swallowed.
      return { kind: "UNHANDLED", ignoreReason: "REFUND_UNHANDLED" };
    default:
      return null;
  }
}

function gatewayErrorMessage(err: GatewayApiError): string {
  if (err.code === "401" || err.code === "403") {
    return "Kredensial gateway pembayaran ditolak. Hubungi admin sistem.";
  }
  if (err.code === "network" || err.code === "408") {
    return "Gateway pembayaran tidak merespons. Coba lagi sebentar.";
  }
  if (err.code === "429") {
    return "Terlalu banyak permintaan ke gateway. Tunggu sebentar lalu coba lagi.";
  }
  if (err.code === "5xx") {
    return "Gateway pembayaran sedang bermasalah. Coba lagi sebentar.";
  }
  return `Gagal memeriksa status ke gateway: ${err.message}`;
}

function unavailableMessage(reason: string | undefined): string {
  if (reason === "NO_SESSION_ID") {
    return "Tagihan ini belum punya ID sesi pembayaran, jadi statusnya tidak bisa diperiksa. Buat ulang link pembayaran terlebih dahulu.";
  }
  if (reason === "ORDER_NOT_FOUND") {
    return "Gateway belum punya catatan transaksi untuk tagihan ini. Belum ada pembayaran yang dimulai.";
  }
  return "Status pembayaran tidak bisa diperiksa saat ini.";
}

/**
 * Poll the active gateway for `invoiceId` and reconcile the local invoice with
 * what it reports. Read-only against the gateway; all local writes go through
 * `processPaymentEvent`.
 *
 * The caller is responsible for authentication and the tenant check — this
 * function assumes the invoice has already been authorised.
 */
export async function reconcileInvoicePayment(
  invoiceId: string,
): Promise<ReconcileResult> {
  const gateway = getGateway();
  const provider = gateway.id;

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      invoiceNumber: true,
      xenditSessionId: true,
    },
  });
  if (!before) {
    return {
      code: "NOT_FOUND",
      message: "Tagihan tidak ditemukan.",
      provider,
      gatewayStatus: null,
      statusBefore: null,
      statusAfter: null,
    };
  }

  let status: GatewayPaymentStatus;
  try {
    status = await gateway.fetchPaymentStatus({
      invoiceId: before.id,
      sessionId: before.xenditSessionId,
    });
  } catch (err) {
    const message =
      err instanceof GatewayApiError
        ? gatewayErrorMessage(err)
        : `Gagal memeriksa status ke gateway: ${err instanceof Error ? err.message : String(err)}`;
    console.error(
      `[PAYMENT REFRESH] provider=${provider} invoice=${before.invoiceNumber} lookup failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return {
      code: "GATEWAY_ERROR",
      message,
      provider,
      gatewayStatus: null,
      statusBefore: before.status,
      statusAfter: before.status,
    };
  }

  if (status.state === "UNAVAILABLE") {
    return {
      code: "UNAVAILABLE",
      message: unavailableMessage(status.unavailableReason),
      provider,
      gatewayStatus: null,
      statusBefore: before.status,
      statusAfter: before.status,
    };
  }

  const dispatch = kindForState(status);
  if (!dispatch) {
    // PENDING / FAILED — nothing to transition. No audit row is written; a
    // click that finds "still unpaid" is not an event worth persisting.
    return {
      code: "NO_CHANGE",
      message:
        status.state === "FAILED"
          ? `Percobaan pembayaran terakhir gagal di gateway (status: ${status.rawStatus ?? "?"}). Tagihan tidak berubah.`
          : `Belum ada pembayaran masuk (status gateway: ${status.rawStatus ?? "?"}).`,
      provider,
      gatewayStatus: status.rawStatus,
      statusBefore: before.status,
      statusAfter: before.status,
    };
  }

  const eventId = buildManualEventId(
    provider,
    before.id,
    status.state,
    status.paymentId,
  );

  const normalized: NormalizedPaymentEvent = {
    provider,
    eventId,
    eventType: `manual.refresh.${status.state.toLowerCase()}`,
    kind: dispatch.kind,
    // The invoice was resolved by primary key above, so hand the processor the
    // id directly — no reference_id string surgery, no session fallback needed.
    referenceId: before.id,
    sessionId: before.xenditSessionId,
    paymentId: status.paymentId,
    amount: status.amount,
    currency: status.currency,
    channelCode: status.channelCode,
    rawPayload: {
      source: "manual-refresh",
      provider,
      invoiceId: before.id,
      gatewayStatus: status.rawStatus,
      gatewayResponse: status.raw,
    },
    ignoreReason: dispatch.ignoreReason,
  };

  const { body } = await processPaymentEvent(normalized);
  const outcome = (body ?? {}) as { status?: string; duplicate?: boolean };

  const after = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  const statusAfter = after?.status ?? before.status;
  const changed = statusAfter !== before.status;

  console.info("[PAYMENT REFRESH]", {
    provider,
    invoiceNumber: before.invoiceNumber,
    gatewayStatus: status.rawStatus,
    statusBefore: before.status,
    statusAfter,
    eventId,
    processorStatus: outcome.status,
    duplicate: outcome.duplicate ?? false,
  });

  const base = {
    provider,
    gatewayStatus: status.rawStatus,
    statusBefore: before.status,
    statusAfter,
    processorStatus: outcome.status,
    duplicate: outcome.duplicate,
  };

  if (changed) {
    return {
      ...base,
      code: "UPDATED",
      message:
        statusAfter === "PAID"
          ? "Pembayaran ditemukan di gateway — tagihan ditandai LUNAS."
          : statusAfter === "PARTIALLY_PAID"
            ? "Pembayaran sebagian ditemukan di gateway — tagihan diperbarui."
            : statusAfter === "PENDING_PAYMENT_LINK"
              ? "Sesi pembayaran sudah kedaluwarsa. Link lama dihapus — silakan buat link baru."
              : `Status tagihan diperbarui menjadi ${statusAfter}.`,
    };
  }

  // Refund is checked BEFORE the already-paid branch: a refunded invoice is
  // still locally PAID, so the PAID branch would otherwise report the
  // reassuring "sudah lunas" for money that has gone back to the parent.
  if (status.state === "REFUNDED" || outcome.status === "REFUND_UNHANDLED") {
    return {
      ...base,
      code: "NO_CHANGE",
      message:
        "Gateway melaporkan pengembalian dana (refund). Perlu ditangani manual — cek panel Aktivitas.",
    };
  }

  if (statusAfter === "PAID") {
    return {
      ...base,
      code: "ALREADY_PAID",
      message: "Tagihan sudah lunas — tidak ada perubahan.",
    };
  }

  // Reached the processor but nothing moved: a duplicate poll, a CANCELLED
  // invoice, or a guard rejection (missing amount / payment id / non-IDR
  // currency). The activity panel carries the detail; keep the toast honest
  // rather than implying success.
  return {
    ...base,
    code: "NO_CHANGE",
    message: outcome.duplicate
      ? "Status sudah sinkron dengan gateway — tidak ada perubahan."
      : `Tidak ada perubahan status (gateway: ${status.rawStatus ?? "?"}). Cek panel Aktivitas untuk detail.`,
  };
}
