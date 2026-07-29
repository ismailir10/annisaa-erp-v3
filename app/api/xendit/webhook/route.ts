// @public — external Xendit webhook, auth via XENDIT_WEBHOOK_TOKEN signature.
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  processPaymentEvent,
  type NormalizedPaymentEvent,
} from "@/lib/payments/webhook-processor";

/**
 * Xendit Payment Session Webhook handler.
 *
 * Reduced in cycle 2026-07-27-doku-payment-gateway T4 to
 * `verify → parse → delegate`: this route owns only the Xendit-specific
 * concerns (rate limit, shared-secret token auth, event-shape parsing, and
 * eventId synthesis for payloads missing a delivery id). Everything after
 * normalization — the two-phase durable-receipt pattern, the advisory-lock
 * transaction, the amount/currency/payment-id guards, overpayment tolerance,
 * and cache-tag busting — lives in `lib/payments/webhook-processor.ts`,
 * shared with `app/api/doku/webhook/route.ts`.
 *
 * Important: NEVER log `payload` content. Only log `eventId` + `eventType`
 * + a small set of derived non-PII fields.
 */
export async function POST(req: NextRequest) {
  // ── Step 0: per-IP rate limit before any parsing. The token check below
  // is the auth boundary; this only caps unauthenticated flood cost. 60/min
  // stays far above Xendit's real delivery bursts (bulk send caps at 25
  // invoices), and a 429 is safe pre-Phase-1 — nothing recorded yet, so a
  // throttled legitimate delivery just retries later.
  const { success } = rateLimit(`xendit-webhook:${getClientIp(req)}`, 60, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

  const eventType = typeof body.event === "string" ? body.event : "";
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
      : `${eventType}:${data.payment_session_id ?? data.id ?? data.reference_id ?? "unknown"}:${data.status ?? "unknown"}:${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16)}`;

  // ── Step 4: normalize the Xendit-specific payload shape.
  const referenceId =
    typeof data.reference_id === "string" && data.reference_id.length > 0
      ? data.reference_id
      : null;
  const sessionId =
    typeof data.payment_session_id === "string"
      ? data.payment_session_id
      : typeof body.id === "string"
        ? body.id
        : null;
  const paymentId =
    typeof data.payment_id === "string"
      ? data.payment_id
      : typeof data.payment_session_id === "string"
        ? data.payment_session_id
        : null;
  const amount = typeof data.amount === "number" ? data.amount : null;
  const currency = typeof data.currency === "string" ? data.currency : null;
  const channelCode = typeof data.channel_code === "string" ? data.channel_code : null;

  let kind: NormalizedPaymentEvent["kind"];
  let ignoreReason: string | undefined;
  if (eventType === "payment_session.completed" && data.status === "COMPLETED") {
    kind = "PAYMENT_COMPLETED";
  } else if (eventType === "payment_session.expired") {
    kind = "SESSION_EXPIRED";
  } else {
    kind = "UNHANDLED";
    ignoreReason = "status_not_handled";
  }

  const normalized: NormalizedPaymentEvent = {
    provider: "xendit",
    eventId,
    eventType: eventType || "unknown",
    kind,
    referenceId,
    sessionId,
    paymentId,
    amount,
    currency,
    channelCode,
    rawPayload: body,
    ignoreReason,
  };

  const { httpStatus, body: responseBody } = await processPaymentEvent(normalized);
  return NextResponse.json(responseBody, { status: httpStatus });
}
