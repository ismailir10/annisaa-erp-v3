# Billing Run wizard — persisted draft, scope + review, one bulk path

## Context

Bulk invoice generation is still all-or-nothing. The "Buat Tagihan" dialog takes three fields —
periode, jatuh tempo, tahun ajaran — and bills **every** ACTIVE enrollment in the tenant for that
year; there is no class filter, no student picker, and no way to see what will be billed before it
is billed. The admin's only preview is a one-line confirm ("21 siswa akan ditagih"), and the plan
output lives in browser memory for the seconds between the plan call and the batch calls
(`lib/finance/run-bulk-generate.ts`). Nothing is persisted, so a refresh loses the run, a partial
failure cannot be resumed, and there is no record of what a given run intended to bill.

This is **Cycle B1 of the bulk invoice wizard arc**. Cycle A (`2026-08-13-keringanan-fee-adjustments`,
merged) made keringanan durable and taught generation to apply it. B1 replaces the three-field dialog
with a three-step wizard on top of a persisted `BillingRun` draft: **step 1** scopes the run (period +
class multi-select + individual student add/remove), **step 2** shows the materialized rows with
keringanan pre-applied and labeled, **step 3** reviews totals and commits. Step 2 is **read-only this
cycle** — Cycle B2 makes it editable (inline component amounts, ad-hoc discount lines, extra catalog
lines). Building the three-step shell now, with step 2 already rendering real per-student rows, means
B2 changes one step's interior rather than re-plumbing the flow.

The draft is the point. Once rows and lines are materialized server-side, the run survives a refresh,
the run id becomes the idempotency key, a partial commit resumes instead of double-billing, and what
the admin approved is exactly what gets written.

UAT input: none applicable. Newest report in `docs/uat/reports/` is `2026-06-04-admin-teacher-full.md`,
over 60 days old and not scoped to invoicing.

## Spec

### Acceptance criteria

- [ ] Three new models — `BillingRun`, `BillingRunRow`, `BillingRunLine` — with hand-authored
      migration carrying `ENABLE ROW LEVEL SECURITY` + a permissive `service_role` policy, per the
      house style in `20260813000000_add_student_fee_adjustment`.
- [ ] `BillingRun.status`: `DRAFT` → `COMMITTING` → `COMMITTED`, plus `CANCELLED`. `BillingRunRow.status`:
      `PENDING` | `EXCLUDED` | `SKIPPED_ALREADY_INVOICED` | `SKIPPED_NO_FEE_STRUCTURE` | `COMMITTED` | `FAILED`.
- [ ] Creating a draft materializes one `BillingRunRow` per in-scope student and one `BillingRunLine`
      per fee component, with keringanan already resolved through `applyAdjustments` — reused
      unchanged from Cycle A, not reimplemented.
- [ ] **Commit writes the draft verbatim.** It does not re-derive amounts. Rationale below under
      Assumptions — this is a deliberate change from today's batch route, which treats its payload as
      untrusted and recomputes.
- [ ] **Commit re-checks duplicates at commit time**, regardless of the draft. A row whose student
      already has an invoice for that `periodLabel` flips to `SKIPPED_ALREADY_INVOICED` and writes
      nothing. Staleness is acceptable for amounts; it is not acceptable for double-billing a family.
- [ ] Commit is **resumable and idempotent**: a row with `invoiceId` set is never committed twice.
      Re-running commit on a partially-committed run picks up only `PENDING` rows.
- [ ] Step 1 scopes by class (multi-select) with individual student add/remove on top, and reports
      counts before the draft is built.
- [ ] Step 2 lists **one row per student** — name, class, total, and a badge when keringanan applied —
      expandable to show that student's lines with the adjustment and its reason. Read-only this cycle.
- [ ] A row can be excluded from the run in step 2 without cancelling the run or affecting later runs.
- [ ] Step 3 shows run totals (students, invoices, grand total, count carrying keringanan) and commits
      via chunked calls with live progress, reusing the chunk/retry/pacing/auto-sweep logic in
      `lib/finance/run-bulk-generate.ts` rather than a second orchestrator.
- [ ] **One bulk path.** The three-field "Buat Tagihan" dialog is removed. `/api/invoices/generate/plan`
      and `/api/invoices/generate/batch` are retired along with it, and their tests are replaced rather
      than left asserting dead routes.
- [ ] A draft survives a page refresh and can be resumed or cancelled from `/admin/invoices`.
- [ ] All new routes admin-only and tenant-scoped, per `.claude/standards/security.md`.

### Non-goals

- **Editing in step 2.** No inline amount edits, no ad-hoc discount lines, no extra catalog lines.
  That is Cycle B2, which this cycle's shape is designed to accept.
- **Writing back to durable keringanan.** A per-run tweak (B2) will never create a
  `StudentFeeAdjustment`; that stays managed on the Keringanan tab.
- **Invoice-level (whole-invoice) adjustments.** Still deferred — see Cycle A's non-goals.
- **Scheduling / recurring runs.** No cron, no "bill on the 1st of every month".
- **Manual invoice creation.** `POST /api/invoices` and `manual-invoice-dialog.tsx` are untouched.
- **The Invoice duplicate unique index.** Still outstanding from Cycle A's dropped T9; the commit-time
  re-check here narrows the window but does not close the DB-level race. Separate cycle.
- **Prod deploy.** Staging only unless the owner says otherwise.

### Assumptions

1. **Commit trusts the draft's amounts.** This deliberately drops the re-derivation guarantee the
   current batch route has. The reason: once B2 lets an admin hand-edit a line, re-deriving would
   throw that edit away, so the draft must be authoritative. The protections that replace it are the
   admin-only tenant-scoped write path, the commit-time duplicate re-check, and the fact that an admin
   can already write arbitrary amounts through manual invoice creation. Flag if you want commit to
   re-derive and reject drifted rows instead.
2. **Draft staleness is surfaced, not prevented.** If a fee structure or keringanan changes after the
   draft is built, the draft keeps the old numbers. Step 3 shows the draft's age and offers "hitung
   ulang" (rebuild rows from current data, discarding B2 edits with a confirm).
3. **One open draft per tenant at a time.** Creating a second while a `DRAFT` exists prompts to resume
   or discard the first. Avoids two admins building conflicting runs.
4. **Step 2 pagination is server-side** against the draft rows, reusing the `api.md` list contract —
   a run is ~200 students × ~3 lines and should not ship as one payload.
5. **`ClassSectionCombobox` gets extracted and given multi-select**, mirroring the `StudentPicker`
   extraction in Cycle A. It currently lives module-private inside `app/admin/students/[id]/page.tsx`
   and is single-select only.
6. **No stepper primitive exists**, so one gets built from vendored Shadcn parts. It stays in
   `components/ui/` only if it is genuinely generic; otherwise it lives beside the wizard.
7. **Retiring `/plan` and `/batch` means rewriting their tests**, plus the bulk section of
   `e2e/admin.spec.ts` and most of `lib/finance/__tests__/run-bulk-generate.test.ts`. The chunk-loop
   module itself is kept and repointed, not deleted — its retry/backoff/pacing behaviour is
   battle-tested and re-earning it would be a regression risk.

## Tasks

- [ ] **T1 — Schema + migration.** Add `BillingRun`, `BillingRunRow`, `BillingRunLine` to
      `prisma/schema.prisma` with `Restrict` FKs, `@@index([tenantId, status])`,
      `@@index([billingRunId, status])`, and `@@unique([billingRunId, studentId])` (a student appears
      once per run). Hand-author the migration with RLS enable + `service_role` policy.
      *Acceptance:* `npx prisma validate` clean, `scripts/verify-rls-coverage.sh` passes with all three
      new tables. *Depends on:* nothing.

- [ ] **T2 — Validation schemas.** `lib/validations/billing-run.ts` — create (scope), row-exclude
      toggle, commit-chunk. Follow the conventions in `lib/validations/student-fee-adjustment.ts`.
      *Acceptance:* unit tests reject an empty scope, a commit chunk over the cap, and a malformed
      `dueDate`. *Depends on:* T1.

- [ ] **T3 — Draft builder.** `lib/finance/build-billing-run.ts` — given scope + tenant + year +
      dueDate, resolve in-scope students (class multi-select ∪ explicit includes, minus excludes),
      classify each into eligible / already-invoiced / no-fee-structure, and materialize rows + lines
      through `applyAdjustments` (reuse from Cycle A, unchanged). Keep the DB reads at the edges so
      the classification logic is unit-testable.
      *Acceptance:* tests cover class scoping, individual include/exclude, dedup of a student in two
      classes, the two skip reasons, and keringanan landing on the right line with the right note.
      *Depends on:* T1.

- [ ] **T4 — Create-draft route.** `POST /api/billing-runs` — builds and persists the draft in one
      transaction. `export const maxDuration = 60` as the batch route does. Rejects a second open
      `DRAFT` with a 409 naming the existing run.
      *Acceptance:* API tests for 403 non-admin, tenant-scoped class ids, the 409 on a second draft,
      and a 200 materializing the expected row/line counts. *Depends on:* T2, T3.

- [ ] **T5 — Read / mutate / cancel routes.** `GET /api/billing-runs/[id]` (paginated rows per
      `api.md`, with lines for expanded rows), `GET /api/billing-runs?status=DRAFT` (resume lookup),
      `PATCH /api/billing-runs/[id]/rows/[rowId]` (exclude / re-include only this cycle),
      `PATCH /api/billing-runs/[id]` (cancel). No `DELETE` — cancel is a status flip.
      *Acceptance:* tests for tenant scoping, 404 cross-tenant, pagination, and that exclude flips
      status without touching lines. *Depends on:* T4.

- [ ] **T6 — Commit route.** `POST /api/billing-runs/[id]/commit` taking a chunk of row ids. Per chunk,
      inside one transaction: re-check the already-invoiced condition, reserve invoice numbers
      (`reserveInvoiceNumbers`), create invoices + lines **from the draft rows verbatim**, set
      `BillingRunRow.invoiceId`. Then the post-commit payment-session fan-out, reusing the existing
      `limit(2)` concurrency and `formatPaymentLinkError` handling. Flip the run to `COMMITTED` when no
      `PENDING` rows remain.
      *Acceptance:* tests prove a row with `invoiceId` is never committed twice, a row whose student
      got invoiced between draft and commit is skipped with the right status, amounts are written
      exactly as drafted, and a payment-link failure leaves the invoice `PENDING_PAYMENT_LINK` without
      failing the row. *Depends on:* T4.

- [ ] **T7 — Extract + extend the class picker.** Move `ClassSectionCombobox` out of
      `app/admin/students/[id]/page.tsx:73-170` into `components/admin/class-section-picker.tsx`,
      preserving today's single-select behaviour for the existing caller, and add a multi-select
      variant grouped by campus. Same shape as Cycle A's `StudentPicker` extraction.
      *Acceptance:* the students page still enrolls with no behavioural change; the extracted
      single-select is byte-identical in behaviour; multi-select returns an id array.
      *Depends on:* nothing. Independent of T1-T6.

- [ ] **T8 — Wizard shell + step 1 (Scope).** New `components/admin/invoices/billing-run-wizard/`.
      Build the step indicator from vendored primitives (none exists). Step 1: periode, jatuh tempo,
      tahun ajaran, class multi-select (T7), student add/remove via the Cycle A `StudentPicker`, and a
      live in-scope count. "Lanjutkan" creates the draft. Cross-check
      `.claude/standards/design-system.html`; apply `better-layout` and `better-accessibility` for the
      step semantics and focus movement between steps.
      *Acceptance:* scope selections produce the expected draft; refreshing mid-wizard resumes from the
      persisted draft. *Depends on:* T4, T7.

- [ ] **T9 — Steps 2 and 3.** Step 2: per-student rows (name, class, total, keringanan badge),
      expandable to lines showing `Penyesuaian` + reason, server-paginated, with an exclude toggle
      per row. Read-only otherwise. Step 3: run totals + commit with live progress, driving the
      repointed chunk loop. Indonesian copy per `.claude/standards/voice.md`.
      *Acceptance:* a run with a keringanan student shows the badge and the correct reduced total;
      excluding a row drops it from the step 3 totals; commit reports per-row results.
      *Depends on:* T5, T6.

- [ ] **T10 — Retire the old path.** Delete the three-field dialog from
      `app/admin/invoices/invoices-client.tsx`, delete `app/api/invoices/generate/{plan,batch}`, and
      repoint `lib/finance/run-bulk-generate.ts` at the commit endpoint — keep its chunking, retry,
      backoff, inter-chunk pacing and pending-link auto-sweep. Rewrite
      `lib/finance/__tests__/run-bulk-generate.test.ts` against the new endpoint and delete
      `invoices-generate-{plan,batch}.test.ts`.
      *Acceptance:* no reference to `/api/invoices/generate` remains anywhere; the retry, pacing and
      abort behaviours still have equivalent test coverage — verify by name, not by count.
      *Depends on:* T9.

- [ ] **T11 — E2E.** Extend `e2e/admin.spec.ts`'s bulk section (currently drives the retired dialog) to
      walk the wizard: scope one class → draft → step 2 shows rows → commit → toast. Keep it lean per
      the testing-gate policy; hard assertions only, no seed-conditional skips — `/ship`'s soft-skip
      delta check blocks net growth.
      *Acceptance:* spec green locally, or deferred to the required CI `Playwright E2E` check and
      recorded in Verification. *Depends on:* T10.

- [ ] **T12 — Docs.** README (finance module capability, route count, an ADR row for the
      draft-then-commit decision and the trust-the-draft trade-off), CLAUDE.md (route + e2e counts),
      `docs/runbooks/module-capability-guide.md`, `docs/uat/jobs/admin.md` (the bulk-generate JTBD now
      describes a wizard).
      *Acceptance:* `/audit-docs` reports zero `fail` findings. *Depends on:* T1-T11.

## Implementation

## Verification

## Ship Notes
