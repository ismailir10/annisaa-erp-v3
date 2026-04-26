// @public — external Xendit webhook, auth via XENDIT_WEBHOOK_TOKEN signature.
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual, createHash } from "crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sumDecimals } from "@/lib/finance/invoice-numbers";

/**
 * Xendit Payment Session Webhook handler. Two-phase, durable.
 *
 * Phase 1 — Receive + persist (always). The first DB action is the
 * WebhookEvent INSERT. On P2002 (eventId @unique) we 200 immediately —
 * Xendit's retry of an already-delivered event is a noop. After this
 * insert the receipt is durable; nothing in the route DELETEs it.
 *
 * Phase 2 — Process + record outcome. Dispatch by event type. Success →
 * status=PROCESSED + 200. Business-logic error (invoice not found,
 * missing amount, etc) → status=ERROR + 200 always (Xendit retry would
 * silently no-op via Phase 1 dedup anyway). Phase 1 itself throwing
 * (DB unreachable BEFORE row committed) → 500; Xendit retries cleanly
 * because no row is yet committed.
 *
 * The P2002 short-circuit on Phase 1 guarantees at most one Phase 2
 * dispatch per eventId — the per-invoice advisory lock in Phase 2 then
 * serialises concurrency at the invoice level.
 *
 * Important: NEVER log `payload` content. Only log `eventId` + `eventType`
 * + a small set of derived non-PII fields.
 */
export async function POST(req: NextRequest) {
  // ── Step 1: verify Xendit token (timing-safe).
  const callbackToken = req.headers.get("x-callback-token");
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (
    !expectedToken ||
    !callbackToken ||
    callbackToken.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(callbackToken), Buffer.from(expectedToken))
  ) {
    console.error("[XENDIT WEBHOOK] Invalid callback token");
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // ── Step 2: parse body.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    console.error("[XENDIT WEBHOOK] Malformed JSON body");
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  const data = (body.data ?? {}) as Record<string, unknown>;

  // ── Step 3: synthesize a stable eventId.
  // Prefer Xendit's per-delivery id; fall back to a deterministic key that
  // includes a SHA-256 of the canonical body so two distinct payloads cannot
  // collide on `(event:session:status)` alone (e.g. attacker-crafted clones,
  // or two real sessions sharing reference_id when payment_session_id absent).
  const rawId = body.id ?? body.event_id;
  const eventId =
    typeof rawId === "string" && rawId.length > 0
      ? rawId
      : `${event}:${data.payment_session_id ?? data.id ?? data.reference_id ?? "unknown"}:${data.status ?? "unknown"}:${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16)}`;

  // ── Step 4: INSERT WebhookEvent. P2002 → already-seen → 200.
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "xendit",
        eventId,
        eventType: event || "unknown",
        payload: body as unknown as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.log(
        `[XENDIT WEBHOOK] Duplicate eventId=${eventId} event=${event} — 200 noop`,
      );
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[XENDIT WEBHOOK] Failed to record event:", err);
    return NextResponse.json({ error: "Audit failure" }, { status: 500 });
  }

  // ── Step 5: Phase 2 — process + record outcome. Receipt is durable
  // ── from this point. Errors mark the row ERROR + return 200 (admin-
  // ── recovery via Aktivitas Xendit panel; Xendit retry would dedup).
  try {
    if (event === "payment_session.completed" && data.status === "COMPLETED") {
      const result = await handleSessionCompleted(data, eventId, body);
      revalidateTag("student-invoices", { expire: 0 });
      return NextResponse.json(result);
    }

    if (event === "payment_session.expired") {
      const result = await handleSessionExpired(data, eventId, body);
      if (result.invoiceId) revalidateTag("student-invoices", { expire: 0 });
      return NextResponse.json(result);
    }

    // Unknown event — log derived non-PII fields only.
    console.warn(
      `[XENDIT WEBHOOK] Unhandled event eventId=${eventId} event=${event} payloadKeys=${Object.keys(data).join(",")}`,
    );
    await markIgnored(eventId, "status_not_handled");
    return NextResponse.json({ ok: true, ignored: true, event });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[XENDIT WEBHOOK] Processing failed eventId=${eventId} event=${event}:`,
      errorMessage,
    );
    // ERROR row retained for admin audit. Always return 200 — a Xendit
    // retry of the same eventId would short-circuit at Phase 1 anyway.
    try {
      await prisma.webhookEvent.update({
        where: { eventId },
        data: { status: "ERROR", errorMessage, processedAt: new Date() },
      });
    } catch {
      // Best-effort; the row may have been deleted by an external job.
    }
    return NextResponse.json({ ok: true, error: errorMessage });
  }
}

// ─── Event handlers ───────────────────────────────────────────────

async function handleSessionCompleted(
  data: Record<string, unknown>,
  eventId: string,
  envelope: Record<string, unknown>,
): Promise<{ ok: true; status: string; eventId: string }> {
  const refId =
    typeof data.reference_id === "string" ? data.reference_id : "";
  const sessionId =
    typeof data.payment_session_id === "string"
      ? data.payment_session_id
      : typeof envelope.id === "string"
        ? (envelope.id as string)
        : null;
  const paymentId =
    typeof data.payment_id === "string"
      ? data.payment_id
      : typeof data.payment_session_id === "string"
        ? data.payment_session_id
        : null;
  const amount = typeof data.amount === "number" ? data.amount : null;

  // T5d — amount-mismatch guard: refuse to credit a missing/zero amount.
  // Falling back to invoice.totalDue would mask partial captures and
  // amount-tampering attacks. Mark ERROR + admin reviews via inspector.
  if (amount == null || amount === 0) {
    console.warn(
      `[XENDIT WEBHOOK] Missing/zero amount eventId=${eventId} refId=${refId}`,
    );
    await markError(eventId, "MISSING_AMOUNT");
    return { ok: true, status: "ERROR:missing_amount", eventId };
  }

  if (!paymentId) {
    console.warn(
      `[XENDIT WEBHOOK] Completed event missing payment_id + payment_session_id eventId=${eventId} refId=${refId}`,
    );
    await markError(eventId, "MISSING_PAYMENT_ID");
    return { ok: true, status: "ERROR:missing_payment_id", eventId };
  }

  // T5c — try reference_id first, then fall back to xenditSessionId. Live
  // production payload supplied during /spec showed `reference_id` of
  // "staging-tagihan-<cuid>" (legacy seed prefix) which findUnique misses;
  // the fallback resolves via payment_session_id.
  let invoice = refId
    ? await prisma.invoice.findUnique({ where: { id: refId } })
    : null;
  if (!invoice && sessionId) {
    invoice = await prisma.invoice.findFirst({
      where: { xenditSessionId: sessionId },
    });
    if (invoice) {
      console.warn(
        `[XENDIT WEBHOOK] ref_id_miss_session_fallback eventId=${eventId} refId=${refId} sessionId=${sessionId} paymentId=${paymentId} resolvedInvoiceId=${invoice.id}`,
      );
    }
  }
  if (!invoice) {
    console.warn(
      `[XENDIT WEBHOOK] Invoice not found eventId=${eventId} refId=${refId} sessionId=${sessionId}`,
    );
    await markError(eventId, `INVOICE_NOT_FOUND:ref=${refId};session=${sessionId ?? ""}`);
    return { ok: true, status: "ERROR:invoice_not_found", eventId };
  }
  const invoiceId = invoice.id;

  if (invoice.status === "PAID") {
    await markProcessed(eventId, invoiceId);
    return { ok: true, status: "PAID:already", eventId };
  }

  // Guard CANCELLED. TOCTOU: a retry helper read PENDING_PAYMENT_LINK then
  // made the Xendit network call; meanwhile the void route flipped to
  // CANCELLED. The helper's later DB update may have left xenditSessionId/Url
  // populated on a CANCELLED row, so a parent could still pay the orphan
  // link. Refuse to credit a CANCELLED invoice.
  if (invoice.status === "CANCELLED") {
    console.warn(
      `[XENDIT WEBHOOK] Payment for CANCELLED invoice ${invoice.invoiceNumber} ignored eventId=${eventId}`,
    );
    await markIgnored(eventId, "invoice cancelled", invoiceId);
    return { ok: true, status: "IGNORED:invoice_cancelled", eventId };
  }

  const paymentAmount = amount; // guaranteed non-null by guard above
  const channelCode =
    typeof data.channel_code === "string" ? data.channel_code : "checkout";

  const txOutcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${invoice.id}))`;

    const fresh = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!fresh) return { status: "PAID", overpaid: false } as const;
    if (fresh.status === "PAID") return { status: "PAID", overpaid: false } as const;
    if (fresh.status === "CANCELLED") return { status: "CANCELLED", overpaid: false } as const;

    const existing = await tx.payment.findUnique({
      where: { xenditPaymentId: paymentId },
    });
    if (existing) return { status: fresh.status as string, overpaid: false } as const;

    // T5d — overpayment guard computed INSIDE the lock from authoritative
    // fresh.totalPaid, not from the pre-tx snapshot. Prevents a false
    // negative when two concurrent webhooks with different paymentIds
    // both pre-read totalPaid=0 then both pass the overpayment check.
    // 1 IDR tolerance for Xendit fee/rounding edge cases.
    const remaining =
      Number(fresh.totalDue) - Number(fresh.totalPaid);
    const overpaid = paymentAmount > remaining + 1;

    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: paymentAmount,
        method: "XENDIT",
        xenditPaymentId: paymentId,
        reference: paymentId,
        notes: `Xendit payment via ${channelCode}`,
      },
    });

    const allPayments = await tx.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    const totalPaid = sumDecimals(allPayments.map((p) => p.amount));
    const totalDue = new Prisma.Decimal(invoice.totalDue);
    const status = totalPaid.greaterThanOrEqualTo(totalDue) ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoice.id },
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
      `[XENDIT WEBHOOK] In-tx CANCELLED race on ${invoice.invoiceNumber} eventId=${eventId}`,
    );
    return { ok: true, status: "IGNORED:invoice_cancelled", eventId };
  }

  if (overpaid) {
    await markError(eventId, "OVERPAYMENT_FLAGGED", invoiceId);
    console.warn(
      `[XENDIT WEBHOOK] Overpayment on ${invoice.invoiceNumber}: paid=${paymentAmount} eventId=${eventId}`,
    );
    return { ok: true, status: `OVERPAID:${newStatus}`, eventId };
  }

  await markProcessed(eventId, invoiceId);
  console.log(
    `[XENDIT WEBHOOK] Invoice ${invoice.invoiceNumber} → ${newStatus} eventId=${eventId}`,
  );
  return { ok: true, status: newStatus, eventId };
}

async function handleSessionExpired(
  data: Record<string, unknown>,
  eventId: string,
  envelope: Record<string, unknown>,
): Promise<{
  ok: true;
  status: string;
  eventId: string;
  invoiceId?: string;
}> {
  const refId =
    typeof data.reference_id === "string" ? data.reference_id : "";
  const sessionId =
    typeof data.payment_session_id === "string"
      ? data.payment_session_id
      : typeof envelope.id === "string"
        ? (envelope.id as string)
        : null;

  // T5c fallback — same as completed handler.
  let resolved = refId
    ? await prisma.invoice.findUnique({
        where: { id: refId },
        select: { id: true, status: true, invoiceNumber: true },
      })
    : null;
  if (!resolved && sessionId) {
    resolved = await prisma.invoice.findFirst({
      where: { xenditSessionId: sessionId },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (resolved) {
      console.warn(
        `[XENDIT WEBHOOK] expired ref_id_miss_session_fallback eventId=${eventId} refId=${refId} sessionId=${sessionId} resolvedInvoiceId=${resolved.id}`,
      );
    }
  }
  if (!resolved) {
    await markError(eventId, `INVOICE_NOT_FOUND:ref=${refId};session=${sessionId ?? ""}`);
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
  console.log(
    `[XENDIT WEBHOOK] Invoice ${result.invoiceNumber} → PENDING_PAYMENT_LINK (session expired, soft-revert) eventId=${eventId}`,
  );
  return { ok: true, status: "REVERTED", eventId, invoiceId };
}

async function markProcessed(
  eventId: string,
  invoiceId: string,
): Promise<void> {
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
