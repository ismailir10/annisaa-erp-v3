# Payments Ledger — Admin Date-Range Cash Recap

## Context

The 2026-06-12 pilot-readiness audit found payments are visible only one-invoice-at-a-time (`Payment` rows render inside `/admin/invoices/[id]`). There is no "money received" view: a treasurer cannot answer "how much cash came in today?" or "what did we collect this month, by method?" without opening every invoice. The `Payment` table already carries everything needed — `amount`, `method`, `paidAt`, `status`, `reference`, linked `invoice → student` — and is indexed on `paidAt`. This cycle adds a read-only **Penerimaan** (payments-received) ledger under Keuangan: a date-range list of payments with a per-method summary, plus CSV export, mirroring the student-attendance recap + export pattern shipped 2026-06-12. Closes the treasurer daily/period-recap loop without schema changes.

## Spec

Acceptance criteria:

- [ ] `GET /api/payments?dateFrom=&dateTo=&method=` returns payments whose `paidAt` falls in the inclusive Jakarta-day range, tenant-scoped via `invoice.tenantId`, excluding `status = REVERSED`. Each row: id, paidAt, amount, method, reference, invoiceNumber, studentName. Plus a `summary` block: total amount + count overall and per method. Admin-gated (`isAdminRole`). Default range = today (Jakarta) when params omitted; `dateFrom`/`dateTo` validated (bad input → 400, not a misleading empty 200).
- [ ] `GET /api/payments/export?dateFrom=&dateTo=&method=` streams the same data as CSV (header + CRLF + Bahasa filename `penerimaan_<dari>_<sampai>.csv`), RFC 4180 quoting + formula-injection neutralization (student name / reference are semi-untrusted), mirroring the student-attendance export contract.
- [ ] New admin page `/admin/payments` ("Penerimaan"): date-range pickers (default today, Jakarta-tz init — not `toISOString()`), method filter, summary stat cards (Total + per-method), DataTable (Tanggal, Siswa, No. Tagihan, Metode, Referensi, Jumlah), "Ekspor CSV" button (`window.open`).
- [ ] Keuangan nav gains "Penerimaan" → `/admin/payments`, gated like Tagihan.
- [ ] Cross-checked design-system.html for stat cards + DataTable patterns (frontend gate token: design-system).

Non-goals:

- No schema/migration changes (reads existing `Payment`/`Invoice`/`Student`).
- No payment recording/editing here — that stays on `/admin/invoices/[id]`. This surface is strictly read + export.
- No "recorded by" staff name column — `Payment.createdBy` is a bare User id with no relation; resolving names is an N+1 not worth it for the MVP. Deferred.
- No xlsx (CSV only, consistent with the other admin exports).
- No reconciliation/refund workflow.

Assumptions:

1. `paidAt` (when the money arrived), not `createdAt`, is the ledger's economic date — matches how a cash recap reads.
2. `REVERSED` payments are excluded from the ledger and summary (they represent undone receipts). `RECORDED` + `APPROVED` both count as money in.
3. Method filter values reuse the existing enum: CASH | BANK_TRANSFER | XENDIT | OTHER, labelled Tunai / Transfer Bank / Virtual Account / Lainnya (lift `METHOD_LABELS` from `app/admin/invoices/[id]/page.tsx` into a shared constant).
4. Default range = single day (today) — the treasurer's most common question is "today's cash"; range widens on demand.

## Tasks

- [x] **T1 — Ledger aggregation lib + JSON API.** `lib/finance/payments-ledger.ts` (shared query: range + method filter → rows + per-method summary, tenant-scoped via invoice relation, REVERSED excluded; `parseDateRange` validator; reuse the Jakarta-day window approach from `lib/attendance/student-recap.ts`) + `GET /api/payments/route.ts` + unit tests (row mapping, summary math, REVERSED exclusion, date validation, tenant scoping). Lift `METHOD_LABELS` → `lib/constants/payment-methods.ts`. *Accept:* correct totals for a seeded range, 400 on junk dates, REVERSED absent; vitest green. (independent)
- [x] **T2 — CSV export API.** `GET /api/payments/export/route.ts` reusing the T1 lib + a `buildLedgerCsv` (RFC 4180 + formula-injection guard, Bahasa header/filename). Unit test for CSV assembly. *Accept:* curl yields valid CSV matching the JSON totals. (depends T1)
- [x] **T3 — Penerimaan page + nav.** `/admin/payments` page (date pickers Jakarta-init, method filter, summary StatCards, DataTable, Ekspor CSV via `window.open`) + `config/admin-nav.ts` Keuangan group entry. *Accept:* renders for today, export downloads, nav link works; design-system cross-checked. (depends T1, T2)
- [x] **T4 — E2E + docs.** New `e2e/admin-payments.spec.ts` (page renders, summary + table present, API 200/400 contracts, export content-type/header) + README modules/finance + portal Admin bullet, CLAUDE.md route/spec counts. *Accept:* end-of-cycle gate (build + vitest + playwright) green. (depends T3)

## Implementation

- Subagent plan: all tasks inline-sequential (T1→T2→T3→T4 share files/state); review via subagent.
- Task 1: Ledger lib + JSON API — `lib/finance/payments-ledger.ts` (getPaymentsLedger, parseDateRange/isValidYmd, jakartaDayStartUtc window, resolveLedgerRequest, buildLedgerCsv), `lib/constants/payment-methods.ts` (lifted METHOD_LABELS from invoice detail), `app/api/payments/route.ts`, tests. `paidAt` Jakarta-day window → UTC instants; REVERSED excluded; tenant via invoice relation.
- Task 2: CSV export — `app/api/payments/export/route.ts` reusing the shared resolver + buildLedgerCsv (RFC 4180 + formula-injection guard, Bahasa filename `penerimaan_<dari>_<sampai>.csv`).
- Review (general-purpose subagent — sonnet→glm remap blocks the named reviewer agents): no blockers/majors. Confirmed tenant isolation, the 23:30/00:30-WIB window boundary, REVERSED handling, validation, CSV hardening. Applied 2 minor suggestions: consolidated both routes into `resolveLedgerRequest` (anti-drift, mirrors resolveRecapRequest) + cleaner `readonly string[]` cast instead of `as never`. Noted pre-existing (out of scope): no code writes REVERSED today, and the invoice `totalPaid` recompute doesn't share the REVERSED filter.

- Task 3: Penerimaan page + nav — `app/admin/payments/page.tsx` (date pickers Jakarta-init, method Select, summary StatCards + per-method badges, DataTable, Ekspor CSV via `window.open`), `config/admin-nav.ts` (Keuangan → Penerimaan, Wallet icon). UI review (subagent): no blockers/majors; applied a11y aria-labels on filter controls. Build caught `StatsCardsRow cols={2}` (min is 3) → plain `grid-cols-1 sm:grid-cols-2`.
- Task 4: E2E + docs — `e2e/admin-payments.spec.ts` (page render, ledger data+summary envelope, CSV contract, 400 on inverted range + unknown method), README finance module + admin portal bullet, CLAUDE.md counts (175 routes, 30 specs), JTBD-ADMIN-PAY-01.

## Verification

- [x] Cross-checked design-system.html §stats (StatCard) + §DataTable (sortable headers, loading, empty state) + §forms (date inputs, Select) for the Penerimaan page; button label "Ekspor CSV" per voice.md glossary.
- T1+T2 gate: `npm run build` ✓ + `npx vitest run` 1989 passed | 42 todo (22 new ledger tests).
- T3 gate: `npm run build` ✓ (after fixing StatsCardsRow cols + a11y) + `npx vitest run` 1992 passed | 42 todo.

## Ship Notes
