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
- [x] The three `DialogClose`/`SheetClose` call sites in `employees/page.tsx` and `leave-requests/page.tsx` use the `render` prop instead of nesting a `<Button>` as a child — no behavior change, pure markup-validity fix.
- [x] The four dialogs named above mark their required fields with `required` + `aria-required="true"` on the control and `required` on `FieldLabel`, matching the exact pattern already shipped on Theme/SubTheme/Week cards.
- [x] `CompletionBadge` in `penilaian/page.tsx` uses `bg-status-present-subtle text-status-present-text` / `bg-status-late-subtle text-status-late-text` instead of the opacity-modifier + border classes.
- [x] No behavior change to any of the four surfaces beyond: (a) users now sees a confirm step before a status flip, exactly like every sibling settings page; (b) the two form dialogs show a visible/announced required cue before submit.
- [x] Gates green: `npm run build`, `npx vitest run`, `verify-api-auth.sh`, `verify-rls-coverage.sh`, `audit-docs.sh`; Playwright local pass or CI-deferral recorded.

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
- [x] **T2 — Fix nested `<button>` in three DialogClose/SheetClose call sites.** `app/admin/(hr)/employees/page.tsx` (×2), `app/admin/(hr)/leave-requests/page.tsx` (×1). *Acceptance:* all three use `render={<Button .../>}`, matching the 5+ correct call sites elsewhere in the app; `npx tsc --noEmit` and existing gates stay green.
- [x] **T3 — Restore required-field marking on four dialogs.** `objectives/client.tsx`'s three dialogs, `academic-years/page.tsx`'s year dialog. *Acceptance:* every field the server schema requires (`content`, `competencyText`, `order`, `startDate`, `endDate`) carries `required` + `aria-required="true"` on the control and `required` on `FieldLabel`.
- [x] **T4 — Fix `CompletionBadge`'s status-color tokens.** `app/admin/penilaian/page.tsx`. *Acceptance:* the done/in-progress branches use the canonical `-subtle`/`-text` pair; a test locks in the exact class names and rejects the old opacity-modifier pattern.

All four tasks touch disjoint files with no shared state — independent, no sequencing required.

## Implementation

- Subagent plan: driver=claude-sonnet-5, dirty-work=claude-sonnet-5. All four tasks are small, disjoint-file, pre-specced slices done inline by the driver (each is a handful of lines once the diagnosis was already done by the earlier review) — no fan-out; noted per CLAUDE.md's exception for cycles where fan-out costs more than it saves.
- T1: `app/admin/settings/users/page.tsx` (+ new `__tests__/page.test.tsx`) — `handleToggleStatus` split into `putStatus`/`handleConfirmDeactivate`/`handleConfirmActivate`; row actions now set `deactivateTarget`/`activateTarget` state instead of firing the PUT directly; added `DeactivateConfirmDialog` (deactivate) and a plain `ConfirmDialog` (activate), mirroring `employees/page.tsx`'s existing split exactly. Cross-checked `design-system.html` — both are existing shared overlay primitives, same copy/label convention as their employees-page counterparts, no new component or token.
- T2: `app/admin/(hr)/employees/page.tsx` (2 spots), `app/admin/(hr)/leave-requests/page.tsx` (1 spot) — `<DialogClose>`/`<SheetClose>` wrapping a `<Button>` child switched to the `render` prop, matching the form already used correctly by 5+ other dialogs in the same two files and elsewhere in the app. Cross-checked `design-system.html` — markup-validity fix only, no visual or component change.
- T3: `app/admin/semesters/[id]/objectives/client.tsx` (`ObjectiveEditDialog`, `AddIndicatorDialog`, `IndicatorEditDialog`), `app/admin/academic-years/page.tsx` (year dialog) — `required`/`aria-required="true"` added to every server-required field's control, `required` added to the paired `FieldLabel`, matching the exact pattern already shipped on Theme/SubTheme/Week cards in the sibling `themes/client.tsx`. Cross-checked `design-system.html` — no new component, attribute-only addition to existing `Field`/`FieldLabel`/`Input`/`Textarea` usage.
- T4: `app/admin/penilaian/page.tsx` (+ extended `__tests__/page.test.tsx`) — `CompletionBadge`'s done/in-progress branches swapped from `bg-status-*/10 text-status-* border-status-*/20` to `bg-status-present-subtle text-status-present-text` / `bg-status-late-subtle text-status-late-text`; the untouched "not started" branch was never part of the bug. Cross-checked `design-system.html` + `colors.md` — canonical token pair, matches every other status chip in the app.
- Code review: `feature-dev:code-reviewer` ran against the full combined diff (all 4 tasks) — no high-confidence issues. It also surfaced (out of scope, flagged for a separate cycle): `app/admin/(hr)/payroll/page.tsx` and `app/admin/(hr)/payroll/[id]/page.tsx` have the identical nested-`<Button>`-in-`DialogClose` pattern T2 just fixed elsewhere (2 spots each) — not touched here per this cycle's Non-goals ("no broader sweep").

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no output (after `rm -rf node_modules && npm install && npx prisma generate` to replace the worktree's symlinked `node_modules`, which Turbopack rejects — known issue, see CLAUDE.md worktree notes).
- `npm run build` — ✅ compiled successfully, all routes generated including every touched admin page.
- `npx vitest run` (full suite) — ✅ `Test Files 338 passed | 2 skipped (340)` · `Tests 3282 passed | 42 todo (3324)`.
- `bash scripts/verify-api-auth.sh` — ✅ `196 / 196` (unchanged — no route added/removed; this cycle is client-only).
- `bash scripts/verify-rls-coverage.sh` — ✅ `42 / 42` (unchanged — no schema change).
- `bash scripts/audit-docs.sh` — ✅ 0 fail (counts block regenerated: 37 active cycle docs).
- **Playwright** — local run refused: `Error: Refusing to run e2e against non-local DATABASE_URL host "aws-1-ap-southeast-1.pooler.supabase.com"` (this worktree's `.env` points at the shared staging Supabase pooler; the specs mutate data through the API). Required CI check `Playwright E2E` gates the merge.
- **New/extended tests** — `app/admin/settings/users/__tests__/page.test.tsx` (new, 2 tests): proves no `PUT` fires until the confirm dialog is explicitly confirmed, for both the deactivate and activate directions. `app/admin/penilaian/__tests__/page.test.tsx` (extended, +1 test): locks in the exact `bg-status-late-subtle`/`text-status-late-text` classes and asserts the old `status-late/\d+` opacity-modifier pattern is gone.
- **Not added:** a dedicated test asserting `required`/`aria-required` on the four T3 dialogs, or asserting the T2 markup is no longer nested. The three dialog components in `objectives/client.tsx` are unexported (would need an export-for-testability change to unit-test in isolation, itself scope creep), and the existing `client.test.tsx` in that file continues to pass unchanged. T2's fix is a mechanical swap to a form already proven correct in 5+ other places in this exact codebase — `npm run build`/`tsc` catch a malformed JSX prop, and the risk of a silent wrong-but-compiling variant is low given the precedent it copies. Noted here rather than skipped silently.
- **Design system** — [x] Cross-checked `design-system.html` + `.claude/standards/ui.md`/`crud.md` across every task: every component touched (`DeactivateConfirmDialog`, `ConfirmDialog`, `DialogClose`/`SheetClose`, `Field`/`FieldLabel`, status-color tokens) is an existing shared primitive used exactly as its other callers use it — no new component, no new token, no markup invented.
- **Not verified this cycle** — live preview-verify (Chrome MCP) against the deployed Vercel preview: the preview requires its own Google sign-in and the admin account wasn't authenticated against that specific deployment URL. Per the user's direction, verification for this cycle and the prior journal-admin-catchup cycle is being done post-merge against the already-authenticated staging deployment instead.

## Ship Notes

- **Migrations:** none. **Env vars:** none. **Routes:** none added, removed, or reshaped — every fix in this cycle is client-side (confirm gating, markup validity, ARIA attributes, CSS classes).
- **Data:** none written or changed in shape. `PUT /api/users/[id]` is unchanged; this cycle only gates *when* the client calls it.
- **Behavior change worth announcing to admins:** deactivating or activating a user in Pengaturan → Pengguna now asks for confirmation first — previously it happened on the first click with no way to catch a misclick.
- **Follow-up flagged, not fixed here:** `app/admin/(hr)/payroll/page.tsx` and `app/admin/(hr)/payroll/[id]/page.tsx` carry the same nested-`<Button>`-in-`DialogClose` bug T2 fixed elsewhere (2 spots each, 4 total) — surfaced by this cycle's code review, out of scope per this cycle's Non-goals.
- **Rollback:** revert the merge commit. Nothing persisted changes shape; reverting restores the previous (unconfirmed) deactivate/activate flow with no data loss.
