# Finance safety — payment confirm step, manual-payment reversal, overdue void, Rupiah KPIs

## Context
The full E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`) found that money actions on the admin finance surface have no safety net. Finding ids: **FIN-6** (one click on "Catat Pembayaran" records the full pre-filled balance permanently; no reversal path), **FIN-7** (manual payments store no actor), **FIN-9 / FIN-10** (OVERDUE invoices cannot be cancelled; the 409 shows raw enum names), **FIN-13** (`/admin/invoices` KPI cards are counts only, no Rupiah), plus the small related items **FIN-8** (overpayment error shows raw numbers), **FIN-11** (cancelled invoice keeps a red "Sisa"), **FIN-20** (paid invoice keeps a live payment link; ambiguous "Perbarui pembayaran"), **FIN-23** (manual payment offers gateway methods), **PAR-7** (parent: overdue/partial invoice without a link has no way to contact the school) and **PAR-8** (parent partial-payment wording).

Facts found while reading the code:
- `Payment.status` is already a string column with `REVERSED` documented, `Payment.createdBy` already exists, and `getPaymentsLedger` (penerimaan) already excludes `REVERSED`. No migration is needed.
- The paid/status recompute lived inline in `POST /api/invoices/[id]/payments` (sum every Payment row) and, separately, in the webhook processor. Both sum ALL payment rows, so they must learn to skip `REVERSED`.
- Gateway payments are `method IN (XENDIT, DOKU)` (they also carry `xenditPaymentId`). The cron `finance-maintenance` only promotes SENT to OVERDUE.
- There is no school phone/WhatsApp anywhere in `OrgConfig`/`Tenant`/`Campus` (schema change is a non-goal).

## Spec
- [ ] "Catat Pembayaran" dialog has a mandatory review step (invoice number, student, amount in Rp, method, date, resulting status Lunas / Dibayar sebagian) before the POST; the primary buttons say what they do. Prefill of the remaining balance is kept.
- [ ] `POST /api/invoices/[id]/payments/[paymentId]/reverse` reverses a MANUAL payment with a required reason: tenant-scoped, `payments.record` permission, advisory-locked, idempotent (second call = 200 no-op), refused with a clear Indonesian message for gateway payments (XENDIT/DOKU) and for cancelled invoices. Invoice totalPaid/status are recomputed by the same helper the record path uses; an `AuditLog` row (`Payment` / `reverse`) is written in the same transaction.
- [ ] Reversed payments are shown struck-through with a "Dibatalkan" label in the admin history; excluded from invoice totals, penerimaan ledger, guardian invoice detail + receipt PDF, and the webhook recompute.
- [ ] Manual payments store `createdBy = session.id`; the admin payment history shows "Dicatat oleh <name>".
- [ ] OVERDUE invoices with no active payments can be cancelled via the same menu (detail + list); invoices with payments get an Indonesian explanation (reverse payments first); 409 messages use human status labels.
- [ ] `/admin/invoices` shows Rupiah "Piutang" (sum of remaining on SENT/PARTIALLY_PAID/OVERDUE) and "Diterima bulan ini" (non-reversed payments, current Jakarta month) next to the counts.
- [ ] Minors: FIN-8 (Rp in overpayment error), FIN-11 (no red Sisa on cancelled), FIN-20 (no live link card / clearer refresh label on paid), FIN-23 (manual method list = Tunai / Transfer Bank / Lainnya), PAR-7 (contact affordance), PAR-8 (Total / Sudah dibayar / Sisa on parent detail).

### Non-goals
- No schema migration, no gateway refund integration, no redesign of the invoices page beyond the KPI numbers.

### Assumptions
1. Reversal reuses `payments.record` (no new permission code): a person who may record a payment may correct their own mistake; adding a code would need role backfill.
2. "Who reversed + reason" is stored in `Payment.notes` (appended) and in the `AuditLog` row (actor, before/after).
3. When a reversal returns an invoice to zero paid, status becomes SENT (or OVERDUE if past due) when it was ever sent / has a link, PENDING_PAYMENT_LINK if it has a link error, else DRAFT.
4. There is no school contact in config; PAR-7 reads an optional `SCHOOL_CONTACT_PHONE` env var and always tells the parent to quote the invoice number.

## Tasks
- [x] **T1 — Payment state helper + record/reverse API.** Shared recompute helper, `createdBy`, Rp overpayment message, manual-methods only, reversal route + audit, webhook skips REVERSED; vitest.
- [x] **T2 — Void + stats + guardian APIs.** OVERDUE void with human 409s; stats add Rupiah totals; guardian detail/PDF exclude REVERSED; vitest.
- [ ] **T3 — Admin invoice detail UI.** Review step, reverse dialog, reversed styling, actor, cancel menu for OVERDUE, FIN-11/20/23; vitest.
- [ ] **T4 — Admin invoice list UI.** KPI Rupiah cards, void action for OVERDUE, FIN-11 in list; vitest.
- [ ] **T5 — Parent invoice sheet.** PAR-7 contact affordance, PAR-8 Total/Sudah dibayar/Sisa; vitest.
- [ ] **T6 — Local verification + Ship Notes.**

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, dirty-work=none (sonnet is the harness tier; no cheaper tier). Tasks T1-T6 sequential and inline: each UI task depends on the API contract of the previous one, and the brief runs a cycle in one build agent.
- Task 1: Payment state helper + record/reverse API — `lib/finance/invoice-payment-state.ts` (new: `ACTIVE_PAYMENT_FILTER`, `deriveInvoicePaymentState`, `unpaidStatusFor`, `recomputeInvoiceFromPayments`), `app/api/invoices/[id]/payments/route.ts` (createdBy = session.id, uses the helper, atomic `recordAudit`, overpayment message in Rp on the `amount` field, gateway methods refused), new `app/api/invoices/[id]/payments/[paymentId]/reverse/route.ts`, `lib/payments/webhook-processor.ts` (recompute skips REVERSED), `lib/validations/invoice.ts` (`reversePaymentSchema`), `lib/constants/payment-methods.ts` (`MANUAL_PAYMENT_METHODS`, `isGatewayPayment`). `recordPaymentSchema.method` stays the full enum because `enum-conformance.test.ts` pins it to the Prisma comment; the gateway refusal is route-level. README/CLAUDE generated counts regenerated (route count 198).
- Task 2: Void + stats + guardian + admin detail APIs — `app/api/invoices/[id]/void/route.ts` (OVERDUE voidable; any non-reversed payment or `totalPaid > 0` blocks with "Batalkan pembayarannya lebih dulu" / gateway explanation; human status labels via new `lib/constants/invoice-status.ts`; `AuditLog` Invoice/void), `app/api/invoices/stats/route.ts` (+`outstanding`, `collectedThisMonth`; reuses `UNPAID_INVOICE_STATUSES` and new `lib/finance/jakarta-month.ts`), `app/api/guardian/invoices/[id]/route.ts` + `/pdf/route.ts` (payments `where: ACTIVE_PAYMENT_FILTER`), `app/api/invoices/[id]/route.ts` (GET resolves `createdByName`, tenant-scoped).

## Verification
- Task 1: gates passed — `npm run build` exit 0, `npx vitest run` 432 files passed / 2 skipped, 4095 tests passed. New tests: `lib/finance/__tests__/invoice-payment-state.test.ts`, `app/api/__tests__/invoice-payment-reverse.test.ts` (reverse, idempotent, gateway x3, cancelled, reason required, tenant/permission 403/404), `app/api/__tests__/invoices-record-payment-flow.test.ts` (createdBy, audit, REVERSED-excluding recompute, Rp overpayment on `amount`, XENDIT/DOKU refused). Manual review of the diff (no reviewer agents installed): reversal shares the record path's lock + recompute; gateway rows are identified by method OR `xenditPaymentId`.

## Ship Notes
