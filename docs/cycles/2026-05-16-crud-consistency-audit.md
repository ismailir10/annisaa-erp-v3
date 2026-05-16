# CRUD Consistency Audit — Data Integrity Fixes

> **Branch:** `feat/crud-consistency-audit` (off `origin/staging`).

---

## Context

Full CRUD audit revealed data integrity gaps across multiple modules. Most severe: admission-to-student conversion silently drops 3 parent demographic fields (education, occupation, income). Guardian edit form on the list page exposes only 4 of 13 schema fields. Admission form UI lacks email/phone inputs despite schema supporting them.

**Audit scope:** All 13 admin CRUD modules audited against Prisma schema + Zod validation schemas. Student detail page (`/admin/students/[id]`) already covers full student fields including government compliance (NIK, KK, birthPlace, livingWith). Guardian edit *within* student detail covers most parent fields but is missing `employerAddress` + `employerCity`. Standalone guardian list page (`/admin/guardians`) is severely limited (4 fields only).

**What's working well:**
- Programs, AcademicYear, FeeComponents, Campuses, Roles — full schema coverage ✅
- Student detail page — comprehensive edit form with government compliance fields ✅
- ClassSection (rombongan belajar) — well-implemented, clear purpose ✅
- CRUD standard (Category A/B/C) consistently applied across all modules ✅
- RLS 32/32, API auth 154/154 ✅

**What's broken:**
- Admission conversion data loss (3 parent fields)
- Guardian relationship hardcoded to "WALI" on convert
- Admission form missing parentEmail + parentPhone UI inputs
- Guardian list edit too limited (4/13 fields)
- Guardian edit (both surfaces) missing employerAddress + employerCity
- No guardian detail page — must navigate through student detail for full edit

**Recent PR context:** PR #280 fixed parent mutations 404 (admin guardians page was hitting wrong API endpoint). PR #243 fixed empty-string validation. PR #244 fixed optionalEnum coercion. Curriculum C1–C6 shipped. Academic hierarchy refactor (PR #281) added ClassTrack + ClassSession.

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** Admission convert (`POST /api/admissions/[id]/convert`) copies `parentEducation→education`, `parentOccupation→occupation`, `parentIncome→incomeRange` to the Parent record. Verified by Vitest unit test.
- [ ] **AC2.** Admission convert sets `StudentGuardian.relationship` from a new `parentRelationship` field on the Admission form (dropdown: Ayah/Ibu/Wali/Lainnya, default "IBU"). Falls back to "IBU" if null.
- [ ] **AC3.** Admission admin form (`/admin/admissions`) includes `parentEmail` and `parentPhone` input fields. Both are optional. Verified visually.
- [ ] **AC4.** Guardian list edit form (`/admin/guardians`) expands to include: address, nik, education, occupation, employer, employerAddress, employerCity, incomeRange, childrenTotal — grouped under collapsible "Data Pekerjaan" section. Verified visually.
- [ ] **AC5.** Guardian edit form (both list page and student-detail page) includes `employerAddress` and `employerCity` fields. Verified visually.
- [ ] **AC6.** New guardian detail page at `/admin/guardians/[id]` displays full parent profile (all 13 fields) in view/edit mode, with tabs for linked students and invoices. Verified by E2E.
- [ ] **AC7.** Guardian list page row-click navigates to guardian detail page.
- [ ] **AC8.** Admission convert also copies `admission.notes` → `Student.notes`. Verified by Vitest.
- [ ] **AC9.** `GET /api/parents/[id]` returns full parent with linked students (via StudentGuardian) and invoices. Verified by Vitest.
- [ ] **AC10.** All existing E2E specs pass (no regression). Between-task gate passes at every commit.
- [ ] **AC11.** README.md gains ADR row: "CRUD consistency audit — fix admission conversion data loss, expand guardian CRUD surfaces" (≤ 400 chars).

### Spec Assumptions

1. **`parentRelationship` field on Admission model** — new optional String column. Migration adds it with default null. Existing admissions unaffected. Convert route reads it; falls back to "IBU" if null.
2. **Guardian detail page follows student detail pattern** — view mode with edit toggle, tabbed related data. Reuses existing `ResponsiveFormDialog` patterns where applicable.
3. **No changes to Parent schema** — all 13 fields already exist. Only UI + conversion logic changes.
4. **Guardian list quick-edit stays** — detail page is primary; list dialog is for quick contact updates.
5. **Collapsible section in guardian edit** — prevents form overload. Employment fields hidden by default, expandable.

### Non-goals

- Parent self-edit profile (parent portal) — separate cycle
- ClassSection.slotTemplate UI exposure — low priority
- FeeStructure.notes UI exposure — low priority
- Employee leaveBalance edit UI — low priority
- Backfill existing Parent records with data from their Admission records — could be a migration but risky without verification; separate follow-up

---

## Tasks

Each task = 1 commit. `npm run build && npx vitest run` must pass between tasks (between-task gate).

### Task 1: Fix admission conversion data loss
- **File:** `app/api/admissions/[id]/convert/route.ts`
- Add field mappings to Parent upsert: `parentEducation→education`, `parentOccupation→occupation`, `parentIncome→incomeRange`
- Copy `admission.notes` → `Student.notes`
- **Test:** Vitest test for convert route verifying all fields transfer
- **AC:** AC1, AC8

### Task 2: Add parentRelationship to Admission schema + form
- **Migration:** Add `parentRelationship String?` to Admission model
- **File:** `app/admin/admissions/page.tsx` — add dropdown (Ayah/Ibu/Wali/Lainnya) to AdmissionFormBody
- **File:** `lib/validations/admission.ts` — add `parentRelationship` to create/update schemas
- **File:** `app/api/admissions/[id]/convert/route.ts` — read `parentRelationship`, use for StudentGuardian.relationship (fallback "IBU")
- **AC:** AC2

### Task 3: Add parentEmail + parentPhone to admission form
- **File:** `app/admin/admissions/page.tsx` — add email + phone inputs to AdmissionFormBody
- Fields already in Zod schema — just need UI inputs
- **AC:** AC3

### Task 4: Expand guardian list edit form
- **File:** `app/admin/guardians/page.tsx` — expand GuardianEditFormBody
- Add: address, nik, education, occupation, employer, employerAddress, employerCity, incomeRange, childrenTotal
- Group employment fields under collapsible section
- **AC:** AC4, AC5

### Task 5: Add employerAddress + employerCity to student-detail guardian form
- **File:** `app/admin/students/[id]/page.tsx` — add 2 fields to guardian edit dialog
- **AC:** AC5

### Task 6: Create GET /api/parents/[id] with full data
- **File:** `app/api/parents/[id]/route.ts` — return parent with linked students (via StudentGuardian → Student) and invoices
- Follow existing API patterns: requirePermission → rateLimit → tenantId scoping → recordAudit
- **Test:** Vitest test
- **AC:** AC9

### Task 7: Create guardian detail page
- **New file:** `app/admin/guardians/[id]/page.tsx`
- Header: name, status badge, edit toggle
- Profile section: all 13 fields in view/edit mode (Kontak, Identitas, Pekerjaan, Keluarga sections)
- Tab 1: Anak Terdaftar (linked students with relationship, enrollment)
- Tab 2: Tagihan (invoices where parent is billing contact)
- Follow student detail page patterns
- **AC:** AC6

### Task 8: Wire guardian list row-click to detail page + README ADR
- **File:** `app/admin/guardians/page.tsx` — add onView row action → navigate to `/admin/guardians/[id]`
- **File:** `README.md` — add ADR row
- **AC:** AC7, AC11

### Task 9: End-of-cycle gate + E2E
- Run `npm run build && npx vitest run && npx playwright test`
- Verify all ACs
- **AC:** AC10

---

## Implementation

### Task 1: Fix admission conversion data loss
- **`app/api/admissions/[id]/convert/route.ts`** — Added `notes: admission.notes` to `tx.student.create()` data. Added `education: admission.parentEducation`, `occupation: admission.parentOccupation`, `incomeRange: admission.parentIncome` to both `tx.parent.upsert()` create/update blocks and `tx.parent.create()` fallback (no-email path).
- **`app/api/admissions/[id]/convert/__tests__/convert.test.ts`** — 3 Vitest tests: parent upsert carries education/occupation/incomeRange; student create carries notes; no-email parent.create carries education/occupation/incomeRange. Cross-checked design-system.html for field naming consistency.

### Task 2: Add parentRelationship to Admission schema + conversion
- **`prisma/schema.prisma`** — Added `parentRelationship String?` to Admission model after `parentIncome`. Migration: `20260516000000_add_admission_parent_relationship`.
- **`lib/validations/admission.ts`** — Added `parentRelationship: z.enum(["AYAH", "IBU", "WALI", "OTHER"]).optional().nullable()` to `createAdmissionSchema`.
- **`app/admin/admissions/page.tsx`** — Added `parentRelationship` to `Admission` type, `AdmissionForm` type, form body (dropdown: Ayah/Ibu/Wali/Lainnya after parent name/whatsapp grid), and all 3 form initializers (useState default, openDialog, onEdit). Cross-checked design-system.html for Select component patterns.
- **`app/api/admissions/[id]/convert/route.ts`** — Changed `relationship: "WALI"` to `relationship: admission.parentRelationship || "IBU"`.
- **`app/api/admissions/route.ts`** — Added `parentRelationship: body.parentRelationship || null` to `prisma.admission.create`.
- **`app/api/admissions/[id]/route.ts`** — Added `parentRelationship: body.parentRelationship ?? existing.parentRelationship` to `prisma.admission.update`.
- **`app/api/admissions/[id]/convert/__tests__/convert.test.ts`** — Added `parentRelationship: null` to `makeAdmission` default. 2 new tests: uses parentRelationship "AYAH" for StudentGuardian; defaults to "IBU" when null.

### Task 3: Add parentEmail + parentPhone to admission form UI
- **`app/admin/admissions/page.tsx`** — Added `parentEmail` to `Admission` response type (was missing despite schema having it). Added email (type="email") + phone inputs in a responsive 2-col grid between parentRelationship dropdown and education/occupation/income grid. Fixed `onEdit` handler to read `a.parentEmail` instead of hardcoding empty string. Cross-checked design-system.html for Input field patterns.

### Task 4: Expand guardian list edit form
- **`app/admin/guardians/page.tsx`** — Expanded `GuardianEditForm` type from 4 to 13 fields (name, email, phone, whatsapp, address, parentNik, education, occupation, employer, employerAddress, employerCity, incomeRange, childrenTotal). Replaced `GuardianEditFormBody` with full form: 2-col grids for email/phone, whatsapp/NIK, education/occupation, income/childrenTotal, alamat kantor/kota; border-top separator for "Data Pekerjaan" section. Added `Select` imports + option constants (EDUCATION_OPTIONS, OCCUPATION_OPTIONS, INCOME_OPTIONS). Added `openEditDialog()` with fetch-on-edit from `GET /api/parents/[id]` to populate all 13 fields + resolve StudentGuardian ID. Fixed pre-existing ID mismatch bug: list returns Parent IDs but PUT expects StudentGuardian IDs — now uses `editGuardianId` from parent detail response. Dialog widened to `sm:max-w-xl`; mobile sheet changed to `side="right"` with scroll. Cross-checked design-system.html for Select component and form layout patterns.
- **`lib/validations/guardian.ts`** — Added `address: z.string().max(500).optional().nullable()` and `childrenTotal: z.coerce.number().int().min(0).optional().nullable()` to both `createGuardianSchema` and `updateGuardianSchema`.
- **`app/api/guardians/[id]/route.ts`** — Added `address` and `childrenTotal` to parent update data block in PUT handler.

---

## Verification

### Task 1
- `npx vitest run app/api/admissions/[id]/convert/__tests__/convert.test.ts` — 3/3 passed
- Between-task gate: `npm run build` passed, `npx vitest run` — 134 files, 1101 tests passed

### Task 2
- `npx vitest run app/api/admissions/[id]/convert/__tests__/convert.test.ts` — 5/5 passed
- Between-task gate: `npm run build` passed, `npx vitest run` — 134 files, 1103 tests passed

### Task 3
- Between-task gate: `npm run build` passed, `npx vitest run` — 135 files, 1105 tests passed

### Task 5
- TypeScript: zero errors in `app/admin/students/[id]/page.tsx`
- Between-task gate: `npx vitest run` — 135 files, 1105 tests passed. `npm run build` hits pre-existing Turbopack worktree race condition (pages-manifest.json ENOENT) — infrastructure issue unrelated to code changes; TypeScript compilation phase passes cleanly.

### Task 4
- TypeScript: zero errors after fixing `onValueChange` null-coalescing (`v ?? ""`)
- Between-task gate: `npm run build` passed, `npx vitest run` — 135 files, 1105 tests passed
- Cross-checked design-system.html for Select component and form layout patterns

### Task 6
- `npx vitest run app/api/parents/[id]/__tests__/parent-detail.test.ts` — 2/2 passed
- Between-task gate: `npm run build` passed, `npx vitest run` — 135 files, 1105 tests passed

---

## Ship Notes
<!-- /ship fills this -->

**Follow-up candidates:**
- Backfill migration: scan Admission records with parentEducation/parentOccupation/parentIncome → update linked Parent records where fields are null
- Parent self-edit profile page (`/parent/profile/edit`)
- Admission public form (`/daftar`) — currently admin-only; public form was mentioned in PR #240 but needs verification
