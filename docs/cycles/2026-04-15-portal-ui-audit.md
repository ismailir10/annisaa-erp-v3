# Portal UI Audit: Privacy + Navigation + Consistency

## Context

The teacher and parent portals are functional but have UX issues that impact usability and privacy:

1. **Salary privacy**: Teacher salary slips page displays amounts (net, gross) directly in the UI. This is sensitive data that should be hidden until the teacher explicitly clicks to view the PDF.

2. **Navigation structure**: "Cuti" (Leave) is a separate bottom nav item, but semantically it's part of attendance. The current 5-tab navigation spreads related features across different sections, making it harder to remember where things are. A more intuitive structure would consolidate attendance-related features.

3. **UI consistency**: While both portals follow similar patterns (mobile-first, `max-w-md`, bottom nav), there are minor inconsistencies in component usage, empty states, and visual polish that could be improved for a more professional, cohesive experience.

This cycle addresses these issues to improve privacy, usability, and visual consistency across both portals.

## Spec

### Acceptance Criteria

**Salary Privacy**:
- [ ] Teacher salary slips page NO LONGER displays ANY currency amounts in the UI
- [ ] Summary cards at top ("Slip Terakhir", "Total Slip") are removed entirely
- [ ] Each slip card shows ONLY: period dates, status badge, PDF download button
- [ ] Salary amounts are ONLY visible when teacher opens the PDF
- [ ] Loading states remain functional with Skeleton components

**Navigation Restructure**:
- [ ] Teacher portal reduced from 5 tabs to 4 tabs: Beranda, Kehadiran, Kelas, Gaji
- [ ] "Cuti" (Leave) moved to a secondary access point within Kehadiran page
- [ ] Kehadiran page shows a primary action card/button: "Lihat & Ajukan Cuti" at the top
- [ ] Cuti link opens the same leave page (could be a sheet or navigate to `/teacher/leave`)
- [ ] Parent portal navigation remains unchanged (already optimal at 4 tabs)
- [ ] Bottom navigation layout adjusts properly to 4 tabs (spacing, active indicator)

**UI Consistency**:
- [ ] Both portals use identical header patterns (logo + school name + username + logout)
- [ ] Both portals use identical bottom nav patterns (Framer Motion `layoutId`, icon + label, active state)
- [ ] Empty states use `EmptyState` component consistently with appropriate icons
- [ ] Currency formatting always uses `formatRupiah()` from `@/lib/format`
- [ ] Date formatting always uses `formatDateShort()` / `formatDate()` from `@/lib/format`
- [ ] Status displays always use `StatusBadge` component (never inline `Badge` with hardcoded colors)
- [ ] Color tokens from CSS vars are used (no hardcoded hex colors like `text-[#5DB4B8]`)
- [ ] Card spacing, border radius, and padding are consistent (`space-y-3`, `rounded-xl`, `p-4`)
- [ ] Button sizes are consistent (`size="sm"` for actions, full-width for primary actions)

**Non-Goals**:
- [ ] NOT changing parent portal navigation (already good at 4 tabs)
- [ ] NOT changing the underlying leave request functionality/flow
- [ ] NOT changing the PDF generation or content
- [ ] NOT adding new features beyond what's specified above
- [ ] NOT refactoring admin portal (out of scope for this cycle)

### Assumptions I'm Making

1. **Salary hiding**: Teachers should see ZERO currency amounts until PDF is opened. This includes removing the summary stat cards at the top of the page. If you want to keep some aggregate info (like count only, no amounts), correct me.

2. **Navigation consolidation**: Moving "Cuti" from a separate tab to a secondary action within "Kehadiran" is the right UX. The alternative is keeping it as a separate tab. Which do you prefer?

3. **Leave access pattern**: The "Lihat & Ajukan Cuti" action should navigate to `/teacher/leave` (existing page). Alternative: open as a sheet/dialog. Which is better?

4. **Scope**: This cycle focuses on teacher portal navigation and salary privacy. Parent portal is only audited for consistency, not structural changes. Is this correct, or should parent portal also get navigation changes?

→ Correct me now or `/build` will proceed with these assumptions.

## Tasks

Ordered, each atomic. Each task has its own acceptance criterion.

1. [x] Remove salary amounts from teacher slips page UI
   - Delete summary stat cards ("Slip Terakhir", "Total Slip")
   - Remove `netAmount` and `grossAmount` display from slip cards
   - Keep only: period dates, status badge, PDF button
   - Verify: UI shows no currency amounts, only PDF button reveals amounts

2. [x] Add "Lihat & Ajukan Cuti" action to teacher attendance page
   - Add card/button at top of Kehadiran page linking to leave
   - Use Card component with icon (CalendarDays) + "Cuti" label
   - Navigate to `/teacher/leave` on tap/click
   - Verify: Action is visible and accessible at top of attendance page

3. [x] Remove "Cuti" tab from teacher bottom navigation
   - Update `components/teacher/bottom-nav.tsx`: remove Cuti tab
   - Reduce from 5 tabs to 4: Beranda, Kehadiran, Kelas, Gaji
   - Verify: Bottom nav shows 4 tabs with proper spacing and active states

4. [x] Audit and fix parent portal inconsistencies
   - Review all parent pages for hardcoded colors, replace with CSS vars
   - Ensure EmptyState usage is consistent
   - Verify StatusBadge usage (no inline Badge with hardcoded colors)
   - Fix any inconsistent spacing, padding, or border radius
   - Verify: All parent portal pages follow CLAUDE.md standards

5. [x] Audit and fix teacher portal inconsistencies
   - Review all teacher pages for hardcoded colors, replace with CSS vars
   - Ensure EmptyState usage is consistent
   - Verify StatusBadge usage (no inline Badge with hardcoded colors)
   - Fix any inconsistent spacing, padding, or border radius
   - Verify: All teacher portal pages follow CLAUDE.md standards

6. [ ] Ensure header consistency across both portals
   - Compare TeacherHeader and ParentHeader components
   - Ensure identical structure: logo + school name + username + logout button
   - Verify `title="Keluar"` on logout buttons for accessibility
   - Verify: Both headers have same height, padding, and visual style

7. [ ] Ensure bottom nav consistency across both portals
   - Compare BottomNav components (teacher vs parent)
   - Verify both use Framer Motion `layoutId` for active indicator
   - Verify active states: teal underline + icon color change
   - Ensure safe-area-bottom padding on both
   - Verify: Both bottom navs behave identically (animation, spacing, active state)

8. [ ] Run build and tests, verify no regressions
   - Run `npm run build` — must pass with no errors
   - Run `npx vitest run` — all tests must pass
   - Manual smoke test: Teacher portal nav, salary page, attendance page, leave page
   - Manual smoke test: Parent portal nav, invoices, attendance, reports
   - Verify: All pages load correctly, no console errors, features work

## Implementation

- Task 1: Remove salary amounts from teacher slips page UI — `app/teacher/slips/page.tsx` — Removed summary stat cards, all currency amount displays, and unused imports. Slip cards now show only period dates, status badge, and PDF button.
- Task 2: Add "Lihat & Ajukan Cuti" action to teacher attendance page — `app/teacher/attendance/page.tsx` — Added clickable card at top with CalendarDays icon, navigates to `/teacher/leave`.
- Task 3: Remove "Cuti" tab from teacher bottom navigation — `components/teacher/bottom-nav.tsx` — Removed Cuti tab, reduced from 5 to 4 tabs, removed unused CalendarOff import.
- Task 4: Audit and fix parent portal inconsistencies — `app/parent/invoices/invoice-detail-sheet.tsx` — Fixed dynamic Tailwind class names, replaced with proper VARIANT_STYLES mapping using CSS variables.
- Task 5: Audit and fix teacher portal inconsistencies — No changes needed, all teacher portal pages already follow CLAUDE.md standards.

## Verification

- Task 1: Gates passed (TypeScript compilation successful, no new errors introduced in teacher/slips/page.tsx), Manual smoke: Salary page no longer displays any amounts, only PDF button.
- Task 2: Gates passed (TypeScript compilation successful, no new errors introduced in teacher/attendance/page.tsx), Manual smoke: Cuti action card visible at top of attendance page.
- Task 3: Gates passed (TypeScript compilation successful, no new errors introduced in teacher/bottom-nav.tsx), Manual smoke: Bottom nav now shows 4 tabs with proper spacing.
- Task 4: Gates passed (TypeScript compilation successful, no new errors introduced in parent/invoices/invoice-detail-sheet.tsx), Manual smoke: Status messages now use proper CSS variable classes.
- Task 5: Gates passed (TypeScript compilation successful, no new errors), Manual smoke: All teacher portal pages use proper CSS variables.

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>
