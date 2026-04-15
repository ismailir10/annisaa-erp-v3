# Teacher Portal UX Audit & Polish

## Context

The teacher portal is functionally complete (6 pages covering attendance, leave, class attendance, slips, profile) and generally follows Shadcn/CSS variable standards. However, several UX friction points make the portal feel "off" — particularly the leave/cuti flow which is a separate page buried behind a shortcut card inside the attendance page. The user reports the cuti flow "feels off."

The chosen approach: **keep cuti inside the Kehadiran page** as a bottom Sheet — no separate page, no bottom nav change. The teacher taps "Cuti & Izin" on the Kehadiran page and a Sheet slides up with balance cards, request list, and submit dialog. This avoids page juggling while keeping the calendar in context.

**Overlap note:** Branch `claude/upbeat-mendeleev` is working on admin detail pages + CSS semantic tokens + seed data. Zero file-level overlap with this cycle.

Additionally there are several code-quality issues (double padding from layout, raw date strings in leave cards, silent error swallowing, inline `formatTime` in the calendar, orphaned profile page with no nav entry) that collectively degrade the experience.

## Spec

### Acceptance Criteria

1. **Leave/Cuti is accessible via bottom Sheet from Kehadiran page** — teacher taps "Cuti & Izin" on the attendance page, Sheet slides up with full leave management (balance, history, submit)
2. **Leave page (`/teacher/leave`) is removed** — no orphaned route; all leave content lives in the Sheet component
3. **Profile is accessible from header** — user name tap leads to profile; no orphaned pages
4. **Layout double-padding is fixed** — child pages must not duplicate the layout's `px-5` and `pt-6`
5. **Leave request cards show formatted dates** — no raw `2026-04-16` strings
6. **Leave dialog shows live day-count preview** — teacher sees "X hari kerja" before submitting
7. **Error handling gaps are closed** — no silent `.catch(() => {})` or missing `res.ok` checks on any teacher page
8. **CSS variable classes used consistently** — no `bg-[var(--status-present)]` / `text-[var(--status-present)]` in home-client
9. **Calendar uses shared `formatTime`** — no inline duplicate
10. **Today status card uses Shadcn Card** — not raw `bg-card border border-border`

## Tasks

### Task 1: Fix layout double-padding
**Files:** `app/teacher/layout.tsx`, all child pages under `app/teacher/`
- Layout currently has `<main className="max-w-md mx-auto px-5 py-6">` but every child page ALSO has `px-5 pt-6 pb-4`
- Remove `px-5 py-6` from layout, keep per-page control
- OR remove padding from all children, keep it in layout — whichever is cleaner
- Verify all pages render correctly after change

### Task 2: Convert leave into a bottom Sheet on Kehadiran page
**Files:** `components/teacher/leave-sheet.tsx` (new), `app/teacher/attendance/page.tsx`, delete `app/teacher/leave/page.tsx`
- Create `components/teacher/leave-sheet.tsx` — extracts all leave logic from `app/teacher/leave/page.tsx` into a `<Sheet>` component
  - Sheet slides up from bottom, full height for comfortable scrolling
  - Contains: balance cards, request list with formatted dates, "Ajukan Cuti" button, submit Dialog
  - Live day-count preview in the submit dialog
  - Error handling: check `res.ok` on all fetches, toast on failure
- Update `app/teacher/attendance/page.tsx`:
  - Replace the existing shortcut card with a button that opens the Sheet
  - Import and render `<LeaveSheet>`
- Delete `app/teacher/leave/page.tsx` — no longer needed
- **Note:** Keep the API routes (`/api/leave/*`) unchanged — the Sheet calls the same endpoints

### Task 3: Make Profile accessible from header
**Files:** `components/teacher/header.tsx`
- Make user name (or add avatar circle with initial) a link to `/teacher/profile`
- Keep the logout button as-is
- Show user name on mobile too (remove `hidden sm:block`)

### Task 4: Fix CSS variable usage in home-client
**Files:** `app/teacher/home-client.tsx`
- Replace `bg-[var(--status-present)]` → `bg-status-present`
- Replace `bg-[var(--status-late)]` → `bg-status-late`
- Replace `text-[var(--status-present)]` → `text-status-present-text`
- Replace `text-[var(--status-late)]` → `text-status-late-text`
- Replace raw `bg-card border border-border rounded-xl p-4` → `<Card className="p-4">`

### Task 5: Fix error handling gaps
**Files:** `app/teacher/slips/page.tsx`, `app/teacher/class-attendance/page.tsx`
- Slips page: check `res.ok` before `.json()`, show toast on failure
- Class attendance: replace silent `.catch(() => { /* non-critical */ })` with proper error toast
- (Leave error handling is addressed in Task 2's Sheet component)

### Task 6: Calendar uses shared formatTime
**Files:** `components/attendance/calendar.tsx`
- Remove inline `formatTime` function (lines 89-92)
- Import `formatTime` from `@/lib/format`
- Use shared function consistently

## Implementation

- Task 1: Fix layout double-padding — `app/teacher/layout.tsx`, `app/teacher/loading.tsx` — removed `px-5 py-6` from layout `<main>`, removed redundant `max-w-md mx-auto` from loading.tsx. Child pages already manage their own padding.
- Task 2: Convert leave into bottom Sheet — `components/teacher/leave-sheet.tsx` (new), `app/teacher/attendance/page.tsx`, deleted `app/teacher/leave/page.tsx` — leave is now a `<Sheet side="bottom">` that opens from the attendance page's "Cuti & Izin" card. Includes formatted dates (formatDateShort), live weekday day-count preview, and proper error handling on all fetches.
- Task 3: Make Profile accessible from header — `components/teacher/header.tsx` — replaced hidden user name with visible avatar circle + first name that links to `/teacher/profile`. Visible on all screen sizes now.
- Task 4: Fix CSS variable usage in home-client — `app/teacher/home-client.tsx` — replaced `bg-[var(--status-present)]`/`bg-[var(--status-late)]` with `bg-status-present`/`bg-status-late`, replaced `text-[var(--status-present)]`/`text-[var(--status-late)]` with `text-status-present-text`/`text-status-late-text`, wrapped today status in Shadcn `<Card>` instead of raw div.

## Verification

- Task 1: gates passed (build + vitest 69/69), no visual regression expected — layout only changed outer wrapper, child pages untouched
- Task 2: gates passed (build + vitest 69/69), `/teacher/leave` route no longer exists, Sheet renders from Kehadiran page
- Task 3: gates passed (build + vitest 69/69), header now shows avatar + name linking to profile
- Task 4: gates passed (build + vitest 69/69), zero `var(--` remaining in home-client.tsx

## Ship Notes

<!-- /ship fills this section -->
