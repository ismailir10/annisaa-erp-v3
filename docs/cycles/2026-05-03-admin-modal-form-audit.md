# Admin Modal & Form Consistency Sweep

## Context

`design-system.html` §17 (audit matrix) flagged `Karyawan / Tagihan / Penggajian / Cuti / Akademik / Assessments` as "drift" on the Create/Edit overlay column, and the cross-cutting card lists nine concrete drift items — three of which apply directly to overlays:

> "Edit UX split — Some entities use edit-in-place toggle, others use Dialog. Pick one per entity size (rule: > 6 fields → page, else dialog)."
> "Sheet vs Dialog — Mobile forms sometimes use Dialog (breaks thumb reach). Rule: <640px → Sheet from bottom."
> "Button labels — 'Simpan' vs 'Simpan Perubahan' vs 'Ya, Simpan' — canonicalize per action type."

A fresh inventory across `app/admin/**` and `components/admin/**` found **47 overlay instances** (Dialog / Sheet / AlertDialog / ConfirmDialog) across **22 files**. Of those:

- **11 files** use `useIsMobile()` to switch Dialog→Sheet on mobile (students, guardians, admissions, employees list, leave, payroll list, invoices list+detail, enrollments, students detail, manual-invoice helper).
- **9 files** open form Dialogs **with no mobile branching** (academic, assessments/templates, fees, student-attendance, teaching-assignments, settings/{campuses,holidays,roles,salary-components,users,config}). PAUD admin staff use tablets in landscape and phones in the field — these dialogs reflow but lose thumb-reach affordances and waste vertical space.
- **15 edit dialogs** are labeled `"Simpan"` instead of the canonical `"Simpan Perubahan"` (academic ×3, settings ×5, assessments ×1, enrollments ×1, fees ×1, teaching-assignments ×1, employees-detail edit, etc).
- **7 dialogs** use `<Button variant="outline">Batal</Button>` for the cancel slot. Design system specifies ghost-Cancel on the left, solid-Submit on the right (`patterns.md` Recipe 3).
- **6 form Dialogs** ship without an explicit width (`className="p-card"` only). Defaults vary across Shadcn versions and Storybook fragments — pin to `sm:max-w-lg` (or `sm:max-w-2xl` if >8 fields).
- **3 destructive confirms** (`invoices/[id]` void, `invoices` page bulk void, `student-attendance` void) call `<ConfirmDialog>` without the `destructive` prop, so the action button renders as default-blue instead of `variant="destructive"` red. The dialog is still an `AlertDialog` under the hood, so the modal-trap contract is honored — only the colour signal is wrong.
- **Required-field indicator** is hand-rolled (`Nama *` inline in `FieldLabel`) in every form. The design-system anatomy uses a coloured `<span class="req">*</span>` for visual weight — consolidating into `FieldLabel` would let us flip the asterisk colour with one token change.

These are all **drift** issues — no API changes, no schema work, no business-logic risk. The work is mechanical: standardize labels, add mobile branching, pin widths, fix the destructive flag, normalize the asterisk. The win is design-system fidelity (and unblocks the §17 audit table from "drift" → "ok").

## Spec

**Acceptance criteria:**

- [ ] All 9 form-Dialog pages without mobile branching adopt the canonical `useIsMobile()` Dialog↔Sheet pattern. Submit + cancel labels match the canonical table below.
- [ ] All edit dialogs use submit label `"Simpan Perubahan"` (loading state `"Menyimpan..."`). All create dialogs use `"Tambah <Entity>"` or `"Buat <Entity>"` matching the entity's existing trigger button. All destructive confirms use `"Ya, <Verb>"` (e.g. `"Ya, Batalkan"`, `"Ya, Hapus"`).
- [ ] All Dialog cancel buttons use `variant="ghost"` (was `"outline"` in 7 places).
- [ ] Every standalone form Dialog has explicit `sm:max-w-lg` (or `sm:max-w-2xl` for >8 fields) on `DialogContent`.
- [ ] All destructive `<ConfirmDialog>` call sites pass the `destructive` prop (Cancel/Void/Delete/Deactivate). Restore/Approve/Activate stay non-destructive.
- [ ] A reusable `<FieldLabel>` asterisk pattern lands (either a new `required` prop on `<FieldLabel>` or a documented inline pattern using a `<span className="text-destructive">`) and replaces inline `*` in all form fields under `app/admin/**`.
- [ ] One Playwright spec (`e2e/admin-dialogs.spec.ts`) opens every admin form dialog (Chromium desktop + 390×844 mobile viewport) and asserts the canonical button labels are present. Screenshots saved to `e2e/__snapshots__/` for visual baseline.
- [ ] `design-system.html` §17 audit matrix flips the affected modules (Karyawan, Tagihan, Penggajian, Akademik, Assessments) from "drift" to "ok" on the Create/Edit and Errors columns where the work cleared the issue.

**Canonical button-label table** (added to `.claude/standards/ui.md` as part of T2):

| Action type | Submit label | Loading | Cancel | Cancel variant |
|---|---|---|---|---|
| Create | `Tambah <Entity>` (e.g. `Tambah Siswa`) — match the trigger button | `Menyimpan...` | `Batal` | `ghost` |
| Bulk create | `Buat <Plural>` (e.g. `Buat Tagihan Bulanan`) | `Memproses...` | `Batal` | `ghost` |
| Edit | `Simpan Perubahan` | `Menyimpan...` | `Batal` | `ghost` |
| Domain mutation (approve, send, void, override) | Verb-only (`Setujui`, `Kirim`, `Catat Pembayaran`, `Simpan Override`) | `Memproses...` | `Batal` | `ghost` |
| Destructive confirm (`<ConfirmDialog destructive>`) | `Ya, <Verb>` (`Ya, Hapus`, `Ya, Batalkan`, `Ya, Nonaktifkan`) | `Memproses...` | `Batal` | (`AlertDialogCancel`) |
| Reversible confirm (Restore/Activate) | `<Verb>` (`Aktifkan`, `Pulihkan`) | `Memproses...` | `Batal` | (`AlertDialogCancel`) |

**Non-goals:**

- No edits to AlertDialog/ConfirmDialog component internals beyond verifying they honor the `destructive` prop — the component is correct.
- No conversion of route-level `/new` form pages to dialogs (the >6-field rule keeps them where they are).
- No copy rewrites beyond the button-label table and the `description=` fields where the current copy is wrong/missing — this is a *consistency* sweep, not a voice rewrite. Voice issues belong in a separate `/spec voice-pass` cycle.
- No new shell components beyond the optional `ResponsiveFormDialog` extracted in T1 — keep the helper minimal.
- No DataTable, EmptyState, or Skeleton work. Out of scope.

**Assumptions:**

1. The `useIsMobile()` hook (`@/components/ui/use-mobile`) breaks at 768px — same as the existing 11 files use it. We follow that breakpoint, not the 640px the design-system text mentions, because the 11 existing implementations are the de-facto standard.
2. The 6 ConfirmDialog sites I read use the shared `components/ui/confirm-dialog.tsx` wrapper, which already extends `AlertDialog`. So "ConfirmDialog vs AlertDialog" is a non-issue — only the `destructive` prop is the gap.
3. The Settings pages (`campuses`, `roles`, `salary-components`, `users`, `holidays`, `config`) are SUPER_ADMIN-only and accessed almost exclusively from desktop. Mobile-Sheet branching is added for parity / consistency, not because it's blocking — these can ship with a lighter pattern (e.g. `max-h-[90vh] overflow-y-auto` on Dialog) if the Sheet conversion is too noisy.
4. Playwright covers Chromium only per `CLAUDE.md`. We test desktop + mobile viewport in the same browser; we do not add Webkit/Firefox.
5. `design-system.html` §17 audit table is hand-curated. Updating it is a docs edit, not a generated artifact.

## Tasks

> Tasks marked **[parallel]** can be dispatched as concurrent subagents — they touch disjoint files. Tasks marked **[sequential]** depend on the previous task. T1 is a small foundation that T2 / T3 reuse.

- [x] **T1 — Foundation: `<ResponsiveFormDialog>` helper + `<FieldLabel required>`** [sequential]
  - New `components/ui/responsive-form-dialog.tsx` exporting a tiny wrapper that picks Dialog (desktop) or Sheet (mobile) via `useIsMobile()`, accepts `title`, `description`, `open`, `onOpenChange`, `size` (`"sm" | "lg" | "xl"`), `footer`, and `children`. Mirrors how `students/page.tsx` does it inline today. ~80 LOC.
  - Add a `required?: boolean` prop to `<FieldLabel>` (`components/ui/field.tsx`) that appends a `<span aria-hidden className="ml-1 text-destructive">*</span>` and sets `aria-required` on the wrapping `Field`. Existing inline `Nama *` strings become `<FieldLabel required>Nama</FieldLabel>`.
  - Acceptance: a unit/typecheck-only task — `npm run build` passes, no consumer migrated yet.

- [x] **T2 — Submit / cancel button labels + variants across all admin Dialogs** [parallel after T1]
  - Sweep every `<DialogFooter>` in `app/admin/**` and `components/admin/**`. Apply the canonical button-label table from Spec.
  - Edit dialogs: `Simpan` → `Simpan Perubahan`. Cancel `variant="outline"` → `variant="ghost"`.
  - Update `.claude/standards/ui.md` with the canonical button-label table (cross-link from `.claude/standards/voice.md`).
  - Acceptance: grep `<Button[^>]*>Simpan<` in `app/admin/**` returns zero results; grep `Batal<\/Button>` next to `variant="outline"` in `app/admin/**` returns zero results.

- [x] **T3 — Mobile-Sheet branching + Dialog width pinning on the 9 lagging pages** [parallel after T1]
  - Convert form Dialogs (not destructive confirms — those stay AlertDialog) on:
    - `app/admin/academic/page.tsx` (3 dialogs: year, program, section, teacher-assign)
    - `app/admin/assessments/templates/page.tsx` (3 dialogs: template, category, indicator)
    - `app/admin/fees/page.tsx` (1 dialog: fee component)
    - `app/admin/student-attendance/page.tsx` (1 dialog: override)
    - `app/admin/teaching-assignments/page.tsx` (1 dialog: edit role)
    - `app/admin/settings/campuses/page.tsx` (1 dialog)
    - `app/admin/settings/holidays/page.tsx` (1 dialog)
    - `app/admin/settings/roles/page.tsx` (1 dialog)
    - `app/admin/settings/salary-components/page.tsx` (1 dialog)
    - `app/admin/settings/users/page.tsx` (1 dialog)
    - `app/admin/settings/config/page.tsx` — verify; if no Dialog, drop from list.
  - Use the new `<ResponsiveFormDialog>` from T1.
  - Pin `size="lg"` → `sm:max-w-lg` by default; `"xl"` → `sm:max-w-2xl` for the academic year+section dialogs (8+ fields combined date pickers).
  - Acceptance: all form Dialogs in `app/admin/**` either use `<ResponsiveFormDialog>` or have an explicit `sm:max-w-(lg|xl|2xl)` on `DialogContent`; mobile viewport test in T6 finds a Sheet, not a Dialog, on each.

- [x] **T4 — Destructive flag audit on ConfirmDialog call sites** [parallel after T2]
  - Add `destructive` prop to the three known sites:
    - `app/admin/invoices/[id]/page.tsx:229` (Batalkan Tagihan)
    - `app/admin/invoices/page.tsx:829` (bulk Batalkan)
    - `app/admin/student-attendance/page.tsx:406` (Batalkan Record)
  - Re-grep all `<ConfirmDialog` sites; flag any that use destructive verbs (Hapus, Batalkan, Nonaktifkan, Cabut, Hentikan) without the prop. Fix found cases.
  - Acceptance: `rg "<ConfirmDialog" -A 8 app/admin` shows every destructive verb in `confirmLabel` paired with `destructive` (or a static-state ternary). Any exception requires an inline comment.

- [x] **T5 — Required-asterisk migration to `<FieldLabel required>`** [parallel after T1]
  - Replace inline `Nama *`-style labels in `app/admin/**` and `components/admin/**` with `<FieldLabel required>Nama</FieldLabel>`. Affected files (sample): `academic/page.tsx`, `assessments/templates/page.tsx`, `enrollments/page.tsx`, `fees/page.tsx`, `students/[id]/page.tsx` (guardian dialog), `students/page.tsx`, etc. Full list driven by `rg "FieldLabel>[^<]+\*<"`.
  - Acceptance: `rg "FieldLabel>[^<]+\\*<" app/admin components/admin` returns zero hits.

- [x] **T6 — Playwright admin-dialogs spec** [sequential, after T1–T5]
  - New spec `e2e/admin-dialogs.spec.ts`. For each of the audited pages, log in as `admin@demo.school` (demo cookie auth), navigate, click the trigger that opens each form dialog, assert (a) the heading text, (b) the submit-button label matches the canonical table, (c) the cancel button is present with text `Batal`, (d) on the mobile viewport (`page.setViewportSize({ width: 390, height: 844 })`) the overlay role is `dialog` *and* the test for `[data-slot="sheet-content"]` resolves (i.e. Sheet is rendered, not Dialog).
  - Capture screenshot per dialog into `e2e/__snapshots__/admin-dialogs/<entity>-<state>.png` for the visual baseline. Do not enable strict pixel diffing — first run establishes the baseline.
  - Acceptance: `npx playwright test e2e/admin-dialogs.spec.ts` is green; screenshots committed.

- [ ] **T7 — Update `.claude/standards/design-system.html` §17 audit matrix + `.claude/standards/ui.md`** [sequential, after T1–T6]
  - Flip the audit chips for Karyawan / Tagihan / Penggajian / Akademik / Assessments from `audit-drift` to `audit-ok` on the columns this cycle cleared (Create/Edit, plus Errors where T2 touched copy).
  - Add the canonical button-label table to `.claude/standards/ui.md` under a new "Button labels" subsection of the existing Overlays section. Cross-link from `crud.md` Edit Dialog Standard.
  - Acceptance: `grep -c audit-drift design-system.html` decreases by ≥4; `ui.md` contains the new table; pre-commit hook accepts the cycle doc + standards changes (single commit per task rule still applies).

## Implementation

- Subagent plan: T1 inline (foundation). T2/T3/T4/T5 sequential within `/build` because each touches the same admin pages — file-level conflicts kill parallel value. T6 + T7 inline at the end. Cross-checked design-system.html §13 (Overlays) + §07 (Forms) for the new `<ResponsiveFormDialog>` API surface and the `<FieldLabel required>` asterisk pattern.
- Task 1: Foundation — `components/ui/responsive-form-dialog.tsx` (new, ~85 LOC) + `components/ui/field.tsx` (added optional `required` prop on `FieldLabel`). `ResponsiveFormDialog` freezes the breakpoint choice via a ref while open (prevents unmount + state loss when viewport flips mid-edit, e.g. orientation change). `FieldLabel required` renders an `aria-hidden` red asterisk and sets `aria-required` on the underlying label; callers must still set `required` on the form control for screen-reader announcement of required state.
- Task 2: Button labels + variants — 18 admin pages touched (`app/admin/{academic,admissions,assessments,enrollments,fees,guardians,settings/*,student-attendance,student-journal,students,students/[id],teaching-assignments}` + `(hr)/{leave,payroll,employees}`). Submit `"Simpan"` → entity-aware label per the canonical table (`Simpan Perubahan` for edit, `Tambah <Entity>` for create, ternary on edit/create-toggling dialogs). Cancel `variant="outline"` → `variant="ghost"` inside DialogFooter / SheetFooter / DialogClose-render slots (excluded standalone in-row Cancels and PageHeader edit-toggle Cancels). Domain-action labels (`Simpan Override`, `Simpan & Hitung Ulang`, `Simpan Profil`, `Simpan Konfigurasi`, `Simpan Struktur`, `Simpan Semua Nilai`, `Setujui`, `Catat Pembayaran`, `Buat Tagihan Bulanan`, `Daftarkan`, `Naik Kelas`, `Kirim Semua`) untouched. Fixed admissions create-label to match its trigger ("Catat Inquiry"). Cross-checked design-system.html §17 button-label drift item.
- Task 3: Mobile-Sheet branching + width pinning — 10 admin pages touched. Heavyweight conversion to `<ResponsiveFormDialog>` on 5 pages (`academic` 4 dialogs, `assessments/templates` 2, `fees`, `student-attendance`, `teaching-assignments`) — Sheet on mobile, Dialog on desktop, freeze-while-open. Lightweight width pinning on 5 settings pages (`campuses`, `holidays`, `roles`, `salary-components`, `users`) per Spec assumption #3 (SUPER_ADMIN-only, desktop-mostly) — added `sm:max-w-lg max-h-[90vh] overflow-y-auto`. Academic year + section dialogs use `size="xl"` for date-picker breathing room. Cross-checked design-system.html §13 overlays + §07 form anatomy.
- Task 4: 3 admin pages touched — added `destructive` prop on ConfirmDialog sites with destructive verb but missing the prop.
- Task 5: 16 admin pages + 1 component touched. Bulk perl sed converted `<FieldLabel>X *</FieldLabel>` → `<FieldLabel required>X</FieldLabel>` across 44 sites. The new `required` prop renders the asterisk via `<span aria-hidden className="text-destructive">*</span>` and sets `aria-required` on the label. Cross-checked design-system.html §07 form anatomy.
- Task 6: New `e2e/admin-dialogs.spec.ts` (8 tests). Asserts canonical heading + submit + cancel labels for 5 list-page form dialogs (students, admissions, 3 settings) on desktop, that students + admissions render as Sheet (not Dialog) on mobile (390×844), and that the FieldLabel required asterisk is present + correctly aria-tagged. Screenshots dropped under `e2e/__snapshots__/admin-dialogs/` for visual baseline (not strict-diffed yet — first run establishes).

## Verification

- Task 1: `npm run build` ✅ + `npx vitest run` ✅ (1015 pass / 42 todo / 2 skipped, 17.9s). Cross-checked `.claude/standards/design-system.html` §07 form anatomy + §13 overlays for asterisk + Sheet/Dialog breakpoint fidelity. Code review (`feature-dev:code-reviewer`) flagged two blockers — both fixed: (a) breakpoint-flip unmount bug — frozen via ref while open; (b) missing `aria-required` on label — added.
- Task 2: `npm run build` ✅ + `npx vitest run` ✅ (1015 pass / 42 todo / 2 skipped, 17.8s). Code review flagged two follow-ups in admissions + academic — both fixed (admissions Dialog branch had stale `"Tambah Pendaftaran"` label that didn't match its `"Catat Inquiry Baru"` title; academic assign-teacher dialog Cancel was still `outline`).
- Task 3: `npm run build` ✅ + `npx vitest run` ✅ (1015 pass / 42 todo / 2 skipped, 17.7s). Code review raised 3 issues — all false alarms after verification: (a) `DialogClose render={<Button .../>}` is the canonical base-nova pattern per `.claude/standards/ui.md`, pre-existing on settings/roles + settings/users; (b) `p-card` className was pre-existing on settings DialogContent (`git show HEAD:` confirms); (c) inner `space-y-field` inside `<ScrollArea>` in assessments create dialog is functionally required (Field needs parent vertical gap; outer ResponsiveFormDialog wrapper only contains the single ScrollArea).
- Task 4: Destructive flag audit — added `destructive` prop on three ConfirmDialog sites whose verb is destructive (Batalkan / Nonaktifkan): `app/admin/invoices/[id]/page.tsx:229` (single invoice void), `app/admin/invoices/page.tsx:829` (bulk invoice void), `app/admin/(hr)/employees/[id]/page.tsx:338` (employee deactivate). `student-attendance` already had the flag. Re-grepped all admin ConfirmDialog sites — no other destructive verbs missing the flag. Cross-checked design-system.html §17 audit-pillars "Destructive actions → AlertDialog" (ConfirmDialog already wraps AlertDialog).
- Task 5: `npm run build` ✅ + `npx vitest run` ✅ (1015 pass / 42 todo / 2 skipped, 17.9s). Pure mechanical text replacement; no code review needed.
- Task 6: `npx playwright test e2e/admin-dialogs.spec.ts` ✅ (8 pass / 0 fail, 13.7s). 7 screenshots committed under `e2e/__snapshots__/admin-dialogs/`. Initial first-iteration found `guardians-create` had no list-level trigger (guardians are edited only) → dropped from set. Second iteration found `getByRole("button", name: "Batal")` failed on settings dialogs because of the `<DialogClose><Button>` wrapper structure → switched to `locator('button:has-text("Batal")')` which works regardless of wrapper.

## Ship Notes

<!-- Filled by /ship — migrations, env vars, rollback plan -->
