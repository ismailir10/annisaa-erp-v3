# Admin Dashboard Shadcn Rebuild

## Context

Current admin dashboard at `app/admin/page.tsx` + `app/admin/dashboard-client.tsx` ships four KPI stat cards, a hand-rolled CSS bar chart for the seven-day attendance trend, a "Pending Actions" card (leave + payroll), and a quick-actions grid. The chart, stat cards, and pending list are bespoke implementations that predate adoption of `components/ui/chart.tsx` (shadcn `ChartContainer` wrapping recharts) and the rest of the shadcn primitive set the project now standardises on.

This cycle rebuilds the admin dashboard using shadcn primitives the project already ships, keeps the existing information architecture, and adds two new pieces of admin-facing context: a Pending Admissions row and a cross-module Recent Activity feed sourced from the `AuditLog` table. Tabs and analytics/reports views are explicitly out of scope.

Brainstorm spec: [docs/superpowers/specs/2026-05-03-dashboard-shadcn-rebuild-design.md](../superpowers/specs/2026-05-03-dashboard-shadcn-rebuild-design.md)
Implementation plan: [docs/superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md](../superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md)

Scope: admin portal only. Teacher and parent portal dashboards are not touched.

## Spec

### Goals

1. Replace the bespoke CSS bar chart with a shadcn `ChartContainer` (recharts) implementation rendering the same seven-day attendance dataset.
2. Adopt shadcn primitives consistently across all dashboard sections (`Card`, `Badge`, `StatusBadge`, `Avatar`, `EmptyState`, `ChartContainer`).
3. Split the monolithic `dashboard-client.tsx` into focused single-purpose components under `components/admin/dashboard/` that mirror the existing `components/admin/stat-card.tsx` split.
4. Add a Pending Admissions row to the existing Pending Actions card, gated by `admissions.view`.
5. Add a Recent Activity feed component rendering up to eight humanised cross-module events from `AuditLog`, gated by `hr.view`.
6. Switch the page-level `Promise.all` orchestration to `Promise.allSettled` so a single failed query degrades only its own section.

### Acceptance criteria

- `/admin` (logged in as full SUPER_ADMIN) renders the five sections in Layout C: full-width 4-card stat grid; 3-column middle row with attendance chart spanning 2 cols (left) and stacked Pending Actions + Activity Feed in the 1-col right rail; full-width Quick Actions below. Collapses to single column below `lg`.
- Attendance chart renders via `ChartContainer` from `components/ui/chart.tsx` with stacked bars (present / late / absent) over the same seven weekdays computed today by `app/admin/page.tsx`.
- Pending Actions shows leave (always), admissions (if `admissions.view`), payroll (if `payroll.view`).
- Activity Feed shows up to eight rows or empty state copy "Belum ada aktivitas terbaru" via existing `EmptyState`.
- SCHOOL_ADMIN seed user (no `payroll.view`): payroll row + payroll quick action hidden.
- One simulated failed query renders that section's empty state but leaves all other sections intact.
- Cross-checked against `.claude/standards/design-system.html` for token + spacing alignment.
- Between-task gate (`npm run build && npx vitest run`) passes after every task.
- End-of-cycle gate including `npx playwright test` passes once before final `/ship`.

## Tasks

Task ordering and per-step content live in [docs/superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md](../superpowers/plans/2026-05-03-dashboard-shadcn-rebuild.md). Summary:

1. **Add `lib/dashboard/activity-feed.ts` (TDD).** `getRecentActivity(tenantId, limit = 8)` queries `AuditLog`, batch-resolves entity display names, maps via `VERB_MAP`, returns `ActivityEvent[]`. Wrapped in `unstable_cache(60s, tag "activity-feed")`. Six vitest cases cover empty input, verb mapping, whitelist skip, hard-deleted skip, deleted-actor fallback, limit honouring.
2. **Add `components/admin/dashboard/*` splits.** Five components (`stat-grid`, `attendance-trend-chart`, `pending-actions`, `activity-feed`, `quick-actions`) plus `index.ts` barrel. Only the chart is `"use client"` (recharts requirement). Drops `framer-motion` from non-chart sections.
3. **Rewrite `app/admin/page.tsx`** to compose the new layout, switch to `Promise.allSettled` with a `settled()` helper, perm-gate the two new fetches (`prisma.admission.count` for `INQUIRY` status; `getRecentActivity`). Delete `app/admin/dashboard-client.tsx`.
4. **Wire `revalidateTag("activity-feed")` into `lib/audit.ts`** after `auditLog.create` succeeds. Add 2 vitest cases (success invalidates, failure doesn't).
5. **Add `e2e/admin-dashboard.spec.ts`** covering the five sections for SUPER_ADMIN and the SCHOOL_ADMIN gating (no payroll row + no payroll quick action).

Tasks 1 and 2 are independent. Task 3 depends on both. Tasks 4–5 sequential.

## Implementation

### Task 1 — `lib/dashboard/activity-feed.ts` ✅ (chore: a990559, fix: pending)

`getRecentActivity(tenantId, limit = 8)` queries `AuditLog`, batch-resolves entity display names per whitelisted entity in a single `Promise.all` (no N+1), maps each row through `VERB_MAP` to humanise actor/verb/target into Indonesian, and returns `ActivityEvent[]`. Wrapped in `unstable_cache(60s, tag "activity-feed")` for Task 4 invalidation.

Files: `lib/dashboard/activity-feed.ts`, `lib/dashboard/__tests__/activity-feed.test.ts` (8 tests).

Code review fixed two correctness issues:
- `Invoice` display field was `"number"` — Prisma schema actually exposes `invoiceNumber`. Wrong field would throw `PrismaClientValidationError` at runtime; the test mock used the wrong field too so the bug was masked. Fixed in source + test.
- `PayrollRun.periodStart` is `YYYY-MM-DD`; now formatted via `formatDate(..., { month: "long", year: "numeric" })` so the verb renders as "membuat penggajian April 2026" rather than "...2026-04-01". Locked in by a dedicated test.

Deferred to a follow-up: tighter per-entity-type isolation via `Promise.allSettled` inside the helper. Spec design relies on the page-level `Promise.allSettled` + per-section empty-state degradation (Task 3); the tighter inner isolation is nice-to-have, not load-bearing.

## Verification

(populated end-of-cycle once `npm run build && npx vitest run && npx playwright test` all green; will explicitly cross-check against `design-system` reference)

## Ship Notes

(populated after end-of-cycle gate passes — expected: no migrations, no env vars, rollback = revert cycle commits)
