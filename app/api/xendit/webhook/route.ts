// @public — external Xendit webhook, auth via XENDIT_WEBHOOK_TOKEN signature.
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual, createHash } from "crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * Xendit Payment Session Webhook handler.
 *
 * Scope: only `payment_session.completed` and `payment_session.expired`
 * events affect Invoice state. Every other event is logged + IGNORED with
 * 200 (Xendit does not retry on 200).
 *
 * Idempotency: every inbound webhook is INSERTed into `WebhookEvent` with
 * UNIQUE on `eventId`. A duplicate Xendit delivery hits P2002 and 200s
 * immediately — race-free dedup at the DB layer.
 *
 * On transient throw mid-processing: the WebhookEvent row is DELETED so
 * the next provider retry can re-INSERT cleanly. Xendit caps retries
 * (typically 5×) so a permanently-failing payload eventually stops; the
 * operator should monitor `WebhookEvent` for FAILED rows during deploy.
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

  // ── Step 5: business logic. On any throw, DELETE the audit row so the
  // ── provider retry can re-INSERT cleanly.
  try {
    if (event === "payment_session.completed" && data.status === "COMPLETED") {
      const result = await handleSessionCompleted(data, eventId);
      revalidateTag("student-invoices", {});
      return NextResponse.json(result);
    }

    if (event === "payment_session.expired") {
      const result = await handleSessionExpired(data, eventId);
      if (result.invoiceId) revalidateTag("student-invoices", {});
      return NextResponse.json(result);
    }

    // Unknown event — log derived non-PII fields only.
    console.warn(
      `[XENDIT WEBHOOK] Unhandled event eventId=${eventId} event=${event} payloadKeys=${Object.keys(data).join(",")}`,
    );
    await prisma.webhookEvent.update({
      where: { eventId },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, ignored: true, event });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[XENDIT WEBHOOK] Processing failed eventId=${eventId} event=${event}:`,
      errorMessage,
    );
    // DELETE so the provider retry inserts cleanly.
    // Xendit caps retries (~5×); a permanent-poison payload eventually stops.
    try {
      await prisma.webhookEvent.delete({ where: { eventId } });
    } catch {
      // Ignore delete errors — best-effort cleanup.
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

// ─── Event handlers ───────────────────────────────────────────────

async function handleSessionCompleted(
  data: Record<string, unknown>,
  eventId: string,
): Promise<{ ok: true; status: string; eventId: string }> {
  const invoiceId =
    typeof data.reference_id === "string" ? data.reference_id : "";
  const paymentId =
    typeof data.payment_id === "string"
      ? data.payment_id
      : typeof data.payment_session_id === "string"
        ? data.payment_session_id
        : null;
  const amount = typeof data.amount === "number" ? data.amount : null;

  if (!invoiceId) {
    await markIgnored(eventId, "missing reference_id");
    return { ok: true, status: "IGNORED:missing_reference_id", eventId };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });
  if (!invoice) {
    console.warn(
      `[XENDIT WEBHOOK] Invoice not found eventId=${eventId} invoiceId=${invoiceId}`,
    );
    await markIgnored(eventId, "invoice not found", invoiceId);
    return { ok: true, status: "IGNORED:invoice_not_found", eventId };
  }

  if (invoice.status === "PAID") {
    await markProcessed(eventId, invoiceId);
    return { ok: true, status: "PAID:already", eventId };
  }

  const paymentAmount = amount ?? Number(invoice.totalDue);
  const channelCode =
    typeof data.channel_code === "string" ? data.channel_code : "checkout";

  const newStatus = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoice.id}))`;

    const fresh = await tx.invoice.findUnique({ where: { id: invoice.id } });
    if (!fresh || fresh.status === "PAID") return "PAID";

    const existing = paymentId
      ? await tx.payment.findFirst({
          where: { invoiceId: invoice.id, reference: paymentId },
        })
      : null;
    if (existing) return fresh.status as string;

    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: paymentAmount,
        method: "XENDIT",
        reference: paymentId,
        notes: `Xendit payment via ${channelCode}`,
      },
    });

    const allPayments = await tx.payment.findMany({
      where: { invoiceId: invoice.id },
    });
    const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const status =
      totalPaid >= Number(invoice.totalDue) ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        totalPaid,
        status,
        paidAt: status === "PAID" ? new Date() : null,
      },
    });
    return status;
  });

  await markProcessed(eventId, invoiceId);
  console.log(
    `[XENDIT WEBHOOK] Invoice ${invoice.invoiceNumber} → ${newStatus} eventId=${eventId}`,
  );
  return { ok: true, status: newStatus, eventId };
}

async function handleSessionExpired(
  data: Record<string, unknown>,
  eventId: string,
): Promise<{
  ok: true;
  status: string;
  eventId: string;
  invoiceId?: string;
}> {
  const invoiceId =
    typeof data.reference_id === "string" ? data.reference_id : "";
  if (!invoiceId) {
    await markIgnored(eventId, "missing reference_id");
    return { ok: true, status: "IGNORED:missing_reference_id", eventId };
  }

  // Wrap in a transaction with the same advisory lock the completed path
  // uses, so a concurrent `payment_session.completed` for the same invoice
  // can't race us into a stale CANCELLED state.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
    const fresh = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (!fresh) {
      return { type: "IGNORED:invoice_not_found" as const, invoiceNumber: "" };
    }
    if (fresh.status === "PAID" || fresh.status === "CANCELLED") {
      return {
        type: `${fresh.status}:no_change` as const,
        invoiceNumber: fresh.invoiceNumber,
      };
    }
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "CANCELLED",
        xenditSessionId: null,
        xenditPaymentUrl: null,
      },
    });
    return { type: "CANCELLED" as const, invoiceNumber: fresh.invoiceNumber };
  });

  if (result.type === "IGNORED:invoice_not_found") {
    await markIgnored(eventId, "invoice not found", invoiceId);
    return { ok: true, status: "IGNORED:invoice_not_found", eventId };
  }
  await markProcessed(eventId, invoiceId);
  if (result.type === "CANCELLED") {
    console.log(
      `[XENDIT WEBHOOK] Invoice ${result.invoiceNumber} → CANCELLED (session expired) eventId=${eventId}`,
    );
  }
  return { ok: true, status: result.type, eventId, invoiceId };
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
