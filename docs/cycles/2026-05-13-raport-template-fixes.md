# Raport + Template e2e fixes

## Context

UAT walked the journal + raport end-to-end on staging on 2026-05-13 and surfaced three real bugs that block the rapor flow for school admins and parents (not copy nits). All three are in the assessment-template + parent-rapor cache path, so they ship together.

1. **B1 — Admin cannot retrofit kategori onto an existing assessment template.** `app/admin/assessments/templates/page.tsx` Edit dialog (lines 431–461) only exposes `name` + `type`. The Create dialog (lines 365–428) has an inline Kategori & Indikator builder, but it is duplicated as raw JSX, not extracted. The `PUT /api/assessments/templates/[id]` handler (and `updateAssessmentTemplateSchema`) drop categories entirely. Net effect: the two 0-kategori seed templates left in staging (`E2E Template Rapor KB v2`, `E2E Test Template KB`) cannot be made usable — admin has to delete + recreate, losing references.
2. **B2 — Buat Template dialog footer overlaps the last form field once ≥2 kategori are expanded.** Verified live: `Buat Template` button sits on top of the second kategori's indikator input at viewport y≈561 (1468×651 viewport). Root cause: `DialogContent` (`components/ui/dialog.tsx:42–81`) has no `max-h` and no flex/grid layout that scrolls the body; the Create dialog wraps content in `<ScrollArea max-h-[60vh]>` but the ScrollArea is nested inside `ResponsiveFormDialog`'s body `<div className="space-y-field py-2">`, which itself has no height cap — so on tight viewports the inner ScrollArea is ineffective and the form pushes through the docked DialogFooter. Submit becomes unclickable.
3. **B3 — Parent /parent/reports shows stale "Rapor belum terbit" after teacher publishes.** `lib/parent-helpers.ts:248–277` wraps `getPublishedAssessmentsForStudent` in `unstable_cache` with tag `"parent-published-assessments"` and `revalidate: 120`. The publish handler at `app/api/assessments/student/[id]/route.ts:103–133` updates `studentAssessment.status → PUBLISHED` but never calls `revalidateTag`/`revalidatePath`. Parents see the empty state for up to 2 minutes after their teacher publishes — they will assume the publish broke.

Intended outcome: admin can author + repair templates from one UI, the Create/Edit dialog never blocks submit, and parents see their child's rapor within one server round-trip of publish.

## Spec

### Acceptance criteria

- [ ] **B1.1** — Edit Template dialog (admin `/admin/assessments/templates`) renders the same Kategori & Indikator builder UI as the Create dialog.
- [ ] **B1.2** — The Kategori & Indikator builder is extracted into a single shared component (`components/admin/assessments/KategoriIndikatorBuilder.tsx`) used by both Create and Edit dialogs — no duplicated JSX.
- [ ] **B1.3** — `PUT /api/assessments/templates/[id]` accepts a `categories` payload (same shape as POST), performs a transactional replace inside Prisma (`deleteMany` then `createMany` cascade pattern, scoped to the template), and returns the updated template with `categories` included.
- [ ] **B1.4** — Edit dialog refuses to mutate kategori when `_count.assessments > 0` and instead shows an inline notice: *"Template ini sudah dipakai N penilaian. Nama dan tipe bisa diubah; struktur kategori dikunci untuk menjaga riwayat nilai."* The notice and lock are driven by the API response, not the client.
- [ ] **B1.5** — `updateAssessmentTemplateSchema` extends to accept the optional `categories` array. Backwards-compatible: existing callers passing only `{ name, type, isActive }` keep working.
- [ ] **B2.1** — On desktop, the dialog body never overlaps the dialog footer. Concretely: `DialogContent` becomes a flex-column with `max-h-[90vh]`, the body slot gets `flex-1 min-h-0 overflow-y-auto`, the footer keeps its docked styling. Verified at viewport heights down to 600px with the Create dialog expanded to 2 kategori × 2 indikators.
- [ ] **B2.2** — `ResponsiveFormDialog` no longer leaves the height/scroll responsibility to consumers. The redundant `<ScrollArea max-h-[60vh]>` wrapper inside the Create dialog (lines 377–427) is removed.
- [ ] **B2.3** — Mobile (`Sheet`) branch already has `max-h-[90vh] overflow-y-auto` — confirmed unchanged.
- [ ] **B3.1** — `PUT /api/assessments/student/[id]` calls `revalidateTag('parent-published-assessments')` after a successful transition to `PUBLISHED`. Skipped when the request only saves scores (no `publish: true` and no `status: "PUBLISHED"`) — avoids unnecessary cache busts on every autosave.
- [ ] **B3.2** — Parent `/parent/reports` reflects a fresh publish within one full-page navigation (no manual hard reload, no 120s wait). Verified manually on staging after this ships.

### Non-goals

- No changes to teacher scoring UI, no change to the BB/MB/BSH/BSB rubric or score schema.
- No changes to `app/parent/reports/page.tsx` itself — fix is in the cache invalidation path, not the consumer.
- No fix in this cycle for the parent journal week-empty bug (M8 from UAT) or the parent attendance cache (separate cycle).
- No locale/copy changes (deferred — separate cycle if at all).

### Assumptions

1. `AssessmentCategory` and `AssessmentIndicator` have `onDelete: Cascade` from `AssessmentTemplate`, so `deleteMany` on categories cascades to indicators. (Verify before T1 — if not, indicators must be deleted explicitly first.)
2. Locking the kategori builder when `assessments > 0` is the correct UX policy (preserves score history). Confirm with user before T1 if they'd prefer destructive edit with a confirmation gate instead.
3. Only one consumer of `getPublishedAssessmentsForStudent` exists; bumping its tag from anywhere reaches parent /reports.
4. Existing dialogs that use `ResponsiveFormDialog` don't rely on the body being unbounded in height. (Sample several before T2.)

→ Correct any of these now or `/build` will proceed with these.

## Tasks

- [ ] **T1 — Extract `KategoriIndikatorBuilder` + wire Edit dialog + extend PUT schema/route.**
  - Create `components/admin/assessments/KategoriIndikatorBuilder.tsx` accepting `{ categories, onChange, disabled?, readOnly? }`.
  - Replace the inline builder JSX in Create dialog (page.tsx:401–425) with the new component.
  - Mount the same component in the Edit dialog. Hydrate `editForm.categories` from `editTarget.categories` (already present in the row fetch) when the dialog opens.
  - Extend `updateAssessmentTemplateSchema` with optional `categories` (same shape as create).
  - In `PUT /api/assessments/templates/[id]`, when `categories` is present and `_count.assessments === 0`, do a transactional `deleteMany`-then-create rewrite. When `assessments > 0`, ignore the `categories` payload (server-side enforcement of B1.4).
  - Surface `assessments` count to the client (already in GET — verify) so the Edit dialog can render the locked notice.
  - **Acceptance:** Re-opening one of staging's 0-kategori templates lets admin add 2 kategori × 2 indikator and save. List row updates to "2 kategori". The Edit dialog on a template with existing scores shows the notice and disables the builder.
  - **Depends on:** nothing.

- [ ] **T2 — Fix DialogContent/ResponsiveFormDialog scroll layout.**
  - In `components/ui/dialog.tsx`, change `DialogContent` from `grid gap-4` to `flex flex-col max-h-[90vh] min-h-0`. Keep all other classes.
  - In `components/ui/responsive-form-dialog.tsx`, change the desktop body wrapper from `<div className="space-y-field py-2">` to `<div className="space-y-field py-2 flex-1 min-h-0 overflow-y-auto pr-2">`.
  - Remove the redundant `<ScrollArea max-h-[60vh] pr-2>` wrapper from `app/admin/assessments/templates/page.tsx` Create dialog body (it's now in the parent).
  - Sample 3–4 other `ResponsiveFormDialog` consumers (admin/employees edit, admin/admissions Catat Pertanyaan, admin/students edit) and confirm they still render normally — `npm run build` will catch type breakage, manual smoke catches visual regressions.
  - **Acceptance:** Buat Template with 2 kategori × 2 indikator → footer below scroll, Buat Template button always clickable at 1468×600 viewport. No regression in three other ResponsiveFormDialog consumers.
  - **Depends on:** nothing (independent of T1).

- [ ] **T3 — Invalidate parent rapor cache on publish.**
  - In `app/api/assessments/student/[id]/route.ts`, after the transaction commits, branch on `newStatus === "PUBLISHED"` and `revalidateTag('parent-published-assessments')`. Also call `revalidatePath('/parent/reports')` as a belt-and-braces measure (cheap, narrow).
  - Add a small comment pointing to the cache key in `lib/parent-helpers.ts:267` so future hands keep the tag string in sync.
  - **Acceptance:** Manual staging smoke: teacher publishes → parent reloads /parent/reports (no hard reload) → celebration card visible within ≤2s. Build + unit gate green.
  - **Depends on:** nothing.

- [ ] **T4 — End-to-end smoke + cycle doc Verification + Ship Notes.**
  - Run `npm run build && npx vitest run`.
  - Run `npx playwright test` (end-of-cycle gate; not pure-docs so Playwright required).
  - Manual smoke on staging dev server (`DEMO_MODE=true npm run dev`): create-template w/ 2 kategori, edit-template adding kategori to one of the 0-kategori seed entries, publish a rapor as teacher and verify parent sees the celebration card without a hard reload.
  - Cross-checked `design-system.html` § dialogs for the new scroll layout (frontend gate).
  - Fill cycle doc Implementation + Verification + Ship Notes.

## Implementation

- **T1** — Added `components/admin/assessments/KategoriIndikatorBuilder.tsx`. Replaced inline builder in `app/admin/assessments/templates/page.tsx` Create dialog and added it to the Edit dialog. Edit hydrates `categories` from `editTarget.categories`, sends `categories` in PUT payload, and is locked client-side when `_count.assessments > 0`. Extended `updateAssessmentTemplateSchema` to accept optional `categories`. `PUT /api/assessments/templates/[id]` now checks the existing assessment count and returns 409 if a `categories` payload arrives for a template with scores; otherwise it does a transactional `deleteMany` → recreate of `AssessmentCategory` (FK-cascades indicators). Cross-checked `design-system.html` § dialogs — no new variants introduced. Also restored missing `exceljs` dep (was absent from the symlinked node_modules; pre-existing build break unrelated to this cycle).

- **T2** — `components/ui/dialog.tsx` `DialogContent` switched from `grid gap-4` (no height cap) to `flex flex-col max-h-[90vh] min-h-0 gap-4`. `components/ui/responsive-form-dialog.tsx` desktop body wrapper gained `flex-1 min-h-0 overflow-y-auto pr-2`; header and footer marked `shrink-0`. Removed the now-redundant `<ScrollArea max-h-[60vh]>` wrapper from the Create dialog body in `app/admin/assessments/templates/page.tsx` and the unused `ScrollArea` import. Sampled three other consumers (`app/admin/academic/page.tsx`, `app/admin/fees/page.tsx`, `app/admin/teaching-assignments/page.tsx`) — all use the dialog the standard way, no body wrappers that conflict with `overflow-y-auto`. Cross-checked `design-system.html` § dialogs — layout pattern matches the standard shadcn dialog spec.

- **T3** — `app/api/assessments/student/[id]/route.ts` now imports `revalidateTag` + `revalidatePath` from `next/cache` and, after the publish transaction commits, calls `revalidateTag("parent-published-assessments", { expire: 0 })` plus `revalidatePath("/parent/reports")` only when `newStatus === "PUBLISHED"`. Per-keystroke autosaves leave the cache alone. Tag profile signature matches the existing pattern from `app/api/invoices/**/route.ts`. Added a comment in `lib/parent-helpers.ts` pointing future hands to the publish handler so the tag string doesn't drift.

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
