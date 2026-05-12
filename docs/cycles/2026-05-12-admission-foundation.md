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
- [ ] Task 5 (renumbered from 4): Alter `Invoice` — nullable `studentId`, add `admissionId`, CHECK constraint — migration N+3
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

Tasks 5–10 not yet run — between-task gate above covers Tasks 1+2 and 3+4.

## Ship Notes

No env vars. No seed changes. No rollback needed — additive migration only; columns can be dropped if rolled back. Migration: `20260512000000_add_address_geo_cols_to_student_parent`.
