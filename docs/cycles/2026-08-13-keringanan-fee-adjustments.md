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

- [ ] New `StudentFeeAdjustment` model: `tenantId`, `studentId`, `academicYearId`, `feeComponentId?`,
      `type` (`DISCOUNT` | `SURCHARGE`), `mode` (`PERCENT` | `FIXED`), `value` `Decimal(15,2)`,
      `reason` (required), `validFrom?` / `validTo?` (`YYYY-MM-DD`), `status` (`ACTIVE` | `INACTIVE`),
      `createdBy`, `createdAt`.
- [ ] Hand-authored `migration.sql` matching house style: `CREATE TABLE`, `ALTER TABLE … ENABLE ROW LEVEL
      SECURITY`, permissive `service_role` policy, FK indexes — same shape as
      `prisma/migrations/20260731100000_add_raport_narrative_templates/migration.sql`.
- [ ] Pure resolver `lib/finance/applyAdjustments` computes adjusted lines from base lines + adjustments,
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
- [ ] `POST /api/invoices/generate/batch` writes real `adjustmentAmount` / `adjustmentNote` / `finalAmount`
      per line and a `totalDue` that reflects them. These columns stop being permanently zero.
- [ ] `POST /api/invoices/generate/plan` additionally returns `withAdjustments` (count of eligible students
      carrying at least one applicable adjustment), and the bulk confirm dialog surfaces it.
- [ ] Admin CRUD at `/admin/fees` as a third tab, "Keringanan", following the **Category A** pattern in
      `.claude/standards/crud.md`: `DataTableToolbar` (search + status filter) → `DataTable` → row actions
      with edit / deactivate / reactivate → `ResponsiveFormDialog` for create+edit → `AlertDialog`
      confirm before deactivate → soft delete via `status`, never a hard delete.
- [ ] Admin picks the student with a real async search, not a raw id field.
- [ ] All new API routes are admin-only and tenant-scoped, matching the guard already used by the
      sibling fee routes (`getSession()` + `isAdminRole(session.role)` + `session.tenantId`).
- [ ] Existing invoice generation tests stay green — a student with no adjustments produces byte-identical
      invoice lines to today.

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

- [ ] **T1 — Schema + migration + demo seed.** Add `StudentFeeAdjustment` to `prisma/schema.prisma` with
      relations to `Tenant`, `Student`, `AcademicYear`, `FeeComponentDef` (all `onDelete: Restrict`) and
      indexes on `[tenantId, status]` and `[studentId, academicYearId]`. Hand-author
      `prisma/migrations/<ts>_add_student_fee_adjustment/migration.sql` including `ENABLE ROW LEVEL
      SECURITY` + permissive `service_role` policy, per the house style in
      `20260731100000_add_raport_narrative_templates`. Seed one sample adjustment in
      `app/api/admin/seed/route.ts` so demo mode and e2e have data.
      *Acceptance:* `npx prisma generate` clean, migration applies to a fresh DB, `scripts/verify-rls-coverage`
      passes with the new table.
      *Depends on:* nothing.

- [ ] **T2 — Validation schemas.** New `lib/validations/student-fee-adjustment.ts` exporting
      `createStudentFeeAdjustmentSchema` / `updateStudentFeeAdjustmentSchema` + inferred input types,
      following the naming and Indonesian-message convention in `lib/validations/fee-component.ts`.
      `feeComponentId` required this cycle. Unit tests under `lib/validations/__tests__/`.
      *Acceptance:* schema rejects bad `type`/`mode`, negative `value`, `PERCENT` > 100, empty `reason`,
      malformed dates, and `validTo` earlier than `validFrom`; tests green.
      *Depends on:* T1.

- [ ] **T3 — Pure resolver + tests.** New `lib/finance/apply-adjustments.ts` implementing every rule in the
      Spec. Reuse `sumDecimals` from `lib/finance/invoice-numbers.ts:85`; add the rupiah rounding helper
      there is currently none of. No Prisma calls — takes plain inputs, returns resolved lines +
      `totalDue` + an `adjustmentApplied` flag.
      *Acceptance:* table-driven vitest covering PERCENT, FIXED, DISCOUNT, SURCHARGE, two adjustments on
      one component, clamp-at-zero, validity window vs `dueDate` (inside / before / after / open-ended),
      wrong-year adjustment ignored, phantom-component adjustment ignored, HALF_UP rounding on an odd
      percentage.
      *Depends on:* T1.

- [ ] **T4 — API routes.** `app/api/student-fee-adjustments/route.ts` (GET list + POST) and
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

- [ ] **T5 — Extract StudentPicker.** Move the module-private `StudentPicker`
      (`components/admin/invoices/manual-invoice-dialog.tsx:137-365`) into
      `components/admin/student-picker.tsx`, export it, and rewire the manual invoice dialog to import it.
      Pure refactor — no behaviour change, same props, same debounce and abort handling.
      *Acceptance:* `components/admin/invoices/__tests__/manual-invoice-dialog.test.ts` green unchanged;
      manual invoice dialog still creates an invoice.
      *Depends on:* nothing. Independent of T1-T4.

- [ ] **T6 — Keringanan tab UI.** New `components/admin/fees/keringanan-tab.tsx`, mounted as a third
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

- [ ] **T7 — Wire into bulk generation.** In `app/api/invoices/generate/batch/route.ts`: fetch applicable
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

- [ ] **T8 — Docs.** Update `README.md` (route count, fees module capability) and correct the now-false
      claim at `docs/runbooks/module-capability-guide.md:204`.
      *Acceptance:* `/audit-docs` reports zero `fail` findings.
      *Depends on:* T1-T7.

- [ ] **T9 — (Droppable) Invoice duplicate guard.** Query staging and prod via Supabase MCP for existing
      duplicate `(tenantId, studentId, periodLabel)` rows on `Invoice`. If zero, add
      `@@unique([tenantId, studentId, periodLabel])` plus migration, and let the batch route's existing
      `P2002` handling cover the race. If any duplicates exist, **drop this task** and record the finding
      in Ship Notes as its own follow-up cycle — do not ship an asserting migration that breaks
      `prisma migrate deploy`.
      *Acceptance:* either the index exists and `npx vitest run` is green, or the task is explicitly
      dropped with the duplicate count recorded.
      *Depends on:* nothing. Runs last regardless.

- [ ] **T10 — E2E.** One lean Playwright spec extending the admin suite: open `/admin/fees` → Keringanan
      tab → create an adjustment against a seeded student → assert it lists → deactivate → assert the
      status filter hides it. Generation-path coverage stays in vitest per the testing-gate policy — do
      not add a Playwright run of the whole bulk generate.
      *Acceptance:* spec green locally, or deferred to the required CI `Playwright E2E` check and recorded
      in Verification.
      *Depends on:* T6.

## Implementation

## Verification

## Ship Notes
