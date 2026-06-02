# Fix UI Consistency Blockers (P0)

## Context

The 2026-05-18 comprehensive UI consistency review ([docs/reviews/2026-05-18-ui-consistency.md](../reviews/2026-05-18-ui-consistency.md)) flagged 4 P0 (critical) issues across teacher, shared attendance, admin HR, and admin settings. Each is a single-file mechanical fix but blocks the canonical UI contract: the teacher error boundary leaks raw `error.message` strings to end users; `components/attendance/calendar.tsx` maintains parallel status-color + label maps that diverge from `StatusBadge`'s canonical "Alpa" label (still ships "Tidak Hadir"); the payroll Approve + Send-Slips confirmations use `<Dialog>` for irreversible workflow transitions instead of `<AlertDialog>`; the salary-components deactivate toggle fires without any confirmation guard. Outcome: close all four against `ui.md` Overlays Rule + `voice.md` glossary + `portal.md` Fetch Error Contract, with no scope creep into P1/P2 items from the same review.

## Spec

**Acceptance criteria:**

- [ ] `app/teacher/error.tsx` renders only the fixed Indonesian fallback string — no `error.message` interpolation. Visual layout, icon, and "Coba Lagi" button unchanged.
- [ ] `components/attendance/calendar.tsx` no longer maintains a local `label` field for status entries. Labels resolve via `getStatusConfig()` from `components/ui/status-badge.tsx` (canonical source). "Tidak Hadir" no longer appears in the legend, modal, or summary — replaced by "Alpa" per `voice.md`. Grid cell solid-bg styling preserved (calendar-specific, not duplicated by StatusBadge).
- [ ] `app/admin/(hr)/payroll/[id]/page.tsx` Approve + Send Slips confirmations use `<AlertDialog>` (not `<Dialog>`). Both surface their body content (period summary / slip count) inside `<AlertDialogDescription>` or a `div` between header and footer. `<AlertDialogCancel>` carries no variant; `<AlertDialogAction>` carries the destructive intent.
- [ ] `app/admin/settings/salary-components/page.tsx` deactivation (toggling `isEnabled: true → false`) prompts an `<AlertDialog>` before calling `toggleEnabled()`. Activation (off → on) remains a single-click action (non-destructive). Copy: "Nonaktifkan komponen ini?" + reassurance "Bisa diaktifkan kembali kapan saja."
- [ ] `npm run build && npx vitest run` passes (between-task gate, after each task).
- [ ] End-of-cycle: `npx playwright test` passes (or recorded skip with rationale).
- [ ] Cross-checked `design-system.html` §Status palette + §Overlay/Confirm patterns for any visual side-effects.

**Non-goals:**

- P1/P2 findings from the review (38 Major + 35 Minor) — separate cycles.
- Refactoring `StatusBadge` API or status token system.
- Adding new variants to `AlertDialog`, `Dialog`, or `Sheet`.
- Migrating other Dialog → AlertDialog cases (e.g. leave reject, admission cancel) — only payroll Approve + Send Slips this cycle.
- Touching the payroll edit-line modal or vars modal (lines 480-522) — those are non-destructive edits, Dialog is correct.
- Mobile Sheet branches for settings dialogs (P1 item).

**Assumptions:**

1. `<AlertDialog>` primitive at `components/ui/alert-dialog.tsx` exists with full Shadcn API (`AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction`). If a wrapper is missing, will add minimal Shadcn-template content in the same task.
2. `getStatusConfig()` is the canonical export from `status-badge.tsx` (confirmed by reading the file: `export function getStatusConfig(status: string): StatusConfig` at line 268).
3. Calendar grid cell color treatment (solid `bg-status-*` + `text-white`) is intentional and distinct from `<StatusBadge>`'s subtle-bg pill — local color map kept, only `label` fields removed.
4. Calendar modal can adopt `<StatusBadge variant="intent">` for the status row without breaking the existing layout — visual change is acceptable since current modal styling is bespoke and inconsistent with the rest of portal.
5. Salary-components activation path stays click-through (no confirm) — toggling INACTIVE → ACTIVE is non-destructive and matches the pattern in other admin modules.
6. Build + unit-test gate is sufficient mid-cycle. Playwright runs once end-of-cycle.

## Tasks

All four tasks are independent (no shared files). `/build` should dispatch in parallel via `superpowers:subagent-driven-development`.

- [x] **T1 — Remove raw error.message from teacher error boundary**
  - File: `app/teacher/error.tsx`
  - Change: line 20 — delete `{error.message || ...}` interpolation, keep fixed string `"Halaman tidak bisa dimuat. Coba lagi sebentar ya."`
  - Acceptance: file renders identical layout; visit `/teacher` with a forced thrown error and the user sees only the fixed Indonesian copy. `npx vitest run` passes (no test changes expected).

- [x] **T2 — Dedupe attendance calendar status maps + label drift**
  - File: `components/attendance/calendar.tsx`
  - Changes:
    - Strip `label` field from local `STATUS_COLORS` (keep `bg` + `text` for grid-cell styling — that is calendar-specific).
    - Delete `STATUS_TEXT_COLORS` map.
    - Replace legend label render (lines 144-149) with `getStatusConfig(key).label`.
    - Replace summary `"Tidak Hadir"` (line 157) with `getStatusConfig("ABSENT").label`.
    - Replace modal status row (lines 197-202) with `<StatusBadge status={selectedDay.status} variant="intent" />`.
    - Add `import { StatusBadge, getStatusConfig } from "@/components/ui/status-badge"`.
  - Acceptance: legend, summary, and modal all show "Alpa" for ABSENT. No more local label drift. Grid cells still render solid-bg coloring. `npx vitest run` passes.

- [x] **T3 — Convert payroll Approve + Send Slips to AlertDialog**
  - File: `app/admin/(hr)/payroll/[id]/page.tsx`
  - Changes:
    - Replace `<Dialog open={approveModal}>` block (lines 525-542) with `<AlertDialog>` equivalent. Move body summary into a `div` between `<AlertDialogHeader>` and `<AlertDialogFooter>`. `<AlertDialogCancel>` for Batal; `<AlertDialogAction onClick={handleApprove}>` for Setujui.
    - Replace `<Dialog open={sendModal}>` block (lines 544-559) with `<AlertDialog>` equivalent.
    - Add imports from `@/components/ui/alert-dialog` (Root, Content, Header, Title, Description, Footer, Cancel, Action). Drop unused `DialogClose` if it remains only for these blocks.
  - Acceptance: clicking Setujui/Kirim Semua surfaces an AlertDialog (no overlay-over-overlay regression). Body content (period dates, employee count, total) still visible. Disabled state during `approving` / `sending` preserved on the Action button. `npx vitest run` + `npm run build` pass.

- [x] **T4 — Add AlertDialog guard to salary-components deactivate**
  - File: `app/admin/settings/salary-components/page.tsx`
  - Changes:
    - Add `confirmTarget` state: `const [confirmTarget, setConfirmTarget] = useState<Component | null>(null)`.
    - Change `onDeactivate` in column actions (line 156) to `() => setConfirmTarget(c)`. Leave `onActivate` as direct `toggleEnabled` call.
    - Render `<AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>` with copy: title "Nonaktifkan komponen ini?", description "Bisa diaktifkan kembali kapan saja.", Cancel = "Batal", Action = "Ya, Nonaktifkan" → `toggleEnabled(confirmTarget); setConfirmTarget(null);`.
    - Add `AlertDialog` import from `@/components/ui/alert-dialog`.
  - Acceptance: toggling Aktif → Tidak Aktif via the row action now opens an AlertDialog. Confirm fires `toggleEnabled`. Cancel closes without state change. Toggling Tidak Aktif → Aktif still single-click. `npx vitest run` + `npm run build` pass.

## Implementation

- Subagent plan: 4 tasks touch disjoint files (T1 teacher, T2 components/attendance, T3 admin payroll, T4 admin settings). Independent in code but cycle-doc edit + commit pipeline serializes the loop. Executing inline sequentially with per-task gate + code-reviewer.
- Base: branch was 69 commits behind `origin/staging` (claude-harness worktree started before recent merges). Zero commits ahead → `git reset --hard origin/staging` to sync; cycle/review docs preserved as untracked.
- Task 1: Remove raw error.message from teacher error boundary — `app/teacher/error.tsx` — replaced `{error.message || "…"}` interpolation with the fixed Indonesian fallback only. `error` prop kept on the signature (Next.js error boundary contract); TS unused-params not enabled. Cross-checked design-system.html §Status/Empty states for layout — no other visual change.
- Task 2: Dedupe attendance calendar status maps — `components/attendance/calendar.tsx` — deleted local `STATUS_COLORS` + `STATUS_TEXT_COLORS`. New `STATUS_CELL_BG` retains only the calendar-specific solid-bg lookup (no label field). Labels in legend + summary now resolve via `getStatusConfig()` from `status-badge.tsx`. Modal status row swapped to `<StatusBadge variant="intent">`. "Tidak Hadir" → "Alpa" canonical drift fix can no longer regress here.
- Task 3: Payroll Approve + Send Slips → AlertDialog — `app/admin/(hr)/payroll/[id]/page.tsx` — two irreversible confirmations migrated from `<Dialog>` to `<AlertDialog>` per ui.md Overlays Rule. `AlertDialogAction` carries the `disabled={approving|sending}` pending state (Button prop spread); `AlertDialogCancel` uses default outline variant. The 3 non-destructive Dialogs in the file (vars-modal, line-adj, edit) stay as `<Dialog>` (intentional — they edit reversible data). Dialog imports retained for the remaining consumers.
- Task 4: Salary-components deactivate guard — `app/admin/(hr)/salary-components/page.tsx` (note: review report cited `app/admin/settings/salary-components/` — file was moved by a recent merge before this cycle; same code shape, no spec change needed). Added `confirmTarget` state + `<AlertDialog>` with destructive `<AlertDialogAction variant="destructive">`. `onDeactivate` now sets state instead of firing the toggle directly; `onActivate` stays single-click. Copy: "Nonaktifkan komponen ini?" + body interpolating component label + reassurance "Bisa diaktifkan kembali kapan saja"; confirm label "Ya, Nonaktifkan" per ui.md table.

## Verification

- Task 1 gate: `npm run build` ✓, `npx vitest run` ✓ (175 files, 1663 passed, 2 skipped, 42 todo, 167s). `feature-dev:code-reviewer` clean.
- Task 2 gate: `npm run build` ✓, `npx vitest run` ✓ (175 files, 1663 passed, 2 skipped, 42 todo, 130s). `feature-dev:code-reviewer` clean.
- Task 3 gate: `npm run build` ✓, `npx vitest run` ✓ (175 files, 1663 passed, 2 skipped, 42 todo, 64s). `feature-dev:code-reviewer` clean.
- Task 4 gate: `npm run build` ✓, `npx vitest run` ✓ (175 files, 1663 passed, 2 skipped, 42 todo, 60s). `feature-dev:code-reviewer` clean.
- End-of-cycle: `DEMO_MODE=true npx playwright test` ✓ (26 passed, 10 skipped, 3 did not run, exit 0, 42m).
- End-of-cycle reviewer pass: `feature-dev:code-reviewer` on full branch diff flagged one IMPORTANT (confidence 88) bug — `toggleEnabled` in salary-components silently swallowed API failures (pre-existing pattern, but T4's AlertDialog confirm implies reliability). Fix added `res.ok` guard + success/error toasts mirroring sibling `handleSave`. Re-review clean. Gate `npm run build` ✓ + `npx vitest run` ✓ (175 files, 1663 passed, 36s).
- Cross-checked design-system.html §Status / §Empty / §Confirm overlay sections for visual side-effects across cycle tasks.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Risk:** Low. Four single-file UI fixes — no API, no schema, no auth. Each commit is independently revertable.
- **Manual smoke (preview URL):**
  1. Teacher portal — force an error (e.g. visit `/teacher` with a broken downstream); confirm error boundary shows only "Halaman tidak bisa dimuat. Coba lagi sebentar ya." with no Prisma/stack trace leak.
  2. Teacher self-attendance calendar (`/teacher/attendance`) — confirm legend, summary card, and the day-detail modal all show "Alpa" (not "Tidak Hadir") for ABSENT records.
  3. Admin payroll detail (`/admin/payroll/[id]` on a DRAFT run) — click "Setujui" and "Kirim Slip"; both surface AlertDialog (not Dialog). Cancel + confirm work as expected.
  4. Admin salary-components (`/admin/salary-components`) — toggle a component Off → confirm AlertDialog with "Ya, Nonaktifkan" surfaces; toggle On stays single-click.
- **Rollback:** `git revert` any of the 4 task commits individually.
- **Note for shipper:** `/spec` referenced the salary-components file at `app/admin/settings/salary-components/` (path in 2026-05-18 review report). After base reset to `origin/staging` the file was at `app/admin/(hr)/salary-components/` (recent merge moved it). Implementation tracked the new path; cycle Implementation bullet documents the discrepancy.
