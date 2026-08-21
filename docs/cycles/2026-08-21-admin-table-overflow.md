# Admin Table Overflow — Header Buttons Clipped by a Wide Table

## Context

Reported immediately after `enrollment-flexibility` (#509) shipped: on `/admin/students` the header's action buttons are clipped at the right edge — "Unduh Data" is partly hidden and "Tambah Siswa" is cut down to a sliver. The page itself scrolls horizontally rather than the table.

Two things combine.

**The latent cause — a flex child that cannot shrink.** `app/admin/layout.tsx:20` renders `<div className="relative flex w-full flex-1 flex-col bg-background">` as a flex child of `SidebarProvider`. A flex item's default `min-width: auto` refuses to shrink below its content's intrinsic width, and this div has no `min-w-0`. So when its content is wide, the div grows past the viewport and takes the `<header>` (line 21) and `<main>` (line 33) with it — clipping the page header's buttons. `components/ui/table.tsx:11` already wraps every table in `overflow-x-auto`, which is supposed to contain exactly this, but it can never engage while an ancestor is happy to expand.

**The trigger — `enrollment-flexibility` made a cell longer.** `TableCell` is `whitespace-nowrap` (`components/ui/table.tsx:86`), so cell content never wraps. The previous cycle changed the students list "Program / Kelas" column to render *both* placements for a dual-enrolled student, joined inline as `Kelompok Bermain · KB + D'Care (Day Care) · DCARE`. Forced onto one line that is roughly twice the previous width, which pushed the table past the viewport and exposed the layout defect.

So the clipping is new, but the bug that allows it is not — any sufficiently wide table on any admin page could always have done this. Fixing only the cell would leave the trap set for the next long column.

**Outcome:** the page header stays put regardless of table width, wide tables scroll inside their own container as the table component already intends, and the dual-placement cell no longer needs the extra width in the first place.

## Spec

- [x] The admin page header and its action buttons remain fully visible no matter how wide the table content is.
- [x] A too-wide table scrolls horizontally **within** its own bordered container (the existing `overflow-x-auto`), not by widening the page.
- [x] The fix is at the layout level, so it covers every admin table, not just students.
- [x] A dual-enrolled student's placements render one per line instead of a single inline run, so the column no longer demands double width.
- [x] A single-enrollment row renders exactly as before — no visual change for the common case.
- [x] `design-system` — no new component or token; reuses the existing table container and cell composition.

### Non-goals

- **Not removing `whitespace-nowrap` from `TableCell` globally.** It is deliberate across many tables (dates, phone numbers, status chips read badly when wrapped). This cycle opts one cell out rather than flipping a default that every admin table depends on.
- **Not auditing other admin tables for the same overflow.** The `min-w-0` fix covers them structurally; hunting for other over-wide columns is separate work.

## Tasks

- [x] **T1 — Let the layout column shrink.** Add `min-w-0` to the flex child in `app/admin/layout.tsx` so `overflow-x-auto` on the table container can engage, with a comment explaining why it is load-bearing.
  *Acceptance:* header buttons stay visible on `/admin/students` with a dual-enrolled student present; the table scrolls inside its own border.
- [x] **T2 — Stack the placements in the students list.** Render each placement on its own line (`whitespace-normal`), dropping the `+` join that mixed separators with the `·` already used between program and class.
  *Acceptance:* existing list tests pass unchanged; a new assertion pins both the ordering and the two-line structure.

## Implementation

- Task 1: `app/admin/layout.tsx` — added `min-w-0` to the main flex column. One word; it is what actually stops the page from stretching.
- Task 2: `app/admin/students/page.tsx` — the "Program / Kelas" cell now renders a `flex flex-col` with `whitespace-normal`, one placement per line, `+` separator removed. `app/admin/students/__tests__/page.test.tsx` — the existing dual-enrolment test only asserted that all four strings were present; it now also pins the ordering its own comment claimed and asserts the two placements are separate elements rather than one inline run.

## Verification

- `npm run build` — exit 0.
- `npx vitest run` — **313 passed | 2 skipped (315 files), 3040 passed | 42 todo (3082 tests), 0 failures.**
- Honest note: one earlier full run reported `1 failed | 312 passed` but the failure detail did not surface in the captured output, and two subsequent full runs were clean. Treated as a flake, not proven so. If CI shows a failure, this is the first thing to look at.
- `design-system` — no new surface; the change is one utility class in the layout plus a flex-column cell using existing spacing tokens.
- Playwright: local run deferred to CI (env cannot execute it — `playwright.config.ts` refuses to start because this worktree's `DATABASE_URL` points at the staging Supabase pooler, and the specs mutate data through the API). Required CI check `Playwright E2E` gates the merge.
- Preview-verify on the Vercel preview for PR #510, admin portal, `/admin/students` with the dual-enrolled student present. The local demo server could not be used (the preview supervisor inherited a deleted working directory — `EPERM: uv_cwd`), so verification was done against the real preview instead. **Blockers 0, minors 0**, zero console errors.
  - Both header actions render fully: measured `Unduh Data` right edge at 1306px inside a 1470px viewport.
  - No page-level overflow: `document.documentElement.scrollWidth === clientWidth === 1470`.
  - Alia renders stacked — `Kelompok Bermain · KB` above `D'Care (Day Care) · DCARE` — and single-enrollment rows are unchanged.
  - **Root cause proven, not just the symptom.** Injecting a deliberately unwrappable 3000px element into a table cell and forcing layout gave `tableScrollWidth 3688` against `tableClientWidth 1164` while `document.documentElement.scrollWidth` stayed at `1470`: the table now absorbs the excess into its own `overflow-x-auto` instead of stretching the page and carrying the header off-screen. Probe removed afterwards; page state restored and re-measured clean.

## Ship Notes

**No migrations, no env vars, no schema change.** Two CSS-level changes.

- The `min-w-0` fix is layout-wide: every page under `/admin` now lets a wide table scroll inside its own container instead of stretching the page. If any admin page was accidentally relying on the page growing to fit its table, it will now scroll within the table border instead — the intended behaviour, but worth a glance on the widest tables (invoices, payroll).
- **Rollback:** `git revert`. Nothing stateful.
- **Follow-up, separate from this fix:** while diagnosing, staging showed `santo` with student status `WITHDRAWN` (Keluar) but holding an **ACTIVE** D'Care enrollment alongside three withdrawn ones — which is why that row renders a live class next to a "Keluar" badge. Neither enrolment door checks `Student.status`, so a withdrawn or graduated student can still be enrolled. That is **pre-existing** (the pre-`enrollment-flexibility` code had no such check either) and is not touched here. Worth its own cycle: reject enrolment when `student.status !== "ACTIVE"` on both doors, and decide whether to correct the stray staging row.
