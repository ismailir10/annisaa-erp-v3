# Keringanan — durable per-student fee adjustments

## Context

Bulk invoice generation today has no flexibility at the student level. `POST /api/invoices/generate/batch`
builds every invoice line straight from `ProgramFeeStructure` for the student's program, sets
`finalAmount = amount`, and leaves `adjustmentAmount` at 0 — the `InvoiceLine.adjustmentAmount` /
`adjustmentNote` columns have existed since the finance schema landed and **nothing in the app has ever
written them**. `adjustInvoiceLineSchema` (`lib/validations/invoice.ts:25`) is dead code with no importer
and no route behind it. The only documented workaround is manual single-invoice creation, one student at
a time — `docs/runbooks/module-capability-guide.md:204` states outright that "fee waivers/discounts
[are] handled as manual line adjustments (no dedicated approval workflow)". So an admin granting a
sibling discount or a beasiswa either hand-builds that student's invoice every month or edits nothing at
all.

This cycle is **Cycle A of a two-cycle arc**. Cycle A makes keringanan a durable, first-class record:
grant it once against a student for an academic year, and every subsequent bulk run applies it
automatically with an audit trail of who granted it and why. Cycle B (separate cycle doc, not specced
here) builds the three-step bulk generation wizard — scope/segment, editable confirm table, review and
generate — on top of a persisted `BillingRun` draft; that wizard shows Cycle A's adjustments
**pre-applied and labeled**, and lets an admin tweak a single run without touching the durable policy.
Cycle A ships value on its own: it plugs into the existing three-field bulk dialog with no wizard needed.

UAT input: none applicable. The newest report in `docs/uat/reports/` is `2026-06-04-admin-teacher-full.md`,
over 60 days old and not scoped to fees or invoicing.

## Spec

### Acceptance criteria

- [x] New `StudentFeeAdjustment` model: `tenantId`, `studentId`, `academicYearId`, `feeComponentId?`,
      `type` (`DISCOUNT` | `SURCHARGE`), `mode` (`PERCENT` | `FIXED`), `value` `Decimal(15,2)`,
      `reason` (required), `validFrom?` / `validTo?` (`YYYY-MM-DD`), `status` (`ACTIVE` | `INACTIVE`),
      `createdBy`, `createdAt`.
- [x] Hand-authored `migration.sql` matching house style: `CREATE TABLE`, `ALTER TABLE … ENABLE ROW LEVEL
      SECURITY`, permissive `service_role` policy, FK indexes — same shape as
      `prisma/migrations/20260731100000_add_raport_narrative_templates/migration.sql`.
- [x] Pure resolver `lib/finance/applyAdjustments` computes adjusted lines from base lines + adjustments,
      with these rules made explicit and unit-tested:
  - Validity gate: adjustment applies when `status === "ACTIVE"`, `academicYearId` matches the run, and
    the run's `dueDate` falls inside `[validFrom, validTo]` (either bound null = open).
  - `PERCENT` is always computed against the **base** `amount`, never compounded against a prior
    adjustment, so two adjustments on one component are order-independent.
  - Money rounds to 0 decimal places, `ROUND_HALF_UP` (rupiah has no cents).
  - `DISCOUNT` is negative, `SURCHARGE` positive. `finalAmount` clamps at 0 — a discount can zero a line
    but never make it negative. `totalDue` clamps at 0.
  - An adjustment naming a component the student has no base line for is ignored — no phantom line.
  - `adjustmentNote` on the line is the adjustment `reason`; multiple reasons on one line join with ` · `.
- [x] `POST /api/invoices/generate/batch` writes real `adjustmentAmount` / `adjustmentNote` / `finalAmount`
      per line and a `totalDue` that reflects them. These columns stop being permanently zero.
- [x] `POST /api/invoices/generate/plan` additionally returns `withAdjustments` (count of eligible students
      carrying at least one applicable adjustment), and the bulk confirm dialog surfaces it.
- [x] Admin CRUD at `/admin/fees` as a third tab, "Keringanan", following the **Category A** pattern in
      `.claude/standards/crud.md`: `DataTableToolbar` (search + status filter) → `DataTable` → row actions
      with edit / deactivate / reactivate → `ResponsiveFormDialog` for create+edit → `AlertDialog`
      confirm before deactivate → soft delete via `status`, never a hard delete.
- [x] Admin picks the student with a real async search, not a raw id field.
- [x] All new API routes are admin-only and tenant-scoped, matching the guard already used by the
      sibling fee routes (`getSession()` + `isAdminRole(session.role)` + `session.tenantId`).
- [x] Existing invoice generation tests stay green — a student with no adjustments produces byte-identical
      invoice lines to today. *(Met in substance: the batch and `run-bulk-generate` suites, which are what
      prove this, are untouched and green. Three whole-envelope `toEqual` assertions in the plan suite did
      have to gain `withAdjustments: 0` — see the T7 note in Implementation.)*

### Non-goals

- **The wizard itself.** No `BillingRun`, no segment/class picker, no editable confirm table. That is
  Cycle B.
- **Invoice-level (whole-invoice) adjustments.** `feeComponentId` is nullable in the schema so Cycle B can
  add them without a second migration, but Cycle A validation *requires* it — every adjustment is scoped
  to one fee component. Rationale: an invoice-level discount has no `FeeComponentDef` to hang an
  `InvoiceLine` off (the FK is required), so it needs either a nullable FK across every consumer or a
  seeded system "Keringanan" component. Both are real work that belongs with the wizard row that
  motivates them.
- **Manual invoice creation** (`POST /api/invoices`, `manual-invoice-dialog.tsx`) does not auto-apply
  adjustments. It stays a fully hand-driven escape hatch this cycle.
- **Approval workflow.** Whoever can administer fees can grant keringanan. No maker-checker.
- **Retroactive application.** Invoices already generated are untouched. Adjustments affect future runs
  only.
- **Prod deploy.** This cycle stops at staging unless the owner says otherwise.

### Assumptions

1. **`academicYearId` is the validity unit**, with optional `validFrom`/`validTo` dates as a finer gate
   compared against the run's `dueDate`. Not `periodLabel` — that field is free text ("April 2026") and
   cannot be range-compared.
2. **`SURCHARGE` is included** even though the ask was about discounts. It is a sign flip in the resolver
   and one extra radio in the dialog; adding it later means a second migration.
3. **Percent adjustments are capped at 100** and fixed adjustments must be positive — `type` carries the
   sign, `value` is always a positive magnitude. Keeps the list readable and the SQL unambiguous.
4. **`/admin/fees/page.tsx` is already a 347-line all-in-one client component.** The new tab goes in its
   own file (`components/admin/fees/keringanan-tab.tsx`) rather than growing that page further.
5. **`StudentPicker` gets extracted, not duplicated.** It exists today as a module-private function inside
   `components/admin/invoices/manual-invoice-dialog.tsx:137` and is exactly the control this tab needs.
6. **One adjustment per (student, year, component) is not enforced** by a unique constraint — two
   overlapping grants stack. The resolver is order-independent so this is well-defined, and stacking
   ("sibling discount" + "beasiswa") is plausible. Flag if you want it exclusive instead.
7. **Task 9 (Invoice unique index) is droppable.** It fixes a real gap found while exploring — there is no
   DB uniqueness behind the "already invoiced for this period" check, so concurrent runs can
   double-invoice — but it is not part of keringanan. It ships only if a duplicate check against staging
   and prod comes back clean; otherwise it drops out and becomes its own cycle.

## Tasks

- [x] **T1 — Schema + migration + demo seed.** Add `StudentFeeAdjustment` to `prisma/schema.prisma` with
      relations to `Tenant`, `Student`, `AcademicYear`, `FeeComponentDef` (all `onDelete: Restrict`) and
      indexes on `[tenantId, status]` and `[studentId, academicYearId]`. Hand-author
      `prisma/migrations/<ts>_add_student_fee_adjustment/migration.sql` including `ENABLE ROW LEVEL
      SECURITY` + permissive `service_role` policy, per the house style in
      `20260731100000_add_raport_narrative_templates`. Seed one sample adjustment in
      `app/api/admin/seed/route.ts` so demo mode and e2e have data.
      *Acceptance:* `npx prisma generate` clean, migration applies to a fresh DB, `scripts/verify-rls-coverage`
      passes with the new table.
      *Depends on:* nothing.

- [x] **T2 — Validation schemas.** New `lib/validations/student-fee-adjustment.ts` exporting
      `createStudentFeeAdjustmentSchema` / `updateStudentFeeAdjustmentSchema` + inferred input types,
      following the naming and Indonesian-message convention in `lib/validations/fee-component.ts`.
      `feeComponentId` required this cycle. Unit tests under `lib/validations/__tests__/`.
      *Acceptance:* schema rejects bad `type`/`mode`, negative `value`, `PERCENT` > 100, empty `reason`,
      malformed dates, and `validTo` earlier than `validFrom`; tests green.
      *Depends on:* T1.

- [x] **T3 — Pure resolver + tests.** New `lib/finance/apply-adjustments.ts` implementing every rule in the
      Spec. Reuse `sumDecimals` from `lib/finance/invoice-numbers.ts:85`; add the rupiah rounding helper
      there is currently none of. No Prisma calls — takes plain inputs, returns resolved lines +
      `totalDue` + an `adjustmentApplied` flag.
      *Acceptance:* table-driven vitest covering PERCENT, FIXED, DISCOUNT, SURCHARGE, two adjustments on
      one component, clamp-at-zero, validity window vs `dueDate` (inside / before / after / open-ended),
      wrong-year adjustment ignored, phantom-component adjustment ignored, HALF_UP rounding on an odd
      percentage.
      *Depends on:* T1.

- [x] **T4 — API routes.** `app/api/student-fee-adjustments/route.ts` (GET list + POST) and
      `[id]/route.ts` (PUT). Admin guard + tenant scoping copied from `app/api/fee-components/route.ts`;
      verify `studentId`, `academicYearId`, and `feeComponentId` all belong to the tenant before writing,
      as `app/api/fee-structure/route.ts:63-71` does. GET follows the pagination contract in
      `.claude/standards/api.md` and supports `studentId`, `academicYearId`, `status`, and `search`
      filters. **No `export const revalidate`** — unlike the sibling fee routes, this data is mutable and
      per-student. Soft delete is `PUT { status: "INACTIVE" }`.
      *Acceptance:* API tests under `app/api/__tests__/` (mock style per
      `invoices-generate-batch.test.ts`) prove 403 for no session and for TEACHER, 400 with a Zod `issues`
      envelope, cross-tenant ids rejected, list filters and pagination, soft-delete roundtrip.
      *Depends on:* T2.

- [x] **T5 — Extract StudentPicker.** Move the module-private `StudentPicker`
      (`components/admin/invoices/manual-invoice-dialog.tsx:137-365`) into
      `components/admin/student-picker.tsx`, export it, and rewire the manual invoice dialog to import it.
      Pure refactor — no behaviour change, same props, same debounce and abort handling.
      *Acceptance:* `components/admin/invoices/__tests__/manual-invoice-dialog.test.ts` green unchanged;
      manual invoice dialog still creates an invoice.
      *Depends on:* nothing. Independent of T1-T4.

- [x] **T6 — Keringanan tab UI.** New `components/admin/fees/keringanan-tab.tsx`, mounted as a third
      `AdminTabsTrigger`/`AdminTabsContent` in `app/admin/fees/page.tsx`. Category A CRUD per
      `.claude/standards/crud.md`: `DataTableToolbar` → `DataTable` (student, komponen, jenis, nilai,
      berlaku, status, actions) → `DataTableRowActions` → `ResponsiveFormDialog` using `Field`/`FieldLabel`
      (never raw `Label`+`Input`) → `AlertDialog` confirm before deactivate, mirroring
      `app/admin/(hr)/salary-components/page.tsx`. Student chosen via the T5 `StudentPicker`. Copy in
      Indonesian per `.claude/standards/voice.md`; cross-check `.claude/standards/design-system.html` for
      table, dialog, and badge treatment, and `better-accessibility` for the dialog's focus handling.
      *Acceptance:* create → list → edit → deactivate → reactivate roundtrip in the browser; empty state
      renders per the Empty State Contract; success and error toasts fire.
      *Depends on:* T4, T5.

- [x] **T7 — Wire into bulk generation.** In `app/api/invoices/generate/batch/route.ts`: fetch applicable
      adjustments alongside the existing `Promise.all` at L95, run every student's `programFees` through
      the T3 resolver, and use its output for both `totalDue` (currently L149) and the
      `invoiceLine.createMany` mapper (currently L208-218). In
      `app/api/invoices/generate/plan/route.ts`: add a `withAdjustments` count to the response. Update the
      confirm dialog copy in `app/admin/invoices/invoices-client.tsx:810-827` to surface it.
      *Acceptance:* every existing test in `invoices-generate-batch.test.ts` and
      `invoices-generate-plan.test.ts` stays green untouched (proving no-adjustment students are
      unaffected); new tests prove a discounted student's lines carry `adjustmentAmount`,
      `adjustmentNote`, a reduced `finalAmount`, and a `totalDue` matching the sum.
      *Depends on:* T3, T4.

- [x] **T8 — Docs.** Update `README.md` (route count, fees module capability) and correct the now-false
      claim at `docs/runbooks/module-capability-guide.md:204`.
      *Acceptance:* `/audit-docs` reports zero `fail` findings.
      *Depends on:* T1-T7.

- [x] **T9 — (Droppable) Invoice duplicate guard. DROPPED — see Ship Notes.** Query staging and prod via Supabase MCP for existing
      duplicate `(tenantId, studentId, periodLabel)` rows on `Invoice`. If zero, add
      `@@unique([tenantId, studentId, periodLabel])` plus migration, and let the batch route's existing
      `P2002` handling cover the race. If any duplicates exist, **drop this task** and record the finding
      in Ship Notes as its own follow-up cycle — do not ship an asserting migration that breaks
      `prisma migrate deploy`.
      *Acceptance:* either the index exists and `npx vitest run` is green, or the task is explicitly
      dropped with the duplicate count recorded.
      *Depends on:* nothing. Runs last regardless.

- [x] **T10 — E2E.** One lean Playwright spec extending the admin suite: open `/admin/fees` → Keringanan
      tab → create an adjustment against a seeded student → assert it lists → deactivate → assert the
      status filter hides it. Generation-path coverage stays in vitest per the testing-gate policy — do
      not add a Playwright run of the whole bulk generate.
      *Acceptance:* spec green locally, or deferred to the required CI `Playwright E2E` check and recorded
      in Verification.
      *Depends on:* T6.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-4-6; T1 ∥ T5 ∥ T9-precheck parallel
  (disjoint files), then T2 ∥ T3, then T4, then T6 ∥ T7, then T10, then T8.
- Task 1: Schema + migration + demo seed — `prisma/schema.prisma`,
  `prisma/migrations/20260813000000_add_student_fee_adjustment/migration.sql`,
  `app/api/admin/seed/route.ts` — `StudentFeeAdjustment` model with four `Restrict` FKs and three
  indexes; hand-authored migration carrying RLS enable + `service_role` policy per house style; one
  idempotent 20% sibling-discount seed row so demo mode and e2e have data. The subagent's
  `prisma format` had realigned 126 unrelated lines across the schema; that churn was reverted and
  the change re-applied by hand, leaving a 38-insertion / 0-deletion diff.
- Task 5: Extract StudentPicker — `components/admin/student-picker.tsx` (new),
  `components/admin/invoices/manual-invoice-dialog.tsx` — the async student-search control was a
  module-private function inside the manual invoice dialog; it is now a named export so the
  Keringanan tab can reuse it instead of duplicating it. Pure move: same props, same 250ms debounce,
  same AbortController handling, same query params.
- Task 2: Validation schemas — `lib/validations/student-fee-adjustment.ts`,
  `lib/validations/__tests__/student-fee-adjustment.test.ts` — create + update schemas following the
  `fee-component.ts` conventions. `studentId`, `academicYearId`, `feeComponentId` and `type` are
  deliberately immutable after creation: changing any of them re-scopes what the grant *is*, so the
  correct move is deactivate + create-new, which preserves the audit trail. Surfaced a real hole for
  T4: the PERCENT ≤ 100 cap cannot be enforced by the schema when a payload changes `value` without
  resending `mode`, because the schema cannot see the stored row — the route must re-check.
- Task 3: Pure resolver + tests — `lib/finance/apply-adjustments.ts`,
  `lib/finance/__tests__/apply-adjustments.test.ts` — `applyAdjustments()` takes base lines +
  candidate grants and returns resolved lines, `totalDue`, and an `adjustmentApplied` flag. No Prisma
  inside, so both the batch route and Cycle B's wizard can share it. Reuses `sumDecimals`; rounds
  each delta HALF_UP at 0 dp via `Prisma.Decimal.toDecimalPlaces`, never float math.
  Two changes made during review, both deliberate:
  - **The over-discount clamp now applies to `adjustmentAmount` too**, not just `finalAmount`, so
    `amount + adjustmentAmount === finalAmount` holds on every path. Both figures are parent-visible
    on the invoice; a line whose numbers don't add up is a support call.
  - **The `status` and `academicYearId` gates were moved into the resolver.** The first draft
    documented them as a caller contract and left `AdjustmentInput` without those fields. That made
    the spec's stated gate untestable and meant a single missing `where` clause in a future call site
    would bill a family from a revoked grant or a prior year's scholarship. The resolver now
    re-checks regardless of how the caller queried.
- Task 4: API routes — `app/api/student-fee-adjustments/route.ts` (GET paginated list + POST),
  `app/api/student-fee-adjustments/[id]/route.ts` (PUT), `app/api/__tests__/student-fee-adjustments.test.ts`
  — admin-gated and tenant-scoped, `studentId`/`academicYearId`/`feeComponentId` each re-verified
  against the tenant before any write, `tenantId` and `createdBy` taken from the session. GET is
  admin-gated rather than merely tenant-gated as `fee-components` GET is: this endpoint exposes who
  receives a discount and how much, which is per-family financial data. No `revalidate` — the sibling
  fee routes cache for an hour and stale keringanan would misprice an invoice.
  Three defects were found and fixed during review rather than deferred:
  - **PERCENT ≤ 100 could be escaped one field at a time.** `PUT { value: 150 }` against a stored
    PERCENT row passes schema validation, since the schema cannot see the stored row. The route now
    re-checks the *effective* mode and value.
  - **The same hole existed on the validity window** — `PUT { validFrom }` alone could land after a
    stored `validTo`. Same effective-value fix.
  - **A validity bound could never be cleared once set.** The update schema had the dates as
    `.optional()`, so `undefined` meant "leave unchanged" and there was no payload that restored
    open-ended validity. They are now `.nullable().optional()`, and the edit form sends `null` for a
    blanked date.
- Task 6: Keringanan tab UI — `components/admin/fees/keringanan-tab.tsx` (new), `app/admin/fees/page.tsx`
  (6 lines of tab wiring only — that page is already a 347-line all-in-one client component and this
  cycle does not grow it), `README.md` — Category A CRUD cloned from the `salary-components` exemplar:
  `DataTableToolbar` → `DataTable` → `DataTableRowActions`, `ResponsiveFormDialog` for create/edit,
  `AlertDialog` before deactivate, `StatusBadge`, Empty State Contract. PERCENT renders as "20%",
  FIXED through `formatRupiah`. On edit the four immutable fields are shown read-only rather than
  hidden, so the admin can see what they are editing. Client-side validation mirrors the server's
  rules so a bad value produces an inline `FieldError`, not a 400 toast. Sortable columns are limited
  to the three the route's `parseSort` allowlist accepts, so a header click cannot trip a 400.
  This task is what surfaced the un-clearable validity bound fixed in T4.
- Task 7: Wire into bulk generation — `app/api/invoices/generate/batch/route.ts`,
  `app/api/invoices/generate/plan/route.ts`, `app/admin/invoices/invoices-client.tsx`,
  `lib/finance/run-bulk-generate.ts`, `lib/finance/apply-adjustments.ts`, `README.md` — the batch
  route fetches each student's active grants alongside its existing `Promise.all` and routes
  `programFees` through the resolver for both `totalDue` and the `invoiceLine.createMany` mapper.
  `InvoiceLine.adjustmentAmount` / `adjustmentNote` are now written for the first time since the
  finance schema landed. `plan` returns `withAdjustments`, and the confirm dialog gains one clause:
  "Termasuk {n} siswa dengan keringanan." `isWithinValidity` was exported so `plan` reuses the exact
  validity rule instead of re-deriving it.
  **Deviation from the task's acceptance criterion, deliberate:** the criterion said every existing
  test must pass untouched. Three assertions in `invoices-generate-plan.test.ts` use `toEqual` on the
  whole response envelope, and `toEqual` fails on any extra key — so adding the spec-mandated
  `withAdjustments` field breaks them unconditionally, at any value. Their expected literals gained
  `withAdjustments: 0`. The alternative — omitting the field when zero — would make the envelope
  inconsistent with `skipped: 0` / `created: 0`, which are always present. The tests that actually
  protect billing amounts, in `invoices-generate-batch.test.ts` and `run-bulk-generate.test.ts`, are
  untouched and green, and those are what prove a student with no adjustments is billed identically.
- Task 10: E2E — `e2e/admin-fees-keringanan.spec.ts` (new) — its own file rather than a block in
  `admin.spec.ts`, matching how every other single-feature admin spec in `e2e/` is organised.
  Creates a keringanan through the tab, asserts the row, deactivates it via the row action +
  confirm, then asserts the "Aktif" status filter hides it. Because e2e rows leak between runs, the
  row is located by student name plus a timestamp-derived percentage rather than by position.
- Task 8: Docs — `README.md` (finance module capability + a 2026-08-13 ADR row), `CLAUDE.md`
  (route count 184 → 186, e2e spec count 33 → 34), `docs/runbooks/module-capability-guide.md`
  (the claim that waivers are manual line adjustments was true when written and is now false),
  `docs/uat/jobs/admin.md` (new JTBD-ADMIN-INV-04, "Last audited" bumped).

## Verification

- Task 1: gates passed — `npm run build` clean, `npx vitest run` 290 files / 2686 tests passed,
  2 skipped, 42 todo. `npx prisma validate` valid, `npx prisma generate` clean,
  `scripts/verify-rls-coverage.sh` → "RLS coverage OK: 40 / 40 tenant-scoped models have ENABLE +
  policy". `feature-dev:code-reviewer` compared the migration to the model column by column and
  found no drift.
- Task 5: gates passed — `npm run build` clean, `npx vitest run` 290 files / 2686 tests passed.
  Byte-fidelity of the refactor verified directly rather than by assertion: the extracted function
  was diffed against `git show HEAD:components/admin/invoices/manual-invoice-dialog.tsx` and is
  identical, 229 lines, zero differences.
- Task 2: gates passed — `npm run build` clean, `npx vitest run` 292 files / 2733 tests passed,
  2 skipped, 42 todo. 28 schema tests cover each required field, both enums, value bounds, the
  PERCENT cap, malformed and out-of-order dates, and the `{ status }`-only soft-delete payload.
- Task 3: gates passed — `npm run build` clean, `npx vitest run` 292 files / 2733 tests passed;
  the resolver suite itself is 22 tests. Order-independence is proved by running two stacked
  adjustments in both orderings and asserting equal output. Rounding was hand-verified against the
  implementation: 33% of 12345 = 4073.85 → 4074, and 1% of 50 = 0.5 → 1 (HALF_UP; banker's rounding
  would have given 0). An invariant test asserts `amount + adjustmentAmount === finalAmount` across
  a mixed batch including an over-discounted line.
- Task 4: gates passed — `npm run build` clean, `npx vitest run` 293 files / 2758 tests passed,
  2 skipped, 42 todo. 18 route tests; the cross-tenant and role-guard tests assert the write was
  never attempted, not just the status code. `superpowers:code-reviewer` ran the security pass over
  authorization, tenant scoping, mass assignment and the PERCENT-cap bypass and found no holes; its
  two low-severity suggestions (status-filter enum validation, `not.toHaveBeenCalled()` on the role
  tests) were both applied rather than noted.
- End-of-cycle gates: `npm run build` exit 0; `npx vitest run` 293 files / 2758 tests passed,
  2 skipped, 42 todo; `npm run lint` 0 errors, 59 warnings, all pre-existing and none in this
  cycle's files.
- Playwright: local run deferred to CI (env cannot execute it — `playwright.config.ts` refuses to
  run against a non-local `DATABASE_URL`, and this worktree's points at the shared staging Supabase.
  The guard was left in place rather than overridden with `E2E_ALLOW_REMOTE_DB=1`, since these specs
  create and mutate rows through the API). Required CI check `Playwright E2E` gates the merge; CTO
  will not merge on red.
- `/ship` Step 1c soft-skip delta: the e2e spec first shipped with a resolve-then-skip guard, which
  put the delta at +2 against `origin/staging` and blocked the ship. Correctly so — a test that
  skips itself when the seed looks empty is vacuously green. The three fixture lookups are hard
  assertions now: the demo seed creates a student, a fee component and an academic year, so their
  absence is a broken environment, not a reason to pass. Delta back to 0.
- T9 duplicate precheck, run against both databases via Supabase MCP before deciding:
  staging (`udbivhchbizpxoryejgz`) returned 2 duplicate `(tenantId, studentId, periodLabel)` groups —
  "Juli 2026" and "Agustus 2026", each a pair created hours apart, consistent with repeat bulk runs
  against the shared staging DB. Prod (`vxwywmvpxetdgnxejjgk`) returned 0. Task dropped per its own
  acceptance criterion.
- Task 6: gates passed — `npm run build` clean (`/admin/fees` still renders `ƒ`), `npx vitest run`
  293 files / 2758 tests passed. `npm run lint` 0 errors; no warning falls in the new file.
  Cross-checked design-system.html §08 Status Badges, §09 DataTable, §10 States, §13 Overlays;
  `better-accessibility` applied for the dialog and form (`Field`/`FieldLabel`/`FieldError`
  throughout, `aria-required` on Select triggers which have no native `required`, row actions
  disabled while their request is in flight).
- Task 7: gates passed — `npm run build` clean, `npx vitest run` 293 files / 2758 tests passed,
  2 skipped, 42 todo. New tests prove a PERCENT-discounted student's lines carry `adjustmentAmount`,
  `adjustmentNote` and a reduced `finalAmount` with `totalDue` matching their sum, that a grant for
  a different academic year bills the full amount, and that `plan` reports the right
  `withAdjustments` count.
- `feature-dev:code-reviewer` on T2+T3 raised two findings. The resolver-gate one was accepted and
  fixed as described above. The second — that nothing yet enforces the PERCENT cap on a value-only
  update — is correct and is T4's job; it is called out in T4's acceptance criteria.

- Preview-verify iteration 1
  (`https://annisaa-erp-v3-git-feat-bulk-i-fc2470-ismails-projects-196d40d3.vercel.app`):
  flows=[admin /admin/fees Keringanan tab], blockers=1, minors=0. Signed in as
  `ismailir10@gmail.com` per `.claude/verify-accounts.json`.
  - **Blocker (fixed):** the tab rendered the error toast "Gagal memuat data keringanan" *and* the
    empty state "Belum ada keringanan" at the same time. A failed load presenting as "no keringanan
    granted" is how a family gets billed the full amount — the admin has no way to tell the
    difference. `fetchAdjustments` now sets a `loadError` flag and the tab renders an explicit error
    card with a "Muat Ulang" action instead of the empty state. `portal.md`'s Error Handling Standard
    mandates the toast, which was present; it is silent on the empty-vs-error render, which was the
    actual gap.
  - **Environment limit, not a code defect:** the 500 behind that toast is because Vercel preview
    branches share the *staging* database and skip `prisma migrate deploy` (README:134), so
    `StudentFeeAdjustment` does not exist there yet — confirmed with
    `SELECT to_regclass('public."StudentFeeAdjustment"')` against `udbivhchbizpxoryejgz`, which
    returned null. Any cycle adding a table hits this: the migration only lands when the PR merges,
    but preview-verify runs before the merge.

- Preview-verify iteration 2 (same preview, after the fix commit): flows=[admin Keringanan tab CRUD,
  admin bulk generate incl. plan + confirm + commit, parent invoice list + detail], **blockers=0,
  minors=3**. Converged.
  - The staging DB was missing `StudentFeeAdjustment` (previews skip `prisma migrate deploy`), so
    with the owner's approval `npx prisma migrate deploy` was run against staging before re-walking.
    That is the correct mechanism rather than hand-applied DDL: it records `_prisma_migrations` with
    the right checksum, so the post-merge staging deploy skips the migration instead of failing.
    Verified after: table present, RLS enabled, 1 `service_role` policy, migration row recorded.
  - **Tab CRUD:** create via the extracted `StudentPicker` (async search returned real students with
    NIS), row renders "Diskon / 20% / Tidak terbatas / Aktif", success toast. Client-side PERCENT cap
    fires as an inline `FieldError` with the label reddened and no request sent — not a 400 toast.
  - **Year gate, end to end:** a grant on 2026/2027 with the run set to 2025/2026 produced
    "21 siswa akan ditagih." with the keringanan clause correctly absent. After adding a 2025/2026
    grant the same run read "Termasuk 1 siswa dengan keringanan", and a second grant took it to 2.
  - **Generation:** 21 invoices created, 21 payment links succeeded. The granted student's invoice
    shows `SPP Bulanan — Penyesuaian: Rp -240.000 (Diskon saudara kandung …)` → Rp 960.000, with
    Uang Makan and Uang Kegiatan untouched and the total Rp 1.460.000 exactly equal to the sum.
    First time these columns have ever held a non-zero value.
  - **Parent portal** (signed in as the parent account per `.claude/verify-accounts.json`): the
    unadjusted run shows Rp 975.000 and the adjusted run Rp 877.500 — exactly 15% of that child's SPP
    line. The detail sheet renders `Penyesuaian: Rp -97.500 (Beasiswa prestasi …)`, SPP Rp 552.500,
    and the three lines sum to the header total. No console errors on any page walked.
  - Minor 1: the **admin** invoice detail prints "Penyesuaian: Rp 0" on every unadjusted line. The
    parent sheet correctly omits it. Cosmetic noise on the admin side only.
  - Minor 2: the Keringanan table has no Tahun Ajaran column, so two grants for the same student and
    component differing only by year render identically. Hit this during verification — it makes
    picking the right row to deactivate guesswork.
  - Minor 3: **the `reason` is parent-visible.** It renders verbatim on the parent's invoice line.
    The dialog's help text says it appears on the invoice line but not that the family reads it, so
    an admin could write an internal note ("keluarga tidak mampu") and expose it. Copy/product call,
    not a code defect.
  - Preview 503s on `/.well-known/vercel/jwe`, an OPTIONS, a HEAD, and one RSC prefetch. Vercel
    preview infra noise, not application errors — every real page GET was 200, and the prefetched
    route was opened directly and renders fine.
- Preview-verify converged on iteration 2 (clean): 2 iterations, 1 fix commit, final preview
  `https://annisaa-erp-v3-git-feat-bulk-i-fc2470-ismails-projects-196d40d3.vercel.app`.

## Ship Notes

- **Migrations:** one, additive —
  `prisma/migrations/20260813000000_add_student_fee_adjustment/migration.sql`. Creates one new table
  with four `RESTRICT` FKs, three indexes, RLS enabled and a permissive `service_role` policy. No
  `ALTER` on any existing table, no backfill, no data mutation. Safe to deploy ahead of the app code:
  nothing reads the table until the new routes exist.
- **Env vars:** none added, removed or renamed.
- **Data backfill:** none. Existing invoices are untouched — adjustments affect future runs only.
- **Supabase dashboard changes:** none.
- **Manual smoke on the preview:** open `/admin/fees` → Keringanan tab → add a 20% discount on SPP
  for one student → run "Buat Tagihan" for a fresh period → confirm the dialog reports "Termasuk 1
  siswa dengan keringanan" → open that student's generated invoice and confirm the SPP line shows
  the reduced amount with the reason, and the total matches. Then check the parent portal renders
  the same invoice sanely, since `adjustmentAmount` is parent-visible and, until this cycle, was
  always zero in real data.
- **Rollback:** `git revert` the cycle's commits. The table can be left in place — it is additive and
  nothing else references it. If it must go, drop it after the revert; no other table has an FK to it.
- **T9 dropped — follow-up cycle needed.** There is still no DB uniqueness behind the "already
  invoiced for this period" check, so two concurrent bulk runs can double-invoice a student. The
  index was not added because staging currently holds 2 duplicate groups (see Verification) and an
  asserting migration would break `prisma migrate deploy` on the staging deploy. Prod is clean. The
  follow-up is: clean the 2 staging rows, then add `@@unique([tenantId, studentId, periodLabel])`.
- **Known gap, deliberate:** manual invoice creation (`POST /api/invoices`,
  `manual-invoice-dialog.tsx`) does not auto-apply keringanan. It stays a fully hand-driven escape
  hatch this cycle — an admin creating a one-off invoice for a student who has a standing discount
  must apply it themselves.
- **The migration is already applied to staging.** It was run during preview-verify (see
  Verification) so the preview could exercise the feature at all. `_prisma_migrations` carries the
  row with the correct checksum, so the post-merge `prisma migrate deploy` on staging will skip it.
  Prod is untouched and will apply it normally on the first promotion.
- **Preview-verify left fixtures on staging** — 3 keringanan rows and 42 invoices across two junk
  period labels ("PreviewVerify PR493 C" and "…D"). Harmless, and useful for the next cycle's
  verification, but delete them if the staging invoice list needs to look clean.
- **Prod:** not shipped by this cycle. Staging only unless the owner says otherwise.
