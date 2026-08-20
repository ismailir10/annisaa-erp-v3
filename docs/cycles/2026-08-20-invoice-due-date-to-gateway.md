# Invoice Due Date Must Drive Payment Gateway Session Expiry

## Context

Bu Shanti reported from prod on 2026-08-19: the jatuh tempo printed on the DOKU Virtual
Account is always 7 days out, no matter what she sets in Talib's "Tanggal Jatuh Tempo"
field. Her collection window runs from the 27th to the 10th (13–14 days), so every VA she
issues dies days before the parent's payment window even closes.

She is right, and the cause is ours, not DOKU's. `createPaymentSessionForInvoice` loads the
full invoice row — `dueDate` included — at [`lib/payments/session.ts:55`](../../lib/payments/session.ts),
then forty lines later hands the gateway a hardcoded `expiryDays: 7`
([`session.ts:102`](../../lib/payments/session.ts)). The admin's value is written to the
database correctly and is simply never told to the gateway. The DOKU adapter multiplies that
constant into `payment_due_date: 10080` minutes
([`doku/client.ts:318`](../../lib/payments/doku/client.ts)); the Xendit adapter has the
identical defect at [`xendit/client.ts:141`](../../lib/payments/xendit/client.ts), currently
dormant but one env flip from being live again.

The blast radius is wider than the one report. **Every** invoice ever sent through either
gateway expired 7 days from *creation*, not from its stated due date. An invoice raised on
the 1st with a month-end due date has been handing parents a VA number that stops working on
the 8th. Bu Shanti noticed the mismatch on the document; parents who hit a dead VA most
likely just gave up quietly. Fixing this makes the number on the VA mean what the invoice
says it means.

## Spec

### Acceptance criteria

- [ ] `CreateSessionParams` carries an absolute `expiresAt?: Date` instead of `expiryDays?: number`.
      Day-count cannot express "expires at the end of the 10th" from an arbitrary creation
      instant; an absolute instant is the only shape both adapters honour losslessly.
- [ ] `createPaymentSessionForInvoice` derives `expiresAt` from the invoice's own `dueDate`,
      resolved to **end of day Asia/Jakarta** (`YYYY-MM-DDT23:59:59+07:00`) so a parent paying
      on the due date itself still succeeds.
- [ ] The DOKU adapter converts `expiresAt` to `payment_due_date` in minutes-from-now,
      rounded up, and never emits a value below 1.
- [ ] The Xendit adapter passes `expiresAt` through to `expires_at` as ISO, unchanged.
- [ ] **Floor of 1 day**: an invoice whose `dueDate` is today or already past yields an expiry
      of now + 24h, not a born-expired session. An overdue invoice is still collectable; a
      dead-on-arrival VA is a support ticket.
- [ ] **Cap of 30 days**: a `dueDate` further out is clamped. DOKU publishes only
      `Max Length: 6` for `payment_due_date` and defers the real ceiling to each channel, so
      the safe bound is ours to pick, not theirs to promise.
- [ ] Expiry policy (floor/cap/end-of-day) lives in one exported pure function that is unit
      tested directly — not inlined in the session builder where it cannot be exercised.
- [ ] A unit test asserts `createPaymentSessionForInvoice` passes a `dueDate`-derived
      `expiresAt` to the gateway. This is the test that would have caught the original bug and
      is the one that keeps a future constant from creeping back in.
- [ ] The three non-invoice callers (DOKU probe route, reseed script, finish-xendit script)
      are ported and still compile.
- [ ] `npm run build && npx vitest run` green.

### Non-goals

- **No repair of already-issued sessions.** Existing invoices carry gateway sessions with the
  wrong 7-day expiry. Re-issuing them is an operations decision with parent-facing
  consequences (a new VA number invalidates the one already communicated), so it belongs in
  Ship Notes as a manual step with a scoping query — not in this cycle's code.
- **No change to the admin UI.** "Tanggal Jatuh Tempo" already exists, validates, and persists
  correctly ([`manual-invoice-dialog.tsx:438`](../../components/admin/invoices/manual-invoice-dialog.tsx)).
  The field was never the problem.
- **No change to invoice status transitions, the reconcile sweep, or overdue handling.**
- **No change to `PAYMENT_GATEWAY` selection.** Both adapters are fixed so the answer does not
  depend on which one is active.
- **No persistence of `expiresAt`.** `GatewaySession.expiresAt` is returned and discarded
  today; storing it is a separate concern.

### Assumptions

1. **A due date means end of that day, not the start of it.** An invoice due the 10th is
   payable through 23:59:59 WIB on the 10th. Bu Shanti's "27–10" window reads as inclusive of
   the 10th.
2. **WIB is a fixed UTC+7 offset with no DST**, so `YYYY-MM-DDT23:59:59+07:00` is exact and no
   `Intl.DateTimeFormat` round-trip is needed. Consistent with `JAKARTA_TZ` usage in
   [`lib/sessions/dates.ts`](../../lib/sessions/dates.ts).
3. **30 days is a safe cap for both gateways.** DOKU's per-channel ceilings are undocumented;
   Xendit's session expiry maximum is 31 days. A school invoice due more than a month out is
   rare enough that clamping it is preferable to risking a 400 that leaves a parent with no
   payment link at all.
4. **Keeping `expiresAt` optional with a 7-day fallback is correct** for the probe and script
   callers, which have no invoice and no due date. The fallback is what caused this bug, so the
   wire-level test in T3 exists specifically to prove the invoice path never takes it.
5. **DOKU is live on prod today.** Bu Shanti is receiving DOKU VAs, which supersedes the
   2026-07-29 note that prod `PAYMENT_GATEWAY` still resolved to xendit.

## Tasks

### T1 — Port the gateway port from `expiryDays` to `expiresAt` ✅

Replace `expiryDays?: number` with `expiresAt?: Date` in `CreateSessionParams`
(`lib/payments/types.ts`). Update both adapters: DOKU computes
`Math.max(1, Math.ceil((expiresAt - now) / 60000))` for `payment_due_date` and reuses the same
instant for its `fallbackExpiresAt` path; Xendit emits `expiresAt.toISOString()` for
`expires_at`. Both keep a 7-day default when the field is absent. Port the three non-invoice
callers: `app/api/doku/probe/route.ts` (was `expiryDays: 1`), `scripts/reseed/invoices.ts`,
`scripts/finish-xendit.ts`. Update the existing DOKU adapter tests that pass `expiryDays: 7`.

*Acceptance:* `npm run build` clean; adapter unit tests assert DOKU minutes math (including
the ≥1 floor) and Xendit ISO passthrough for a known `expiresAt`.

*Depends on:* nothing.

### T2 — Derive expiry from `invoice.dueDate` with floor and cap

Add an exported pure helper — `resolveSessionExpiry(dueDate: string, now: Date): Date` — that
parses `YYYY-MM-DD` as `T23:59:59+07:00`, then clamps to `[now + 1 day, now + 30 days]`. Call
it from `createPaymentSessionForInvoice`, replacing the hardcoded `expiryDays: 7`. Reuse
`JAKARTA_TZ` from `lib/sessions/dates.ts` rather than introducing a second timezone constant.

*Acceptance:* unit tests cover the normal case (due date inside the window → exact
end-of-day WIB), overdue (past due date → now + 1 day), same-day (today → now + 1 day, not
seconds-from-now), far-future (>30 days → capped), and a month-boundary case matching Bu
Shanti's real 27→10 window.

*Depends on:* T1 (the `expiresAt` field must exist).

### T3 — Wire-level regression test and stale doc comments

Add a test on `createPaymentSessionForInvoice` with a mocked gateway asserting the
`expiresAt` argument tracks the fixture invoice's `dueDate` — the assertion that would have
caught this bug. Fix the two doc comments that document the removed constant
(`app/payment/success/page.tsx:7`, `app/payment/cancel/page.tsx:7`, both say "With
`expiryDays: 7` on session creation"). Update README if the payments section states the
7-day expiry as behaviour.

*Acceptance:* the new test fails when `session.ts` is reverted to a constant expiry; both doc
comments describe the due-date-derived behaviour.

*Depends on:* T1, T2.

> **Note for `/build`:** T3 touches `app/**/*.tsx` (comment-only), which trips the pre-commit
> frontend gate. Add a Verification line citing `design-system` — no visual surface changes in
> this cycle, and the line should say so plainly.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=n/a. Fan-out skipped deliberately —
  T1→T2→T3 are strictly sequential over the same six files, fully specced, ~200 lines total,
  and the driver already held complete context from locating the root cause. A subagent would
  have re-derived it at a net loss. The mandatory `feature-dev:code-reviewer` pass still runs
  per task. This is the exception clause in `/build`'s Planning step, invoked knowingly.

- Task 1: Port the gateway port from `expiryDays` to `expiresAt` —
  `lib/payments/types.ts`, `lib/payments/expiry.ts` (new), `lib/payments/doku/client.ts`,
  `lib/payments/xendit/client.ts`, `lib/payments/session.ts`, `app/api/doku/probe/route.ts`,
  `scripts/reseed/invoices.ts`, `scripts/finish-xendit.ts`,
  `lib/payments/__tests__/expiry-conversion.test.ts` (new),
  `lib/payments/xendit/__tests__/expires-at-passthrough.test.ts` (new),
  `lib/payments/doku/__tests__/client.test.ts` — `CreateSessionParams` now carries an absolute
  `expiresAt?: Date`; DOKU converts via the new exported `toDokuPaymentDueDateMinutes()`
  (ceil, floored at 1), Xendit serialises it straight to `expires_at`.
  **Behaviour deliberately unchanged in this commit** — every call site is held at
  `defaultExpiresAt()` (7 days), including a `TODO(T2)` in `session.ts`, so the port lands
  without a behaviour change mixed into it and T2's diff shows only the fix.
  - Reviewer (`feature-dev:code-reviewer`) found one real gap: T1's own acceptance criterion
    names a Xendit ISO-passthrough test that the first pass omitted. Added
    `expires-at-passthrough.test.ts` before commit. Reviewer separately confirmed no missed
    call site (`lib/xendit/helpers.ts` and `lib/finance/xendit-retry.ts` both route through
    the same single function) and judged the loosened wire-level `payment_due_date` assertion
    acceptable, since the exact arithmetic is covered by fixed-clock pure-function tests.

## Verification

- Task 1: gates passed — `npm run build` clean (Next.js 16.2.3, TypeScript check green),
  `npx vitest run` 303 files passed / 2 skipped, 2947 tests passed / 42 todo.
  New coverage: DOKU minutes conversion under a fixed clock (whole days, partial-minute
  round-up, already-past floor, 30-day cap within DOKU's 6-digit field length, and Bu Shanti's
  real 27→10 window asserting it is no longer 7 days), plus Xendit ISO passthrough and its
  7-day fallback. All new tests use fixed instants or bracket `Date.now()`, so none are
  clock-flaky in CI.

## Ship Notes

<!-- filled by /ship -->
