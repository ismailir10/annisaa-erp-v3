# Dashboard Disaster Recovery

## Context

Staging shipped PR #171 (`feat(admin): rebuild dashboard with shadcn primitives + activity feed`) on 2026-05-03. User reported the dashboard as "a disaster". Reproducing on `feat/dashboard-disaster-recovery` (staging HEAD `5b7b499` plus a fresh DB seed) surfaced four distinct regressions:

1. **Card overflow** — `PendingActions` and `ActivityFeed` both carry `h-full flex flex-col`. With the right rail using `space-y-4` (block layout) and no parent height, each card resolves `h-full` against the grid row track, so each child stretches to the full row height (528px in repro). Cards stack instead of overlap, so the right rail visibly extends 1000+px below the chart card.
2. **Chart card stretching** — `ChartContainer` ships with `flex aspect-video justify-center` baked into its base classes. Even though the dashboard caller passes `h-32`, the `aspect-ratio: 16/9` is not cancelled, so grid track sizing inflates the chart card to ~528px and leaves ~360px of empty whitespace below the bars.
3. **Quick Actions skip perm gates** — three of the four quick actions (`Lihat Kehadiran`, `Pengajuan Cuti`, `Tambah Karyawan`) link into the `(hr)` route group, which is gated by `assertPermission("hr.view")`. SCHOOL_ADMIN lacks `hr.view`, so each click silently bounces back to `/admin`. Only `Jalankan Penggajian` was perm-gated.
4. **POST /api/invoices** — comment at line 199 reads "Any other error bubbles to the route's outer 500 handler" but no outer handler existed. Any unexpected DB / Xendit / serialisation throw fell through to Next.js' generic 500, surfacing as the staging "Gagal membuat tagihan" toast with no server breadcrumb.

Cross-checked `.claude/standards/design-system.html` §cards / §charts — h-full on stacked cards is not a documented pattern; aspect-video override via aspect-auto is the standard escape hatch.

## Spec

- Dashboard right rail must not overflow the grid row.
- Chart card height must follow the inner chart container, not the recharts aspect-ratio default.
- Quick Actions must hide any link to a route the current role cannot reach. The whole section must vanish when no actions remain.
- POST /api/invoices must catch every unhandled throw, log a structured breadcrumb (tenantId, studentId, error name+message+stack), and return `{ error: "Gagal membuat tagihan" }` with status 500.

## Tasks

1. **Layout** — strip `h-full` from `PendingActions` + `ActivityFeed`; switch the right rail from `space-y-4` to `flex flex-col gap-4`; add `lg:items-start` on the outer grid so neither column stretches; add `aspect-auto` to the `ChartContainer` className to override the inherited `aspect-video`.
2. **Perm gates** — add a `canSeeHr` prop to `QuickActions`; gate the three HR links behind it; render `null` when no actions remain. Compute `canSeeHr = hasPermission(session, "hr.view")` in `app/admin/page.tsx` and pass it through. Reuse the same value for `canSeeActivity` (already gated on `hr.view`).
3. **Invoice POST** — wrap the body of `POST /api/invoices` from after validation through the final `NextResponse.json` in `try { … } catch (e) { console.error(…); return 500 }`. Keep the existing inner try/catch around the Xendit call and the P2002 retry loop unchanged.

## Implementation

- `components/admin/dashboard/pending-actions.tsx:23` — drop `h-full` from the Card className.
- `components/admin/dashboard/activity-feed.tsx:11` — drop `h-full` from the Card className.
- `components/admin/dashboard/attendance-trend-chart.tsx:67` — `aspect-auto h-32 w-full` on `ChartContainer`.
- `components/admin/dashboard/quick-actions.tsx` — new `canSeeHr` prop; gate three HR links; early-return `null` on empty actions list.
- `app/admin/page.tsx:60` — add `canSeeHr` derived from `hasPermission(session, "hr.view")`; pass to `<QuickActions />`; reuse for `canSeeActivity`.
- `app/admin/page.tsx:172` — grid gets `lg:items-start`; right rail wrapper changes from `space-y-4` to `flex flex-col gap-4`.
- `app/api/invoices/route.ts:99` — outer `try` opens after parsed-input destructuring; closing `catch` at end of function logs `{ tenantId, studentId, err }` and returns `{ error: "Gagal membuat tagihan" }` 500.

## Verification

- Dev (DEMO_MODE=true) + Playwright MCP, SCHOOL_ADMIN seat:
  - `/admin` chart card 220px tall, bars render (turquoise + amber stack on Thu/Fri), no whitespace stretching.
  - Right rail stacks PendingActions then ActivityFeed naturally (no 1000px overflow); both cards stop at their content edge.
  - Aksi Cepat row absent for SCHOOL_ADMIN (no `hr.view`), no broken-link "Lihat Kehadiran / Pengajuan Cuti / Tambah Karyawan" tiles.
  - Pendaftaran Baru row still present (gated on `admissions.view` which SCHOOL_ADMIN has).
  - `/admin/admissions`, `/admin/invoices` reachable; `/admin/attendance`, `/admin/leave`, `/admin/employees` redirect to `/admin` (existing `(hr)` group gate, unchanged).
  - 0 console errors on the dashboard, 0 hydration warnings.
- Cross-checked `.claude/standards/design-system.html` §cards (no h-full guidance for stacked cards) + §charts (aspect-auto override pattern).
- Code review (feature-dev:code-reviewer) surfaced two follow-ups, both folded in:
  - Payroll quick-action tile now requires `canSeeHr && canSeePayroll` (the `(hr)` layout gate would bounce a custom role granted only `payroll.view`).
  - Outer `try/catch` on POST /api/invoices no longer logs `studentId` in the breadcrumb — Prisma error messages can echo query parameters and `studentId` is student-linked PII; `tenantId` alone is enough scope for triage.
- Build + vitest + lint + Playwright e2e gates: see Ship Notes.

## Ship Notes

- No database migrations.
- No new environment variables.
- Rollback: revert this cycle's commits.
- Risk: existing `e2e/admin-dashboard.spec.ts` only asserts presence/absence by `data-testid` and visible text; no layout assertions changed. SCHOOL_ADMIN test cases that previously asserted Aksi Cepat absence by checking quick-actions count remain valid (the section now renders `null` instead of an empty grid).
- Test gate results:
  - `npm run lint` — 0 errors, 28 warnings (all pre-existing).
  - `npx vitest run` — 1015 passed, 42 todo.
  - `npm run build` — clean.
  - `DEMO_MODE=true npx playwright test` — 61 passed, 7 skipped, 1 failed (`e2e/teacher.spec.ts:46 › salary slips page loads`). The failing teacher-slips test reproduces on `origin/staging` ahead of any change in this cycle and is therefore filed as a pre-existing regression carried in from PR #170 (assessments fix). Will be triaged in a follow-up cycle.
  - `npx playwright test e2e/admin-dashboard.spec.ts` — 8/8 passed (5 SUPER_ADMIN + 3 SCHOOL_ADMIN gating).
