/**
 * Diagnostic probe: does DOKU's undocumented `/checkout/v2/payment` endpoint
 * accept our Checkout payload, and does `additional_info.override_notification_url`
 * actually deliver a notification from it?
 *
 * Context — cycle 2026-07-29-doku-all-va-channels. Two settled sandbox VA
 * payments produced ZERO notification attempts in DOKU's own Notification
 * Center. DOKU support (2026-07-30) replied that
 * `additional_info.override_notification_url` "is supported for the API V2
 * Checkout". Their docs publish only `/checkout/v1/payment`, and "v2" in DOKU
 * vocabulary normally means the `BRN-`/`MCH-` merchant generation rather than a
 * URL version — but an unauthenticated probe showed `/checkout/v2/payment` is
 * really routed:
 *
 *   POST /checkout/v9/payment  -> 404 {"message":"No static resource checkout/v9/payment."}
 *   POST /checkout/v2/payment  -> 400 {"code":"invalid_signature",...}
 *
 * A 404-vs-400 split means v2 exists and shares v1's signature scheme. This
 * script is the next step: sign a real request against whichever version you
 * pick and see what comes back.
 *
 * Credentials are read from the environment and never printed. Get them with
 * `vercel env pull .env.doku-probe` (or export them yourself), then:
 *
 *   set -a; . ./.env.doku-probe; set +a
 *   node scripts/doku-probe-checkout.mjs --version v2
 *   node scripts/doku-probe-checkout.mjs --version v1      # control
 *
 * Point the notification somewhere that logs unconditionally to separate
 * "DOKU never sent it" from "DOKU sent it and our route rejected the
 * signature" — the latter leaves no WebhookEvent row, so our own endpoint
 * cannot tell those two apart:
 *
 *   node scripts/doku-probe-checkout.mjs --version v2 --notify https://<bin>/hook
 *
 * Uses sandbox unless DOKU_ENV=production. Mints a real sandbox VA; settle it
 * from https://sandbox.doku.com/integration/simulator/ (the NON-SNAP "Bank BCA"
 * row — Checkout mints non-SNAP VAs, positively confirmed in the cycle doc).
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

const STAGING_WEBHOOK =
  "https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/api/doku/webhook";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const version = arg("version", "v2");
if (!["v1", "v2"].includes(version)) {
  console.error(`--version must be v1 or v2, got "${version}"`);
  process.exit(1);
}
const notificationUrl = arg("notify", STAGING_WEBHOOK);

const clientId = process.env.DOKU_CLIENT_ID;
const secretKey = process.env.DOKU_SECRET_KEY;
if (!clientId || !secretKey) {
  console.error(
    "DOKU_CLIENT_ID and DOKU_SECRET_KEY must be set in the environment.\n" +
      "  vercel env pull .env.doku-probe && set -a; . ./.env.doku-probe; set +a",
  );
  process.exit(1);
}

const baseUrl =
  process.env.DOKU_ENV === "production"
    ? "https://api.doku.com"
    : "https://api-sandbox.doku.com";

// Deliberately synthetic — no real guardian PII leaves the repo, which matters
// because --notify may point at a third-party request bin.
const invoiceNumber = `PROBE-${version.toUpperCase()}-${Date.now()}`;
const returnUrl = "https://example.test/parent/invoices";

// Byte-for-byte the body `createDokuSession` builds (lib/payments/doku/client.ts),
// including payment_method_types, so a difference in outcome is attributable to
// the endpoint version and nothing else.
const payload = {
  order: {
    amount: 10000,
    invoice_number: invoiceNumber,
    currency: "IDR",
    callback_url: returnUrl,
    callback_url_result: returnUrl,
    callback_url_cancel: returnUrl,
    language: "ID",
    auto_redirect: false,
  },
  additional_info: { override_notification_url: notificationUrl },
  payment: {
    payment_due_date: 7 * 24 * 60,
    type: "SALE",
    payment_method_types: [
      "VIRTUAL_ACCOUNT_BCA",
      "VIRTUAL_ACCOUNT_BANK_MANDIRI",
      "VIRTUAL_ACCOUNT_BRI",
      "VIRTUAL_ACCOUNT_BNI",
      "VIRTUAL_ACCOUNT_BANK_PERMATA",
      "VIRTUAL_ACCOUNT_BANK_CIMB",
      "VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI",
      "VIRTUAL_ACCOUNT_BANK_DANAMON",
      "VIRTUAL_ACCOUNT_BTN",
      "VIRTUAL_ACCOUNT_BNC",
      "VIRTUAL_ACCOUNT_DOKU",
    ],
  },
  customer: {
    name: "Probe Wali Murid",
    email: "doku-probe@example.test",
    phone: "6281277226711",
  },
};

// Serialise ONCE — the digest covers these exact bytes and the same string is
// the request body. Re-serialising after signing breaks verification.
const rawBody = JSON.stringify(payload);
const target = `/checkout/${version}/payment`;
const requestId = randomUUID();
const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const digest = createHash("sha256").update(rawBody, "utf8").digest("base64");
const signedString = [
  `Client-Id:${clientId}`,
  `Request-Id:${requestId}`,
  `Request-Timestamp:${timestamp}`,
  `Request-Target:${target}`,
  `Digest:${digest}`,
].join("\n");
const signature = `HMACSHA256=${createHmac("sha256", secretKey)
  .update(signedString, "utf8")
  .digest("base64")}`;

console.log(`POST ${baseUrl}${target}`);
console.log(`  invoice_number           ${invoiceNumber}`);
console.log(`  override_notification_url ${notificationUrl}`);
console.log(`  Request-Id               ${requestId}`);
console.log("");

const response = await fetch(`${baseUrl}${target}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Client-Id": clientId,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    Digest: digest,
    Signature: signature,
  },
  body: rawBody,
});

const text = await response.text();
console.log(`HTTP ${response.status}`);
let parsed = null;
try {
  parsed = JSON.parse(text);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log(text);
}

const payment = parsed?.response?.payment;
if (payment?.url) {
  console.log("");
  console.log("Checkout URL:", payment.url);
  console.log("token_id:    ", payment.token_id ?? "(none)");
  console.log("expires:     ", payment.expired_datetime ?? payment.expired_date ?? "(none)");
  console.log("");
  console.log("Next: open the URL, pick BCA, copy the VA number, settle it at");
  console.log("  https://sandbox.doku.com/integration/simulator/  (NON-SNAP 'Bank BCA')");
  console.log("Then check, in this order:");
  console.log("  1. your --notify destination        (did DOKU send anything at all?)");
  console.log("  2. Back Office > Settings > Notification > HTTP Notifications > Notifikasi");
  console.log("  3. WebhookEvent rows on staging     (did it verify and process?)");
}

process.exit(response.ok ? 0 : 1);
