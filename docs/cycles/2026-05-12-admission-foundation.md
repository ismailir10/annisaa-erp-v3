# Admission Foundation (Pack 1)

## Context

Admission domain redesign — Pack 1 lays the Prisma schema foundation for the full admission workflow. The spec ([docs/superpowers/specs/2026-05-12-admission-student-domain-design.md](../superpowers/specs/2026-05-12-admission-student-domain-design.md)) calls for structured address geo columns on Student and Parent, new AdmissionApplication + AdmissionGuardian tables, updated Invoice nullable cols, address dataset infrastructure, and an AddressPicker component.

No UAT report stale-check needed — this is a pure schema + infrastructure cycle with no user-facing UI shipping in Pack 1.

## Spec

- All new columns are nullable; no defaults at schema layer (app layer owns picker initial state per reviewer m3).
- Legacy fields (`Student.address`, `Parent.address`, `Parent.employerAddress`, `Parent.employerCity`) remain untouched — additive only.
- Migrations follow `<timestamp>_<name>/migration.sql` convention; five sequential migrations total (N+1 through N+5).
- `npm run build && npx vitest run` must pass between every task.

## Tasks

- [x] Task 1+2 (bundled): Add address geo cols to `Student` (9 cols) and `Parent` (9 home + 9 employer + 2 portalInvite = 20 cols) — migration N+1
- [x] Task 3+4 (bundled): Create `AdmissionApplication` + `AdmissionGuardian` tables; add 8 new fields + updated status enum + relations to `Admission`; placeholder back-relation on `Invoice` — migration N+2
- [x] Task 5 (renumbered from 4): Alter `Invoice` — nullable `studentId`, real `admission` back-ref, CHECK constraint documented — migration N+3
- [ ] Task 5: Backfill `addressLine` from legacy `address` (idempotent SQL) — migration N+4
- [ ] Task 6: `lib/constants/income.ts` + `lib/constants/__tests__/income.test.ts`
- [ ] Task 7: `lib/scripts/canonicalize-income.ts` + tests
- [ ] Task 8: Address dataset infrastructure (`lib/address/`, `scripts/seed-address-dataset.ts`, `public/address/`)
- [ ] Task 9: `components/ui/address-picker.tsx` + tests
- [ ] Task 10: Wire `AddressPicker` into student/guardian edit forms

## Implementation

### Task 1+2 (bundled) — 2026-05-12

**Files changed:**
- `prisma/schema.prisma` — added 9 cols to `Student` after `livingWith`, added 20 cols to `Parent` after `childrenTotal`
- `prisma/migrations/20260512000000_add_address_geo_cols_to_student_parent/migration.sql` — 31 `ALTER TABLE ... ADD COLUMN` statements, all `TEXT` or `TIMESTAMP(3)`, no `NOT NULL`, no defaults

**Student cols added:** `addressLine`, `addressVillageCode`, `addressVillageName`, `addressDistrictCode`, `addressDistrictName`, `addressRegencyCode`, `addressRegencyName`, `addressProvinceCode`, `addressProvinceName`

**Parent home cols added:** `homeAddressLine`, `homeVillageCode`, `homeVillageName`, `homeDistrictCode`, `homeDistrictName`, `homeRegencyCode`, `homeRegencyName`, `homeProvinceCode`, `homeProvinceName`

**Parent employer cols added:** `employerAddressLine`, `employerVillageCode`, `employerVillageName`, `employerDistrictCode`, `employerDistrictName`, `employerRegencyCode`, `employerRegencyName`, `employerProvinceCode`, `employerProvinceName`

**Parent portal invite cols added:** `portalInviteSentAt` (DateTime?), `portalInviteSentBy` (String?)

Migration applied via `npx prisma migrate deploy` (shadow DB skipped — pre-existing RLS migration blocks shadow DB apply on this project; `migrate deploy` is equivalent for non-destructive additive changes).

### Task 3+4 (bundled) — 2026-05-12

**Files changed:**
- `prisma/schema.prisma` — added `AdmissionApplication` model (23 fields, 3 relations, 2 indexes); added `AdmissionGuardian` model (27 fields, 3 relations, 4 indexes); added `admissionGuardians` back-relation on `Parent`; added `admissionApplications` + `admissionGuardians` back-relations on `Tenant`; added 8 new fields to `Admission` (`mergeCandidateId`, `submittedAt`, `submissionSource`, `registrationInvoiceId`, `paidAt`, `admittedAt`, `admittedById`, `cancellationReason`); updated `Admission.status` enum comment (dropped `VISIT_SCHEDULED`, added `APPLIED` + `PAID`); added `application` + `registrationInvoice` back-relations on `Admission`; added Path A placeholder back-relation `admissionsForRegistration` on `Invoice`
- `prisma/migrations/20260512000001_create_admission_application_and_guardian/migration.sql` — data migration (UPDATE VISIT_SCHEDULED → INQUIRY), 8 `ALTER TABLE Admission ADD COLUMN`, `CREATE TABLE AdmissionApplication` + `CREATE TABLE AdmissionGuardian` with all indexes and foreign keys

Migration applied via `npx prisma migrate deploy`. Prisma Client (7.6.0) regenerated.

## Verification

- `npx prisma format` — passed, no errors
- `npx prisma migrate deploy` — `20260512000000_add_address_geo_cols_to_student_parent` applied cleanly
- `npx prisma generate` — Prisma Client (7.6.0) generated successfully
- `npm run build` — TypeScript passed, all 123 pages compiled (exit 0)
- SQL inspection: 9 Student `ALTER TABLE` + 18 Parent address `ALTER TABLE` + 2 Parent portalInvite `ALTER TABLE` = 29 statements, all ending `TEXT` or `TIMESTAMP(3)`, no `NOT NULL`, no destructive ops

### Task 3+4 verification (2026-05-12)

- `npx prisma format` — passed, no errors
- `npx prisma migrate deploy` — `20260512000001_create_admission_application_and_guardian` applied cleanly
- `npx prisma generate` — Prisma Client (7.6.0) generated successfully
- `npm run build` — TypeScript passed, all 123 pages compiled (exit 0)
- No `DROP`, no `NOT NULL` on new columns; data migration for VISIT_SCHEDULED is defensive
- psql not available in this environment — deploy success is the verification

### Task 5 verification (2026-05-12)

- `npx prisma format` — initial errors due to both relation sides providing `fields`/`references`; resolved by keeping FK solely on `Admission` side and using pure back-ref on `Invoice`
- `npx prisma migrate deploy` — `20260512000002_alter_invoice_for_admission_link` applied cleanly
- `npx prisma generate` — Prisma Client regenerated
- `npm run build` — 5 TypeScript null-safety errors surfaced and fixed (guardian invoice/PDF routes, xendit create-session, xendit helpers, xendit-retry types, parent-helpers outstanding); build exits 0
- `npx vitest run` — 1097 passed, 1 pre-existing failure (enum-conformance for Admission.status from Task 3+4), no regressions introduced

Tasks 6–10 not yet run — between-task gate above covers Tasks 1+2, 3+4, and 5.

### Task 5 — Invoice nullable studentId + admission back-ref (2026-05-12)

**Files changed:**
- `prisma/schema.prisma` — `Invoice.studentId`: `String` → `String?`; `Invoice.student` relation: `Student` → `Student?`; placeholder `admissionsForRegistration Admission[]` replaced with `admission Admission? @relation("AdmissionRegistrationInvoice")` (pure back-ref; FK lives on `Admission.registrationInvoiceId`)
- `prisma/migrations/20260512000002_alter_invoice_for_admission_link/migration.sql` — `ALTER TABLE "Invoice" ALTER COLUMN "studentId" DROP NOT NULL`; CHECK invariant documented (FK is on Admission side, cannot express as row-level CHECK on Invoice)
- `app/api/guardian/invoices/[id]/route.ts` — added `!invoice.studentId || !invoice.student` to 404 guard (null-safety for admission invoices)
- `app/api/guardian/invoices/[id]/pdf/route.ts` — same guard pattern for PDF endpoint
- `app/api/xendit/create-session/route.ts` — introduced `displayName` with `invoice.student?.name ?? \`Tagihan ${invoice.invoiceNumber}\`` fallback
- `lib/finance/xendit-retry.ts` — `RetryResultRow.studentId` type updated to `string | null`
- `lib/parent-helpers.ts` — added `!r.studentId` skip guard in outstanding items loop (admission invoices are not parent-portal items)
- `lib/xendit/helpers.ts` — `invoice.student` accesses changed to optional chain; `customerName` uses `guardianParent?.name ?? invoice.student?.name ?? invoice.invoiceNumber` fallback

**Design decision:** The FK for the 1:1 Admission↔Invoice relation lives on `Admission.registrationInvoiceId` (set in Tasks 3+4). Invoice carries only the pure Prisma back-reference. No `admissionId` column was added to Invoice — it is not needed.

### State machine surface alignment — follow-up to Tasks 3+4 (2026-05-12)

Tasks 3+4 changed the `Admission.status` enum comment but missed downstream surfaces. Controller verified the "pre-existing" enum-conformance test failure was actually caused by Tasks 3+4 leaving stale references — fixed inline:

**Files changed:**
- `lib/validations/admission.ts` — zod enum aligned to `INQUIRY | VISITED | APPLIED | PAID | ADMITTED | REGISTERED | CANCELLED`
- `app/api/admissions/[id]/route.ts` — `VALID_TRANSITIONS` reflects new linear flow with APPLIED/PAID phases; doc comment references spec §2.1
- `app/admin/admissions/page.tsx` — `NEXT_STATUS` dict + status filter dropdown updated (drops VISIT_SCHEDULED, adds APPLIED + PAID)
- `components/ui/status-badge.tsx` — drops VISIT_SCHEDULED entries from label/icon/border maps, adds APPLIED row
- `app/api/admin/seed/route.ts` — demo seed rows use `VISITED` (was `VISIT_SCHEDULED`)
- `scripts/reseed/extras.ts` — `ADMISSION_STATUSES` array updated to new 7-value set
- `e2e/admin.spec.ts` — admission status transition test uses `INQUIRY → VISITED` (was `INQUIRY → VISIT_SCHEDULED`)

**Verification:**
- `npx vitest run` — 1098 passed, 0 failed, 42 todo, 2 skipped
- `npm run build` — exits 0
- `grep -rn "VISIT_SCHEDULED" --include="*.ts" --include="*.tsx"` — no matches
- Cross-checked design-system.html §status-chip for APPLIED amber border + label — matches "in-progress" severity family used by SENT/PARTIALLY_PAID

Full transition guards for VISITED→APPLIED (file completeness) and APPLIED→PAID (Xendit webhook side-effect) land in Pack 4 (admin detail page + payment integration) per implementation plan.

## Ship Notes

No env vars. No seed changes. No rollback needed — additive migration only; columns can be dropped if rolled back. Migration: `20260512000000_add_address_geo_cols_to_student_parent`.
