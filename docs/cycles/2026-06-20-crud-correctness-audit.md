# CRUD Correctness Audit + Gap Fixes

## Context

CTO directive: ensure CRUD across modules is "proper" — every admin form must let the
admin enter the data the schema is designed to hold ("tambah siswa should allow admin to
add any data available within student schema"). Scope chosen: **exhaustive audit first**,
then fix in priority order. Priority classes: **missing fields in forms** + **validation
consistency**.

### Audit method

Objective coverage matrix (`/tmp/crud-audit.mjs`, not committed): parsed every model in
`prisma/schema.prisma` → scalar/enum user-settable fields, then cross-referenced each field
name against `lib/validations/**`, `app/admin/**`, `app/api/**`. 47 models audited, 91 raw
candidate gaps. Triaged each candidate by reading the source — most are *correctly* absent
from forms.

### Triage outcome (91 raw → real set)

Not gaps (correctly form-absent):
- **Actor/audit stamps** (~32): `createdBy`, `reviewedBy/At`, `recordedById`,
  `changedByUserId`, `voidedById`, `overriddenBy/At`, `checkedInBy` — server-set.
- **Computed/derived** (~12): `grossAmount`, `netAmount`, `totalDue/Paid`, `deductions`,
  `weekId`, `sessionId`, `days`, `childAge`.
- **Integration-set** (~6): `xenditSessionId`, `xenditPaymentUrl`, `xenditPaymentId`,
  `paymentLinkError`, `emailSent`.
- **Lifecycle ts/flags** via dedicated endpoints (~14): `withdrawalDate`, `graduationDate`,
  `*SignedAt`, `isVoided`, `isLocked`, `isBackfilled`, `isManualOverride`, `*publishedAt`,
  `sentAt`, `exportedAt`, `slipsSentAt`, `paidAt`, `approvedAt`.
- **File uploads** via separate routes (verified exist: `app/api/students/[id]/photo`,
  `app/api/parents/[id]/ktp`, `app/api/parents/[id]/kk`): `photoUrl`, `ktpUrl`, `kkUrl`.
- **App-side / mobile capture** (~6): geofence `checkIn/OutLat/Lng`, `pickedUpByRelation`,
  `pickedUpByName` (teacher checkout, not admin create).
- **Heuristic false-positives** (~15): `enrollDate` (verified server-set to today via
  enroll route; not user-enterable by design), FK/route-param keys (`parentId`,
  `templateId`, `assessmentId`, `termId`, `classTrackId`, `categoryId`, `entityId`).

Gold-standard modules (full schema coverage, exemplar): Student, Guardian, Parent, Program,
ClassTrack, Class/ClassSection, Campus (lat/lng + geolocate), Holiday, Admission, Semester,
Theme, SubTheme, Week, LearningObjective, AchievementIndicator, AssessmentTemplate, fee
structure, curriculum hierarchy.

### Real gaps (matching the two priority classes)

| # | Module | Gap | Class |
|---|--------|-----|-------|
| R1 | Employee | `leaveBalanceAnnual` / `leaveBalanceSick` — no form input, no validation; hardcoded defaults 12/14. Mid-year hire / carryover cannot be set. | Missing field |
| R2 | AcademicYear | No Zod schema (verified); route does ad-hoc manual validation. Only module off-pattern. | Validation consistency |
| R3 | fee-components | No Zod schema (verified); `category` accepts arbitrary string — no enum guard. | Validation consistency |
| R4 | SalaryComponentDef | Create schema inline in route (not `lib/validations/`); `isEnabled` toggled ad-hoc. | Consistency (low) |

## Spec

Acceptance criteria:
1. **R1 — Employee leave balances.** `createEmployeeSchema` + `updateEmployeeSchema` accept
   optional `leaveBalanceAnnual` / `leaveBalanceSick` (Int ≥ 0). Employee create/edit form
   exposes both inputs (defaulting to 12/14 placeholders). POST/PUT route persists them.
2. **R2 — AcademicYear Zod.** New `lib/validations/academic-year.ts` with
   `createAcademicYearSchema` / `updateAcademicYearSchema` (name, startDate YYYY-MM-DD,
   endDate YYYY-MM-DD, status enum PLANNING|ACTIVE|ARCHIVED). `app/api/academic-years/route.ts`
   + `[id]/route.ts` parse via the schema, replacing manual `if (!name?.trim()...)` blocks.
   Behaviour preserved (same 400 messages or better).
3. **R3 — fee-components Zod.** New `lib/validations/fee-component.ts` with
   `createFeeComponentSchema` / `updateFeeComponentSchema`. `category` is an enum
   (TUITION|REGISTRATION|ACTIVITY|MATERIAL|OTHER). Route parses via schema.
4. No regression: `npm run build && npx vitest run` green; existing e2e unaffected.

Non-goals: R4 (low — defer); refactoring gold-standard modules; touching app-side/mobile
capture fields; file-upload flows; payroll/invoice computed fields.

Assumptions:
- Leave balances are whole days (Int), already the schema type. Negative disallowed.
- AcademicYear status enum is the existing `isAcademicYearStatus` set — reuse if present.
- fee-component `category` enum values match the schema comment + existing seed data; verify
  seed/usages before locking the enum so we don't reject existing rows on edit.

## Tasks

- [ ] **T1 — R2 AcademicYear Zod.** Add `lib/validations/academic-year.ts`; wire
  `app/api/academic-years/route.ts` (POST) + `[id]/route.ts` (PUT). Unit test the schema.
- [ ] **T2 — R3 fee-component Zod.** Verify existing `category` values in seed/db usages;
  add `lib/validations/fee-component.ts` (category enum); wire `fee-components/route.ts` +
  `[id]/route.ts`. Unit test.
- [ ] **T3 — R1 Employee leave balances.** Extend employee Zod (create+update) with
  `leaveBalanceAnnual`/`leaveBalanceSick`; add form inputs; persist in POST/PUT route. Unit
  test the schema.

## Implementation

### T1 — R2 AcademicYear Zod
- Added `lib/validations/academic-year.ts`: `createAcademicYearSchema` /
  `updateAcademicYearSchema`. Status enum sourced from the canonical
  `ACADEMIC_YEAR_STATUSES` in `lib/academic-year/activate.ts` (no drift). Dates
  regex-validated YYYY-MM-DD; name trimmed + required on create, partial on update.
- Wired `app/api/academic-years/route.ts` (POST) + `[id]/route.ts` (PUT) to
  `safeParse` the body, replacing the ad-hoc `if (!name?.trim())` /
  `isAcademicYearStatus` checks. ARCHIVED active-enrollment blocker + single-active
  invariant logic unchanged. Per-field 400 messages now instead of one combined string.
- Added `lib/validations/__tests__/academic-year.test.ts` (9 cases).

## Verification

### T1
- `npx vitest run lib/validations/__tests__/academic-year.test.ts` → 9 passed.
- `npm run build` → success (all routes compiled).
- `npx vitest run` → 206 files passed | 2 skipped; 2046 passed | 42 todo. No regressions.
- Playwright: deferred to end-of-cycle gate.

## Ship Notes

_(filled by /ship — no migration expected; all three target columns already exist)_
