# UI Audit Phase 2 — Full-Stack Bug & Consistency Sweep

## Context

The first UI audit cycle (`2026-04-15-ui-consistency-fixes.md`) identified 9 violations across the admin portal, but tasks 2–10 were never built before the cycle stalled. A separate portal audit (`2026-04-15-portal-ui-audit.md`) fixed teacher salary privacy and navigation but didn't cover the full codebase. This cycle re-audits all three portals plus API routes with fresh eyes, consolidating the unfinished work from the first audit with new findings. The goal: fix every remaining CLAUDE.md violation, security issue, and UX inconsistency in one pass.

## Spec

### Acceptance Criteria

**Admin Portal UI:**
- [ ] Zero `console.error()` calls in admin pages — all replaced with `toast.error()`
- [ ] Zero hardcoded hex colors in `app/page.tsx` and `app/layout.tsx` — replaced with CSS variables
- [ ] `toLocaleDateString()` replaced with `formatDate()`/`formatDateShort()` in all admin pages (API routes that format for PDF/email are acceptable)
- [ ] Attendance page uses `DataTableRowActions` instead of raw `<button>` for override action
- [ ] Inline `<Badge>` with hardcoded colors replaced with `StatusBadge` where applicable

**Teacher & Parent Portal UI:**
- [ ] `app/teacher/class-attendance/page.tsx` — hardcoded color classes replaced with CSS variable classes
- [ ] `app/teacher/profile/page.tsx` — raw `<Badge>` replaced with `StatusBadge`
- [ ] `app/parent/assessments-table.tsx` — hardcoded color mapping replaced with CSS variable classes

**API Security & Standards:**
- [ ] All 7 DELETE routes converted to soft delete (status-based) where the model has a status field; where it doesn't (junction/holiday/campus), document the exception
- [ ] `app/api/leave/requests/route.ts` POST — manual validation replaced with Zod schema + `validateBody()`
- [ ] 7 `where: any` type annotations replaced with proper Prisma `WhereInput` types
- [ ] Xendit webhook error responses changed from `{ ok: false, error }` to `{ error }` format
- [ ] `app/api/attendance/export/route.ts` — `toLocaleDateString()` replaced with `formatDate()` utility

**Infrastructure:**
- [ ] Stale worktrees cleaned up (done during spec phase — 5 worktrees removed, ~1GB freed)
- [ ] All 73 tests pass, build succeeds

### Non-Goals

- NOT adding new features or pages
- NOT changing navigation structure (already fixed in portal-ui-audit cycle)
- NOT modifying Prisma schema (no new fields — existing status fields used for soft delete)
- NOT touching the Xendit payment flow beyond error response format
- NOT adding error boundaries (separate concern, out of scope)

### Assumptions I'm Making

1. **Hard delete → soft delete:** Only entities with existing `status` fields will get soft delete. Junction records (`studentGuardian`), holidays, campuses, and teaching assignments have no status field — those hard deletes are intentional and acceptable (they're config/reference data, not business records). I'll document each exception.
2. **`where: any` typing:** I'll use each model's Prisma `WhereInput` type (e.g., `Prisma.EmployeeWhereInput`) instead of `any`.
3. **Date formatting in API routes:** `toLocaleDateString()` in `app/api/slips/[payrollItemId]/pdf/route.ts` and `app/api/payroll/[id]/send-slips/route.ts` is acceptable — these format dates for PDF generation and email, not for UI display. I won't change those.
4. **`app/page.tsx` and `app/layout.tsx` colors:** These are the login page and root layout. The hardcoded colors should be replaced with CSS variables, but the login page may intentionally use a different color scheme. I'll replace hex with vars but preserve the visual design.
5. **Attendance page action column:** The override action (pencil button) is functionally different from the standard "Lihat/Edit/Deactivate" pattern — it opens an inline override dialog. I'll wrap it in a proper action component but keep the override-specific behavior.

**Correct me now or `/build` will proceed with these assumptions.**

## Tasks

Ordered, each atomic. Each task will be committed independently after `npm run build && npx vitest run` passes.

1. [x] **Replace console.error with toast.error in admin pages** — Update 7 instances across 6 admin pages (students, employees, invoices, admissions, payroll, leave). Accept: zero `console.error()` in `app/admin/`.

2. [ ] **Replace hardcoded hex colors in app/page.tsx and app/layout.tsx** — Replace all `text-[#xxx]`/`bg-[#xxx]` with CSS variable equivalents from globals.css. Accept: `grep -c 'text-\[#' app/page.tsx app/layout.tsx` returns 0.

3. [ ] **Replace toLocaleDateString with formatDate in admin pages** — Update 4 admin pages (employees/[id], invoices, attendance, attendance/monthly). Accept: zero `toLocaleDateString` in `app/admin/`.

4. [ ] **Fix attendance page action column** — Replace raw `<button>` override action with proper DataTableRowActions or equivalent pattern. Accept: attendance page action column follows standard pattern.

5. [ ] **Fix inline Badge → StatusBadge in admin** — Check employees, dashboard-client, fees pages for inline Badge with hardcoded colors; replace with StatusBadge. Accept: no inline Badge with hardcoded color classes in admin pages.

6. [ ] **Fix hardcoded colors in teacher class-attendance** — Replace `bg-[var(--status-present)]` etc. with proper CSS variable classes. Accept: zero `text-[`/`bg-[` in `app/teacher/class-attendance/page.tsx`.

7. [ ] **Fix teacher profile Badge → StatusBadge** — Replace raw `<Badge>` with `<StatusBadge>` in `app/teacher/profile/page.tsx`. Accept: uses StatusBadge component.

8. [ ] **Fix parent assessments-table color mapping** — Replace `text-[var(--status-late)]` with proper CSS variable class. Accept: zero `text-[` in `app/parent/assessments-table.tsx`.

9. [ ] **Convert DELETE routes to soft delete where applicable** — For each of the 7 hard delete routes, check if the model has a status field. If yes, convert to status-based deactivation. If no, add a code comment documenting why hard delete is intentional. Accept: no `prisma.*.delete()` on entities with status fields.

10. [ ] **Add Zod validation to leave request POST** — Replace manual `if (!leaveType || ...)` with a Zod schema and `validateBody()`. Accept: POST handler uses `validateBody(leaveRequestSchema, body)`.

11. [ ] **Replace `where: any` with proper Prisma types** — Update 7 API routes to use `Prisma.*WhereInput` types. Accept: zero `where: any` in `app/api/`.

12. [ ] **Standardize Xendit webhook error format** — Change `{ ok: false, error }` to `{ error }` in webhook route. Accept: consistent error format across all routes.

13. [ ] **Replace toLocaleDateString in attendance export route** — Update `app/api/attendance/export/route.ts` to use formatDate utility. Accept: zero `toLocaleDateString` in API route files (PDF/email routes exempted).

14. [ ] **Final build + test verification** — Run `npm run build && npx vitest run`. Fix any regressions. Accept: build passes, all tests pass.

## Implementation

- Task 1: Replace console.error with toast.error — `app/admin/{students,employees,invoices,admissions,payroll,leave}/page.tsx` — Replaced 7 `console.error()` calls with `toast.error()` in Indonesian. Added `import { toast } from "sonner"` to 3 files that were missing it (students, employees, payroll).

## Verification

- Task 1: Gates passed (build + vitest run). Zero `console.error` remaining in `app/admin/`.

## Ship Notes

<filled by /ship>
