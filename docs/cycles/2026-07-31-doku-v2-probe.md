# DOKU Checkout v2 probe — run the experiment from inside a deployment

## Context

DOKU has never delivered a notification to this merchant. Cycle
`2026-07-29-doku-all-va-channels` root-caused it as far as it could go from the
outside: two settled sandbox VA payments, both showing `Lunas` /
`SUCCESS` on DOKU's side, and **zero** delivery attempts in DOKU's own
Notification Center. Not our signature, not our endpoint, not our code. Every
DOKU `WebhookEvent` row in staging is a `manual.refresh.completed` from the
admin button; Xendit, by contrast, has a real webhook row.

PR #436 (merged to `staging`, `89d48229`) added the two things DOKU support
gave us on 2026-07-30 (ticket `1115484:1806761`):

1. `DOKU_CHECKOUT_VERSION` (`v1`|`v2`, unset → `v1`), because support said
   `additional_info.override_notification_url` "is supported for the API **V2**
   Checkout" and `/checkout/v2/payment` turns out to be genuinely routed
   despite only v1 being documented.
2. Omitting `payment.payment_method_types` entirely, because naming a channel
   that is inactive on the account rejects the *whole* session.

It also added `scripts/doku-probe-checkout.mjs` to run the v1-vs-v2 experiment.
**That probe has never been run**, and this cycle found out why it cannot be:
`DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are marked **Sensitive** in Vercel.
`vercel env pull` returns them as empty strings (verified 2026-07-31 — every
other secret in the same file came back populated, `XENDIT_SECRET_KEY` at 77
chars, the two DOKU vars at 0), and Vercel exposes no read-back API. The
credentials exist in exactly one place we can reach: the running deployment.

A second gap surfaced while reading the code. When the webhook rejects a
notification for a bad signature it returns 401 **before** `processPaymentEvent`
writes the durable `WebhookEvent` receipt, and logs only the string
`[DOKU WEBHOOK] Invalid signature`. So "DOKU never sent it" and "DOKU sent it
and we rejected it" have, until now, produced the same observable: nothing in
the database. Vercel runtime-log retention (checked 2026-07-31 — a 7-day query
returns "likely exceeds your plan's retention") is far too short to answer the
question retroactively.

## Spec

**AC-1** — `POST /api/doku/probe` creates a real DOKU Checkout session from
inside a deployment, on a caller-chosen endpoint version, and returns the
checkout URL. It uses `createDokuSession` — the same function that serves real
parents — so any difference between arms is attributable to the endpoint and
nothing else.

**AC-2** — The probe route is bearer-gated on `CRON_SECRET`, fail-closed,
mirroring `/api/cron/reconcile-payments`. No `vercel-cron/` User-Agent check:
it is invoked by a human, not the scheduler.

**AC-3** — The probe refuses when `DOKU_ENV=production` (it would mint a real
payable VA against the live merchant and burn one of the five transactions the
not-yet-verified production account is capped at) and when `DEMO_MODE=true`
(where `createDokuSession` short-circuits and the run would prove nothing while
looking like it had).

**AC-4** — The probe writes nothing to the database. `referenceId` is a
synthetic `PROBE-…` string, so any notification that does arrive lands as an
unmatched-invoice `WebhookEvent` and can never credit anything.

**AC-5** — Per-call version selection must not mutate `process.env`. A warm
serverless container serves concurrent requests; a mutated
`DOKU_CHECKOUT_VERSION` would leak into a real parent's payment link.

**AC-6** — `/api/doku/webhook` emits one unconditional arrival line before any
rejection path, recording header **presence** (never the secret, the computed
HMAC, or the received signature), body size, path and User-Agent — and, on a
signature miss, the candidate targets that were tried.

**AC-7** — `scripts/doku-probe-checkout.mjs` stops sending the hardcoded eleven
`payment_method_types` that PR #436 removed from the adapter. Omission is the
default; `--channels a,b` re-adds the field deliberately.

**Non-goals** — Flipping `PAYMENT_GATEWAY` on production. Promoting to `main`.
Activating BCA/Mandiri (DOKU Sales, owner action). Rotating the disclosed
secret key.

## Tasks

1. Per-call checkout-version override on `createDokuSession`, off the port.
2. `POST /api/doku/probe`, bearer-gated and environment-guarded.
3. Webhook arrival observability.
4. Probe-script channel-list drift fix.

## Implementation

**T1 — `lib/payments/doku/client.ts`**
Added `CreateDokuSessionOverrides { checkoutVersion?: string }` as an optional
**second argument**, deliberately not a `CreateSessionParams` field, so it is
invisible to the `PaymentGateway` port and the `dokuGateway` wrapper never
passes it — every production call is byte-identical to before. `resolveCheckoutTarget`
now receives `overrides?.checkoutVersion ?? process.env.DOKU_CHECKOUT_VERSION`,
so an absent override falls through to the env flag and an unrecognised value
still throws rather than silently running v1 (AC-5).

**T2 — `app/api/doku/probe/route.ts`** (new)
`CRON_SECRET` bearer, 500 when the secret is unset, 401 on mismatch, 403 under
`DOKU_ENV=production`, 409 under `DEMO_MODE`. Body takes `version` and an
optional `notificationUrl` (defaulting to this deployment's own
`/api/doku/webhook`, which is the point of `override_notification_url`).
`referenceId` is `PROBE-<VERSION>-<epoch>` so DOKU's dashboard, the checkout
page and any notification all name the arm of the experiment. A
`GatewayApiError` is surfaced with its `status`/`code`/`message` — DOKU's own
rejection text (`PAYMENT CHANNEL IS INACTIVE`) is the most informative part of
a failed run and must not be flattened into a generic 502.

**T3 — `app/api/doku/webhook/route.ts`**
One `console.info("[DOKU WEBHOOK] inbound", …)` before the header check,
carrying booleans only for the four auth headers plus `hasSecretKey` (a missing
server-side key is our misconfiguration, not DOKU's, and worth telling apart at
a glance), `bodyBytes`, `path`, `userAgent`. The two 401 branches now say which
one fired — missing header vs no candidate target matched — and the latter logs
the candidate list, since an inbound target we never guessed is the likeliest
cause and `DOKU_NOTIFICATION_TARGET` is the fix.

**T4 — `scripts/doku-probe-checkout.mjs`**
`payment_method_types` omitted by default via `...(channels && {…})`, opt-in
through `--channels`. Header comment corrected: `vercel env pull` does not work
for these credentials, and points at the new route instead.

**T5 — raw-envelope capture** (added after the first live run)
The first signed call to `/checkout/v2/payment` returned **2xx** and then
failed on `[DOKU] Session response missing payment.url`, while the v1 control
returned a working checkout link. That is the single most informative result of
the cycle — v2 accepts our exact body — but the adapter distils the envelope
and discards it, so what v2 *answered* was unobservable. Added
`captureRaw?: (envelope: unknown) => void` to `CreateDokuSessionOverrides`,
invoked with the parsed success envelope before distillation and therefore
before that throw. A callback rather than a `console.log` because a Checkout
envelope can carry a VA number, and rather than widening the thrown error
because that error sits on the real parent-facing path. The route holds the
captured value outside the `try`, so a failed distillation still reports it.

## Verification

- `npm run build && npx vitest run` — recorded below.
- Playwright: deferred to the required CI `Playwright E2E` check. No
  parent/admin-facing surface changed; the probe route is bearer-gated and has
  no UI.
- Preview-verify: the probe route has no UI to walk. Verified instead by
  calling `POST /api/doku/probe` against the preview deployment with the
  `CRON_SECRET` bearer — results below.

### Live run — preview `feat/doku-v2-probe`, 2026-07-31

Preview health: `{"ok":true,"source":"doku","tier":"sandbox"}` — real DOKU
sandbox, not `DEMO_MODE`.

**v1 (control)** — `PROBE-V1-1785464553873`, HTTP 200:

```
token_id    09c53a328e2d446599d367948384dd8420262231092234044
paymentUrl  https://staging.doku.com/checkout-link-v2/09c53a32…
expiresAt   2026-08-01T02:22:33Z
```

**v2** — `PROBE-V2-1785464554736`:
`{"ok":false,"message":"[DOKU] Session response missing payment.url"}`

That failure is **not** an HTTP error. `createDokuSession` throws
`GatewayApiError` for any non-OK response and the probe reports it as a 502
with DOKU's own `error_messages`; this run reached the *success* path and fell
over on distillation instead. So `/checkout/v2/payment` **accepted a signed
request carrying our exact production body and answered 2xx** — the signature
scheme, the headers and the payload all validate on v2. It simply does not
answer with `response.payment.url` the way v1 does. What it answers with is
what T5 was added to capture; run recorded in the next section once the
redeployed preview is live.

Incidental confirmation: v1's `paymentUrl` host is
`staging.doku.com/checkout-link-**v2**/…`. DOKU's *link* generation has been
"v2" all along while the *API* path we post to is v1 — which is exactly the
kind of vocabulary collision that makes support's "supported for the API V2
Checkout" ambiguous, and is worth quoting back at them.

## Ship Notes

- **New env var:** none. The route reuses `CRON_SECRET`, `DOKU_CLIENT_ID`,
  `DOKU_SECRET_KEY`, `DOKU_ENV`, `DOKU_CHECKOUT_VERSION`, all already set.
- **New route:** `POST /api/doku/probe`. Bearer-gated, sandbox-only, writes
  nothing. **Delete it once DOKU notifications are confirmed working end to
  end** — it exists to answer one question.
- **Migrations:** none.
- **Rollback:** revert the commit. `DOKU_CHECKOUT_VERSION` stays unset →
  `v1` → today's behaviour.
- **Still open before the prod cutover** (unchanged by this cycle): activate
  BCA + Mandiri via DOKU Sales; audit both Back Office accounts for non-VA
  channels now that the VA-only guarantee lives there and not in code; get BTN
  + BNC Checkout-activated; finish account verification; rotate the disclosed
  secret key; promote to `main` so the daily reconcile cron registers on
  production.
