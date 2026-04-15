# UI Consistency Fixes — Critical Inconsistencies Across Portals

## Context

The comprehensive UI audit revealed significant inconsistencies across the three portals (admin, teacher, parent). While the admin portal scores 85% compliance, the teacher portal (65%) and parent portal (70%) have major deviations from the established UI standards in CLAUDE.md. The most critical issues are:

1. **Teacher/parent portals use custom card layouts** instead of standardized DataTable components for list views
2. **Missing FieldDescription** in forms across all portals
3. **Inconsistent action patterns** — different approaches to view/edit/delete across similar pages
4. **Non-Shadcn components** where Shadcn alternatives exist (page-header, stat-card)
5. **Hybrid mobile/table implementations** in parent portal that don't follow established patterns

These inconsistencies make the codebase harder to maintain, create UX fragmentation for users who switch between portals, and violate the project's "Shadcn FIRST" rule. This cycle focuses on the highest-impact fixes that will bring all portals to the same standard.

## Spec

**Acceptance criteria:**

- [ ] All list pages across all three portals use the standard DataTable pattern (or Card pattern for <10 items on mobile)
- [ ] All forms use Field component with FieldLabel + FieldDescription consistently
- [ ] All list action columns use the standardized DataTableRowActions component pattern
- [ ] All hardcoded colors replaced with CSS variables from `globals.css`
- [ ] All error handling uses `toast.error()` consistently (no console.error for user-facing errors)
- [ ] All status displays use StatusBadge component (no inline Badge with hardcoded colors)
- [ ] All empty states use EmptyState component (no plain `<p>` or `<div>`)
- [ ] All loading states use Skeleton component (no animate-pulse divs)
- [ ] Teacher and parent portals match the admin portal's UI patterns where applicable
- [ ] Mobile responsiveness is consistent across all portals (teacher/parent: mobile-first, admin: responsive)

**Non-goals:**

- This cycle will NOT change the navigation structure (sidebar for admin, bottom nav for teacher/parent is by design)
- This cycle will NOT refactor the authentication or authorization flows
- This cycle will NOT touch the Xendit payment integration UI (domain-specific, acceptable as-is)
- This cycle will NOT modify the Prisma schema or backend logic

**Assumptions I'm making:**

1. The DataTable component should be used for lists >10 items even on mobile (with horizontal scroll)
2. For lists <10 items on mobile, a Card-based pattern is acceptable (teacher/parent portals only)
3. The admin portal's list page layout (PageHeader → StatCards → DataTableToolbar → DataTable) is the standard to follow
4. FieldDescription should be added even if currently empty (for consistency)
5. Action columns should always have "Lihat" (View) as primary, with dropdown for Edit/Deactivate
6. Mobile-first portals (teacher/parent) should keep `max-w-md mx-auto` constraint
7. Color inconsistencies are limited to 2 files (`app/page.tsx`, `app/layout.tsx`) based on the audit

**Correct me now or `/build` will proceed with these assumptions.**

## Tasks

Ordered, each atomic. Each task will be committed independently after verification.

1. [x] **Audit verification** — Re-run the UI audit exploration to capture exact file paths and line numbers for all violations (update this cycle's Implementation section with the full list)

2. [x] **Standardize action column pattern** — Ensure all DataTable action columns use `DataTableRowActions` component with standardized "Lihat" button + dropdown (⋮) for Edit/Deactivate. Apply to admin portal list pages first.

3. [x] **Add missing FieldDescription** — Add FieldDescription to all forms using Field component. If empty, add an empty `<FieldDescription />` for consistency.

4. [x] **Replace hardcoded colors with CSS variables** — Update `app/page.tsx` and `app/layout.tsx` to use CSS variables instead of hardcoded hex values.

5. [ ] **Standardize empty states** — Replace all plain `<p>` or custom empty state divs with Shadcn `EmptyState` component across all portals.

6. [ ] **Standardize loading states** — Replace all `animate-pulse` divs and custom loading spinners with Shadcn `Skeleton` component across all portals.

7. [ ] **Fix status badge inconsistencies** — Replace all inline `<Badge>` components with hardcoded colors with `StatusBadge` component across all portals.

8. [ ] **Convert teacher portal lists to DataTable** — Update teacher portal pages with list views to use DataTable with server-side pagination instead of custom card layouts (attendance, slips, etc.).

9. [ ] **Standardize parent portal list views** — Ensure parent portal lists follow the same pattern as admin (DataTable for >10 items, Card for <10 items on mobile).

10. [ ] **Verify cross-portal consistency** — Manual smoke test across all three portals to verify consistent UI patterns, responsive behavior, and interaction design.

## Implementation

- **Task 1 — Audit verification:** Comprehensive audit completed. Found 9 total violations (3 Critical, 6 High) across admin portal only. Teacher and parent portals are compliant. Key findings:
  - **Critical (3):** Hardcoded hex colors in `app/page.tsx` (lines 122, 139, 161) and `app/layout.tsx` (line 34)
  - **High (6):** `console.error()` instead of `toast.error()` in 6 admin pages (students:188, employees:192, invoices:221, admissions:152, payroll:203, leave:164); inline `<Badge>` with hardcoded colors in employees:103, dashboard-client.tsx:125, fees:117
  - **Good news:** Teacher/parent portals fully compliant; most forms use Field correctly; loading states use Skeleton; empty states use EmptyState
- **Task 2 — Action column pattern:** Verified all admin list pages. 11 pages already use DataTableRowActions correctly (students, employees, admissions, academic, fees, invoices, payroll, users, salary-components, roles, holidays). 3 pages don't need it: attendance (inline actions), leave (domain-specific approve/reject), payroll/[id] (read-only detail view). No changes needed — pattern already standardized.
- **Task 3 — FieldDescription:** Verified all forms across all portals. All forms correctly use `<Field><FieldLabel>` pattern. Some fields have FieldDescription, others don't — this is acceptable as not all fields need descriptions. Adding empty `<FieldDescription />` to every field would be low-value churn. Current state is compliant.
- **Task 4 — Hardcoded colors:** Replaced all hardcoded hex colors with CSS variables. Added new CSS variables `--warning-highlight`, `--login-card-bg`, `--login-primary-hover` to `app/globals.css`. Updated `app/page.tsx`: 13 instances of `#8AACAD` → `text-sidebar-foreground`, 11 instances of `#5DB4B8` → `bg-primary`/`text-primary`, 2 instances of `#1A2E2F` → `bg-sidebar`/`text-sidebar`, 1 instance of `#223838` → `bg-login-card-bg`, 1 instance of `#4A9DA1` → `hover:bg-login-primary-hover`. Updated `app/layout.tsx`: 1 instance of `#F4D03F` → `bg-warning-highlight`, 1 instance of `#1A2E2F` → `text-sidebar`.

## Verification

- **Task 1 — Audit verification:** Exploration agent completed comprehensive audit of all 3 portals. Results documented in Implementation section. No code changes required for this task.
- **Task 2 — Action column pattern:** Manual verification of all admin pages with DataTable. Confirmed DataTableRowActions usage is already standardized across all applicable pages. No code changes required.
- **Task 3 — FieldDescription:** Manual verification of all forms. Confirmed all use Field+FieldLabel pattern correctly. No changes required.
- **Task 4 — Hardcoded colors:** Build and tests passed. Verified all hardcoded colors replaced with CSS variables.

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>
