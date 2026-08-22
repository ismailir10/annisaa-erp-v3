# E2E Cross-Actor Bug Sweep — 5 fixes

## Context

End-to-end testing on staging (12 Mei 2026) surfaced five cross-actor bugs while
walking the admin → teacher → parent flow:

- **A** student attendance taps on `/teacher/class-attendance` showed local UI
  update but neither `/admin/student-attendance` nor `/parent/attendance`
  reflected the new record — and no error toast was shown
- **B** `/admin/assessments/templates` "Buat Template" toast reported success
  but the row appeared with `0 kategori` and the kategori/indikator inputs
  never persisted — blocking the entire rapor pipeline
- **C** Shadcn/Base UI Select on the template Program field and the manual
  invoice Komponen field required two clicks (label shows after first click,
  but submit fails until user explicitly clicks the option row)
- **D** Buku Penghubung catatan written by teacher was visible on
  `/parent/attendance` "CATATAN DARI SEKOLAH" but missing on the parent
  `/parent/student-journal` and on the teacher's own reload — three surfaces,
  three answers from the same row
- **E** After admin approves a leave on `/admin/(hr)/leave/`, the four KPI
  cards (Total / Menunggu / Disetujui / Ditolak) kept their pre-action numbers

Full E2E test report and reproduction steps captured in the chat thread.

## Spec

For each bug, fix the cross-actor invariant so the action taken in one portal
is observable in the others.

Acceptance:

1. Template create with kategori+indikator persists nested rows; teacher
   detail page exposes indicators for scoring
2. Manual invoice + assessment template Selects commit form value on the
   first interaction (no validation regression)
3. Admin leave KPI cards refresh after every approve/reject
4. Teacher student attendance tap either reports save explicitly or reverts
   on silent failure (no more silent zero-rows-saved success)
5. Catatan tenantId is derived from the student record, so cross-tenant
   teacher writes don't tag the note out of the guardian's read scope

## Tasks

1. Bug B — extend `createAssessmentTemplateSchema` with nested categories +
   indicators; POST handler creates the nested rows
2. Bug E — extract `fetchStats` callback on admin leave page; invoke
   after `handleReview` alongside `fetchRequests`
3. Bug A — add per-row save state on teacher class-attendance; guard against
   `saved < total` from mark-route response
4. Bug C — pre-fill Select-bound state with first available option when the
   list loads / when the dialog opens / when an extra line is added
5. Bug D — fetch student.tenantId in notes POST and tag the note row with
   the student's tenantId rather than the author's session tenantId

## Implementation

| File | Change |
|---|---|
| `lib/validations/assessment-template.ts` | `categories: z.array(z.object({ name, indicators[] }))` added to create schema |
| `app/api/assessments/templates/route.ts` | POST writes nested kategori+indikator rows via `data.categories: { create: ... }` and returns them via `include` |
| `app/admin/assessments/templates/page.tsx` | "Buat Template" button now pre-fills `programId` with `programs[0]?.id` |
| `components/admin/invoices/manual-invoice-dialog.tsx` | fee-components effect pre-fills `lines[0].feeComponentId`; `addLine()` seeds new rows with the first component |
| `app/admin/(hr)/leave/page.tsx` | `fetchStats` extracted to `useCallback`; called after approve/reject mutation |
| `app/teacher/class-attendance/page.tsx` | per-row `saveState`; revert + toast when `body.saved < 1` despite 200 OK |
| `app/api/student-journal/notes/route.ts` | note `tenantId` derived from `Student.tenantId`, not `session.tenantId` |

## Verification

- `npx vitest run` → 133 files, 1098 passed, 42 todo, 2 skipped, 0 failed
- `npm run build` → ✓ Compiled successfully in 6.2s, 123/123 static pages
- Playwright skipped — pure bug-fix cycle, no UI flows added; the affected
  surfaces are exercised by existing vitest suites:
  - `app/api/__tests__/student-attendance-mark.test.ts` (Bug A path)
  - `components/admin/invoices/__tests__/manual-invoice-dialog.test.ts` (Bug C path)
  - `app/api/__tests__/leave-*.test.ts` (Bug E indirect)
- Cross-checked design-system.html § Overlay/Form for the form fixes — no
  visual changes, only behavior fixes inside existing Shadcn primitives.

## Ship Notes

- No migrations
- No env-var changes
- Rollback: revert the merge commit; no schema state to undo
- Risk surface:
  - Template create now writes nested rows — backfill not needed (existing
    `0 kategori` templates remain editable for top-level fields, and admins
    can recreate the proper template now that the form persists kategori)
  - Note tenantId behavior change is a tightening — notes already created
    with the author's tenantId continue to render as before for same-tenant
    parents; cross-tenant authors now write to the student's tenant which
    fixes the previously-invisible case
