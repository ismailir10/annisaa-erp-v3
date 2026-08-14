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

- [x] **A component amount can be edited inline in step 2.** The admin edits the line's *final* amount —
      the figure the family pays for that component. The server derives `adjustmentAmount = finalAmount −
      amount`, keeping Cycle A's invariant `amount + adjustmentAmount === finalAmount` true on every line
      the parent can see. `amount` (the fee-structure base) is never overwritten.
- [x] **An ad-hoc discount line can be added to a row.** Label + positive magnitude; persisted as
      `amount: 0`, `adjustmentAmount: −X`, `finalAmount: −X`, `source: "MANUAL"`. A negative line is the
      honest representation of a credit and is what makes the row total drop; per-line clamp-at-zero
      therefore does **not** apply to `MANUAL` lines (see Assumptions).
- [x] **An extra line can be added from the `FeeComponentDef` catalog** — enabled, `ACTIVE` components
      only, excluding ones already on the row. Persisted `source: "MANUAL"`, `adjustmentAmount: 0`.
      *(Partially met, deliberately: the amount does NOT pre-fill from `ProgramFeeStructure`.*
      *`BillingRunRow` carries no `programId`, so step 2 cannot resolve which fee-structure row applies,*
      *and plumbing one through to save a typed number is not worth a schema change. The label pre-fills*
      *from the component and the amount field says it is not auto-filled. See T5 in Implementation.)*
- [x] **A line can be removed**, except the last remaining line of a row that is still `PENDING` — an
      invoice with no lines is not a thing to commit. That case says so and points at the row's exclude
      toggle instead.
- [x] **`BillingRunRow.totalDue` is re-summed from the row's lines on every line mutation**, clamped at
      zero. This deliberately supersedes B1's "`applyAdjustments` owns `totalDue`, never re-summed" —
      once a line is hand-edited, the resolver's total is stale by construction.
- [x] **`adjustmentNote` is parent-visible and is treated as such.** The edit form pre-fills the existing
      note (so a keringanan reason is never silently clobbered), the help text states that families read
      it, and the server writes a default note rather than leaving a non-zero adjustment unexplained on
      a family's invoice.
- [x] **Every line mutation is refused unless the run is `DRAFT` and the row is `PENDING` or `EXCLUDED`.**
      A `COMMITTED` row already has an invoice; a `SKIPPED_*` row has no lines and is not billable.
- [x] **Edited and manual lines are visually distinguishable in step 2**, and a row carrying either shows
      a badge alongside the existing "Keringanan" one.
- [x] **Step 3 offers "Hitung ulang"** — `POST /api/billing-runs/[id]/rebuild` rebuilds rows and lines
      from current fee structures and keringanan using the run's persisted scope, behind an
      `AlertDialog` that states manual edits will be discarded. `EXCLUDED` row statuses are preserved
      across the rebuild by `studentId`. Refused with 409 unless the run is `DRAFT` with no `COMMITTED`
      row.
- [x] **The resume banner on `/admin/invoices` gains a discard action**, behind a confirm, driving the
      existing `PATCH /api/billing-runs/[id] { status: "CANCELLED" }`. Closes B1's half-met criterion.
- [x] **The draft-materialization path is shared, not duplicated.** `POST /api/billing-runs` and the new
      rebuild route run the same reads + `buildBillingRunRows` call through one extracted helper.
- [x] All new routes admin-only and tenant-scoped, per `.claude/standards/security.md`.
- [x] No migration. `source` gains values on an unconstrained `String` column; no schema change ships.

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

- [x] **T1 — Line math + validation.** Extend `lib/validations/billing-run.ts` with
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

- [x] **T2 — Extract the draft materializer.** Move the read-and-build body of `POST /api/billing-runs`
      (`app/api/billing-runs/route.ts:141-231`) into `lib/finance/materialize-billing-run.ts`, taking a
      Prisma client + tenant/scope/year/dueDate and returning `{ rows, summary }`. Pure move — the create
      route keeps identical behaviour and its existing tests stay green untouched.
      *Acceptance:* `app/api/__tests__/billing-runs.test.ts` passes unchanged; the extracted function is
      byte-faithful to the code it replaces (verify by diff, not by assertion).
      *Depends on:* nothing. Independent of T1.

- [x] **T3 — Line mutation routes.** `POST /api/billing-runs/[id]/rows/[rowId]/lines` (add catalog or
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

- [x] **T4 — Rebuild route.** `POST /api/billing-runs/[id]/rebuild` — reads the run's persisted `scope`,
      re-runs T2's materializer against current data, and inside one transaction deletes the existing
      rows (cascading their lines) and writes the new set, re-applying `EXCLUDED` by `studentId` per
      Assumption 5. 409 unless `DRAFT` with zero `COMMITTED` rows. `export const maxDuration = 60`, as
      the create route has.
      *Acceptance:* tests prove manual edits are gone after a rebuild, an excluded student stays
      excluded, a student who left the scope disappears, a changed fee structure is reflected, a run with
      a COMMITTED row is refused with nothing deleted, and cross-tenant returns 404.
      *Depends on:* T1, T2.

- [x] **T5 — Step 2 editing UI.** `components/admin/invoices/billing-run-wizard/step-2-review.tsx` plus a
      new `line-editor.tsx` sibling: per-line edit control (amount + label + note, with the
      parent-visible warning on the note), "Tambah potongan" and "Tambah komponen" actions per row, and
      per-line remove. `EDITED` / `MANUAL` lines are marked, and the row header gains a badge. Cross-check
      `.claude/standards/design-system.html`; apply `better-accessibility` (the edit control is a form,
      not a click-to-edit cell — labels, `FieldError`, focus return after save) and `better-ui` for the
      inline affordance. Indonesian copy per `.claude/standards/voice.md`.
      *Acceptance:* editing an amount updates the row total in place without a page reload; adding a
      discount drops the row total; the last-line delete refusal surfaces as a message, not a silent
      no-op. *Depends on:* T3.

- [x] **T6 — Step 3 rebuild + banner discard.** Step 3 gains a "Hitung ulang" action (in the stale-draft
      alert and as a secondary control regardless of age) behind an `AlertDialog` naming what is lost; on
      success it returns to step 2 so the rebuilt rows get reviewed, which needs one `onRebuilt` callback
      through `billing-run-wizard.tsx`. `app/admin/invoices/invoices-client.tsx`: the resume banner gains
      "Buang draf" behind a confirm, driving the existing cancel route and refreshing the banner.
      *Acceptance:* rebuilding from step 3 lands back on step 2 with fresh numbers; discarding from the
      banner removes the banner and lets a new run start without hitting the 409 conflict panel.
      *Depends on:* T4.

- [x] **T7 — E2E.** Extend the existing wizard walk in `e2e/admin.spec.ts` with one edit: change a line's
      amount in step 2 and assert the row total moved, then continue to step 3 as today and cancel the
      draft via the API. **Do not add a commit** — B1's CI run proved a spec that writes billing rows
      changes what every later spec sees. Keep it lean, hard assertions only, no seed-conditional skips.
      *Acceptance:* spec green locally, or deferred to the required CI `Playwright E2E` check and
      recorded in Verification; soft-skip delta 0 against `origin/staging`.
      *Depends on:* T5, T6.

- [x] **T8 — Docs.** README (finance module capability now includes per-row editing; route count),
      CLAUDE.md (route count), `docs/runbooks/module-capability-guide.md`, `docs/uat/jobs/admin.md`
      (the bulk-generate JTBD gains the edit step).
      *Acceptance:* `/audit-docs` reports zero `fail` findings. *Depends on:* T1-T7.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-4-6; T1 ∥ T2 parallel (disjoint files),
  then T3 ∥ T4, then T5, T6, T7, T8 sequential.
- Task 1: Line math + validation — `lib/validations/billing-run.ts`,
  `lib/validations/__tests__/billing-run.test.ts`, `lib/finance/billing-run-lines.ts` (new),
  `lib/finance/__tests__/billing-run-lines.test.ts` (new). `resolveLineEdit()` derives
  `adjustmentAmount = finalAmount − amount` and flips a `BASE`/`ADJUSTMENT` line to `EDITED`;
  `buildManualLineFields()` builds the two `MANUAL` shapes (catalog: positive `amount`, zero
  adjustment; discount: zero `amount`, negative adjustment and final); `sumRowTotal()` re-sums a row
  clamped at zero. A negative result on a non-`MANUAL` line is **rejected rather than clamped** — the
  admin typed a number and silently substituting a different one is worse than refusing it. `note` on
  the update schema is `.nullable().optional()`, not `.optional()`: Cycle A shipped the `.optional()`
  version for its validity dates and discovered a bound could never be cleared once set.
- Task 2: Extract the draft materializer — `lib/finance/materialize-billing-run.ts` (new),
  `app/api/billing-runs/route.ts`. Pure move of the read-and-build body so the rebuild route (T4) runs
  the identical queries instead of a second copy that can drift. `db` is typed
  `Prisma.TransactionClient` per `reserveInvoiceNumbers`' convention, so T4 can call it inside its
  transaction. `periodLabel` is passed already-trimmed, matching the create route — the
  already-invoiced query keys off that exact string and a trim mismatch there would silently stop
  detecting duplicates.

- Task 3: Line mutation routes — `app/api/billing-runs/[id]/rows/[rowId]/lines/route.ts` (POST) and
  `.../lines/[lineId]/route.ts` (PATCH + DELETE), `app/api/__tests__/billing-run-lines.test.ts`. Three
  ownership hops per call, then the DRAFT + row-status allowlist, then the T1 math, then the row-total
  re-sum — mutation and re-sum share one transaction so a row can never be left with lines that don't
  match its `totalDue`. The catalog path refuses a duplicate component on a row (a doubled fee is a
  support call); the discount path get-or-creates the `penyesuaian_manual` system component with a
  `P2002` catch that re-finds, so two concurrent discount adds produce one component rather than a 500.
  PATCH never writes `amount` and surfaces `resolveLineEdit`'s rejection as a 400 rather than clamping.
- Task 4: Rebuild route — `app/api/billing-runs/[id]/rebuild/route.ts`,
  `app/api/__tests__/billing-runs-rebuild.test.ts`. Reads (including `materializeBillingRun`) outside
  the transaction, delete-then-recreate inside it, mirroring the create route's split. `run.scope` is a
  `Json` column and is shape-validated rather than cast — a present-but-malformed field throws instead
  of silently rebuilding the run down to nothing. The builder's `summary.excluded` is always 0 by
  construction, so it is corrected to the re-applied count (and `pending` reduced) before returning, or
  the UI would report 0 excluded immediately after preserving several.
  **Driver fix after review: the DRAFT and COMMITTED-row guards were check-then-act.** They ran outside
  the transaction, and the commit route flips a run `DRAFT` → `COMMITTING` and then claims rows inside
  *its* transaction — so a commit starting between the rebuild's check and its `deleteMany` would have
  had its rows deleted from under it, leaving invoices written against rows that no longer exist. Both
  conditions are now re-checked under the run's row lock: a conditional `updateMany` on
  `{ id, status: "DRAFT" }` is the first statement in the transaction, and the COMMITTED count is
  re-run after it. Same claim-first shape B1 used for its rows. Two tests cover the lost-race paths and
  assert nothing was deleted.
- Task 5: Step 2 editing UI — `components/admin/invoices/billing-run-wizard/line-editor.tsx` (new),
  `step-2-review.tsx`, `types.ts`. `EditableRowLines` replaces the read-only line list for rows whose
  status is `PENDING`/`EXCLUDED`, mirroring the route's allowlist so the UI never offers an action the
  server would refuse. Four surfaces: edit a line (label + final amount + note), "Tambah Potongan",
  "Tambah Komponen" (catalog filtered to `isEnabled && ACTIVE`, minus components already on the row, so
  the route's duplicate 409 is unreachable by normal use), and remove behind an `AlertDialog`. Every
  mutation patches the parent's `rowsPage` state from the response rather than refetching, following
  the exclude toggle that was already there. The note field is **pre-filled from the line's existing
  `adjustmentNote`** and carries "Orang tua akan melihat catatan ini pada tagihan mereka" — Cycle A's
  preview-verify caught an admin writing an internal note the family then reads, and this is the one
  place in the product where that mistake is easiest to make.
  **Deviation from an acceptance criterion, deliberate:** the catalog line's amount does NOT pre-fill
  from `ProgramFeeStructure`. `BillingRunRow` carries no `programId`, so step 2 cannot resolve which
  fee-structure row applies, and plumbing `programId` through the row to save one typed number is not
  worth a schema change. The field starts blank and says so in its help text.
- Task 6: Step 3 rebuild + banner discard — `step-3-commit.tsx`, `billing-run-wizard.tsx`,
  `app/admin/invoices/invoices-client.tsx`. "Hitung Ulang" is offered twice from one `ConfirmDialog`:
  inside the stale-draft `Alert` and as a footer control regardless of age, because `STALE_DRAFT_MS` is
  a 24h heuristic and a fee structure edited an hour ago staled the draft just as thoroughly. The
  confirm names what is lost and what survives ("nominal yang diubah, potongan, dan komponen tambahan —
  akan hilang. Siswa yang sudah dikecualikan tetap dikecualikan") rather than asking "are you sure".
  On success it toasts the new billable count plus `reappliedExclusions` and routes back to step 2 via a
  new `onRebuilt` prop — a rebuild that dropped the admin straight at "Komit" would be asking them to
  commit numbers they have not seen.
  The resume banner gains "Buang draf" behind the same confirm wrapper, driving the existing
  `PATCH /api/billing-runs/[id] { status: "CANCELLED" }` and refetching the banner. That closes the
  criterion B1 ticked having verified only the resume half.
- Task 8: Docs — `README.md` (finance module capability now describes editing, rebuild and discard; API
  route count 188 → 191; an ADR row for the `adjustmentAmount`-delta / disabled-system-component
  decisions), `CLAUDE.md` (route count 188 → 191; e2e spec count unchanged at 34 — T7 extends the
  existing wizard test in place rather than adding a file, same as B1),
  `docs/runbooks/module-capability-guide.md`, `docs/uat/jobs/admin.md` (JTBD-ADMIN-INV-05's steps and
  "Done when" now cover editing and Hitung Ulang; "Last audited" bumped to this cycle).

## Verification

- Tasks 1 + 2 (built in parallel, so the suite below covers both): gates passed — `npm run build`
  exit 0; `npx vitest run` **298 files passed / 2 skipped (300), 2893 tests passed / 42 todo (2935)**.
  Baseline on `origin/staging` is 297 files / 2851 tests, so this is +1 file (the new line-math suite)
  and +42 tests. `npx eslint` clean on all six touched files.
  T2's fidelity was verified by diff rather than asserted: the extracted region was pulled out of
  `git show HEAD:app/api/billing-runs/route.ts`, the three expected substitutions applied
  (`prisma.` → `db.`, `trimmedLabel` → the `periodLabel` input field, and the terminal `const {rows,
  summary} =` → `return`), and `diff -u` then reported zero differences. `billing-runs.test.ts`
  (27 tests) passes with the file unedited, which is the real proof the create route's behaviour is
  unchanged.
- Tasks 3 + 4 (built in parallel): gates passed — `npm run build` exit 0; `npx vitest run`
  **300 files passed / 2 skipped (302), 2929 tests passed / 42 todo (2971)**. That is +2 files and
  +36 tests over the T1/T2 point (298 / 2893). `npx eslint` clean on all five touched files.
  21 line-route tests and 15 rebuild tests. The guard tests assert the write was never attempted
  (`deleteMany` / `create` `not.toHaveBeenCalled()`), not merely the status code — the repo convention,
  and the only form that would actually catch a guard that returns 409 after mutating.
  **The two subagents' reports disagreed and I resolved it against the real output rather than picking
  one.** T4's run showed `billing-run-lines.test.ts` failing on its P2002 re-find test; T3's later run
  showed it green. Re-running all three billing-run suites myself returned `Test Files 3 passed (3) /
  Tests 61 passed (61)` — T3 had fixed the failure after T4 took its snapshot. Worth recording because
  concurrent subagents in one worktree make every "full suite" number a snapshot of a moving tree.
- Tasks 5 + 6 (built in parallel): gates passed — `npm run build` exit 0; `npx vitest run`
  **300 files passed / 2 skipped (302), 2929 tests passed / 42 todo (2971)** — unchanged from the T3/T4
  checkpoint, as expected for UI-only work that adds no test infrastructure (Assumption 8).
  `npx eslint` clean across the whole wizard directory plus `invoices-client.tsx`. Verified by me
  directly, not taken from the subagents' reports.
  Cross-checked `design-system.html` §07 Forms (`Field`/`FieldLabel`/`FieldDescription`/`FieldError`,
  errors under the field) and §13 Overlays (`ResponsiveFormDialog` → Dialog on desktop, Sheet on
  mobile; `AlertDialog` for destructive confirms). `better-accessibility`: editing is a real labelled
  form with a real submit rather than a click-to-edit cell, both destructive paths are true
  `AlertDialog`s so Escape and click-outside cannot bypass the explicit Cancel, and busy state is
  carried by text ("Menyimpan…", "Memproses…") not colour alone. `better-writing`: action buttons name
  their action ("Hitung Ulang", "Buang Draf", "Tambah Potongan"). The remove confirm reads "Ya, Hapus",
  which is not a `better-writing` slip but this repo's established destructive-confirm label — it
  matches `components/admin/deactivate-confirm-dialog.tsx` and the project standard wins on conflict.
- Task 7: E2E — `e2e/admin.spec.ts`, +57 lines, no deletions. The existing wizard walk now expands a
  row, edits one line's final amount by a fixed +1.000 delta, and asserts the row total lands on
  exactly `totalBefore + delta` — a hard equality against `formatRupiah`'s output, not a "something
  changed" check. An increase is used deliberately: it can never trip the negative-base-line rejection,
  so the assertion tests the re-sum rather than the guard.
  **No commit was added, and that is the point.** B1's first CI run went red because the wizard spec
  committed real invoices and every later spec in the file order then observed a world with new
  outstanding balances. The spec still stops at a live "Komit N Tagihan" button and cancels its own
  draft via the API.
  Every selector was resolved against component source rather than guessed — the expand button's
  `aria-label` (`step-2-review.tsx:154`), the row-total span's className (`:198`), the per-line edit
  trigger's `aria-label` (`line-editor.tsx:650`), the `Jumlah Akhir` field's real `<label htmlFor>`
  (`:207`), and the `Edit Baris Tagihan` dialog title (`:179`). The row locator filters on the
  *expandable* aria-label so it can only land on a `PENDING`/`EXCLUDED` row — a `SKIPPED_*` row renders
  a disabled "Tidak ada rincian" button instead and would have no line to edit.
  **Soft-skip delta 0, verified by me rather than taken on report:** `git grep -nE "test\.skip|\.skip\(" `
  over `e2e/` returns 42 on `origin/staging` and 42 here.
- Task 8: Docs — `/audit-docs` is user-invocation-only in this harness and could not be run from the
  build session; the counts it checks were verified directly instead. `find app/api -name route.ts`
  returns **191** (README and CLAUDE.md both updated from 188 — the three new files are the lines POST,
  the line PATCH/DELETE, and the rebuild route). `ls e2e/*.spec.ts` returns **34**, unchanged, because
  T7 extended the existing wizard test in place rather than adding a spec — same call B1 made and for
  the same reason. **`/audit-docs` still has to be run as a `/ship` preflight; it is not satisfied by
  this check.**
- End-of-cycle gates: `npm run build` exit 0; `npx vitest run` **300 files passed / 2 skipped (302),
  2929 tests passed / 42 todo (2971)**; `npm run lint` **0 errors, 59 warnings** — the same 59 as
  `origin/staging`, none of them in this cycle's files.
- Playwright: local run deferred to CI, same environment limit as B1 and Cycle A — `playwright.config.ts`
  refuses a non-local `DATABASE_URL` and this worktree points at shared staging. The guard was read, not
  triggered, and was not overridden with `E2E_ALLOW_REMOTE_DB=1`. The required CI check `Playwright E2E`
  gates the merge; CTO will not merge on red.

- Preview-verify iteration 1
  (`https://annisaa-erp-v3-git-feat-billin-232741-ismails-projects-196d40d3.vercel.app`):
  flows=[banner discard → fresh run with no 409; step 2 edit / add potongan / add komponen / remove
  line; step 3 totals; Hitung Ulang], **blockers=1, minors=1**. Signed in as `ismailir10@gmail.com`
  per `.claude/verify-accounts.json`. No migration to pre-apply this cycle, so unlike Cycle A and B1
  the preview needed no `prisma migrate deploy` against staging first.
  - **"Buang draf" works end to end.** Discarded B1's leftover staging draft ("Wizard Resume Test" —
    the fixture B1's Ship Notes flagged), banner disappeared with a "Draf tagihan dibuang" toast, and
    opening "Buat Tagihan" immediately after went straight to step 1 with **no 409 conflict panel**.
    That is precisely the criterion B1 ticked having verified only the resume half.
  - **Editing works and the arithmetic is right at every step.** Scoped to DCARE (5 students). Edited
    Abdullah Ibrahim Wijaya's SPP 1.200.000 → 1.500.000: the line gained a `Diedit` badge and
    `Penyesuaian: Rp 300.000 (Penyesuaian manual)` — the default note firing exactly where the spec
    says, and the invariant holding (1.200.000 + 300.000 = 1.500.000). Row total re-summed to
    2.000.000. Added "Potongan promo Agustus" −250.000 → 1.750.000, rendered as a negative
    `Rp -250.000` line with a `Manual` badge. Removed Uang Kegiatan → 1.650.000. Re-added it from the
    catalog at 150.000 → 1.800.000. Step 3 then read Rp 8.360.000, which is
    1.460.000 + 1.800.000 + 3 × 1.700.000 exactly.
  - **The catalog picker's exclusion logic is right in both directions.** With all three components on
    the row it hid "Tambah Komponen" and said "Semua komponen aktif sudah dipakai pada baris ini";
    deleting Uang Kegiatan brought the button back offering exactly that one component. The lazily
    created `penyesuaian_manual` system component — which by then existed, since I had added a
    discount — was **not** offered, confirming `isEnabled: false` keeps it out of the picker as
    Assumption 3 requires.
  - **"Hitung Ulang" does exactly what its confirm promises.** The dialog names what is lost ("nominal
    yang diubah, potongan, dan komponen tambahan — akan hilang") and what survives ("Siswa yang sudah
    dikecualikan tetap dikecualikan"). After confirming, Ibrahim was back to a clean Rp 1.700.000 with
    no badges, Faris still carried his Rp 1.460.000 keringanan (re-resolved from the durable grant,
    not preserved from the old rows), the wizard returned to step 2, and the toast reported "5 siswa
    akan ditagih setelah dihitung ulang."
  - No console errors on anything walked.
  - **Blocker (fixed): a hand-edited row was badged "Keringanan".** Both the step 2 badge and step 3's
    "Dengan keringanan" count tested `adjustmentAmount !== 0`. Assumption 1 has a manual edit write
    its delta into `adjustmentAmount`, so every edited row read as a fee waiver — Ibrahim, whose bill
    I had just raised by 300.000, was badged "Keringanan" and step 3 reported "Dengan keringanan: 2
    siswa" when only one student had a grant. Wrong in the most expensive direction: it labels an
    admin's own surcharge as a discount on the screen they approve the billing run from. Fixed by
    extracting `rowHasKeringanan()` into `lib/finance/billing-run-lines.ts`, discriminating on `source`
    (`BASE`/`ADJUSTMENT` are the resolver's, `EDITED`/`MANUAL` are the admin's), and having both
    components call it so the badge and the count can never drift apart. Six unit tests guard it,
    including the upward-edit case that produced the wrong badge.
  - **Minor: the catalog component `Select` renders the raw cuid** in its trigger after a selection
    instead of the component label. Not introduced by this cycle — `components/ui/select.tsx`'s
    `SelectValue` has no children mapping and `components/admin/fees/keringanan-tab.tsx:613` uses the
    identical pattern on the shipped Keringanan tab. Low impact here because the Label field directly
    beneath auto-fills with the human name the moment a component is picked, so the admin still sees
    what they chose. Fixing it properly means touching the shared primitive, which is wider than this
    cycle.
  - **Fix-commit note.** The first cut of the fix put `rowHasKeringanan()` in
    `lib/finance/billing-run-lines.ts` and imported it from the two client components — which pulled
    `@/lib/generated/prisma/client` into the browser bundle and failed the build with
    `the chunking context (unknown) does not support external modules (request: node:module)`. Caught
    by the gate, not shipped. The `source` vocabulary and its predicates now live in
    `lib/finance/billing-run-line-source.ts`, which imports nothing; `billing-run-lines.ts` re-exports
    them so server callers keep a single import site.
  - Gates after the fix: `npm run build` exit 0; `npx vitest run` **2935 passed / 42 todo (2977)** —
    +6 over the pre-fix 2929, the six `rowHasKeringanan` cases, which include the upward-edit that
    produced the wrong badge. `npx eslint` clean on every touched file.

- Preview-verify iteration 2 (same preview alias, on the fix commit `791840c6`):
  flows=[resume draft; exclude 3 rows; edit a line upward with a custom note; add an ad-hoc potongan;
  step 3 totals; **commit**; admin invoice detail], **blockers=0, minors=1**. Converged.
  - **The blocker is fixed.** Edited Abdullah Ibrahim Wijaya's SPP up to 1.500.000 again — the exact
    case that produced the wrong badge. His row now shows only `Diedit`, and after the potongan
    `Diedit` + `Manual`; no `Keringanan`. Abdullah Faris Siregar still shows `Keringanan` for his
    genuine Cycle A grant. Step 3 read "Dengan keringanan: 1 siswa" where iteration 1 said 2.
  - **Exclusions and totals.** Excluded 3 of 5 rows (rendered struck-through and dimmed), and they
    survived closing and resuming the wizard. Step 3 read 2 billed / 3 excluded / Rp 3.210.000 =
    1.460.000 + 1.750.000 exactly.
  - **Commit writes the hand-edited draft verbatim — the headline claim of the arc.** "2 tagihan
    berhasil dibuat", list 294 → 296, and Ibrahim's invoice is **Rp 1.750.000**, not the 1.700.000 the
    fee structure would have produced. The three excluded students were not billed. Both invoices got
    payment links.
  - **A negative `MANUAL` line renders sanely on a real invoice**, which was the open question in Ship
    Notes. `INV-2026-0057` shows `Potongan promo Agustus … Rp -250.000` as its own credit line with
    `Penyesuaian: Rp -250.000 (Penyesuaian manual)`, the edited SPP at Rp 1.500.000 carrying the
    admin's own note `(Tambahan kegiatan renang semester ini)` rather than the default, and
    `Total Tagihan Rp 1.750.000` — the four lines sum to the header exactly.
  - **Not walked: the parent-side render of a negative line.** The billed student's guardian is
    `parent-83@example.test`, not the parent account in `.claude/verify-accounts.json`, so there is no
    signed-in identity that can open that invoice. The admin detail proves the underlying
    `InvoiceLine` data, and the parent sheet renders the same fields through the same `formatRupiah`,
    but the parent view of a negative line remains unobserved. It stays in Ship Notes as a manual
    smoke step rather than being claimed here.
  - No console errors on any page walked, including the invoice detail.
  - Minor carried from iteration 1 (the catalog `Select` showing a raw cuid) is unchanged and remains
    a pre-existing repo-wide pattern, not a B2 regression.
- Preview-verify converged on iteration 2 (clean): 2 iterations, 1 fix commit, final preview
  `https://annisaa-erp-v3-git-feat-billin-232741-ismails-projects-196d40d3.vercel.app`.
- **CI caught a bug in the new e2e block that preview-verify could not.** The first `Playwright E2E`
  run on PR #495 came back red — 1 failed, and it was the wizard spec itself, failing both attempts at
  `admin.spec.ts:562` with "expanded row has no editable line". Not a product defect: T7 located the
  row with `.filter({ has: … /^Tampilkan rincian tagihan/ })`, and Playwright locators re-resolve
  lazily on every use, so the moment the test clicked that button and the aria-label flipped to
  "Sembunyikan rincian tagihan" the row locator matched nothing and every subsequent
  `editableRow.…` resolved to an empty set. Manual preview-verify never hits this because a human
  clicking a row does not re-run a stale selector.
  Fixed by filtering on the state-independent `/rincian tagihan/`, which still excludes `SKIPPED_*`
  rows (their expand button is disabled and labelled "Tidak ada rincian"). Soft-skip delta stays 0.

## Ship Notes

- **Migrations:** none. `BillingRunLine.source` is an unconstrained `String` column, so the new
  `EDITED` and `MANUAL` values need no schema change. Nothing to deploy ahead of the app code, nothing
  to roll back at the database level.
- **Env vars:** none added, removed or renamed.
- **Data backfill:** none. Existing drafts keep `source: "BASE"` on every line and behave exactly as
  before until someone edits one.
- **Supabase dashboard changes:** none.
- **First ad-hoc discount on a tenant creates a `FeeComponentDef`.** Code `penyesuaian_manual`, label
  "Penyesuaian", `isEnabled: false`, `isRecurring: false`, `category: "OTHER"`, created lazily and
  idempotently. It is deliberately visible in the Komponen tab on `/admin/fees` as a disabled row —
  hiding a component that appears on real invoices would be worse than showing it. `isEnabled: false`
  is load-bearing: `ProgramFeeStructure` fee queries filter on `isEnabled: true`, so it can never be
  billed by a normal run.
- **Manual smoke on the preview:** `/admin/invoices` → "Buat Tagihan" → scope one small class →
  Lanjutkan → in step 2 expand a row and (a) edit a component's amount and confirm the row total moves
  by exactly that delta, (b) "Tambah Potongan" and confirm the total *drops*, (c) "Tambah Komponen"
  from the catalog and confirm it rises, (d) remove a line, then (e) try removing every line and
  confirm the last one is refused with a message pointing at the exclude toggle. Then step 3 →
  "Hitung Ulang" → confirm the edits are gone, any excluded student is still excluded, and the wizard
  lands back on step 2. Commit, and **open the resulting invoice on the parent portal** — the whole
  point of the `amount + adjustmentAmount = finalAmount` invariant is that a hand-edited line renders
  coherently to a family, so a negative ad-hoc line and an edited line must both look sane there.
  Separately: create a draft, reload `/admin/invoices`, and use "Buang draf" — then confirm a fresh
  "Buat Tagihan" does NOT hit the 409 conflict panel. That is the criterion B1 half-shipped.
- **Rollback:** `git revert` the cycle's commits. No schema to unwind. Any `BillingRunLine` already
  carrying `source: "EDITED"`/`"MANUAL"` stays readable — B1's code treats `source` as an opaque string
  and the commit route copies lines verbatim regardless of it. A `penyesuaian_manual` component created
  before the revert is inert (disabled, in no fee structure) and can be left in place.
- **Known gap carried forward, unchanged:** still no DB unique index on
  `Invoice(tenantId, studentId, periodLabel)` (Cycle A's dropped T9). Staging holds 2 duplicate groups
  blocking an asserting migration; prod is clean. Explicitly out of scope here — see Non-goals.
- **Known gap, new and deliberate:** a catalog line's amount does not pre-fill from
  `ProgramFeeStructure`, because `BillingRunRow` carries no `programId`. If admins find themselves
  looking the number up every time, the fix is to snapshot `programId` onto the row — a migration, and
  its own cycle.
- **No per-line edit attribution.** The run records `createdBy`; who changed which line to what is not
  stored. If an audit trail on edits turns out to matter, that is a schema change.
- **Preview-verify left fixtures on staging** — 2 committed invoices under period "Verify B2 Edit"
  (`INV-2026-0056` Rp 1.460.000, `INV-2026-0057` Rp 1.750.000, the latter carrying a hand-edited SPP
  and a −250.000 ad-hoc potongan), plus the `penyesuaian_manual` fee component created on first use.
  It also **cancelled B1's leftover "Wizard Resume Test" draft** — that was the fixture B1's own Ship
  Notes flagged as a nuisance, and discarding it was how the new "Buang draf" action got verified.
  No open `DRAFT` remains, so the next admin to start a run will not meet the conflict panel.
- **Parent-side render of a negative line is still unobserved** — see Verification, iteration 2. Worth
  one look on staging as part of the smoke above.
- **Prod:** not shipped by this cycle. Staging only unless the owner says otherwise.
