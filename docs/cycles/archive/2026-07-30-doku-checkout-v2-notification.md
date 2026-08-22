# DOKU Checkout v2 — Chase the Missing Notification, and Stop Naming Channels

## Context

Two things arrived on 2026-07-30, both from DOKU support (ticket `1115484:1806761`), and together they change the shape of the DOKU integration.

### 1. DOKU answered the notification ticket, and the answer points at an endpoint we do not call

Cycle [2026-07-29-doku-all-va-channels](2026-07-29-doku-all-va-channels.md) established the failure exhaustively: two Virtual Account payments settled on the sandbox, DOKU recorded both (`Reports → Checkout Orders`, order `cms5as9q2000004jxdq21orae`, Lunas, `SUCCESS` at 29/07/2026 06:41:27 GMT+7), the per-channel notification URL was populated and reachable, our signature contract matched DOKU's documented `Request-Target` rule — and DOKU's own Notification Center logged **zero delivery attempts**. Not failures. No attempts.

DOKU's reply, point by point:

| # | Their answer | What it does for us |
|---|---|---|
| 1 | Merchant HTTP notification needs no manual enabling; verify under Settings → HTTP Notification | **Non-responsive.** That is the page showing `Tidak ada data`, 0 of 0. Restates the documented default; does not look at our orders. |
| 2 | `additional_info.override_notification_url` **is supported for the API V2 Checkout** | The lead. See below. |
| 3 | Production behaves exactly as Sandbox | Removes the hope that prod differs. Sandbox emits nothing → prod emits nothing. |
| 4 | Sinarmas / BJB / Sahabat Sampoerna: **not supported for Checkout**. Maybank is `VIRTUAL_ACCOUNT_MAYBANK` | Closes follow-up #2 of the previous cycle. |
| 5 | An inactive channel in `payment_method_types` returns `{"message":["PAYMENT CHANNEL IS INACTIVE"]}`. Alternatively, **omit `payment_method_types`** and Checkout shows every channel active on the account | Closes follow-up #4 — the bad way. See below. |
| 6 | BTN + BNC are Checkout-supported but need DOKU Sales to activate | Account work, not code. |

**The lead in point 2.** DOKU said "API V2 Checkout". Their published docs expose only `POST /checkout/v1/payment`, and in DOKU's vocabulary "v2" usually means the `BRN-`/`MCH-` **merchant generation** rather than a URL version — our Client-Id is `BRN-0249-1785138907502`, so we are v2-generation calling a v1 path, and that reading makes their sentence simply true of us.

Except an unauthenticated probe of the sandbox host says a v2 path is really there:

| Probe (`POST https://api-sandbox.doku.com…`) | Response |
|---|---|
| `/checkout/v9/payment` | `404 {"message":"No static resource checkout/v9/payment."}` |
| `/checkout/v1/nonsense-abc` | `404 {"message":"No static resource checkout/v1/nonsense-abc."}` |
| `/totally/bogus/path` | `404 {"message":"No static resource totally/bogus/path."}` |
| `/checkout/v1/payment` | `400 {"code":"invalid_signature","message":"Invalid Header Signature"}` |
| **`/checkout/v2/payment`** | **`400 {"code":"invalid_signature","message":"Invalid Header Signature"}`** |

`404 No static resource` is DOKU's unrouted-path response. `/checkout/v2/payment` never reaches it: with a stale timestamp it returns `request_time_out_of_range`, and with a fresh timestamp plus our real Client-Id it returns `invalid_signature` — the same two-stage header validation, in the same order, as v1. So **v2 exists, is routed, and shares v1's non-SNAP HMAC scheme**. It is absent from [Backend Integration](https://developers.doku.com/accept-payments/doku-checkout/integration-guide/backend-integration), which publishes v1 only.

If notification dispatch is wired on v2 and not on v1 for this merchant, every observation from the previous cycle fits at once: order recorded, payment `SUCCESS`, URL configured and reachable, signature contract satisfied, zero attempts logged. That is a hypothesis, not a finding — but it is the first hypothesis in three investigation rounds that is both untested and cheap to test.

**What is NOT known, and why this cycle ships behind a flag.** Nobody has made a signed call to v2. Its request-body contract is undocumented and may differ from v1's. Switching the endpoint outright would risk `400` on *every* session creation — no parent could obtain a payment link at all, which is a strictly worse failure than the one we are chasing (payments currently *are* credited, by the daily reconcile sweep). The version therefore becomes an environment variable defaulting to `v1`, and the probe result — not a guess — decides when it flips.

### 2. Point 5 is a production hard-block, discovered by answer rather than by outage

The previous cycle recorded an explicit unverified assumption:

> DOKU is assumed to ignore or gracefully omit a requested channel that is not activated on the merchant account, rather than rejecting the whole session with a 400.

DOKU has now answered: it **rejects**, with `PAYMENT CHANNEL IS INACTIVE`. And `DOKU_VIRTUAL_ACCOUNT_METHODS` hardcodes eleven channels including `VIRTUAL_ACCOUNT_BCA` and `VIRTUAL_ACCOUNT_BANK_MANDIRI`, **neither of which is active on production** (`BRN-0223-1785136973187`). Production's BTN and BNC rows are SNAP-only and per point 6 need Sales to activate for Checkout, so those two are likely inactive-for-Checkout as well.

Net effect had this shipped to production unchanged: **every** `createDokuSession` call returns `400`. Not a degraded channel list — no payment links at all, for anybody.

Point 5's second half is the fix, and it is DOKU's own recommendation: omit `payment_method_types` and Checkout renders whatever is active on the account. That also retires the enum-guessing problem permanently — Maybank works without us hardcoding `VIRTUAL_ACCOUNT_MAYBANK`, and a future channel activation needs no deploy.

The cost is real and is accepted deliberately (CTO decision, 2026-07-30): the **Virtual-Account-only guarantee moves out of code and into Back Office configuration**. If a card, QRIS, e-wallet or paylater channel is ever activated on either account, parents will see it and the school will pay card MDR — the exact outcome cycle 2026-07-27 chose VA-only to avoid. Weighed against total payment failure, the asymmetry is not close. The guarantee becomes a Back Office audit, recorded as a Ship Notes gate.

## Spec

**AC-1** The Checkout endpoint version is read from `DOKU_CHECKOUT_VERSION`. Accepted values `v1` and `v2` (case-insensitive, surrounding whitespace tolerated). Unset → `v1`.

**AC-2** An unrecognised `DOKU_CHECKOUT_VERSION` **throws** rather than falling back to `v1`. A typo'd flag that silently kept v1 would present as "we flipped it and the notification still did not arrive" — corrupting the one experiment this cycle exists to run.

**AC-3** The resolved path is used for **both** the `Request-Target` signature component and the request URL, from a single evaluation. A signature signed over one path and sent to another fails as `invalid_signature`, which would be misread as a credential problem.

**AC-4** `payment.payment_method_types` is absent from the request body. `DOKU_VIRTUAL_ACCOUNT_METHODS` is deleted, not merely unused.

**AC-5** `additional_info.override_notification_url` is still sent on every session that supplies `notificationUrl`. Unchanged behaviour, pinned by an existing test — it is the mechanism under test and must not regress while attention is on the endpoint.

**AC-6** The remainder of the body is byte-identical to what shipped in #420: `order.amount` / `invoice_number` / `currency`, the three `callback_url*` fields, `language: "ID"`, `auto_redirect: false`, optional `line_items`, `payment.payment_due_date`, `payment.type: "SALE"`, and the capped/normalised `customer` fields.

**AC-7** `scripts/doku-probe-checkout.mjs` is committed: signs a real Checkout request against either version with the production payload, reads credentials from the environment and never prints them, and accepts an arbitrary `--notify` destination.

**Non-goals.** No change to `/orders/v1/status/{invoice_number}` (a different API; unaffected by point 2 and confirmed working — it is what the reconcile sweep and the manual button poll). No change to signature assembly, retry, the webhook route, or `webhook-processor.ts`. No Prisma change. No removal of the daily reconcile cron — it stays load-bearing until a notification is observed arriving, and remains correct afterwards via its deterministic-`eventId` dedup. No SNAP migration.

**Assumption, stated because it is unverified.** v2's request-body contract is assumed identical to v1's. Untested — the probe (AC-7) is how it gets tested, and the flag default of `v1` is what makes being wrong survivable.

## Tasks

1. Add `resolveCheckoutTarget()` to `lib/payments/doku/client.ts`, reading `DOKU_CHECKOUT_VERSION`; use it for the single `target` binding in `createDokuSession`.
2. Delete `DOKU_VIRTUAL_ACCOUNT_METHODS` and the `payment_method_types` body line.
3. Update `lib/payments/doku/__tests__/client.test.ts`: drop the two channel-list tests and the constant import, drop `payment_method_types` from the body assertion, add version-resolution tests (default, `v1`, `v2`, case/whitespace, throw-on-garbage) and a signature/URL agreement test for v2.
4. Commit `scripts/doku-probe-checkout.mjs`.
5. Update README — `DOKU_CHECKOUT_VERSION` in the env table, and footnote ⁴ / the gateway-health footnote where they assert eleven hardcoded channels.

## Implementation

**Task 1 + 2 — `lib/payments/doku/client.ts`**

`resolveCheckoutTarget(raw = process.env.DOKU_CHECKOUT_VERSION)` normalises with `.trim().toLowerCase()`, returns `/checkout/${version}/payment` for `v1` / `v2`, and throws naming the offending value otherwise. Exported for unit testing. `createDokuSession` replaces the `const target = "/checkout/v1/payment"` literal with a call to it — one evaluation, feeding both `buildSignature({ target })` and the `fetch` URL, so AC-3 holds by construction rather than by convention.

`DOKU_VIRTUAL_ACCOUNT_METHODS` (48 lines including its doc comment) and the `payment_method_types` line are deleted. The replacement comment on `payment` records DOKU's `PAYMENT CHANNEL IS INACTIVE` answer, the production BCA/Mandiri gap that made the hardcoded list fatal, and that VA-only enforcement now lives in Back Office.

**Task 3 — `lib/payments/doku/__tests__/client.test.ts`**

Removed: the `DOKU_VIRTUAL_ACCOUNT_METHODS` import and its two-test `describe` block (the pinned eleven-element list and the prefix invariant — both retired by AC-4, not weakened), and the `payment_method_types` key from the body assertion at the create-session spec test.

Added: a `resolveCheckoutTarget` block (unset → v1; explicit `v1`; explicit `v2`; `"V2"` and `" v2 "` normalised; `v3` / `2` / empty-string throw with the offending value in the message), an assertion that no `payment_method_types` key survives anywhere in the serialised body, and a `DOKU_CHECKOUT_VERSION=v2` create-session test asserting the fetch URL ends `/checkout/v2/payment` **and** that the signed `Request-Target` line names the same path — the AC-3 agreement, checked by recomputing the HMAC over the expected signed string rather than trusting the client's own output.

**Task 4 — `scripts/doku-probe-checkout.mjs`**

Standalone `.mjs`, no repo imports, so it runs with plain `node` and cannot drift into the build. Reproduces the adapter's body byte-for-byte, serialises once, signs the five-component string from `signature.ts`'s documented order, and prints status, body, checkout URL, `token_id` and expiry. Credentials come from `DOKU_CLIENT_ID` / `DOKU_SECRET_KEY` and are never echoed. `--version v1|v2` (default `v2`), `--notify <url>` (default the staging webhook). Customer fields are synthetic, because `--notify` may point at a third-party request bin and no guardian PII should leave the repo.

The `--notify` indirection is the point: our own webhook route rejects a bad signature *before* writing a `WebhookEvent` row, so a delivered-but-rejected notification and a never-sent notification look identical from inside Talib. A bin that logs unconditionally separates them.

**Task 5 — `README.md`**

`DOKU_CHECKOUT_VERSION` added to the env table (blank for local, `v1` for both deployed envs, marked as the flag for the notification experiment). Footnote ⁴'s "offers all eleven documented Virtual Account channels" replaced with the omit-the-parameter behaviour and the Back Office VA-only audit obligation.

## Verification

**Gates — run in the worktree, output verbatim.**

```
npm run build     → compiled successfully, all routes emitted
npx tsc --noEmit  → 0 errors
npx vitest run    → Test Files  251 passed | 2 skipped (253)
                    Tests  2446 passed | 42 todo (2488)
npx vitest run lib/payments/doku/
                  → Test Files  2 passed (2)
                    Tests  69 passed (69)
```

The full-suite count is **not** comparable to the 2397 recorded in the 2026-07-29 cycle: this branch is cut from a `staging` that has advanced 19 commits since #420 merged, so the delta includes other cycles' tests. The attributable change is local to `lib/payments/doku/__tests__/client.test.ts` — two tests removed (the pinned eleven-channel list and the `VIRTUAL_ACCOUNT_` prefix invariant, both retired by AC-4) and thirteen added across `resolveCheckoutTarget`, the `payment_method_types` absence assertion, the v2 URL/signature agreement, and the throw-before-fetch guard.

**A note on a misleading intermediate result, recorded so it is not re-discovered.** `npx tsc --noEmit` reported **340 errors** when run before `npm run build` in this fresh worktree. None were in files this cycle touches. Cause: `lib/generated/prisma/**` is gitignored, so a newly created worktree has no generated Prisma client until `npm run build` runs `prisma generate`. After the build, the same command reports 0. Any future cycle that starts by typechecking a brand-new worktree will hit this and should build first rather than start bisecting.

**Playwright: could not run locally — deferred to the required CI `Playwright E2E` check.** This is the environment-can't-run deferral, and the refusal is a deliberate repo guard rather than a failure. Verbatim:

```
Error: Refusing to run e2e against non-local DATABASE_URL host
"aws-1-ap-southeast-1.pooler.supabase.com". These specs create + mutate data via
the API and would pollute that database (DEMO_MODE does not switch the DB — see
lib/db.ts). Point DATABASE_URL at a local/ephemeral Postgres, or set
E2E_ALLOW_REMOTE_DB=1 to override.
    at assertLocalDatabaseForE2E (playwright.config.ts:40:11)
```

`setup-worktree.sh` symlinks `.env` from the main checkout, whose `DATABASE_URL` is the staging Supabase pooler. `E2E_ALLOW_REMOTE_DB=1` was **not** set — doing so would have written e2e fixtures into the live staging database to satisfy a gate that cannot reach this code anyway. Independently of the guard, no e2e spec exercises this diff: previews and the local e2e harness both run `DEMO_MODE=true`, and `createDokuSession` short-circuits before either the request body or the target path is constructed.

**Preview-verify:** not meaningful for the same reason — `DEMO_MODE` returns a synthetic session without constructing a request. The real contract test is the probe script against the live sandbox, which is a manual step gated on credentials this harness does not hold.

## Ship Notes

### Migrations

**None.**

### Env vars

`DOKU_CHECKOUT_VERSION` — **new, optional**. Unset or `v1` reproduces today's behaviour exactly; `v2` switches the Checkout endpoint. Not required at deploy time. Set it in Vercel only after the probe confirms v2 accepts our payload, and set it on Preview before Production.

### The experiment, in order

1. `vercel env pull` the sandbox credentials locally, then `node scripts/doku-probe-checkout.mjs --version v2` (and `--version v1` as the control). If v2 returns a body-shape `400`, stop — the flag stays `v1` and DOKU owes us v2's schema.
2. On `200`, settle the minted VA at the [sandbox simulator](https://sandbox.doku.com/integration/simulator/), **non-SNAP** "Bank BCA" row (Checkout mints non-SNAP VAs — positively confirmed last cycle by feeding a Checkout VA to the SNAP simulator and getting `Invalid Bill/Virtual Account [Virtual account not found.]`).
3. Check, in this order: the `--notify` destination (did DOKU send anything at all?), Back Office → Settings → Notification → HTTP Notifications → Notifikasi (does DOKU log it?), `WebhookEvent` rows on staging (did it verify and process?).
4. A notification arriving on v2 and not v1 is the root cause. Set `DOKU_CHECKOUT_VERSION=v2` on Preview, re-run end to end, then Production.
5. No notification on v2 either → v2 is excluded, and the escalation reply to ticket `1115484:1806761` stands: ask for DOKU's server-side dispatch log for those two orders, brand-level notification state for `BRN-0249-1785138907502`, which Back Office field is authoritative, and whether the Notifikasi log covers Checkout at all.

### GATE — Back Office VA-only audit, both accounts, before any production invoice

Omitting `payment_method_types` moves the Virtual-Account-only guarantee from this repository into DOKU Back Office. Before production billing, confirm at Settings → Payment Settings that **no non-VA channel is active** on `BRN-0249-1785138907502` (sandbox) or `BRN-0223-1785136973187` (production) — no credit card, QRIS, e-money, paylater or direct debit. Any active non-VA channel now appears on the checkout page and the school pays its MDR. Nothing in code prevents it any more; this audit is the only control.

### Still-open production blockers, unchanged by this cycle

1. **Guardian contact coverage.** 1 email across 307 parents; 0 of 179 students would receive a VA number. Under Virtual Account the parent must be *told* the number. This remains the first go-live gate, ahead of everything here.
2. **Production has no Checkout-addressable channel worth having.** BCA and Mandiri are inactive; Sinarmas / BJB / Sahabat Sampoerna cannot be used by Checkout at all (point 4); BTN and BNC need Sales (point 6). Maybank is the only one left. Requires DOKU Sales, plus finishing the "onboarding is almost complete" account verification.
3. **Notifications still unproven on production.** Point 3 says prod mirrors sandbox, and sandbox has never emitted. The daily reconcile cron (`POST /api/cron/reconcile-payments`, `30 0 * * *`) remains the only *proven* credit path, and Vercel registers crons from the production deployment only — so this must reach `main`, not just `staging`, before production billing.

### Rollback

Revert the commit, or simply unset `DOKU_CHECKOUT_VERSION` — with the flag absent the code sends v1, i.e. #420's behaviour, with the single exception of the omitted `payment_method_types`. That omission is not flag-guarded, deliberately: keeping the hardcoded list reachable would leave the production `400` landmine armed. Reverting it re-arms it.

Nothing here is persisted. Sessions already minted keep their VA numbers, and `/api/doku/webhook` credits them regardless of which endpoint version or channel produced them — the route reads `channel.id` as free-form data and never validates it against a list.

### Follow-ups carried forward

- **Prune the webhook's `Request-Target` candidates** — still waiting on the same first real notification (carried from 2026-07-27 and 2026-07-29).
- **Expiry-reminder window** — Back Office warns the customer 5 minutes before an order expires; `payment_due_date` is 7 days. 1-2 days would be useful; 5 minutes is not.
- **Guardian contact capture report** — an admin-facing "guardians missing contact details" view driven off the same query that found the 1-of-307, so the gap is worked down before the first invoice batch rather than discovered after it.
