# Admin Dashboard Rebuild — Shadcn Primitive Adoption + Activity Feed

## Context

The admin dashboard at `app/admin/page.tsx` + `app/admin/dashboard-client.tsx` ships four KPI stat cards, a hand-rolled CSS bar chart for the seven-day attendance trend, a "Pending Actions" card (leave + payroll), and a quick-actions grid. The chart, stat cards, and pending list are bespoke implementations that predate adoption of `components/ui/chart.tsx` (shadcn ChartContainer wrapping recharts) and the rest of the shadcn primitive set the project now standardises on.

The shadcn dashboard example referenced by the user (https://ui.shadcn.com/examples/dashboard) is the canonical visual reference for current shadcn dashboard patterns: stacked metric cards, recharts chart in a card with a polished header, a "recent activity"-style right-rail list, and tabs for analytics/reports views we do not have content for yet.

This cycle rebuilds the admin dashboard using shadcn primitives the project already ships, keeps the existing information architecture (what data is shown), and adds two new pieces of admin-facing context: a pending admissions row (where applicable) and a cross-module recent activity feed sourced from the `AuditLog` table. Tabs and analytics/reports views are explicitly out of scope.

Scope: admin portal only. Teacher and parent portal dashboards are not touched and will be addressed in a follow-up cycle if needed.

## Spec

### Goals

1. Replace bespoke dashboard CSS bar chart with a shadcn `ChartContainer` (recharts) implementation that renders the same seven-day attendance data set.
2. Adopt shadcn primitives consistently for cards, badges, avatars, and chart wrappers across all dashboard sections.
3. Split the current monolithic `dashboard-client.tsx` into bounded, single-purpose components under `components/admin/dashboard/` to align with the existing `components/admin/stat-card.tsx` split and CLAUDE.md's "design for isolation and clarity" principle.
4. Add a Pending Admissions row to the existing Pending Actions card, gated by `admissions.view` permission.
5. Add a new Recent Activity feed component that renders the last eight humanised cross-module events from `AuditLog`, gated by `hr.view` permission.
6. Switch the page-level `Promise.all` query orchestration to `Promise.allSettled` so any single failed query degrades only its own section instead of breaking the entire dashboard.
7. Cross-check final output against `.claude/standards/design-system.html` for token, spacing, and component-style alignment (frontend-gate compliance).

### Non-goals

- No teacher or parent portal changes.
- No tabs (Overview / Analytics / Reports / Notifications). The example references them but the project has no analytics or reports views to populate them and adding empty tabs is busywork.
- No date range picker in the page header. The seven-day window is fixed for the attendance trend.
- No "Lihat semua aktivitas" (`/admin/activity`) destination route. The activity feed has no "see all" link in this cycle; if `hr.view` is granted the inline list is the surface.
- No new dashboard cards beyond the two listed (Pending Admissions row, Activity Feed). Financial pulse, student attendance, and agenda strip were considered and explicitly deferred during brainstorming.
- No animation system change. The current `framer-motion` stagger is dropped on rebuild — server-rendered stat / pending / quick-actions sections do not need motion.

### Acceptance criteria

- `/admin` (logged in as full SUPER_ADMIN seed user) renders five sections in this layout:
  - Top: full-width 4-card stat grid (Total Karyawan / Hadir Hari Ini / Terlambat / Tidak Hadir).
  - Middle: 3-column grid where the attendance chart spans 2 columns (left) and the Pending Actions + Activity Feed cards stack in the right rail (1 column). Collapses to single column below `lg`.
  - Bottom: full-width Quick Actions grid.
- The attendance chart renders via `ChartContainer` from `components/ui/chart.tsx` with stacked bars (present / late / absent) over the same seven weekdays computed today by `app/admin/page.tsx`. Tooltip shows date label + per-status counts.
- Pending Actions card shows three rows when permitted: Pending Leave (always), Pending Admissions (if `admissions.view`), Last Payroll (if `payroll.view`). Rows respect existing `<Link>` + icon + `Badge` / `StatusBadge` pattern from the current implementation.
- Activity Feed card shows up to eight rows: each row has avatar (initials fallback), actor name, humanised verb + target, and relative timestamp ("2 jam lalu"). Empty state ("Belum ada aktivitas terbaru") renders via existing `EmptyState` component when zero events.
- Quick Actions grid renders the same four actions as today (or three if no payroll permission). No animation.
- Logged in as the SCHOOL_ADMIN seed user (no `payroll.view`): the payroll Pending Actions row is hidden and the "Jalankan Penggajian" quick action is hidden, matching current behaviour.
- One simulated failed query (e.g. weekly trend rejection in `Promise.allSettled`) renders the chart's empty state but leaves all other sections intact.
- Cycle's Verification section in the cycle doc contains the literal token `design-system` to satisfy the `pre-commit` frontend-gate (Rule 4).
- Between-task gate (`npm run build && npx vitest run`) passes after every task.
- End-of-cycle gate including `npx playwright test` passes once before the final `/ship` PR.

## Tasks

Tasks are ordered for incremental progress. Each task ends with the between-task gate (`npm run build && npx vitest run`) and one commit. Tasks 1 and 2 are independent of each other and can be parallelised by sub-agents. Task 3 depends on both. Tasks 4–6 are sequential.

1. **Add `lib/dashboard/activity-feed.ts`.** Implement `getRecentActivity(tenantId, limit = 8)`: query `AuditLog.findMany` ordered by `createdAt desc` with the requested limit; group `entityId`s by `entity` type; parallel-fetch display names per whitelisted entity (`Employee`, `LeaveRequest`, `PayrollRun`, `Invoice`, `Admission`, `StudentEnrollment`); parallel-fetch actor names + initials from `User.findMany` by `actorId`; map each row through a `VERB_MAP: Record<\`${Entity}.${Action}\`, (target: string) => string>` lookup; skip rows whose `entity.action` is not in the map and skip rows whose entity reference resolves to no row. Return `ActivityEvent[]` shaped `{ id, actorName, actorInitials, verb, target, href, timestamp }`. Wrap in `unstable_cache` with `revalidate: 60` and tag `"activity-feed"`. Add `lib/dashboard/activity-feed.test.ts` (vitest) covering: empty AuditLog, mixed-entity filtering, three representative verb mappings, hard-deleted entity-id skip, limit honoured, deleted-actor initials fallback.

2. **Add `components/admin/dashboard/` component splits.**
   - `stat-grid.tsx` — server component, props `{ totalEmployees, present, late, absent }`, renders the four `StatCard`s.
   - `attendance-trend-chart.tsx` — `"use client"` recharts BarChart wrapped in `ChartContainer` + `ChartTooltip` from `components/ui/chart.tsx`. Stacked bars (present / late / absent) using `--chart-1`, `--chart-2`, `--chart-3` tokens. Card header has title + "Lihat detail →" link to `/admin/attendance`. Empty state rendered when `data.length === 0` or all sums are zero.
   - `pending-actions.tsx` — server component, props `{ pendingLeave, pendingAdmissions, lastPayroll, canSeePayroll, canSeeAdmissions }`. Renders the leave row always, admissions row only if `canSeeAdmissions`, payroll row only if `canSeePayroll`. Reuses `Badge` + `StatusBadge`. Each row is a `<Link>`.
   - `activity-feed.tsx` — server component, props `{ events: ActivityEvent[] }`. Renders a list of avatar + name + verb + target + relative time, or `EmptyState` when `events.length === 0`. Use the existing `Avatar` from `components/ui/avatar.tsx` with `AvatarFallback` for initials. Time formatted via existing `formatRelativeTime` if it exists in `lib/format.ts`; otherwise add a small inline helper (verify before adding — do not duplicate).
   - `quick-actions.tsx` — server component, props `{ canSeePayroll }`. Renders the static action grid, payroll action filtered out when `!canSeePayroll`. No animation.
   - `index.ts` — barrel export of all five.
   No tests in this task; visual coverage comes from the e2e task.

3. **Rewrite `app/admin/page.tsx` to compose the new layout and switch to `Promise.allSettled`.** Replace the import of `DashboardClient` with imports from `components/admin/dashboard`. Add two new fetches inside the `Promise.allSettled` array: `pendingAdmissions = prisma.admission.count({ where: { tenantId, status: "INQUIRY" } })` (only when `canSeeAdmissions`), and `getRecentActivity(tenantId, 8)` (only when `canSeeActivity = hasPermission(session, "hr.view")`). For each settled result, fall back to a safe empty value on rejection and `console.error("[dashboard] query failed", { key, err })`. Render the page composition described in Acceptance Criteria. Delete `app/admin/dashboard-client.tsx` once the page no longer imports it.

4. **Wire `revalidateTag("activity-feed")` into AuditLog write paths.** Find the central `AuditLog.create` call site (likely `lib/audit/log.ts` or similar — verify before editing). Add `revalidateTag("activity-feed")` after the insert. If multiple call sites write `AuditLog` directly, centralise through the helper or add the invalidation to each. Commit only after `npm run build` proves the import resolves.

5. **Add e2e coverage in `e2e/admin-dashboard.spec.ts` (or extend `e2e/admin.spec.ts` if smaller).** Cover: stat cards render with numeric values; chart container rendered (assert presence of `[data-slot="chart"]` or canvas); pending leave + admissions rows visible for full-perm seed user; activity feed renders ≥1 row OR the empty state copy "Belum ada aktivitas terbaru"; quick actions render four links with correct hrefs. Add a sibling test in `e2e/admin-school-admin.spec.ts` style asserting payroll row + payroll quick action are hidden for the SCHOOL_ADMIN seed user.

6. **Final cycle doc Verification + Ship Notes.** Run end-of-cycle gate (`npm run build && npx vitest run && npx playwright test`); record results in cycle doc Verification section including the literal token `design-system` ("Cross-checked design-system.html §4 cards + §6 charts for spacing + token alignment"). Fill Ship Notes with: no migrations required, no env vars added, rollback = revert the cycle commits.

## Implementation

(populated by `/build` per task)

## Verification

(populated by `/build` end-of-cycle)

## Ship Notes

(populated by `/build` after end-of-cycle gate passes)
