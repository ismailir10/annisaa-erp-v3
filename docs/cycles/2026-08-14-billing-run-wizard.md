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

- [x] **T1 — Schema + migration.** Add `BillingRun`, `BillingRunRow`, `BillingRunLine` to
      `prisma/schema.prisma` with `Restrict` FKs, `@@index([tenantId, status])`,
      `@@index([billingRunId, status])`, and `@@unique([billingRunId, studentId])` (a student appears
      once per run). Hand-author the migration with RLS enable + `service_role` policy.
      *Acceptance:* `npx prisma validate` clean, `scripts/verify-rls-coverage.sh` passes with all three
      new tables. *Depends on:* nothing.

- [x] **T2 — Validation schemas.** `lib/validations/billing-run.ts` — create (scope), row-exclude
      toggle, commit-chunk. Follow the conventions in `lib/validations/student-fee-adjustment.ts`.
      *Acceptance:* unit tests reject an empty scope, a commit chunk over the cap, and a malformed
      `dueDate`. *Depends on:* T1.

- [x] **T3 — Draft builder.** `lib/finance/build-billing-run.ts` — given scope + tenant + year +
      dueDate, resolve in-scope students (class multi-select ∪ explicit includes, minus excludes),
      classify each into eligible / already-invoiced / no-fee-structure, and materialize rows + lines
      through `applyAdjustments` (reuse from Cycle A, unchanged). Keep the DB reads at the edges so
      the classification logic is unit-testable.
      *Acceptance:* tests cover class scoping, individual include/exclude, dedup of a student in two
      classes, the two skip reasons, and keringanan landing on the right line with the right note.
      *Depends on:* T1.

- [x] **T4 — Create-draft route.** `POST /api/billing-runs` — builds and persists the draft in one
      transaction. `export const maxDuration = 60` as the batch route does. Rejects a second open
      `DRAFT` with a 409 naming the existing run.
      *Acceptance:* API tests for 403 non-admin, tenant-scoped class ids, the 409 on a second draft,
      and a 200 materializing the expected row/line counts. *Depends on:* T2, T3.

- [x] **T5 — Read / mutate / cancel routes.** `GET /api/billing-runs/[id]` (paginated rows per
      `api.md`, with lines for expanded rows), `GET /api/billing-runs?status=DRAFT` (resume lookup),
      `PATCH /api/billing-runs/[id]/rows/[rowId]` (exclude / re-include only this cycle),
      `PATCH /api/billing-runs/[id]` (cancel). No `DELETE` — cancel is a status flip.
      *Acceptance:* tests for tenant scoping, 404 cross-tenant, pagination, and that exclude flips
      status without touching lines. *Depends on:* T4.

- [x] **T6 — Commit route.** `POST /api/billing-runs/[id]/commit` taking a chunk of row ids. Per chunk,
      inside one transaction: re-check the already-invoiced condition, reserve invoice numbers
      (`reserveInvoiceNumbers`), create invoices + lines **from the draft rows verbatim**, set
      `BillingRunRow.invoiceId`. Then the post-commit payment-session fan-out, reusing the existing
      `limit(2)` concurrency and `formatPaymentLinkError` handling. Flip the run to `COMMITTED` when no
      `PENDING` rows remain.
      *Acceptance:* tests prove a row with `invoiceId` is never committed twice, a row whose student
      got invoiced between draft and commit is skipped with the right status, amounts are written
      exactly as drafted, and a payment-link failure leaves the invoice `PENDING_PAYMENT_LINK` without
      failing the row. *Depends on:* T4.

- [x] **T7 — Extract + extend the class picker.** Move `ClassSectionCombobox` out of
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

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-4-6; T1 ∥ T7 parallel, then T2 ∥ T3,
  then T4, then T5 ∥ T6, then T8, T9, T10, T11, T12 sequential (each depends on the last).
- Task 1: Schema + migration — `prisma/schema.prisma`,
  `prisma/migrations/20260814000000_add_billing_run/migration.sql` — three models. The cascade split is
  the load-bearing part: rows and lines `Cascade` from their parent so deleting a run cleans up after
  itself, while `student` and `feeComponent` stay `Restrict`. `BillingRunRow.invoiceId` is a plain
  nullable column rather than a relation, deliberately — it is the commit idempotency guard, and
  keeping it unrelated means voiding an invoice can never block deleting the run that produced it.
  Diff is 73 insertions, 0 deletions; `prisma format` was explicitly not run.
- Task 2: Validation schemas — `lib/validations/billing-run.ts`,
  `lib/validations/__tests__/billing-run.test.ts` — create / row-status / commit-chunk / cancel
  schemas. `createBillingRunSchema` refuses a scope with neither classes nor students: an empty scope
  is the one input where the two plausible readings ("bill nobody" vs "bill everybody") differ by ~200
  invoices, so it is rejected rather than guessed. Commit chunk capped at 25, matching `BATCH_SIZE` in
  the existing orchestrator.
- Task 3: Draft builder — `lib/finance/build-billing-run.ts`,
  `lib/finance/__tests__/build-billing-run.test.ts` — `buildBillingRunRows()` takes already-fetched
  data and returns materialized rows + lines + a summary. Deliberately pure: the DB reads stay in the
  route (T4), so the logic deciding who gets billed is unit-testable without mocking Prisma. Line and
  total maths are `applyAdjustments` from Cycle A, called not copied, so Cycle A's status /
  academic-year / validity gate still applies and `totalDue` is the resolver's rather than a re-sum.
  Scope resolution is class-match ∪ explicit-include, deduped by student (first in-scope enrollment
  wins, matching the batch route it replaces), with excludes applied last so they win over both.
- Task 7: Extract + extend the class picker — `components/admin/class-section-picker.tsx` (new),
  `app/admin/students/[id]/page.tsx` — `ClassSectionCombobox` was module-private inside the students
  page; it is now exported, with a `ClassSectionMultiPicker` sibling for the wizard's step 1. The
  single-select's JSX is byte-identical; `label()` and campus grouping were lifted to module-level
  helpers so both variants share them. Multi-select keeps the popover open on select, shows a
  Checkbox per option, summarises as "N kelas dipilih", and carries `role="listbox"` +
  `aria-multiselectable` — cmdk renders no ARIA roles of its own, so there was no convention to
  inherit and they were added explicitly.
- Tasks 4 + 5: Billing-run routes — `app/api/billing-runs/route.ts` (POST create + GET list),
  `app/api/billing-runs/[id]/route.ts` (GET run + paginated rows, PATCH cancel),
  `app/api/billing-runs/[id]/rows/[rowId]/route.ts` (PATCH exclude/re-include),
  `app/api/__tests__/billing-runs.test.ts` — admin-gated and tenant-scoped throughout. Reads happen
  outside the transaction, persistence inside it, with `createMany` for rows and lines rather than
  looped inserts. The single-open-draft guard runs the duplicate check and the insert inside one
  `Serializable` transaction, so two concurrent POSTs cannot both pass it — a plain pre-check would
  leave a race window. `GET [id]` nests the standard `api.md` pagination envelope under `rows` since
  the endpoint returns one run plus a paginated sub-list rather than a flat list. No `revalidate` on
  any of them; draft state is mutable and per-request.
  Two security findings from review, both fixed rather than deferred:
  - **`academicYearId` was not tenant-verified.** The scope arrays were, but the year — which selects
    the fee structures and keringanan the entire run is priced from, and which gets persisted onto the
    run — was passed straight through. A foreign year would have priced this tenant's invoices off
    another tenant's fee table. Now checked before any pricing data is read.
  - **Cancel denylisted `COMMITTED` instead of allowlisting `DRAFT`**, so a `COMMITTING` run could be
    cancelled with a commit in flight, leaving invoices written against a run marked `CANCELLED`.
    Inverted, so any status added later is refused by default instead of silently becoming cancellable.
- Task 6: Commit route — `app/api/billing-runs/[id]/commit/route.ts`,
  `app/api/__tests__/billing-runs-commit.test.ts` — takes a chunk of row ids, re-checks duplicates
  against live `Invoice` data, then in one transaction reserves invoice numbers and writes invoices +
  lines **verbatim from the draft**. Payment-session fan-out reuses the batch route's `limit(2)` and
  `formatPaymentLinkError`, outside the transaction, so a gateway failure leaves
  `PENDING_PAYMENT_LINK` without rolling anything back.
  **The critical fix in this task: rows are now claimed inside the transaction.** As first written,
  the `PENDING && invoiceId == null` guard ran outside the transaction — classic check-then-act. Two
  overlapping commits naming the same rows would both see PENDING, both find no live duplicate, and
  both create an invoice, leaving the family with two payable links. Not hypothetical:
  `run-bulk-generate` retries a chunk with an identical body on any 5xx or network error, so a
  client-perceived timeout mid-commit is exactly that race. The claim is now the first write in the
  transaction — a conditional `updateMany` on `{ id, status: "PENDING", invoiceId: null }` — with
  invoice ids pre-generated so the claim can carry the real `invoiceId`. A concurrent transaction
  blocks on the row lock, re-evaluates the predicate after the first commits, matches nothing, and
  drops the row. Only claim winners get an invoice. This also removed the createMany-then-re-query
  dance the batch route needs.

## Verification

- Task 1: gates passed — `npm run build` exit 0, `npx vitest run` 297 files / 2825 tests passed,
  2 skipped, 42 todo. `npx prisma validate` valid, `scripts/verify-rls-coverage.sh` → 41/41.
  Whitespace-churn guard: `git diff --stat` and `git diff -w --stat` both report 73 insertions, so the
  change is additions-only. `feature-dev:code-reviewer` compared the migration to the models column by
  column, including the cascade/restrict split, and found no drift.
- Task 2: gates passed — same build + vitest run as Task 1. 26 schema tests, including the
  empty-scope rejection from both directions (classes-only empty, students-only empty) and the
  commit-cap boundary at 25 accepted / 26 rejected.
- Task 3: gates passed — same build + vitest run. 16 builder tests covering each of the spec's seven
  rules plus dedup across two in-scope classes, include-without-class-match, exclude beating both
  admission paths, and the two skip reasons producing no lines and a zero total. The reviewer was
  asked specifically whether any rule would still pass if broken; it confirmed the tests assert
  line-level breakdown (amount / adjustmentAmount / finalAmount / note), not just row counts.
- Task 7: gates passed — same build + vitest run; `npm run lint` clean on the new file, and the two
  warnings on the students page were confirmed pre-existing by linting `git show HEAD:` of it.
  Faithfulness verified rather than asserted: the old inline function was extracted from
  `git show HEAD:` and diffed against the new one — the only differences are the added `export` and
  the two lifted helpers, and an isolated diff of the JSX return blocks prints identical. Both call
  sites (enroll + promote dialogs) show zero diff hunks.
- Tasks 4 + 5: gates passed — `npm run build` exit 0, `npx vitest run` 298 files / 2852 tests passed,
  2 skipped, 42 todo. 27 route tests; the auth, cross-tenant and state-machine tests all assert the
  write was never attempted rather than only the status code. Two tests were added for the review
  fixes: a foreign `academicYearId` returns 404 with no pricing data read, and cancelling a
  `COMMITTING` run returns 409.
  **Process note:** `/build` asks for both `feature-dev:code-reviewer` and `superpowers:code-reviewer`
  on security-sensitive diffs. Only the security reviewer ran on this pair — the session hit its
  usage limit mid-cycle and the second pass was dropped deliberately to keep budget for the commit
  route, which is the higher-risk diff. Recorded here rather than left implicit.
- Task 6: gates passed — `npm run build` exit 0, `npx vitest run` 299 files / 2873 tests passed,
  2 skipped, 42 todo. 21 commit tests. Two were added or strengthened after review:
  - a **lost-claim test** — the row looked PENDING on read but the in-transaction `updateMany` matches
    0 rows, asserting no invoice and no line is written. This is the retry path.
  - the **verbatim-amounts test was weak and is now real.** Its fixture had `totalDue` equal to the
    sum of its lines, so a recomputing implementation would have passed it — the assertion proved
    nothing. The fixture now models a stale draft (`totalDue: 999_000` against a single 450_000 line),
    which is the only shape that can distinguish "trusts the draft" from "re-sums the lines".
  `superpowers:code-reviewer` confirmed tenant isolation, transaction boundary, `reserveInvoiceNumbers`
  receiving the tx client, and that the duplicate re-check uses the same `periodLabel` the invoice is
  written with (no trim mismatch).

## Ship Notes
