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

### Task 2 — `components/admin/dashboard/*` splits ✅

Five focused server components plus one client component added under `components/admin/dashboard/`, exported via a barrel `index.ts`.

Files added:
- `components/admin/dashboard/stat-grid.tsx` — server component; renders 2-col (sm) / 4-col (lg) grid of four `StatCard` primitives (total, hadir, terlambat, tidak hadir).
- `components/admin/dashboard/attendance-trend-chart.tsx` — `"use client"`; adopts shadcn `ChartContainer` (wraps `ResponsiveContainer` internally) with stacked recharts `BarChart` using `--chart-1/2/3` tokens. Outer `ResponsiveContainer` dropped vs. plan — `chart.tsx` already wraps it internally (confirmed by inspection of `components/ui/chart.tsx` lines 74–78); plan's gate note correctly predicted this deviation.
- `components/admin/dashboard/pending-actions.tsx` — server component; leave row always shown; admissions row gated by `canSeeAdmissions`; payroll row gated by `canSeePayroll`. Adopts `Card`, `Badge`, `StatusBadge`.
- `components/admin/dashboard/activity-feed.tsx` — server component; renders up to N `ActivityEvent` rows with `Avatar`/`AvatarFallback` (size sm) and `formatRelativeTime`; falls back to `EmptyState` when `events.length === 0`.
- `components/admin/dashboard/quick-actions.tsx` — server component; payroll quick-action gated by `canSeePayroll`; three unconditional actions (kehadiran, cuti, tambah karyawan).
- `components/admin/dashboard/index.ts` — barrel re-exports all five components + `WeeklyTrend` type.

Between-task gate: `npm run build && npx vitest run` — build compiled in 32.4s, 982/982 tests passed.

Code review fixed four issues post-merge:
- `attendance-trend-chart.tsx` — stacked bar `radius` was conditional (bottom-only on present, top-only on absent); when middle stack `late === 0` the rounded corners visually inverted. Switched to uniform `radius={[4, 4, 4, 4]}` across all three bars.
- `activity-feed.tsx` — relative-timestamp `text-[10px]` violated portal.md's banned-size rule (WCAG AA contrast at muted-foreground); raised to `text-xs`.
- `activity-feed.tsx` — empty-state copy strengthened to name the kinds of actions that produce entries (per voice.md "say WHY and WHAT" rule).
- `pending-actions.tsx` — `<Badge className="...text-white">` violated ui.md's no-hardcoded-colors rule; switched to `text-primary-foreground` token.
- `quick-actions.tsx` — emoji glyphs replaced with Lucide icons (`Banknote`, `ClipboardList`, `CalendarOff`, `UserPlus`) per ui.md Shadcn-FIRST rule; icons now sit in a `bg-primary/10` chip mirroring the `PendingActions` row pattern.

### Task 3 — Rewrite `app/admin/page.tsx` + delete `dashboard-client.tsx` ✅

`app/admin/page.tsx` now composes the five focused components from the `components/admin/dashboard/` barrel (StatGrid, AttendanceTrendChart, PendingActions, ActivityFeed, QuickActions) in Layout C: full-width stat grid, 3-column middle row (chart `lg:col-span-2` + right rail with PendingActions/ActivityFeed stacked), full-width QuickActions below.

Key changes:
- **`Promise.allSettled` + `settled()` helper**: each of the 7 query slots is individually extracted with a typed fallback (`0`, `[]`, `null`) and a `console.error` on failure. A single bad query degrades only its own section; the rest render normally.
- **Two new perm-gated queries**: `prisma.admission.count({ status: "INQUIRY" })` behind `admissions.view`; `getRecentActivity(tenantId, 8)` behind `hr.view`. Both fall back to safe-empty values when the permission is absent.
- **TypeScript**: `PayrollRowWithCount` local type alias resolves the `_count.items` narrowing issue (Prisma infers the `include` shape only when the generic is propagated explicitly).
- **Deleted `app/admin/dashboard-client.tsx`**: removed via `git rm`; verified no remaining imports across `app/`, `components/`, `lib/`.

Cross-checked design-system.html §cards + §charts for token + spacing alignment.

Between-task gate: `npm run build` compiled in 19.6s (TypeScript + 123 routes); `npx vitest run` — 982/982 tests passed.

Code review fixed four issues post-merge:
- **Missing `canSeeLeave` perm gate**: leave-request count + Pengajuan Cuti row in PendingActions now gated by `hasPermission(session, "leave.view")`, mirroring the admissions/payroll pattern. SCHOOL_ADMIN's default permission set excludes `leave.view`, so the row stays hidden for them.
- **Stat-grid vs chart `present` semantics divergence**: stat grid previously folded LATE into present (`PRESENT + LATE + PRESENT_NO_CHECKOUT`) while the chart kept LATE separate, producing inconsistent numbers across the same day. Stat grid now matches the chart: `present = PRESENT + PRESENT_NO_CHECKOUT`, late is its own status.
- **UTC timezone bug** carried over from the deleted client: `today.toISOString().split("T")[0]` returns UTC, so a server in UTC saw the previous calendar day during 00:00–07:00 WIB, blanking the dashboard. Replaced with `Date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })` for both `todayStr` and the weekday cursor.
- **`PayrollRowWithCount` type alias** hoisted from mid-function-body to module scope for readability.

### Task 4 — `revalidateTag` in `lib/audit.ts` ✅

Added `import { revalidateTag } from "next/cache"` to `lib/audit.ts` and a single `revalidateTag("activity-feed", { expire: 0 })` call inside the `try` block immediately after `client.auditLog.create(...)` succeeds. The call runs for both the standalone path and the transactional (`tx`) path because both share the same `try` body. No invalidation occurs on the error path — the `catch` block is unchanged (standalone path swallows the error; transactional path re-throws). Also added a global `next/cache` mock to `vitest.setup.ts` (no-op stubs for `revalidateTag`, `revalidatePath`, `unstable_cache`) so that route-level tests exercising `recordAudit` don't throw "static generation store missing" outside Next.js request context. Two new test cases added to `lib/__tests__/audit.test.ts`: one confirms `revalidateTag` is called with `("activity-feed", { expire: 0 })` on success; one confirms it is not called when the standalone create fails. Total test count: 984 (982 before + 2 new).

## Verification

### Task 5 — e2e coverage ✅

Added `e2e/admin-dashboard.spec.ts` with 8 tests:

**SUPER_ADMIN describe block (5 tests):**
1. `renders stat grid with all four metric cards` — asserts Total Karyawan, Hadir Hari Ini, Terlambat, Tidak Hadir visible.
2. `renders attendance trend chart container or its empty state` — heading visible + chart `.or(empty-state)` pattern.
3. `renders pending actions with leave + admissions rows` — PendingActions card scoped; Pengajuan Cuti + Pendaftaran Baru visible.
4. `renders activity feed (rows or empty state copy)` — Aktivitas Terbaru heading + avatar-or-empty-state.
5. `renders quick actions with all four links for full perms` — QuickActions section scoped; all 4 links including Jalankan Penggajian.

**SCHOOL_ADMIN describe block (3 tests):**
6. `hides payroll row in pending actions` — Penggajian Terakhir absent from PendingActions card.
7. `hides leave row (SCHOOL_ADMIN lacks leave.view)` — Pengajuan Cuti absent from PendingActions card.
8. `hides Jalankan Penggajian quick action` — link absent from QuickActions section; Lihat Kehadiran + Tambah Karyawan still present.

All 8 tests pass.

**Bug fixed during Task 5:** `components/admin/dashboard/stat-grid.tsx` lacked `"use client"` directive, causing a React Server Components serialization error (Lucide icon functions cannot cross the server→client boundary). Adding `"use client"` resolved the runtime error. Between-task gate confirmed fix.

### End-of-cycle gate

- `npm run build` — clean, 123 routes, TypeScript passed.
- `npx vitest run` — 984 tests passed (984/984), 42 todo, 2 skipped.
- `npx playwright test` — 60 passed, 6 failed (pre-existing, unrelated to this cycle):
  - 3 `admin.spec.ts` tagihan/Xendit bulk-invoice tests (require live Xendit network, pre-existing).
  - 1 `design-system.spec.ts` iframe test (pre-existing env issue).
  - 2 `teacher.spec.ts` salary-slips + logout tests (pre-existing).
  - All 8 new `admin-dashboard.spec.ts` tests: **PASS**.
  - All previously-passing admin, school-admin, parent, payment specs: **PASS** (unchanged).

Cross-checked design-system.html §cards + §charts — token + spacing alignment confirmed in dev preview.

## Ship Notes

- No database migrations.
- No new environment variables.
- Rollback: revert cycle commits (a990559, 1a4898f, 299d45a, 7241190, 729047f, 0c62286, 25932a0, e61b573, plus the Task 5 commit).
