import { revalidateTag } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sumDecimals } from "@/lib/finance/invoice-numbers";

/**
 * Gateway-agnostic webhook core, extracted from `app/api/xendit/webhook/route.ts`
 * in cycle 2026-07-27-doku-payment-gateway T4 so `app/api/doku/webhook/route.ts`
 * can reuse the exact same durable-receipt + crediting logic instead of
 * duplicating it.
 *
 * A gateway's route handler is responsible for: rate limiting, authenticating
 * the request (shared-secret token for Xendit, HMAC signature for DOKU),
 * parsing the provider-specific payload shape, and normalizing it into a
 * `NormalizedPaymentEvent`. Everything after that — the WebhookEvent audit
 * row, the P2002 dedup, the advisory-lock transaction, the amount/currency/
 * payment-id guards, the overpayment tolerance, status recomputation, and
 * cache-tag busting — lives here, verbatim from the pre-T4 Xendit route.
 *
 * Important: NEVER log `rawPayload` content. Only log `eventId` + `eventType`
 * + a small set of derived non-PII fields (mirrors the pre-T4 rule).
 */

/** Gateway-neutral shape every webhook route normalizes its payload into
 * before handing off to `processPaymentEvent`. */
export type NormalizedPaymentEvent = {
  provider: "xendit" | "doku";
  eventId: string;
  eventType: string;
  kind: "PAYMENT_COMPLETED" | "SESSION_EXPIRED" | "UNHANDLED";
  referenceId: string | null; // resolves an Invoice by primary key
  sessionId: string | null; // fallback resolution via Invoice.xenditSessionId
  paymentId: string | null; // inner idempotency key -> Payment.xenditPaymentId
  amount: number | null;
  currency: string | null;
  channelCode: string | null;
  rawPayload: unknown; // stored verbatim in WebhookEvent.payload
  /** Reason code for a `kind: "UNHANDLED"` event. `"REFUND_UNHANDLED"` is
   * special-cased to mark the row ERROR (surfaced to admin) rather than
   * IGNORED — see AC-14. */
  ignoreReason?: string;
};

/**
 * Process one normalized payment-gateway webhook event. Two-phase, durable.
 *
 * Phase 1 — Receive + persist (always). The first DB action is the
 * WebhookEvent INSERT. On P2002 (eventId @unique) we 200 immediately — a
 * gateway's retry of an already-delivered event is a noop. After this insert
 * the receipt is durable; nothing DELETEs it.
 *
 * Phase 2 — Process + record outcome. Dispatch by `kind`. Success →
 * status=PROCESSED + 200. Business-logic error (invoice not found, missing
 * amount, etc) → status=ERROR + 200 always (a gateway retry would silently
 * no-op via Phase 1 dedup anyway). Phase 1 itself throwing (DB unreachable
 * BEFORE row committed) → 500; the gateway retries cleanly because no row is
 * yet committed.
 *
 * The P2002 short-circuit on Phase 1 guarantees at most one Phase 2 dispatch
 * per eventId — the per-invoice advisory lock in Phase 2 then serialises
 * concurrency at the invoice level.
 */
export async function processPaymentEvent(
  event: NormalizedPaymentEvent,
): Promise<{ httpStatus: number; body: unknown }> {
  const logPrefix = `[${event.provider.toUpperCase()} WEBHOOK]`;

  // ── Phase 1: INSERT WebhookEvent. P2002 → already-seen → 200.
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.rawPayload as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.info(
        `${logPrefix} Duplicate eventId=${event.eventId} event=${event.eventType} — 200 noop`,
      );
      return { httpStatus: 200, body: { ok: true, duplicate: true } };
    }
    console.error(`${logPrefix} Failed to record event:`, err);
    return { httpStatus: 500, body: { error: "Audit failure" } };
  }

  // ── Phase 2 — process + record outcome. Receipt is durable from this
  // ── point. Errors mark the row ERROR + return 200 (admin-recovery via the
  // ── activity panel; a gateway retry would dedup at Phase 1).
  try {
    if (event.kind === "PAYMENT_COMPLETED") {
      const result = await handleSessionCompleted(event, logPrefix);
      revalidateTag("student-invoices", { expire: 0 });
      revalidateTag("parent-invoice-list", { expire: 0 });
      return { httpStatus: 200, body: result };
    }

    if (event.kind === "SESSION_EXPIRED") {
      const result = await handleSessionExpired(event, logPrefix);
      if (result.invoiceId) {
        revalidateTag("student-invoices", { expire: 0 });
        revalidateTag("parent-invoice-list", { expire: 0 });
      }
      return { httpStatus: 200, body: result };
    }

    // kind === "UNHANDLED". REFUND_UNHANDLED must surface to admin as an
    // ERROR (AC-14) — never silently swallowed like a normal ignore.
    const reason = event.ignoreReason ?? "status_not_handled";
    if (reason === "REFUND_UNHANDLED") {
      console.warn(
        `${logPrefix} Refund notification requires manual handling eventId=${event.eventId} event=${event.eventType}`,
      );
      await markError(event.eventId, "REFUND_UNHANDLED");
      return {
        httpStatus: 200,
        body: { ok: true, error: "REFUND_UNHANDLED", eventId: event.eventId },
      };
    }

    console.warn(
      `${logPrefix} Unhandled event eventId=${event.eventId} event=${event.eventType}`,
    );
    await markIgnored(event.eventId, reason);
    return {
      httpStatus: 200,
      body: { ok: true, ignored: true, event: event.eventType },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `${logPrefix} Processing failed eventId=${event.eventId} event=${event.eventType}:`,
      errorMessage,
    );
    // ERROR row retained for admin audit. Always return 200 — a gateway
    // retry of the same eventId would short-circuit at Phase 1 anyway.
    try {
      await prisma.webhookEvent.update({
        where: { eventId: event.eventId },
        data: { status: "ERROR", errorMessage, processedAt: new Date() },
      });
    } catch {
      // Best-effort; the row may have been deleted by an external job.
    }
    return { httpStatus: 200, body: { ok: true, error: errorMessage } };
  }
}

// ─── Event handlers ───────────────────────────────────────────────

async function resolveInvoiceByReferenceOrSession(
  event: NormalizedPaymentEvent,
  logPrefix: string,
) {
  const invoice = event.referenceId
    ? await prisma.invoice.findUnique({ where: { id: event.referenceId } })
    : null;
  if (invoice) return invoice;
  if (!event.sessionId) return null;

  const fallback = await prisma.invoice.findFirst({
    where: { xenditSessionId: event.sessionId },
  });
  if (fallback) {
    console.warn(
      `${logPrefix} ref_id_miss_session_fallback eventId=${event.eventId} refId=${event.referenceId ?? ""} sessionId=${event.sessionId} paymentId=${event.paymentId ?? ""} resolvedInvoiceId=${fallback.id}`,
    );
  }
  return fallback;
}

async function handleSessionCompleted(
  event: NormalizedPaymentEvent,
  logPrefix: string,
): Promise<{ ok: true; status: string; eventId: string }> {
  const eventId = event.eventId;

  // T5d — amount-mismatch guard: refuse to credit a missing/zero amount.
  // Falling back to invoice.totalDue would mask partial captures and
  // amount-tampering attacks. Mark ERROR + admin reviews via inspector.
  if (event.amount == null || event.amount === 0) {
    console.warn(
      `${logPrefix} Missing/zero amount eventId=${eventId} refId=${event.referenceId ?? ""}`,
    );
    await markError(eventId, "MISSING_AMOUNT");
    return { ok: true, status: "ERROR:missing_amount", eventId };
  }

  // Currency guard — the app is IDR-only and Invoice has no currency column,
  // so a settlement in any other currency would credit its numeric amount
  // 1:1 as IDR. Refuse to credit; leave the ERROR row for admin review.
  // Absent currency keeps crediting (older/some-provider payloads omit it).
  if (event.currency && event.currency !== "IDR") {
    console.warn(
      `${logPrefix} Non-IDR currency=${event.currency} eventId=${eventId} refId=${event.referenceId ?? ""}`,
    );
    await markError(eventId, `CURRENCY_MISMATCH:${event.currency}`);
    return { ok: true, status: "ERROR:currency_mismatch", eventId };
  }

  if (!event.paymentId) {
    console.warn(
      `${logPrefix} Completed event missing an idempotency key eventId=${eventId} refId=${event.referenceId ?? ""}`,
    );
    await markError(eventId, "MISSING_PAYMENT_ID");
    return { ok: true, status: "ERROR:missing_payment_id", eventId };
  }

  // T5c — try reference_id first, then fall back to xenditSessionId.
  const invoice = await resolveInvoiceByReferenceOrSession(event, logPrefix);
  if (!invoice) {
    console.warn(
      `${logPrefix} Invoice not found eventId=${eventId} refId=${event.referenceId ?? ""} sessionId=${event.sessionId ?? ""}`,
    );
    await markError(
      eventId,
      `INVOICE_NOT_FOUND:ref=${event.referenceId ?? ""};session=${event.sessionId ?? ""}`,
    );
    return { ok: true, status: "ERROR:invoice_not_found", eventId };
  }
  const invoiceId = invoice.id;

  if (invoice.status === "PAID") {
    await markProcessed(eventId, invoiceId);
    return { ok: true, status: "PAID:already", eventId };
  }

  // Guard CANCELLED. TOCTOU: a retry helper read PENDING_PAYMENT_LINK then
  // made the gateway network call; meanwhile the void route flipped to
  // CANCELLED. The helper's later DB update may have left xenditSessionId/Url
  // populated on a CANCELLED row, so a parent could still pay the orphan
  // link. Refuse to credit a CANCELLED invoice.
  if (invoice.status === "CANCELLED") {
    console.warn(
      `${logPrefix} Payment for CANCELLED invoice ${invoice.invoiceNumber} ignored eventId=${eventId}`,
    );
    await markIgnored(eventId, "invoice cancelled", invoiceId);
    return { ok: true, status: "IGNORED:invoice_cancelled", eventId };
  }

  const paymentAmount = event.amount; // guaranteed non-null by guard above
  const paymentId = event.paymentId; // guaranteed non-null by guard above
  const channelCode = event.channelCode ?? "checkout";
  const method = event.provider === "xendit" ? "XENDIT" : "DOKU";
  const providerLabel = event.provider === "xendit" ? "Xendit" : "DOKU";

  const txOutcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;

    const fresh = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!fresh) return { status: "PAID", overpaid: false } as const;
    if (fresh.status === "PAID") return { status: "PAID", overpaid: false } as const;
    if (fresh.status === "CANCELLED") return { status: "CANCELLED", overpaid: false } as const;

    const existing = await tx.payment.findUnique({
      where: { xenditPaymentId: paymentId },
    });
    if (existing) return { status: fresh.status as string, overpaid: false } as const;

    // T5d — overpayment guard computed INSIDE the lock from authoritative
    // fresh.totalPaid, not from the pre-tx snapshot. Prevents a false
    // negative when two concurrent webhooks with different paymentIds both
    // pre-read totalPaid=0 then both pass the overpayment check. 1 IDR
    // tolerance for gateway fee/rounding edge cases.
    const remaining = Number(fresh.totalDue) - Number(fresh.totalPaid);
    const overpaid = paymentAmount > remaining + 1;

    await tx.payment.create({
      data: {
        invoiceId,
        amount: paymentAmount,
        method,
        xenditPaymentId: paymentId,
        reference: paymentId,
        notes: `${providerLabel} payment via ${channelCode}`,
      },
    });

    const allPayments = await tx.payment.findMany({ where: { invoiceId } });
    const totalPaid = sumDecimals(allPayments.map((p) => p.amount));
    const totalDue = new Prisma.Decimal(invoice.totalDue as never);
    const status = totalPaid.greaterThanOrEqualTo(totalDue) ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        totalPaid,
        status,
        paymentLinkError: null,
        paidAt: status === "PAID" ? new Date() : null,
      },
    });
    return { status, overpaid } as const;
  });

  const newStatus = txOutcome.status;
  const overpaid = txOutcome.overpaid;

  if (newStatus === "CANCELLED") {
    await markIgnored(eventId, "invoice cancelled (in-tx)", invoiceId);
    console.warn(
      `${logPrefix} In-tx CANCELLED race on ${invoice.invoiceNumber} eventId=${eventId}`,
    );
    return { ok: true, status: "IGNORED:invoice_cancelled", eventId };
  }

  if (overpaid) {
    await markError(eventId, "OVERPAYMENT_FLAGGED", invoiceId);
    console.warn(
      `${logPrefix} Overpayment on ${invoice.invoiceNumber}: paid=${paymentAmount} eventId=${eventId}`,
    );
    return { ok: true, status: `OVERPAID:${newStatus}`, eventId };
  }

  await markProcessed(eventId, invoiceId);
  // Triage: structured log so an operator can grep by invoiceId across
  // "[PAYMENT SESSION CREATED]" (session.ts) and this PROCESSED line.
  console.info(`${logPrefix} PROCESSED`, {
    invoiceNumber: invoice.invoiceNumber,
    newStatus,
    eventId,
  });
  return { ok: true, status: newStatus, eventId };
}

async function handleSessionExpired(
  event: NormalizedPaymentEvent,
  logPrefix: string,
): Promise<{
  ok: true;
  status: string;
  eventId: string;
  invoiceId?: string;
}> {
  const eventId = event.eventId;

  // Same reference_id → xenditSessionId fallback as the completed handler.
  let resolved = event.referenceId
    ? await prisma.invoice.findUnique({
        where: { id: event.referenceId },
        select: { id: true, status: true, invoiceNumber: true },
      })
    : null;
  if (!resolved && event.sessionId) {
    resolved = await prisma.invoice.findFirst({
      where: { xenditSessionId: event.sessionId },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (resolved) {
      console.warn(
        `${logPrefix} expired ref_id_miss_session_fallback eventId=${eventId} refId=${event.referenceId ?? ""} sessionId=${event.sessionId} resolvedInvoiceId=${resolved.id}`,
      );
    }
  }
  if (!resolved) {
    await markError(
      eventId,
      `INVOICE_NOT_FOUND:ref=${event.referenceId ?? ""};session=${event.sessionId ?? ""}`,
    );
    return { ok: true, status: "ERROR:invoice_not_found", eventId };
  }
  const invoiceId = resolved.id;

  // T5e — soft-revert (NOT destructive). Only revert SENT and
  // PENDING_PAYMENT_LINK. Already-paid + already-cancelled ignore.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
    const fresh = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (!fresh) {
      return { type: "IGNORED:invoice_not_found" as const, invoiceNumber: "" };
    }
    if (fresh.status === "PAID") {
      return {
        type: "IGNORED:already_paid" as const,
        invoiceNumber: fresh.invoiceNumber,
      };
    }
    if (fresh.status === "CANCELLED") {
      return {
        type: "IGNORED:already_cancelled" as const,
        invoiceNumber: fresh.invoiceNumber,
      };
    }
    if (fresh.status !== "SENT" && fresh.status !== "PENDING_PAYMENT_LINK") {
      return {
        type: "IGNORED:status_not_revertible" as const,
        invoiceNumber: fresh.invoiceNumber,
      };
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PENDING_PAYMENT_LINK",
        xenditSessionId: null,
        xenditPaymentUrl: null,
      },
    });
    return { type: "REVERTED" as const, invoiceNumber: fresh.invoiceNumber };
  });

  if (result.type === "IGNORED:invoice_not_found") {
    await markError(eventId, "INVOICE_NOT_FOUND_INTX", invoiceId);
    return { ok: true, status: "ERROR:invoice_not_found_intx", eventId };
  }
  if (
    result.type === "IGNORED:already_paid" ||
    result.type === "IGNORED:already_cancelled" ||
    result.type === "IGNORED:status_not_revertible"
  ) {
    await markIgnored(eventId, result.type.replace("IGNORED:", ""), invoiceId);
    return { ok: true, status: result.type, eventId, invoiceId };
  }
  await markProcessed(eventId, invoiceId);
  console.info(
    `${logPrefix} Invoice ${result.invoiceNumber} → PENDING_PAYMENT_LINK (session expired, soft-revert) eventId=${eventId}`,
  );
  return { ok: true, status: "REVERTED", eventId, invoiceId };
}

async function markProcessed(eventId: string, invoiceId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status: "PROCESSED",
      invoiceId,
      processedAt: new Date(),
    },
  });
}

async function markIgnored(
  eventId: string,
  reason: string,
  invoiceId?: string,
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status: "IGNORED",
      errorMessage: reason,
      invoiceId: invoiceId ?? null,
      processedAt: new Date(),
    },
  });
}

async function markError(
  eventId: string,
  errorMessage: string,
  invoiceId?: string,
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status: "ERROR",
      errorMessage,
      invoiceId: invoiceId ?? null,
      processedAt: new Date(),
    },
  });
}
