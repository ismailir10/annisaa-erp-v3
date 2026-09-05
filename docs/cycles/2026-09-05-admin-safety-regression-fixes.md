# Admin Safety & Regression Fixes

## Context

A UI/UX review across all three portals surfaced four admin-only defects that are bugs, not style — one real safety footgun and three regressions of already-fixed patterns:

1. **No confirmation on deactivating a user.** `app/admin/settings/users/page.tsx`'s row-action dropdown fires the status-flip `PUT` the instant "Nonaktifkan"/"Aktifkan" is clicked — no `ConfirmDialog`, unlike every sibling settings page (Employees, Campuses, Holidays, Roles) and unlike `crud.md`'s own Category A standard ("Deactivate → ConfirmDialog via dropdown action"). A misclick locks an admin, teacher, or guardian out of login with zero warning and no undo affordance shown.
2. **Invalid nested `<button>` markup.** `app/admin/(hr)/employees/page.tsx` (two spots) and `app/admin/(hr)/leave-requests/page.tsx` (one spot) wrap a `<Button>` as a *child* of `DialogClose`/`SheetClose` instead of passing it via the `render` prop — Base UI's `DialogClose`/`SheetClose` render a `<button>` by default, so this produces `<button><button>Batal</button></button>`: invalid HTML, ambiguous focus/AT semantics. 5+ other dialogs in the same two files (and across the app) already use the correct `render={<Button .../>}` form.
3. **Required-field marking regressed after the 2026-07-30 accessibility audit.** That audit added `required`/`aria-required` to Theme/SubTheme/Week/Class/Semester forms. Four dialogs built afterward never got it: `app/admin/semesters/[id]/objectives/client.tsx`'s `ObjectiveEditDialog`/`AddIndicatorDialog`/`IndicatorEditDialog` (server: `min(1)` on `content`/`competencyText`) and `app/admin/academic-years/page.tsx`'s year dialog (server: regex on `startDate`/`endDate`, both required on create). Sighted users get no visual cue; screen-reader users get no announced required state; both just hit a generic error toast after submitting.
4. **A status-color regression that undoes a contrast fix.** `app/admin/penilaian/page.tsx`'s `CompletionBadge` hand-rolls `bg-status-*/10 text-status-* border-status-*/20` instead of the canonical `bg-status-*-subtle text-status-*-text` pair every other status chip in the app uses — bypassing the 2026-08-19 fix that re-darkened `-text` variants specifically for contrast, and reintroducing a second, undocumented status-color recipe.

None of these four touch the same file or the same subsystem; they are grouped into one cycle because each is small, already-diagnosed, and low-risk to fix in isolation — batching avoids four separate PR/CI round-trips for four one-file changes.

## Spec

- [x] Deactivating or activating a user in `/admin/settings/users` requires an explicit confirm step, matching the `DeactivateConfirmDialog` + plain `ConfirmDialog` pattern `app/admin/(hr)/employees/page.tsx` already uses for the identical deactivate/restore pair.
- [ ] The three `DialogClose`/`SheetClose` call sites in `employees/page.tsx` and `leave-requests/page.tsx` use the `render` prop instead of nesting a `<Button>` as a child — no behavior change, pure markup-validity fix.
- [ ] The four dialogs named above mark their required fields with `required` + `aria-required="true"` on the control and `required` on `FieldLabel`, matching the exact pattern already shipped on Theme/SubTheme/Week cards.
- [ ] `CompletionBadge` in `penilaian/page.tsx` uses `bg-status-present-subtle text-status-present-text` / `bg-status-late-subtle text-status-late-text` instead of the opacity-modifier + border classes.
- [ ] No behavior change to any of the four surfaces beyond: (a) users now sees a confirm step before a status flip, exactly like every sibling settings page; (b) the two form dialogs show a visible/announced required cue before submit.
- [ ] Gates green: `npm run build`, `npx vitest run`, `verify-api-auth.sh`, `verify-rls-coverage.sh`, `audit-docs.sh`; Playwright local pass or CI-deferral recorded.

### Non-goals

- No change to the underlying `PUT /api/users/[id]`, curriculum, or academic-year API routes — every fix here is client-side (confirm gating, markup, ARIA, CSS classes). If C6's confirm gate had turned out to be masking an actually-unguarded API endpoint, this cycle would stop and flag it instead of quietly fixing only the UI — checked, and it isn't: `PUT /api/users/[id]` already requires an authenticated admin session and validates its body; the missing piece was purely the client-side confirmation step.
- No retrofit of any admin detail page to the dossier shell — unrelated, tracked separately in `docs/cycles/2026-09-03-detail-page-pattern-decision.md`.
- No broader audit of every `DialogClose`/`SheetClose` in the app for the same nested-button bug beyond the three call sites named — those three were the ones the review found; a full sweep is separate work if the user wants it.

### Assumptions

1. Reactivating a user does **not** need the same weight of confirm as deactivating — mirrors `employees/page.tsx`'s existing split (`DeactivateConfirmDialog`, non-destructive copy, no "Ya," prefix, for deactivate; a plain `ConfirmDialog` with "Aktifkan" for activate) rather than inventing a new convention.
2. The `order` number fields in the objectives/indicator dialogs get `required`/`aria-required` too, even though the UI always pre-fills a valid default (so a sighted user can't easily leave them empty) — matches `ThemeCard`'s own "Urutan" field treatment in the same standards-compliant sibling file, for consistency rather than because the field is practically emptiable.
3. `CompletionBadge`'s fix is a class-name swap only — not a migration to the shared `StatusBadge` component. `StatusBadge`'s "solid" variant would work, but this badge's label (`"N/M dinilai"`) and `font-currency` numeral treatment don't map cleanly onto `StatusBadge`'s status-enum + label-override shape, and the review's own fix suggestion offered the minimal token swap as sufficient.

## Tasks

- [x] **T1 — Confirm gate on user deactivate/activate.** `app/admin/settings/users/page.tsx`. *Acceptance:* clicking "Nonaktifkan"/"Aktifkan" opens a confirm dialog and fires no `PUT` until confirmed; a test proves both the no-PUT-before-confirm and the PUT-after-confirm halves for each direction.
- [ ] **T2 — Fix nested `<button>` in three DialogClose/SheetClose call sites.** `app/admin/(hr)/employees/page.tsx` (×2), `app/admin/(hr)/leave-requests/page.tsx` (×1). *Acceptance:* all three use `render={<Button .../>}`, matching the 5+ correct call sites elsewhere in the app; `npx tsc --noEmit` and existing gates stay green.
- [ ] **T3 — Restore required-field marking on four dialogs.** `objectives/client.tsx`'s three dialogs, `academic-years/page.tsx`'s year dialog. *Acceptance:* every field the server schema requires (`content`, `competencyText`, `order`, `startDate`, `endDate`) carries `required` + `aria-required="true"` on the control and `required` on `FieldLabel`.
- [ ] **T4 — Fix `CompletionBadge`'s status-color tokens.** `app/admin/penilaian/page.tsx`. *Acceptance:* the done/in-progress branches use the canonical `-subtle`/`-text` pair; a test locks in the exact class names and rejects the old opacity-modifier pattern.

All four tasks touch disjoint files with no shared state — independent, no sequencing required.

## Implementation

- Subagent plan: driver=claude-sonnet-5, dirty-work=claude-sonnet-5. All four tasks are small, disjoint-file, pre-specced slices done inline by the driver (each is a handful of lines once the diagnosis was already done by the earlier review) — no fan-out; noted per CLAUDE.md's exception for cycles where fan-out costs more than it saves.
- T1: `app/admin/settings/users/page.tsx` (+ new `__tests__/page.test.tsx`) — `handleToggleStatus` split into `putStatus`/`handleConfirmDeactivate`/`handleConfirmActivate`; row actions now set `deactivateTarget`/`activateTarget` state instead of firing the PUT directly; added `DeactivateConfirmDialog` (deactivate) and a plain `ConfirmDialog` (activate), mirroring `employees/page.tsx`'s existing split exactly. Cross-checked `design-system.html` — both are existing shared overlay primitives, same copy/label convention as their employees-page counterparts, no new component or token.

## Verification

## Ship Notes
