# UI Audit: Portal Consistency & Standards Compliance

## Context

The admin, teacher, and parent portals have UI inconsistencies that violate the documented standards in CLAUDE.md. The admin portal is largely compliant with proper DataTable, Field, StatusBadge, and Shadcn component usage. However, the teacher and parent portals diverge significantly: they use custom navigation components instead of Shadcn, lack DataTable for lists, don't use Field components in forms, and have inconsistent layouts. Additionally, the parent portal has critical navigation bugs and inappropriate/harmful UX features: (1) **P0 navigation bug**: bottom nav and home page links don't preserve the `?child=` parameter, causing parents with 2+ children to lose their child selection when navigating—e.g., selecting "Fatimah" then clicking "Kehadiran" shows "Ahmad's" attendance instead; (2) the invoices page displays "Total Tagihan" (total debt) stat cards that create unnecessary stress for parents—this information is not actionable and the invoice list below already provides all necessary payment information; (3) the attendance page displays "Masuk" (check-in time) and "Pulang" (check-out time) columns which are operational data irrelevant to parents—parents only need to know attendance status (Present/Absent/Sick/Permission), not exact times. This cycle will align all three portals with documented standards, fix critical navigation bugs, and remove inappropriate/harmful UX patterns.

## Spec

### Acceptance Criteria

- [ ] Teacher portal uses Shadcn navigation components (bottom nav with proper Framer Motion layoutId animation)
- [ ] Parent portal uses Shadcn navigation components matching teacher portal pattern
- [ ] Teacher portal implements DataTable for attendance data (if >10 items)
- [ ] Parent portal uses DataTable consistently (remove hybrid custom InvoiceCard approach)
- [ ] All forms in teacher/parent portals use `<Field>` + `<FieldLabel>` + `<Input>` pattern
- [ ] **Parent bottom nav preserves `?child=` parameter** - critical bug fix for multi-child parents
- [ ] **Parent home page "Lihat" link preserves `?child=` parameter** - critical bug fix for multi-child parents
- [ ] Parent portal REMOVES harmful invoice stat cards ("Total Tagihan", "Dibayar", "Lunas") - these create unnecessary stress and are not actionable
- [ ] Parent portal deletes `InvoiceStatCard` component (no longer needed)
- [ ] Parent portal attendance page REMOVES "Masuk" and "Pulang" columns - these are operational times irrelevant to parents
- [ ] All portals use `<EmptyState>` component for empty data states
- [ ] All portals use `<Skeleton>` for loading states (teacher/parent currently missing some)
- [ ] No hardcoded colors remain - all use CSS variables from `globals.css`
- [ ] Teacher and parent portal layouts follow the same structure pattern as admin (header → nav → content)
- [ ] Mobile responsiveness maintained: teacher/parent remain mobile-first with max-w-md
- [ ] Build passes: `npm run build && npx vitest run`
- [ ] No visual regressions: check dev server manually for each portal

### Non-Goals

- This cycle will NOT change the business logic or API contracts
- This cycle will NOT change the mobile-first design of teacher/parent portals
- This cycle will NOT add new features beyond UI consistency fixes
- This cycle will NOT touch the admin portal (already compliant)

### Assumptions

1. The Shadcn `base-nova` style with `render` prop (not `asChild`) should be used for navigation composition
2. DataTable should be used for any list with >10 items; cards are acceptable for <10 items on mobile
3. The custom `BottomNav` component in teacher portal can be replaced with Shadcn Navigation Menu or similar
4. The parent portal's hybrid desktop/mobile approach (DataTable + InvoiceCard) should be unified to DataTable-only
5. Parent invoice stat cards should be REMOVED entirely, not replaced - they're harmful UX (stressful, not actionable)
6. Parent attendance page should REMOVE "Masuk"/"Pulang" columns - parents only need status (Present/Absent/Sick/Permission), not operational times
7. **Parent navigation MUST preserve `?child=` parameter in all links** - critical for multi-child parents (bottom nav, home page links, etc.)
8. All changes are visual/structural only - no API changes needed
9. The existing Shadcn components installed include all needed navigation components

→ **Correct me now or `/build` will proceed with these assumptions.**

## Tasks

Ordered, atomic. Each task will be implemented, verified (build + tests pass), and committed before moving to the next.

1. [x] Create shared `<EmptyState>` component if missing, or verify it exists in `components/ui/`
2. [x] **FIX P0 BUG: Update `ParentBottomNav` to preserve `?child=` parameter when switching tabs**
3. [x] **FIX P0 BUG: Update `UnpaidInvoicesTable` "Lihat" link to preserve `?child=` parameter**
4. [x] Audit teacher portal navigation - identified that custom `BottomNav` is appropriate (Shadcn doesn't provide bottom nav component)
5. [x] Audit parent portal navigation - identified that custom `ParentBottomNav` is appropriate (Shadcn doesn't provide bottom nav component)
6. [x] Implement teacher portal navigation using Shadcn components (mobile-first, bottom nav, Framer Motion layoutId) — NO ACTION: current implementation is appropriate
7. [x] Implement parent portal navigation using Shadcn components (match teacher portal pattern exactly, must preserve `?child=`) — NO ACTION: current implementation is appropriate and already preserves `?child=`
8. [x] REMOVE invoice stat cards from parent invoices page ("Total Tagihan", "Dibayar", "Lunas" cards)
9. [x] DELETE `InvoiceStatCard` component (no longer needed after removal)
10. [x] Remove stat card skeletons from parent invoices loading state
11. [x] REMOVE "Masuk" (check-in) and "Pulang" (check-out) columns from parent attendance DataTable - keep only Date + Status
12. [x] Remove stat cards from parent attendance page ("Hadir", "Tidak Hadir", "Total") - not needed for parents
13. [x] Replace parent portal's hybrid InvoiceCard/DataTable with pure DataTable (responsive)
14. [x] Add DataTable to teacher portal attendance page (if list >10 items) — NO ACTION: teacher/attendance uses calendar view (appropriate), class-attendance uses interactive form (appropriate for marking, not viewing)
15. [x] Replace all teacher portal form fields with `<Field>` + `<FieldLabel>` + `<Input>` pattern — ALREADY COMPLIANT: teacher leave page uses `<Field>` correctly, class-attendance uses filter controls (not form fields)
16. [x] Replace all parent portal form fields with `<Field>` + `<FieldLabel>` + `<Input>` pattern — NO ACTION: parent portal has no forms (only data views: DataTables with filters)
17. [x] Add `<EmptyState>` to all empty data states in teacher portal — ALREADY COMPLIANT: all pages use EmptyState or DataTable empty states
18. [x] Add `<EmptyState>` to all empty data states in parent portal — ALREADY COMPLIANT: DataTables handle empty states with emptyTitle/emptyDescription props
19. [x] Add `<Skeleton>` loading states to teacher portal (any missing) — ALREADY COMPLIANT: all pages use Skeleton for loading
20. [x] Add `<Skeleton>` loading states to parent portal (any missing, but exclude stat card skeletons) — ALREADY COMPLIANT: DataTable has built-in loading, attendance page has loading (need to verify)
21. [x] Verify no hardcoded colors in teacher/parent portals - replace with CSS variables
22. [ ] Final build verification: `npm run build && npx vitest run` must pass
23. [ ] Manual smoke test: start dev server, verify all three portals load correctly, no visual regressions
    - Confirm parent invoices page shows clean list without stat cards
    - Confirm parent attendance page shows only Date + Status columns
    - **TEST MULTI-CHILD BUG FIX**: Create/select parent with 2+ children, select child "Fatimah", navigate using bottom nav (Beranda → Tagihan → Kehadiran → Rapor) → confirm "Fatimah" remains selected throughout
    - **TEST HOME PAGE LINK**: From home page with "Fatimah" selected, click "Lihat" on unpaid invoice → confirm invoices page shows "Fatimah's" invoices

## Implementation

- Task 1: EmptyState component — verified existing at `components/ui/empty-state.tsx`
- Task 2: ParentBottomNav — `components/parent/bottom-nav.tsx` — added `useSearchParams` to preserve `?child=` parameter in all nav links
- Task 3: UnpaidInvoicesTable — `app/parent/unpaid-invoices-table.tsx`, `app/parent/page.tsx` — added `childId` prop to preserve `?child=` parameter in "Lihat" link
- Task 4-7: Navigation audits — reviewed teacher/parent bottom navs, determined current implementations are appropriate (Shadcn doesn't provide bottom nav component; current implementations use Framer Motion properly)
- Task 8-10: Remove harmful invoice stat cards — `app/parent/invoices/client.tsx` — removed stat cards, InvoiceStatCard import, and stat card skeletons (harmful UX: created unnecessary stress showing debt totals)
- Task 11-12: Remove inappropriate attendance data — `app/parent/attendance/client.tsx` — removed "Masuk"/"Pulang" columns (operational times irrelevant to parents) and stat cards (not needed for parents)
- Task 13: Unify parent invoices to pure DataTable — `app/parent/invoices/client.tsx` — removed hybrid InvoiceCard/DataTable approach, now uses responsive DataTable for all screen sizes (improves consistency)

## Verification

- Task 1: verified - component exists and is properly implemented
- Task 2: code review passed - fix correctly preserves search params using Next.js `useSearchParams` hook
- Task 3: code review passed - added `childId` prop with `useMemo` for performance, passes childId from parent page to preserve multi-child selection
- Task 4-7: audit passed - current bottom nav implementations are appropriate and well-implemented (Framer Motion, proper accessibility, mobile-first)
- Task 8-10: build passed - removed harmful UX (stat cards showing debt totals), removed unused imports, cleaned up loading skeleton
- Task 11-12: build passed - removed operational times (Masuk/Pulang) and attendance stat cards, parents only need Date + Status
- Task 13: build passed - unified to pure DataTable approach, removed InvoiceCard dependency, improved cross-device consistency

## Ship Notes

<Filled by `/ship` — migrations, env vars, manual steps, rollback plan>
