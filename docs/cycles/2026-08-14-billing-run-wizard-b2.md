# Billing Run wizard B2 — editable step 2, rebuild, discard

## Context

Cycle B1 (`2026-08-14-billing-run-wizard`, PR #494) replaced the three-field "Buat Tagihan" dialog with
a three-step wizard on a persisted `BillingRun` draft. Step 2 renders one row per student with lines,
a keringanan badge and an exclude toggle — and is **read-only**, by explicit non-goal. The commit route
already writes `BillingRunLine` rows verbatim into `InvoiceLine` (B1 Assumption 1: commit trusts the
draft precisely so that B2's hand-edits survive it), so the server side of editing is mostly in place:
what is missing is the mutation surface on the draft, not the path from draft to invoice.

This is **Cycle B2 of the bulk invoice wizard arc**, and it closes the arc. It makes step 2 editable —
change a component amount, add an ad-hoc discount line, add an extra line from the `FeeComponentDef`
catalog, remove a line — and picks up the two loose ends B1 left explicitly:

- **The resume banner has no discard.** B1's acceptance criterion read "a draft survives a page refresh
  and can be resumed *or cancelled* from `/admin/invoices`". Only resume shipped; cancelling is reachable
  only by starting a new run and using the 409 conflict panel's "Buang & Mulai Baru". Recorded as a minor
  in B1's preview-verify.
- **"Hitung ulang" was deferred.** B1 Assumption 2 said a stale draft keeps its old numbers and step 3
  would offer a rebuild from current data. Draft age is surfaced; the rebuild is not built.

`BillingRunLine.source` already carries `BASE`, with the schema comment reserving `MANUAL` for this cycle.
It is a plain `String` column with no enum, so adding values needs no migration — **this cycle ships no
migration at all.**

UAT input: none applicable. Newest report in `docs/uat/reports/` is `2026-06-04-admin-teacher-full.md`,
over 60 days old and not scoped to invoicing.

## Spec

### Acceptance criteria

- [ ] **A component amount can be edited inline in step 2.** The admin edits the line's *final* amount —
      the figure the family pays for that component. The server derives `adjustmentAmount = finalAmount −
      amount`, keeping Cycle A's invariant `amount + adjustmentAmount === finalAmount` true on every line
      the parent can see. `amount` (the fee-structure base) is never overwritten.
- [ ] **An ad-hoc discount line can be added to a row.** Label + positive magnitude; persisted as
      `amount: 0`, `adjustmentAmount: −X`, `finalAmount: −X`, `source: "MANUAL"`. A negative line is the
      honest representation of a credit and is what makes the row total drop; per-line clamp-at-zero
      therefore does **not** apply to `MANUAL` lines (see Assumptions).
- [ ] **An extra line can be added from the `FeeComponentDef` catalog** — enabled, `ACTIVE` components
      only, excluding ones already on the row. Amount pre-fills from `ProgramFeeStructure` for that
      component and academic year when one exists, otherwise blank. Persisted `source: "MANUAL"`,
      `adjustmentAmount: 0`.
- [ ] **A line can be removed**, except the last remaining line of a row that is still `PENDING` — an
      invoice with no lines is not a thing to commit. That case says so and points at the row's exclude
      toggle instead.
- [ ] **`BillingRunRow.totalDue` is re-summed from the row's lines on every line mutation**, clamped at
      zero. This deliberately supersedes B1's "`applyAdjustments` owns `totalDue`, never re-summed" —
      once a line is hand-edited, the resolver's total is stale by construction.
- [ ] **`adjustmentNote` is parent-visible and is treated as such.** The edit form pre-fills the existing
      note (so a keringanan reason is never silently clobbered), the help text states that families read
      it, and the server writes a default note rather than leaving a non-zero adjustment unexplained on
      a family's invoice.
- [ ] **Every line mutation is refused unless the run is `DRAFT` and the row is `PENDING` or `EXCLUDED`.**
      A `COMMITTED` row already has an invoice; a `SKIPPED_*` row has no lines and is not billable.
- [ ] **Edited and manual lines are visually distinguishable in step 2**, and a row carrying either shows
      a badge alongside the existing "Keringanan" one.
- [ ] **Step 3 offers "Hitung ulang"** — `POST /api/billing-runs/[id]/rebuild` rebuilds rows and lines
      from current fee structures and keringanan using the run's persisted scope, behind an
      `AlertDialog` that states manual edits will be discarded. `EXCLUDED` row statuses are preserved
      across the rebuild by `studentId`. Refused with 409 unless the run is `DRAFT` with no `COMMITTED`
      row.
- [ ] **The resume banner on `/admin/invoices` gains a discard action**, behind a confirm, driving the
      existing `PATCH /api/billing-runs/[id] { status: "CANCELLED" }`. Closes B1's half-met criterion.
- [ ] **The draft-materialization path is shared, not duplicated.** `POST /api/billing-runs` and the new
      rebuild route run the same reads + `buildBillingRunRows` call through one extracted helper.
- [ ] All new routes admin-only and tenant-scoped, per `.claude/standards/security.md`.
- [ ] No migration. `source` gains values on an unconstrained `String` column; no schema change ships.

### Non-goals

- **Writing back to durable keringanan.** A per-run edit never creates or mutates a
  `StudentFeeAdjustment`. That stays managed on the Keringanan tab — carried forward unchanged from B1.
- **Invoice-level (whole-invoice) adjustments.** Still deferred. A row-level ad-hoc discount line is the
  closest thing this cycle ships, and it hangs off a fee component like every other line.
- **The Invoice duplicate unique index.** Still outstanding from Cycle A's dropped T9 and B1's non-goals.
  Staging holds 2 duplicate `(tenantId, studentId, periodLabel)` groups that would break an asserting
  migration; prod is clean. Explicitly **not** this cycle — cleaning staging data is its own decision and
  does not belong inside an editing cycle.
- **Adding a student to an existing draft.** Scope is fixed at step 1. Editing changes what a row is
  billed, not who is in the run; adding a student means a new draft (or a rebuild after changing the
  scope, which this cycle does not offer either).
- **Bulk edit across rows.** One row at a time. "Give every student in this class a Rp 50.000 discount"
  is a plausible next ask and is not this cycle.
- **An audit log of who edited which line.** The run already records `createdBy`; per-line edit
  attribution is not modelled and would need a migration.
- **Prod deploy.** Staging only unless the owner says otherwise.

### Assumptions

1. **The admin edits `finalAmount`, not `amount`.** `amount` is the fee-structure snapshot and stays the
   audit anchor; the delta lands in `adjustmentAmount`. This keeps one invariant (`amount +
   adjustmentAmount === finalAmount`) true across keringanan-derived and hand-edited lines alike, which
   matters because both render side by side on the same parent invoice. Flag if you would rather the
   admin overwrite the base amount and leave `adjustmentAmount` alone.
2. **`MANUAL` lines may be negative; `BASE`/`EDITED` lines may not.** A fee component cannot cost less
   than nothing, so an edit that would drive a base line below zero is rejected. A standalone discount
   line, by contrast, is *only* meaningful as a negative — clamping it at zero would silently drop the
   discount from the row total. `BillingRunRow.totalDue` is clamped at zero regardless, matching Cycle
   A's rule for `applyAdjustments`.
3. **An ad-hoc discount line needs a `FeeComponentDef` to hang off** — the FK is required on both
   `BillingRunLine` and `InvoiceLine`, and Cycle A's non-goals named this as the blocker for
   invoice-level adjustments. Resolved with option (a) from that note: a lazily created, tenant-scoped
   system component `code: "penyesuaian_manual"`, `isEnabled: false`, `isRecurring: false`,
   `category: "OTHER"`. `isEnabled: false` keeps it out of `ProgramFeeStructure` fee queries (which
   filter on `isEnabled: true, isRecurring: true`) and out of the catalog picker, so it can never be
   billed by accident. It *will* appear in the Komponen tab on `/admin/fees` as a disabled row; that is
   honest rather than hidden, and is called out in Ship Notes.
4. **`source` gains `EDITED` alongside `MANUAL`.** B1 reserved only `MANUAL`, but a hand-edited base line
   and an admin-invented line are different things: the first still has a fee-structure amount behind it
   and is what a rebuild would restore, the second has nothing behind it. Distinguishing them costs one
   string value on an unconstrained column and makes step 2 able to say which is which.
5. **A rebuild preserves `EXCLUDED` by `studentId`, and nothing else.** Losing a carefully assembled set
   of exclusions to a rebuild would be a nasty surprise; losing manual edits is the *point* of the
   rebuild and is confirmed for. Rows that no longer resolve in scope simply disappear.
6. **Rebuild replaces rows wholesale** (delete + rematerialize inside one transaction) rather than
   diffing. `BillingRunRow` cascades to `BillingRunLine`, and the row set is derived data — a diff would
   be more code for no user-visible difference. Guarded to `DRAFT` runs with zero `COMMITTED` rows, so
   nothing carrying an `invoiceId` is ever deleted.
7. **Amounts are whole rupiah.** The edit inputs are integer-only, matching Cycle A's rupiah rounding
   rule (0 dp, `ROUND_HALF_UP`) — there are no cents to enter.
8. **No new component test infrastructure.** Step 2's editing logic that is worth testing (the line math,
   the totals re-sum, the clamps) lives in a pure module and is unit-tested there; the UI itself is
   covered by the wizard's existing e2e walk plus preview-verify, per the testing-gate policy.

## Tasks

- [ ] **T1 — Line math + validation.** Extend `lib/validations/billing-run.ts` with
      `createBillingRunLineSchema` (mode `CATALOG` | `DISCOUNT`, `feeComponentId` required for `CATALOG`,
      `label`, integer `amount`), `updateBillingRunLineSchema` (`finalAmount` integer, optional `label`,
      nullable-optional `note`) and `rebuildBillingRunSchema`. New pure
      `lib/finance/billing-run-lines.ts` owning the math: derive `adjustmentAmount` from a new
      `finalAmount`, apply the sign/clamp rules from Assumption 2 per `source`, default the note when a
      non-zero adjustment would otherwise be unexplained, and re-sum a row's `totalDue` clamped at zero.
      *Acceptance:* unit tests cover a base-line edit up and down, a rejected negative base line, a
      negative `MANUAL` line surviving unclamped, the note default firing only on non-zero adjustments,
      the invariant `amount + adjustmentAmount === finalAmount` across a mixed set, and a row whose lines
      sum below zero clamping to zero. *Depends on:* nothing.

- [ ] **T2 — Extract the draft materializer.** Move the read-and-build body of `POST /api/billing-runs`
      (`app/api/billing-runs/route.ts:141-231`) into `lib/finance/materialize-billing-run.ts`, taking a
      Prisma client + tenant/scope/year/dueDate and returning `{ rows, summary }`. Pure move — the create
      route keeps identical behaviour and its existing tests stay green untouched.
      *Acceptance:* `app/api/__tests__/billing-runs.test.ts` passes unchanged; the extracted function is
      byte-faithful to the code it replaces (verify by diff, not by assertion).
      *Depends on:* nothing. Independent of T1.

- [ ] **T3 — Line mutation routes.** `POST /api/billing-runs/[id]/rows/[rowId]/lines` (add catalog or
      discount line), `PATCH` + `DELETE` on
      `app/api/billing-runs/[id]/rows/[rowId]/lines/[lineId]/route.ts`. Three ownership hops on every
      call (run → tenant, row → run, line → row), then the DRAFT + row-status guard, then the T1 math,
      then row `totalDue` re-sum — all inside one transaction per request. The discount path lazily
      get-or-creates the system `penyesuaian_manual` component per Assumption 3, idempotently
      (`@@unique([tenantId, code])` makes a race a `P2002` to swallow, not a duplicate).
      *Acceptance:* tests for 403 non-admin, 404 cross-tenant run / foreign row / foreign line, 409 on a
      non-DRAFT run and on a COMMITTED row, catalog add rejecting a foreign or disabled component,
      discount add creating the system component exactly once across two calls, delete refusing the last
      line of a PENDING row, and `totalDue` matching the new line sum after each mutation.
      *Depends on:* T1.

- [ ] **T4 — Rebuild route.** `POST /api/billing-runs/[id]/rebuild` — reads the run's persisted `scope`,
      re-runs T2's materializer against current data, and inside one transaction deletes the existing
      rows (cascading their lines) and writes the new set, re-applying `EXCLUDED` by `studentId` per
      Assumption 5. 409 unless `DRAFT` with zero `COMMITTED` rows. `export const maxDuration = 60`, as
      the create route has.
      *Acceptance:* tests prove manual edits are gone after a rebuild, an excluded student stays
      excluded, a student who left the scope disappears, a changed fee structure is reflected, a run with
      a COMMITTED row is refused with nothing deleted, and cross-tenant returns 404.
      *Depends on:* T1, T2.

- [ ] **T5 — Step 2 editing UI.** `components/admin/invoices/billing-run-wizard/step-2-review.tsx` plus a
      new `line-editor.tsx` sibling: per-line edit control (amount + label + note, with the
      parent-visible warning on the note), "Tambah potongan" and "Tambah komponen" actions per row, and
      per-line remove. `EDITED` / `MANUAL` lines are marked, and the row header gains a badge. Cross-check
      `.claude/standards/design-system.html`; apply `better-accessibility` (the edit control is a form,
      not a click-to-edit cell — labels, `FieldError`, focus return after save) and `better-ui` for the
      inline affordance. Indonesian copy per `.claude/standards/voice.md`.
      *Acceptance:* editing an amount updates the row total in place without a page reload; adding a
      discount drops the row total; the last-line delete refusal surfaces as a message, not a silent
      no-op. *Depends on:* T3.

- [ ] **T6 — Step 3 rebuild + banner discard.** Step 3 gains a "Hitung ulang" action (in the stale-draft
      alert and as a secondary control regardless of age) behind an `AlertDialog` naming what is lost; on
      success it returns to step 2 so the rebuilt rows get reviewed, which needs one `onRebuilt` callback
      through `billing-run-wizard.tsx`. `app/admin/invoices/invoices-client.tsx`: the resume banner gains
      "Buang draf" behind a confirm, driving the existing cancel route and refreshing the banner.
      *Acceptance:* rebuilding from step 3 lands back on step 2 with fresh numbers; discarding from the
      banner removes the banner and lets a new run start without hitting the 409 conflict panel.
      *Depends on:* T4.

- [ ] **T7 — E2E.** Extend the existing wizard walk in `e2e/admin.spec.ts` with one edit: change a line's
      amount in step 2 and assert the row total moved, then continue to step 3 as today and cancel the
      draft via the API. **Do not add a commit** — B1's CI run proved a spec that writes billing rows
      changes what every later spec sees. Keep it lean, hard assertions only, no seed-conditional skips.
      *Acceptance:* spec green locally, or deferred to the required CI `Playwright E2E` check and
      recorded in Verification; soft-skip delta 0 against `origin/staging`.
      *Depends on:* T5, T6.

- [ ] **T8 — Docs.** README (finance module capability now includes per-row editing; route count),
      CLAUDE.md (route count), `docs/runbooks/module-capability-guide.md`, `docs/uat/jobs/admin.md`
      (the bulk-generate JTBD gains the edit step).
      *Acceptance:* `/audit-docs` reports zero `fail` findings. *Depends on:* T1-T7.

## Implementation

<!-- /build fills this in per task -->

## Verification

<!-- /build fills this in per task -->

## Ship Notes

<!-- /ship fills this in -->
