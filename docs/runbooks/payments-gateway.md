# Runbook — Payment gateway (DOKU / Xendit)

Operational detail for the `PaymentGateway` port in `lib/payments/`. Moved out of README.md 2026-08-20: it is procedure, not product description, and README is the repo's public front page.

Gateway selection is `PAYMENT_GATEWAY` (`xendit` | `doku`; unset → `xendit`). Both adapters sit behind the same port, so switching is an env flip, not a code change.

---

## Health endpoint

`GET /api/health/payments` reports the active gateway. `/api/health/xendit` is kept as an alias for existing monitors.

Tier is derived from the `XENDIT_SECRET_KEY` prefix for Xendit, and from `DOKU_ENV` for DOKU — DOKU's keys do not encode tier the way Xendit's `xnd_development_` / `xnd_production_` prefixes do.

---

## Virtual Account is enforced in the DOKU dashboard, not in code

The checkout request deliberately sends **no `payment_method_types`**, so DOKU offers whatever channels are active on the merchant account. Naming an inactive channel rejects the whole session with `PAYMENT CHANNEL IS INACTIVE` (confirmed by DOKU support 2026-07-30) — and production had neither BCA nor Mandiri active, so a hardcoded list would have produced zero payment links.

**Consequence:** activating a card, QRIS, e-wallet or paylater channel in the DOKU dashboard puts it in front of parents and costs the school card MDR. **Audit the payment-channel settings on both brands before every billing run.**

Each session also sends its own origin as `additional_info.override_notification_url` (`<origin>/api/doku/webhook`). Register the same URL per channel in the dashboard as a fallback in case the override is ignored.

---

## Do not rely on the notification alone

An audit on 2026-07-29 found that **no DOKU notification has ever verified**. Every DOKU payment to date was credited by an admin pressing "Perbarui pembayaran", while the Xendit webhook has real deliveries.

The safety net is a daily cron, `POST /api/cron/reconcile-payments` at 00:30 UTC — deliberately *before* `finance-maintenance` at 01:00, so a paid invoice is not then promoted to OVERDUE. It polls the gateway for every outstanding invoice holding a payment link and credits anything settled, routing through the same processor as the webhook, so it is idempotent and cannot double-credit. A delivered notification still credits immediately and the sweep then no-ops.

Hourly would be better, but **Vercel's Hobby plan allows one cron per day, max two per project** — a deployment carrying `0 * * * *` is rejected outright. Until the plan changes, "Perbarui pembayaran" on the invoice detail page is how an admin credits a payment immediately.

---

## Testing a payment end to end (sandbox)

A sandbox Virtual Account has no bank behind it, so nothing settles on its own — fire the payment yourself from DOKU's sandbox simulator. Paste the VA number from the checkout page and submit; DOKU then sends a real `SUCCESS` notification to `/api/doku/webhook`, which is what moves the invoice to `PAID`. Without the simulator a sandbox invoice sits at `SENT` forever and looks like a bug.

Two places to watch:

1. **Dashboard → notification history** — every delivery attempt with its endpoint URL, transaction status and delivery status.
2. **App logs** — `[DOKU WEBHOOK] inbound { hasSignature, bodyBytes, … }` is written for *every* inbound request before any rejection, then `[DOKU WEBHOOK] signature verified { target: … }` on each accepted one. The first line is what distinguishes "DOKU never sent it" from "DOKU sent it and we rejected it" — a rejected notification writes no `WebhookEvent` row, so the database alone cannot tell them apart.

`DEMO_MODE=true` short-circuits session creation and returns a synthetic URL, so the simulator does not apply under it. It is set only in CI, never on Vercel preview deploys, which talk to the real DOKU sandbox.

---

## `DOKU_CHECKOUT_VERSION` — an open experiment, not a tuning knob

DOKU support stated (2026-07-30) that `override_notification_url` "is supported for the API V2 Checkout". Their docs publish only `POST /checkout/v1/payment`, but `/checkout/v2/payment` is real: as of 2026-07-31 it accepts our exact production body and returns a working checkout link, verified against the sandbox.

v2 answers a **different envelope** — flat (no `response` wrapper), `token` rather than `token_id`, `message` a string rather than an array, no expiry field, and a different link host. The adapter reads both shapes and both live captures are replayed as regression tests.

**But it does not notify either.** A v2 session carrying `override_notification_url`, settled through the sandbox simulator, produced **zero** inbound requests at that URL — while DOKU's own status endpoint reported the payment `SUCCESS` *and echoed the override URL back*. DOKU recorded the settlement, retained the destination, and dispatched nothing; the webhook's unconditional arrival log rules out a signature rejection.

So the flag stays `v1`, the daily reconcile sweep stays the crediting mechanism, and the open item is a DOKU support escalation for their server-side dispatch log. **Flip the flag only after a notification is observed arriving.**

### Running the probe

Prefer **`POST /api/doku/probe`** (bearer `CRON_SECRET`, body `{"version":"v2"}`). `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are marked *Sensitive* in Vercel, so `vercel env pull` returns them empty and there is no local run without copying a live secret onto a laptop. The route creates the session from inside the deployment via the same `createDokuSession` real parents use, writes nothing to the database, and refuses under `DOKU_ENV=production` or `DEMO_MODE`. **Delete the route once notifications are confirmed working.**

`scripts/doku-probe-checkout.mjs --version v2` does the same locally for anyone holding the credentials out-of-band (`--notify <bin-url>`, `--channels` to opt back into `payment_method_types`).

Full history: [`docs/cycles/archive/2026-07-30-doku-checkout-v2-notification.md`](../cycles/archive/2026-07-30-doku-checkout-v2-notification.md), [`docs/cycles/archive/2026-07-31-doku-v2-probe.md`](../cycles/archive/2026-07-31-doku-v2-probe.md).
