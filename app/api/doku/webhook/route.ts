// @public — external DOKU webhook notification, auth via HMAC signature (A2).
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildDigest, buildSignature } from "@/lib/payments/doku/signature";
import { stripQuery } from "@/lib/payments/xendit/client";
import {
  processPaymentEvent,
  type NormalizedPaymentEvent,
} from "@/lib/payments/webhook-processor";

/**
 * DOKU Checkout notification handler.
 *
 * Order of operations mirrors `app/api/xendit/webhook/route.ts` — rate limit
 * → signature verify → parse → normalize → delegate to the shared
 * `processPaymentEvent` (cycle 2026-07-27-doku-payment-gateway T4).
 *
 * DOKU retries a non-2xx notification at +30 min / +6 h / +12 h (3
 * attempts), so returning 5xx here is a 12-hour credit delay, not a lost
 * payment — but an UNVERIFIED notification must NEVER credit (AC-11). Only
 * rate-limit / signature / malformed-body failures return non-2xx from this
 * route directly; everything else (including business-logic errors) is
 * owned by `processPaymentEvent`, which always returns 200 once the durable
 * WebhookEvent receipt exists (or 500 only if that very insert fails).
 *
 * Important: never log the secret key, the computed HMAC, or the received
 * signature — only which candidate `Request-Target` matched.
 */
export async function POST(req: NextRequest) {
  // ── Step 1: per-IP rate limit before any parsing/auth — matches the
  // Xendit route's ordering; a dedicated test asserts 429 fires before the
  // signature check.
  const { success } = rateLimit(`doku-webhook:${getClientIp(req)}`, 60, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // ── Step 2: read the raw body EXACTLY ONCE as text. The digest is
  // computed over these exact bytes, and the same string is later
  // JSON.parse'd — re-serialising a parsed object would change the bytes
  // and break verification on our side just as surely as on DOKU's (AC-6
  // applies symmetrically to an inbound notification).
  const rawBody = await req.text();

  // ── Step 3: signature verification (AC-11 / A2).
  const clientId = req.headers.get("Client-Id");
  const requestId = req.headers.get("Request-Id");
  const signature = req.headers.get("Signature");
  const timestamp =
    req.headers.get("Request-Timestamp") ?? req.headers.get("Response-Timestamp");
  const secretKey = process.env.DOKU_SECRET_KEY;

  if (!secretKey || !clientId || !requestId || !signature || !timestamp) {
    console.error("[DOKU WEBHOOK] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const digest = buildDigest(rawBody);
  const url = new URL(req.url);

  // Candidate Request-Target values, tried in order — see A2 in the cycle
  // doc for why the inbound target is undocumented and both DOKU-side and
  // our-side candidates must be tried.
  const candidates: string[] = [];
  if (process.env.DOKU_NOTIFICATION_TARGET) {
    candidates.push(process.env.DOKU_NOTIFICATION_TARGET);
  }
  candidates.push(url.pathname);
  candidates.push(stripQuery(req.url) ?? `${url.origin}${url.pathname}`);

  let matchedTarget: string | null = null;
  for (const target of candidates) {
    const expected = buildSignature({
      clientId,
      requestId,
      timestamp,
      target,
      digest,
      secretKey,
    });
    // Guard the length check first — timingSafeEqual throws on unequal
    // length buffers, mirroring the Xendit route's token comparison.
    if (
      expected.length === signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      matchedTarget = target;
      break;
    }
  }

  if (!matchedTarget) {
    console.error("[DOKU WEBHOOK] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  console.info("[DOKU WEBHOOK] signature verified", { target: matchedTarget });

  // ── Step 4: parse body.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    console.error("[DOKU WEBHOOK] Malformed JSON body");
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  // ── Step 5: normalize the DOKU-specific payload shape.
  const transaction = (
    payload.transaction && typeof payload.transaction === "object"
      ? payload.transaction
      : {}
  ) as Record<string, unknown>;
  const order = (
    payload.order && typeof payload.order === "object" ? payload.order : {}
  ) as Record<string, unknown>;
  const channel = (
    payload.channel && typeof payload.channel === "object" ? payload.channel : {}
  ) as Record<string, unknown>;

  const invoiceNumber =
    typeof order.invoice_number === "string" ? order.invoice_number : "";
  const originalRequestId =
    typeof transaction.original_request_id === "string" &&
    transaction.original_request_id.length > 0
      ? transaction.original_request_id
      : null;

  const eventId =
    originalRequestId ??
    `doku:${invoiceNumber}:${transaction.status}:${createHash("sha256").update(rawBody).digest("hex").slice(0, 16)}`;
  const eventType = `doku.${(transaction.status as string | undefined) ?? "unknown"}`;

  let kind: NormalizedPaymentEvent["kind"];
  let ignoreReason: string | undefined;
  if (transaction.status === "SUCCESS") {
    kind = "PAYMENT_COMPLETED";
  } else if (transaction.status === "FAILED" || transaction.status === "VOIDED") {
    kind = "UNHANDLED";
    ignoreReason = "status_not_completed";
  } else if (transaction.status === "REFUNDED") {
    // Surfaced to admin as an ERROR, never silently ignored (AC-14) — the
    // shared processor special-cases this reason string.
    kind = "UNHANDLED";
    ignoreReason = "REFUND_UNHANDLED";
  } else {
    kind = "UNHANDLED";
    ignoreReason = "status_not_handled";
  }

  // DOKU sends `order.amount` as an integer on most channels but as a float
  // (e.g. `20000.00`) on some — coerce and reject non-finite values rather
  // than crediting a NaN/undefined amount.
  const amountRaw = order.amount;
  const amountCoerced =
    typeof amountRaw === "number" || typeof amountRaw === "string"
      ? Number(amountRaw)
      : NaN;
  const amount = Number.isFinite(amountCoerced) ? amountCoerced : null;

  const amountDetails =
    transaction.amount_details && typeof transaction.amount_details === "object"
      ? (transaction.amount_details as Record<string, unknown>)
      : null;
  const currency =
    amountDetails && typeof amountDetails.currency === "string"
      ? amountDetails.currency
      : null;

  const channelCode = typeof channel.id === "string" ? channel.id : null;

  const normalized: NormalizedPaymentEvent = {
    provider: "doku",
    eventId,
    eventType,
    kind,
    // T3 sets order.invoice_number to the bare invoice.id — direct
    // findUnique, no string surgery (A3).
    referenceId: invoiceNumber.length > 0 ? invoiceNumber : null,
    // DOKU notifications carry no session/token id.
    sessionId: null,
    paymentId: originalRequestId,
    amount,
    currency,
    channelCode,
    rawPayload: payload,
    ignoreReason,
  };

  const { httpStatus, body } = await processPaymentEvent(normalized);
  return NextResponse.json(body, { status: httpStatus });
}
