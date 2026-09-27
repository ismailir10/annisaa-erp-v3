# Finish the Admin Standard (Admin UI Standard — Cycle 3)

## Context
Cycles 1 (#564) and 2 (#565, `4d897b7`) standardised admin primitives and moved ~28 forms onto
react-hook-form + zod. Owner: "get them done, pls fix and improve", scope "everything open".
Exploration confirmed every open item and found more real bugs:

- **Bugs found while mapping**
  - Data Anak edit sends `gender: ""` for a student with no gender; `updateStudentSchema` rejects
    it → saving any such student's Data Anak fails.
  - "Tambah Wali Baru" (student page) collects Alamat, Jumlah Anak, Anak ke- but the route never
    writes them (`childOrder` isn't even in `createGuardianSchema`).
  - Withdraw (Keluarkan) confirm closes on a server error — the failure is lost.
  - Salary components: POST rejects PCT_OF_BASE although engine + employee salary page support it;
    PUT has **no validation** (writes any `calcType`/`category`); the rejection lands as a toast,
    not on the field (route returns `issues`, not `errors`); a PCT_OF_BASE component ordered before
    `gaji_pokok` makes payroll generate throw a 500 and makes variable recalcs compute against 0.
  - Employee attendance "Alpa" counts everyone as absent on a weekend/holiday when that day is
    today; `TODAY_ISO` is frozen at module load.
  - Class-session swap: the route's "reason required when substituting" rule is server-only, the
    form schema never runs (Simpan bypasses `handleSubmit`), route returns a non-standard 400.
- **Still hand-rolled forms**: students/[id] (Data Anak, withdrawal reason, Tambahan, promote,
  withdraw, guardian add/link/edit), `GuardianFormBody` (3 callers), classes/[id] Ubah Kelas,
  payroll/[id] period edit, employees/[id] edit, invoices/[id] record payment, semester
  objectives dialogs (TP edit, Tambah IKTP, IKTP edit).
- **Monoliths**: students/[id] 2073 lines, classes/[id]/client 1550, admissions 1088.
- **C1 leftovers**: 9 list pages rebuild DataTable `columns` every render (closes open row menus;
  root cause of the attendance-override test's click-retry hack); class "Kondisi" uses a raw
  Badge + a second colour table; campuses empty state has no "Tambah Kampus" CTA (DataTable has
  no empty-action prop); billing-run wizard shell hand-rolls Dialog/Sheet; seed creates two ACTIVE
  semesters; 36 of 44 admin routes have no route-level `loading.tsx` (detail pages show a
  list-shaped skeleton).

## Spec

Approved by the owner via plan approval (2026-09-27), scope "everything open".

1. **Salary components**: `salaryCalcTypeSchema` includes PCT_OF_BASE; POST and PUT validate with
   `validateBody` (new `updateSalaryComponentSchema`, keeps the `{isEnabled}` toggle); both reject
   a PCT_OF_BASE component whose `sortOrder` ≤ `gaji_pokok`'s with a field error on Urutan;
   payroll generate returns a 400 with a clear Indonesian message instead of a 500 for a misordered
   PCT_OF_BASE; the variables recalc path applies the same ordering guard. Labels consistent
   ("Kehadiran"), stale `calcType` types fixed, the round-trip test flips to "accepted".
2. **classes/[id]**: Ubah Guru Sesi submits through `handleSubmit`; form schema requires a reason
   when the chosen teacher ≠ the session's default (on the Alasan field); route uses
   `validateBody` (+ the same rule in its schema). Ubah Kelas on RHF with `classUpdateSchema`.
   Tambah Siswa / Tambah Guru use `<form>` + `FormDialogFooter`; non-409 failures go through
   `applyServerErrors` (409 advisory flows unchanged).
3. **GuardianFormBody** takes RHF `control` and renders `FormField`s (inline errors); all three
   callers migrated (guardians list dialog — bridge removed; guardians/[id] inline edit;
   students/[id] guardian dialog). Guardian create persists Alamat, Jumlah Anak and Anak ke-.
4. **students/[id]** split into `components/admin/students/detail/*` (one component per Dossier
   section + rail + lifecycle dialogs) with the page as a thin orchestrator owning `student`,
   open-section state, lazy latches, hash handling and the shared metadata writer. Forms on RHF:
   Data Anak (gender "" → null fix), withdrawal-reason edit, Informasi Tambahan (`useFieldArray`,
   unique/non-empty keys inline), promote, withdraw (stays open + shows the error on failure),
   guardian dialog; enroll dialog gets `<form>` + `applyServerErrors` for non-409 failures.
5. **admissions** split: `AdmissionFormBody`, columns (module-level/memoised) and the convert
   dialog move to `components/admin/admissions/*`; POST route → `validateBody`.
6. **Remaining forms** on RHF: payroll/[id] period edit (blank work-days no longer silently 0),
   employees/[id] edit, invoices/[id] record payment, semester objectives dialogs.
7. **Lists**: every admin DataTable `columns` is module-level or memoised; the attendance-override
   test loses its click-retry loop; "Kondisi" uses `StatusBadge` with new keys (Sehat / Perhatian /
   Kritis) and `healthTone` is deleted; `DataTable` gains an empty-state action and campuses uses
   it; billing-run wizard shell → `ResponsiveFormDialog` (steps unchanged).
8. **Alpa** is 0 on a non-working day whether past or today, rows show "Libur" instead of "—" on
   such days, and "today" is computed per render.
9. **Seed**: one ACTIVE semester per year (Semester 1 → CLOSED) in `prisma/seed.ts` and
   `scripts/seed-demo-curriculum.ts`, keeping session generation that spans today.
10. **loading.tsx** for every admin route without one: list routes use the shared list skeleton,
    detail routes (`[id]`) render `DetailPageSkeleton`.
11. Standards: `ui.md` Forms exceptions list trimmed (students/[id], GuardianFormBody, objectives
    no longer deferred), DataTable empty-action + memoised-columns rule, `patterns.md` loading.tsx
    rule; README if routes/modules text changes; counts regenerated.
12. No behaviour change beyond the fixes above; labels, ids and every e2e selector preserved.

**Non-goals**: raport editor, report templates grid, assessments grid, Tarif per Program table,
themes hierarchy, bulk-promote mapping and billing-run wizard *steps* stay documented exceptions;
admissions convert dialog stays the documented 3-way exception; no Prisma schema migration; no new
dependency; teacher/parent portals.

## Assumptions (correct any now)
1. A guardian/parent **email stays non-clearable** from admin edit forms (blank = keep), because it
   ties the parent to their portal sign-in; the field gets a FieldDescription saying so.
2. Allowing PCT_OF_BASE creation is a bug fix (engine, employee salary page and PUT already support
   it); the new ordering rule applies to both create and edit.
3. Payroll generate with a misordered PCT_OF_BASE becomes a 400 naming the component (was a 500).
4. Guardian create now writes Alamat/Jumlah Anak/Anak ke- that the form already collects.
5. Seed Semester 1 becomes CLOSED only if session reconciliation still produces sessions spanning
   today (verified locally); otherwise seed stays and the reason is recorded.
6. On a weekend/holiday the attendance rows show "Libur"; stat card Alpa = 0.
7. Branch: designated `claude/serene-mendel-y846yr` restarted from `origin/staging` (`4d897b7`),
   new PR.

## Tasks
- [x] **T1 Salary components + payroll ordering** — `lib/validations/payroll.ts`, both salary-component
  routes, `app/api/payroll/generate/route.ts`, variables route, salary-components page (+ its
  columns memo), tests incl. round-trip flip.
- [x] **T2 classes/[id]** — swap/edit/add dialogs on RHF + split into `components/admin/classes/detail/*`;
  `lib/validations/class-session.ts`, class-sessions route; Kondisi StatusBadge on classes list.
- [x] **T3 GuardianFormBody on RHF** — `components/admin/guardian-edit-dialog.tsx`, guardians list +
  detail pages, guardian create route persists address/childrenTotal/childOrder
  (`lib/validations/guardian.ts`), students/[id] caller minimally adapted.
- [x] **T4 students/[id] split + forms** (after T3) — `components/admin/students/detail/*`, page as
  orchestrator, fixes (gender, withdraw), enroll dialog `<form>`.
- [x] **T5 admissions split** — `components/admin/admissions/*`, POST → `validateBody`.
- [x] **T6 remaining forms** — payroll/[id] period edit (+ columns memo), employees/[id] edit,
  invoices/[id] record payment, objectives dialogs.
- [x] **T7 lists & polish** — memoise columns (student-attendance, employee-attendance, holidays, fees
  component columns, keringanan, dashboard work-queue) + drop the attendance test retry;
  `DataTable` empty action + campuses CTA; `StatusBadge` health keys; billing-run wizard shell;
  Alpa fix + test; seed semesters.
- [x] **T8 loading.tsx** — new files only.
- [x] **T9 standards + docs** — ui.md / patterns.md / crud.md, README, `audit-docs.sh --write`.
Parallel: T1, T2, T3, T5, T6, T7, T8 (disjoint files); T4 after T3; T9 last.

## Implementation
- Subagent plan: driver=claude-opus-5-5, dirty-work=claude-sonnet-5; T1, T2, T3, T5, T6, T7, T8 in parallel (disjoint files, no builds/commits inside subagents); T4 after T3 (shares the guardian dialog); T9 last. Driver reviews each diff (security review on route changes), runs gates, commits per task.

- Task 8: loading.tsx — 35 new route-level files; every admin page now has one (43/43). List/table pages copy the shared list skeleton (19); entity detail pages (`[id]` dossiers: students, classes, employees, payroll, enrollments, guardians, invoices, journal student) render `DetailPageSkeleton` (8); settings hub, work-hours, design-system, report templates, semester import/objectives/themes and the journal config page use the root skeleton (8). No existing file changed.

- Task 5: admissions split — `app/admin/admissions/page.tsx` 1088 → 432 lines; `components/admin/admissions/{types,constants,sibling-detect-banner,admission-form-body,columns,convert-dialog}` (columns via `createAdmissionColumns(handlers)` memoised with `useCallback` handlers; the convert dialog moved verbatim — documented 3-way exception). Spec item 5's "POST → validateBody" dropped on review: the POST route already returns the standard `{ error, errors[] }` 400 and keeps a deliberate `console.error` diagnostic that `validateBody` would lose — route left unchanged. New `app/api/admissions/__tests__/route.test.ts` pins that 400 shape + auth boundaries.

- Task 1: Salary components + payroll ordering — `salaryCalcTypeSchema` includes PCT_OF_BASE; new `updateSalaryComponentSchema`; POST + PUT `/api/salary-components` on `validateBody` (PUT previously had no validation; it now updates only the keys sent, so the `{ isEnabled }` toggle can't clobber fields); `lib/payroll/salary-component-ordering.ts` rejects a PCT_OF_BASE row ordered at/before an enabled `gaji_pokok` (and moving `gaji_pokok` after one) with a field error on `sortOrder`; payroll generate catches the engine's ordering throw → 400 naming the components (was a 500); the variables recalc route applies the same guard. Salary components page: stale calcType types fixed, one label map (Select now says "Kehadiran" like the list), columns memoised, Urutan hint for PCT_OF_BASE. Driver fix on review: the subagent exported the ordering helper from `app/api/salary-components/route.ts` and imported it into `[id]/route.ts` — Next.js route modules may only export handlers/config, so it moved to `lib/payroll/`; the reverse-direction message now reads "Gaji Pokok harus diurutkan sebelum semua komponen % Gaji Pokok". (`lib/validations/payroll.ts` in this commit also carries T6's self-contained `payrollEditFormSchema` export.)

- Task 2: classes/[id] — `client.tsx` 1550 → 437 lines, orchestrating `components/admin/classes/detail/{types,roster-section,teachers-section,sessions-section,edit-class-dialog,add-student-dialog,add-teacher-dialog,swap-session-dialog}`. Ubah Guru Sesi now submits through `handleSubmit`: `swapClassSessionTeacherFormSchema` carries the session's `defaultTeacherId` as a hidden value and requires a reason (on the Alasan field) for a genuine substitution; the route keeps that rule server-side (it needs the DB's default, a client value can't be trusted) but now returns the standard `errors[]` shape, and parses with `validateBody`. "Kembalikan ke wali kelas" still bypasses the form by design. Ubah Kelas on RHF (`classEditFormSchema` picked from `classFormSchema`, PATCH body unchanged). Tambah Siswa / Tambah Guru non-409 failures now show in `FormRootError`; 409 advisory flows untouched. Kondisi on the classes list renders `StatusBadge` with new Sehat / Perhatian / Kritis / Libur keys; `healthTone` deleted.

- Task 7: lists & polish — columns memoised (student-attendance, employee-attendance, holidays, fees component columns — moved above the early loading return, keringanan) or module-level (dashboard work-queue) with `useCallback` handlers; the attendance-override test's 20-tick settle + 5-try click retry removed (the remounting columns were the real cause). `DataTable` `emptyAction` (passes through to `EmptyState`) + campuses empty state "Tambah Kampus" (hidden on the Nonaktif filter). Billing-run wizard shell → `ResponsiveFormDialog size="2xl"` (steps unchanged, `footer={null}`); driver follow-up: `ResponsiveFormDialog` skips the docked footer when `footer` is null instead of rendering an empty bar. Alpa: `computeAbsentCount` returns 0 on any weekend/holiday (past, today or future); "today" computed per render (Jakarta); no-record rows on such a day show "Libur". Weekend stays Sat/Sun as elsewhere in the module (not org working days). **Seed change reverted (Assumption 5 fallback):** demoting Semester 1 doesn't affect session generation, but the demo curriculum (themes/weeks/objectives) lives on Semester 1 and report cards, parent development and teacher assessments select ACTIVE semesters — demoting it would empty those demo flows. Moving the demo curriculum onto the semester that spans today is a seed redesign → follow-up.

- Task 3: GuardianFormBody on RHF — `components/admin/guardian-edit-dialog.tsx` takes an RHF `control` and renders `FormField`s (same ids/labels/order; Email gets the "blank keeps the saved email — it links the parent to portal sign-in" description, Assumption 1); guardians list dialog (bridge removed, Nama error inline), guardians/[id] inline Data Wali edit (`useZodForm(parentFormSchema)` + `sendJson`), students/[id] guardian dialog create/edit (new `guardianCreateFormSchema` / `guardianUpdateFormSchema`; 409 PARENT_CANDIDATES flow kept). Data-loss fix: `createGuardianSchema` gains `childOrder`, and POST `/api/students/[id]/guardians` now persists Alamat + Jumlah Anak on the parent and Anak ke- on the junction; its two `safeParse`s → `validateBody` (auth/tenant/rate-limit, candidates 409 and employee-email checks unchanged). Driver fix on review: the edit dialog still couldn't clear "Anak ke-" (wire field maps "" → undefined → PUT keeps it) — `guardianUpdateFormSchema` now sends an explicit null, with a round-trip test.

- Task 6: remaining forms — payroll/[id] period edit on RHF (`payrollEditFormSchema`: blank Hari Kerja Aktual is now "wajib diisi" instead of a silent 0; columns memoised above the early returns) and PUT `/api/payroll/[id]` on `validateBody` (was `{ error, details }`, never mappable to a field); employees/[id] Profil/Kepegawaian/Saldo Cuti card (`employeeEditFormSchema` from `employeeBaseObject.partial()`, `role` omitted so no `role` key reaches the PUT, bank-pair refine reused; salary grid untouched); invoices/[id] Catat Pembayaran (`invoicePaymentFormSchema`: blank Jumlah → "wajib diisi") and POST `/api/invoices/[id]/payments` on `validateBody` (auth, tenant check, advisory-lock transaction unchanged); objectives TP edit / Tambah IKTP / Edit IKTP (`objectiveEditFormSchema`, `indicatorAddFormSchema`, `indicatorEditFormSchema` — blank Urutan no longer snaps to 1). New `app/admin/invoices/[id]/__tests__/page.test.tsx`; round-trip sections for all four.

- Task 4: students/[id] — `page.tsx` 2106 → 882 lines, orchestrating `components/admin/students/detail/{types,data-anak-section,kesehatan-section,keluarga-section,riwayat-kelas-section,kehadiran-section,dokumen-section,riwayat-status-section,informasi-tambahan-section,lifecycle-dialogs,rail-content}`. The page keeps `student`, open sections, lazy latches, hash handling, the single `persistMetadata` writer, the Data Anak form (its Edit trigger is in the header) and Promote's fetch-before-open gate. Forms on RHF: Data Anak (`studentDetailEditFormSchema` = `studentFormSchema` minus `status`; a no-gender student now sends `gender: null` instead of the `""` the PUT rejected), withdrawal-reason edit (`withdrawalReasonFormSchema`), Informasi Tambahan (`useFieldArray`, `studentExtraMetadataFormSchema`: empty key and duplicate key land on the row's own Nama field), Promote, Withdraw (`ResponsiveFormDialog` + `withdrawStudentSchema`; a failed submit keeps it open with the error). Graduate's `ConfirmDialog` handler now rethrows so it also stays open on failure. Enroll dialog wrapped in `<form>`; non-409 failures → `FormRootError`. Informasi Tambahan's dirty state reaches the header's Edit guard through a ref, so typing doesn't re-render the dossier.

- Task 9: standards — `ui.md`: Forms named-exceptions list trimmed (students/[id] and `GuardianFormBody` no longer deferred; billing-run wizard *steps* only; admissions convert dialog named as the 3-way exception), rules 1/2 sharpened (hidden comparison values still target a visible field; cleared fields as explicit `null`) and a fourth rule (string parsing only in form-derived schemas, pinned by the round-trip test); `DataTable` `emptyAction`; columns declared above early returns with `useCallback` handlers; `ResponsiveFormDialog footer={null}`; `StatusBadge` health keys. `patterns.md`: every admin route has a `loading.tsx` (list / `DetailPageSkeleton` / root shapes) and big dossiers split into `components/admin/<entity>/detail/*`. `crud.md`: cleared field → `null`, server errors via `applyServerErrors`. README unchanged (no module, route or entity added); counts block unchanged (`audit-docs.sh` clean).

## Verification

- Task 8: tsc + eslint clean on the new files. design-system: skeletons reuse the existing `Skeleton` / `DetailPageSkeleton` shapes only.

- Task 5: `vitest run app/api/admissions app/admin/admissions` 5 files / 29 tests passed (after the route revert); eslint clean. e2e selectors (`admission-edit-sibling-banner`, `admission-row-sibling-chip`, "Catat Pertanyaan", "Konversi ke Siswa") unchanged. design-system: no visual change (pure extraction).

- Task 1: `vitest run app/api/salary-components app/api/payroll "app/admin/(hr)/salary-components" lib/payroll lib/validations/__tests__/{payroll,form-api-roundtrip}.test.ts` 9 files / 124 tests passed after the move; tsc clean for these paths; eslint 0 errors. Security: `requirePermission("payroll.create")` + tenant 404 still precede validation on PUT; POST auth/rate-limit unchanged. design-system: the Urutan hint is a standard `FieldDescription`.

- Task 2: `vitest run app/admin/classes components/ui/__tests__/status-badge.test.tsx lib/validations/__tests__/{class-session,class,form-api-roundtrip}.test.ts app/api/admin` 146 tests passed; eslint clean; tsc clean for these paths. Security: class-sessions PATCH keeps auth + tenant resolution through ClassSection before the reason rule. design-system: Kondisi now uses the status tokens via `StatusBadge` (same tones as the deleted helper).

- Build fix: the T2 commit carried the shared `form-api-roundtrip.test.ts` with T6's still-uncommitted sections (employee edit, invoice payment, objectives schemas), so the committed tree failed typecheck (Vercel build error on 01748b3). The committed copy now ends before those sections (they return with T6); verified with `tsc --noEmit` on a clean checkout of HEAD. Lesson for the parallel build: shared files are committed from a clean-HEAD check, not straight from the working tree.

- Task 7: `vitest run` over employee-attendance, fees, campuses, holidays, student-attendance, dashboard, fees components, invoices components, components/ui — 181 tests passed; override-dialog test 10/10 plain + `flake-hunt.sh 10 8` 10/10 green; eslint 0 errors. design-system: campuses empty state uses the existing `EmptyState` action; wizard uses the shared dialog shell; "Libur" uses the existing HOLIDAY status token.

- Task 3: `vitest run` guardian-edit-dialog, guardians list/detail, students/[id], guardians route, guardian-primary-billing-chain, form-api-roundtrip — 162 tests passed; eslint 0 errors; tsc clean on the staged tree. Security: the guardians POST keeps auth + tenant parent lookup before validation. design-system: fields keep the existing `Field` layout; one `FieldDescription` added.

- Task 6: `vitest run` employees/[id], payroll/[id], invoices/[id], objectives, api/invoices, api/payroll, form-api-roundtrip — 7 files / 95 tests passed; eslint 0 errors (7 pre-existing warnings); tsc clean on the staged tree. Security: both route swaps change only the parse call — permission, tenant scope and the payment lock/transaction precede or wrap it exactly as before. design-system: fields keep the existing `Field` layout via `FormField`; the payment dialog uses `FormDialogFooter`.

- CI fix (2ab8310, `Lint, Typecheck & Test`): `app/admin/(hr)/__tests__/accessibility-contract.test.ts` source-scanned employees/[id] for the hand-written `htmlFor="employee-detail-nama" required` label that T6 replaced with `<FormField required>`. The contract now uses its existing `formFieldBlock` check for Nama/Email/Jabatan/Kampus (and asserts No. HP stays optional). Lesson: grep for source-scan tests (`readFileSync`) of a page before migrating it.

- Task 4: `vitest run app/admin/students components/admin lib/validations app/api/students` 65 files / 785 tests passed (new `lifecycle-and-forms.test.tsx`, `student.test.ts`, round-trip sections for all five forms); eslint 0 errors (1 pre-existing `<img>` warning); tsc clean on the staged tree. No route changed. e2e selectors (`admin-students-full-crud`, `admin-guardian-detail`) and field ids/labels unchanged. design-system: sections keep the Dossier layout; Withdraw uses the shared dialog shell with a destructive submit.

## Ship Notes
