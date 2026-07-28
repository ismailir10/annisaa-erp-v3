# DOKU — Offer Every Documented Virtual Account Channel

## Context

Cycle [2026-07-27-doku-payment-gateway](2026-07-27-doku-payment-gateway.md) shipped the DOKU Checkout adapter with a hardcoded set of **six** Virtual Account channels in `lib/payments/doku/client.ts`:

```
VIRTUAL_ACCOUNT_BCA, VIRTUAL_ACCOUNT_BANK_MANDIRI, VIRTUAL_ACCOUNT_BRI,
VIRTUAL_ACCOUNT_BNI, VIRTUAL_ACCOUNT_BANK_PERMATA, VIRTUAL_ACCOUNT_BANK_CIMB
```

That subset was never justified by a decision — the 2026-07-27 cycle's "Channels" row decided *Virtual Account only* (to avoid card MDR and to match the parent-portal copy "Transfer bank (Virtual Account)"), not *these six VAs only*. DOKU Checkout documents **eleven**. The five omitted ones are BSI, Danamon, BTN, BNC and DOKU's own VA.

**User harm:** a guardian whose only bank account is BSI, BTN, Danamon or BNC is shown a DOKU checkout page with no channel they can use. An Nisaa' is an Islamic school — **Bank Syariah Indonesia is a plausible primary bank for a meaningful share of families**, and it was missing. The invoice stays unpaid and neither the parent nor the admin sees a reason why.

### Verified against DOKU, 2026-07-29

Enum strings taken verbatim from developers.doku.com → DOKU Checkout → [Supported Payment Methods](https://developers.doku.com/accept-payments/doku-checkout/supported-payment-methods). The complete documented Virtual Account set is:

| Bank | Enum | Was in the six? |
|---|---|---|
| BCA | `VIRTUAL_ACCOUNT_BCA` | ✅ |
| Bank Mandiri | `VIRTUAL_ACCOUNT_BANK_MANDIRI` | ✅ |
| BRI | `VIRTUAL_ACCOUNT_BRI` | ✅ |
| BNI | `VIRTUAL_ACCOUNT_BNI` | ✅ |
| Permata | `VIRTUAL_ACCOUNT_BANK_PERMATA` | ✅ |
| CIMB | `VIRTUAL_ACCOUNT_BANK_CIMB` | ✅ |
| Bank Syariah Indonesia | `VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI` | ❌ added |
| Danamon | `VIRTUAL_ACCOUNT_BANK_DANAMON` | ❌ added |
| BTN | `VIRTUAL_ACCOUNT_BTN` | ❌ added |
| BNC | `VIRTUAL_ACCOUNT_BNC` | ❌ added |
| DOKU VA | `VIRTUAL_ACCOUNT_DOKU` | ❌ added |

### Channels DOKU activates but Checkout does not document

The merchant's production DOKU account has **Maybank, Sinarmas, BJB and Sahabat Sampoerna** active in Back Office → Settings → Payment Settings → Virtual Account. None appears in the documented Checkout `payment_method_types` list. `VIRTUAL_ACCOUNT_MAYBANK` and `VIRTUAL_ACCOUNT_SINARMAS` do appear in a sample *response* in DOKU's backend-integration docs, but not in the supported-methods table; no `VIRTUAL_ACCOUNT_BJB` or Sahabat Sampoerna equivalent was found anywhere.

Guessing enum strings from an undocumented sample would risk a `400 error_messages` on **every** session creation — i.e. no parent could get a payment link at all. Deliberately out of scope; a support ticket to DOKU is the right way to resolve it, tracked in Ship Notes.

### Back Office findings from the same session (config, not code)

Discovered while tracing where a notification URL is actually configured. Recorded here because they gate the cutover, not this diff:

- The notification URL is **per channel**, at Settings → Payment Settings → Virtual Account → *[channel]* Configure → "Payment Notification URL". Settings → Notification → HTTP Notifications is *not* it (that page only carries a failure-alert email toggle; its Notifikasi tab is the per-delivery log).
- Sandbox: Mandiri / BCA / BNI / BRI carry the staging webhook URL. **Permata and CIMB are empty** (verified by reading the input values out of the DOM). Expanding the channel list makes five more empties, not two.
- Production account shows "Your onboarding is almost complete! Get your account verified to start unlimited transactions", and its channel list has **no BCA and no Mandiri**.

## Spec

**AC-1** `DOKU_VIRTUAL_ACCOUNT_METHODS` contains exactly the eleven documented DOKU Checkout Virtual Account enum values, in the documented order.

**AC-2** Every entry starts with `VIRTUAL_ACCOUNT_`. No `CREDIT_CARD`, `QRIS`, `EMONEY_*`, `PEER_TO_PEER_*`, `DIRECT_DEBIT_*` or `KARTU_KREDIT_INDONESIA` — the 2026-07-27 card-MDR decision and the "Transfer bank (Virtual Account)" portal copy both still hold.

**AC-3** A unit test pins the literal eleven-element list. The pre-existing create-session body assertion compares `body.payment.payment_method_types` against the constant itself, so it cannot detect a channel being dropped — the new test must assert against a literal.

**AC-4** Admin activity rows render every new `channel.id` as readable Bahasa, not a raw enum.

**Non-goals.** No env-driven channel list. No Maybank/Sinarmas/BJB/Sampoerna guesswork. No change to signature, notification parsing, retry, or the webhook processor. No Prisma change — `Payment.method` stays `"DOKU"`; the channel lands in the webhook payload, not a column.

**Assumption, stated because it is not verified.** DOKU is assumed to ignore or gracefully omit a requested channel that is not activated on the merchant account, rather than rejecting the whole session with a 400. This matters because production currently lacks BCA and Mandiri while the constant requests them. Unverifiable from this harness — creating a real session needs the DOKU secret, which lives only in Vercel. **The first sandbox checkout after deploy is the test**; see Verification.

### Second pass — the rest of the Checkout request body

After the channel work, the [full request schema](https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration) was reviewed field by field against what the adapter actually sends. Four gaps, one of them serious:

| Field | Was | Now | Why it matters |
|---|---|---|---|
| `order.callback_url_cancel` | **dropped** | `cancelReturnUrl` | The caller has always computed `cancelReturnUrl` and passed it in `CreateSessionParams`; the DOKU adapter silently ignored it. The Xendit adapter has always honoured it. A parent cancelling out of DOKU went nowhere defined. |
| `order.callback_url` | unset | `cancelReturnUrl` | Powers the "Back to Merchant" button *on* the VA-instructions page. Without it a parent staring at a VA number has no route back to the portal. |
| `order.language` | unset | `"ID"` | Every parent-facing surface in Talib is Bahasa (`.claude/standards/voice.md`). An English DOKU page mid-flow is a comprehension cliff for the Ibu Nur persona. |
| `payment.type` | unset | `"SALE"` | Explicit capture. The alternatives (`INSTALLMENT`, `AUTHORIZE`) are credit-card only and would be wrong here. |

And the one that changes the risk profile of the whole integration:

**`additional_info.override_notification_url`** — DOKU accepts a per-transaction notification URL that **outranks the per-channel Back Office setting**. That directly defuses the failure mode this cycle would otherwise have widened: going 6 → 11 channels means five more Back Office fields to fill by hand, and *an unconfigured channel still takes the parent's money* — DOKU just has nowhere to deliver the settlement notice, so the invoice sits at `SENT` with no error anywhere.

Sending the origin the request arrived on also makes preview deploys self-notifying instead of pointing at staging's webhook.

Kept as belt-and-braces, not a replacement: the Back Office values stay configured. If DOKU ever ignores the override, the Back Office value is the only thing standing between a settled payment and a stalled invoice.

**`customer.phone` normalisation.** DOKU documents the field as "phone with calling code", max 16. Guardian numbers are hand-entered and arrive as `081234567890`, `+62 812-3456-7890`, `0812 3456 7890`. A malformed value can fail the *whole* session, costing the parent their payment link over formatting. `normalizePhoneForDoku` converts to `62…` digits-only and returns `undefined` — omitting the optional field — whenever it cannot normalise confidently (too short, too long, non-Indonesian prefix). `customer.name` and `customer.email` are truncated to DOKU's 255 / 128 caps for the same reason.

### Reviewed and deliberately not adopted

- `recover_abandoned_cart` / `expired_recovered_cart` — VA-eligible, but invoice regeneration is already owned by `lib/finance/run-bulk-retry.ts`. Two competing recovery mechanisms is worse than one.
- `disable_retry_payment` — documented for CC / DOKU Wallet / Akulaku / OVO / ShopeePay, none of which are enabled.
- `additional_info.allow_tenor` — instalment tenors, credit-card only.
- `shipping_address` / `billing_address` — mandatory only for Kredivo / Indodana paylater. Sending a school's address as a shipping address is noise.
- `line_items[].sku` / `category` / `url` / `image_url` / `type` — required only for paylater channels.
- `customer.id` — enables tokenisation, which is a card feature. Not worth handing DOKU another identifier for zero VA benefit.

### Frontend integration (`loadJokulCheckout`) — evaluated, declined (CTO, 2026-07-29)

DOKU ships a [JS library](https://developers.doku.com/accept-payments/doku-checkout/integration-guide/frontend-integration) (`jokul-checkout-1.0.0.js`, served from `sandbox.doku.com` or `jokul.doku.com`) that renders checkout as a modal overlay instead of a redirect. The parent portal currently opens `invoice.xenditPaymentUrl` in a new tab (`app/parent/invoices/invoice-detail-sheet.tsx:316`).

Declined for this cycle. The modal's whole value proposition is *the customer completes payment without leaving your page* — and that does not describe Virtual Account. The parent receives a VA number and leaves to pay at an ATM or in mobile banking, often hours later; the 2026-07-27 cycle already recorded this as the defining behavioural difference from Xendit's card flow. They leave either way. Worse, dismissing a modal can take the VA number with it, whereas a tab keeps it available to re-read.

The cost is concrete, and it is security surface:

- `script-src` must gain `sandbox.doku.com` + `jokul.doku.com`. Cycle 2026-07-27 T5 deliberately left `script-src` alone on the grounds that "DOKU Checkout is a full-page redirect, not a JS SDK" — this would reverse that.
- `frame-src` would need `*.doku.com` too. There is no `frame-src` directive today, so it inherits `default-src 'self'` and the overlay's frame would be blocked the moment CSP graduates from Report-Only to enforcing.
- The script is version-pinned at 1.0.0 with no SRI hash on offer — unpinned third-party JS on an authenticated portal page, loaded for every parent viewing an invoice, not just those paying.
- The script URL is tier-specific, so `DOKU_ENV` (server-only today) would have to reach the client.
- The portal would have to branch on `gateway === "doku"`, putting gateway-specific knowledge back into a surface the `PaymentGateway` port exists to keep neutral.

Revisit if non-VA channels are ever enabled, since a card or e-wallet flow *does* complete in-session. Until then it is CSP risk bought for no parent-visible gain.

## Tasks

1. Expand `DOKU_VIRTUAL_ACCOUNT_METHODS` to the eleven documented values, with a comment recording the source and the deliberate VA-only scope.
2. Add unit tests pinning the literal list (AC-3) and asserting the `VIRTUAL_ACCOUNT_` prefix invariant (AC-2).
3. Confirm the admin activity-card channel formatter handles the five new values (AC-4).
4. Send `callback_url`, `callback_url_cancel`, `language: "ID"` and `payment.type: "SALE"`; add `notificationUrl` to `CreateSessionParams` and map it to `additional_info.override_notification_url`.
5. Normalise `customer.phone` to DOKU's calling-code form; cap `customer.name` / `customer.email` at DOKU's documented lengths.
6. Make a missing guardian email observable at session-creation time.

## Implementation

**Task 1 — `lib/payments/doku/client.ts`**
`DOKU_VIRTUAL_ACCOUNT_METHODS` goes from 6 → 11 entries. The doc comment now records the source page, the re-verification date, the VA-only scope rationale, and why Maybank/Sinarmas/BJB/Sampoerna are excluded. No other line in the file changes — `createDokuSession` already spreads the constant into `payment.payment_method_types`, so the wire change is entirely data.

**Task 2 — `lib/payments/doku/__tests__/client.test.ts`**
New `describe("DOKU_VIRTUAL_ACCOUNT_METHODS")` block with two tests: a literal eleven-element equality assertion, and a prefix-invariant loop.

**Task 3 — `components/admin/invoices/payment-activity-card.tsx`** — *no change needed.*
`formatPaymentMethod` strips the `VIRTUAL_ACCOUNT_` prefix and title-cases the remaining words, keeping members of `CHANNEL_ACRONYMS` uppercase. That set already contains `BTN`, `BNC` and `DOKU`. All five new channels render correctly as-is:

| Enum | Rendered |
|---|---|
| `VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI` | Virtual Account Bank Syariah Mandiri |
| `VIRTUAL_ACCOUNT_BANK_DANAMON` | Virtual Account Bank Danamon |
| `VIRTUAL_ACCOUNT_BTN` | Virtual Account BTN |
| `VIRTUAL_ACCOUNT_BNC` | Virtual Account BNC |
| `VIRTUAL_ACCOUNT_DOKU` | Virtual Account DOKU |

**Tasks 4-5 — `lib/payments/types.ts`, `lib/payments/doku/client.ts`**
`CreateSessionParams` gains optional `notificationUrl`. The DOKU adapter adds `callback_url`, `callback_url_cancel`, `language`, `payment.type`, conditional `additional_info`, the `normalizePhoneForDoku` helper (exported for testing), and length caps on name/email. The Xendit adapter ignores `notificationUrl` — its callback URL is account-global.

**Task 6 — `lib/payments/session.ts`**
Passes `notificationUrl: ${appOrigin}/api/doku/webhook`. Adds `customerEmailPresent` (a boolean — never the address, which is PII that `lib/webhook/redact-payload.ts` strips everywhere else) to the existing `[PAYMENT SESSION CREATED]` line, plus a `[PAYMENT SESSION NO CUSTOMER EMAIL]` warn carrying `hasPrimaryGuardian` so the two distinct causes — no primary guardian vs. primary guardian with no address — are separable in logs.

## Verification

**Gates — run in the worktree, output verbatim.**

```
npm run build   → compiled successfully (all routes emitted)
npx tsc --noEmit → exit 0
npx vitest run  → Test Files  245 passed | 2 skipped (247)
                  Tests  2397 passed | 42 todo (2439)
```

Baseline before this cycle was 2383 passed; the 14 added tests cover the pinned channel list, the prefix invariant, phone normalisation (5 valid shapes + 6 reject cases + the 16-char cap), the three return URLs, `language`, `payment.type`, `additional_info` presence *and* absence, phone omission on unnormalisable input, and the four guardian-contact passthrough cases.

**Playwright:** deferred to the required CI `Playwright E2E` check. No e2e spec exercises a real DOKU session — previews run `DEMO_MODE=true`, which short-circuits `createDokuSession` before the request body is built, so none of this diff is reachable from a browser test.

**Preview-verify:** not meaningful for this diff, same reason — `DEMO_MODE` returns a synthetic session without constructing the payload. The request body is covered by unit tests against a stubbed `fetch`; the real contract test is the first sandbox checkout (below).

**Not verified — stated plainly.** No live DOKU call was made. The secret lives only in Vercel and this harness has no access to it, so every claim about how DOKU *responds* to the new body rests on documentation, not observation. Two things the first sandbox checkout must confirm:

1. DOKU tolerates the five newly-requested channels on an account where some are inactive (production has neither BCA nor Mandiri) — filtering them rather than 400-ing the session.
2. `override_notification_url` is honoured, i.e. the notification arrives at the origin that created the session. The webhook logs `[DOKU WEBHOOK] signature verified { target: … }` on every accepted delivery, and Back Office → Settings → Notification → HTTP Notifications → Notifikasi lists the endpoint URL and delivery status per attempt.

**Production data check (read-only, `vxwywmvpxetdgnxejjgk`):** see Ship Notes — the gating problem is not code.

**How to actually test a payment (sandbox).** A sandbox VA has no bank behind it, so nothing settles by itself. Fire the payment from [DOKU's sandbox simulator](https://sandbox.doku.com/integration/simulator/): paste the VA number off the checkout page, submit, and DOKU delivers a real `SUCCESS` notification to `/api/doku/webhook` — that is what moves the invoice to `PAID`. Skipping this step leaves the invoice at `SENT` and reads as a bug. Recorded in README footnote ⁴ so it is findable outside this cycle doc.

**Frontend:** no `app/**/*.tsx`, `components/**/*.tsx` or CSS in this diff; the admin activity card was read and confirmed to need no change (Task 3), not modified.

## Ship Notes

### Migrations

**None.** Data-only change to a request body array.

### Env vars

**None added or changed.**

### BLOCKER — no parent can be notified, and it is not a code problem

Prompted by "make sure we pass guardian email to DOKU so parents get notified". The code path was already correct: `lib/payments/session.ts` passes `guardianParent?.email`, the adapter spreads it into `customer.email`, and both DOKU accounts have all five customer email notifications enabled (Back Office → Settings → Notification → Checkout Page Email Notification: Pesanan Baru / Berhasil / Gagal / Kedaluwarsa / akan Kedaluwarsa, channel Email).

The data is the problem. Read-only query against production (`vxwywmvpxetdgnxejjgk`), 2026-07-29:

| Metric | Count |
|---|---|
| Parents | 307 |
| **Parents with an email address** | **1** |
| Parents with WhatsApp | 76 |
| Parents with phone | 77 |
| Students | 179 |
| — with no primary guardian at all | 25 |
| — primary guardian on file, but no email | 154 |
| **— whose primary guardian would receive a DOKU email** | **0** |

**Zero of 179 students** would have a guardian receive the Virtual Account number. Under VA the parent must be *told* the number — there is no redirect-and-pay moment — so shipping DOKU billing against this data means issuing 179 payment links that nobody can act on. Contact coverage is the actual go-live gate, ahead of channel breadth.

Phone coverage is ~25%, so WhatsApp is not a workaround at present either.

The new `[PAYMENT SESSION NO CUSTOMER EMAIL]` warn makes this visible per invoice instead of silent, but it is instrumentation, not a fix. **Do not enable DOKU billing on production until guardian email capture is done.** Suggested follow-up: an admin-facing "guardians missing contact details" report driven off the same query, so the gap is worked down before the first invoice batch rather than discovered after it.

### Back Office config required before this helps anyone

Expanding the code-side list does nothing until each channel also has a notification URL registered. **Per channel**, at Settings → Payment Settings → Virtual Account → *[channel]* Configure → "Payment Notification URL":

| Environment | Back office | URL |
|---|---|---|
| Sandbox | `sandbox.doku.com` | `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/api/doku/webhook` |
| Production | `dashboard.doku.com` | `https://talib.annisaasekolahku.com/api/doku/webhook` |

A channel with no notification URL will still issue a VA number and still take the parent's money — DOKU simply has nowhere to deliver the settlement notice, so the invoice never moves off `SENT` and nothing in the admin activity panel signals it. **An unconfigured channel is worse than an unavailable one.**

`additional_info.override_notification_url` (Task 4) is expected to make this self-healing, but until the first sandbox notification proves the override is honoured, treat Back Office registration as load-bearing rather than optional.

Sandbox state at time of writing: Mandiri / BCA / BNI / BRI carry the staging URL; **Permata and CIMB are empty**, and the five channels added by this cycle have never been configured.

### Rollback

Revert this commit. Rollback is safe at any time: nothing here is persisted. The channel constant and the extra body fields only affect *newly created* sessions. Sessions already minted keep their VA numbers, and `/api/doku/webhook` credits them regardless of which channel produced them or which notification URL delivered them — the route reads `channel.id` as free-form data and never validates it against this list.

One asymmetry worth knowing: sessions created *while* this ships carry `override_notification_url`. After a revert, a late notification for one of those still targets the URL captured at creation time, which is the correct origin anyway. No orphaning.

### Follow-ups

1. **Guardian contact capture** — the blocker above. 306 of 307 parents have no email. Nothing else in this cycle matters until that moves.
2. **Support ticket to DOKU** — ask for the Checkout `payment_method_types` enum strings for Maybank, Sinarmas, BJB and Bank Sahabat Sampoerna, all four active on the production merchant account but undocumented for Checkout. Add them once confirmed; do not guess.
3. **Confirm the two unverified assumptions** on the first sandbox checkout: channel filtering vs. 400, and whether `override_notification_url` is honoured. If DOKU 400s on inactive channels, the constant must become account-aware — likely per-environment env — before production, since production lacks BCA and Mandiri.
4. **BCA + Mandiri activation on production**, and finishing DOKU account verification ("Your onboarding is almost complete" banner). DOKU-side account work, not code.
5. **Expiry-reminder window** — Back Office is set to warn the customer *5 minutes* before an order expires. Our `payment_due_date` is 7 days. A 5-minute warning on a 7-day VA is functionally useless; 1-2 days would give a parent time to act.
6. **Prune the webhook's `Request-Target` candidates** — carried over from the 2026-07-27 cycle, still open, still waiting on the same first real notification.
