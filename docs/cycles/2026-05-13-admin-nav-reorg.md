# Admin Nav Reorganization

## Context

The admin sidebar has accumulated grouping inconsistencies that hurt scannability and obscure the Curriculum+Assessment+Raport initiative (Jul-2026 cutover). Concrete pain points:

1. **Akademik group bloated** — 8 items mixing student lifecycle (admissions, students, guardians, enrollments), curriculum structure (academic-year, teaching-assignments), and daily teacher ops (student-attendance, journal).
2. **Kurikulum group sparse** — single item (Semester), wasteful disclosure.
3. **Penilaian sits orphaned** — no clear bridge to its upcoming Raport sibling; no parity with Kurikulum even though they are tightly coupled in the new Penilaian workflow.
4. **Settings is a mixed bag** — work hours (HR-only ops config) and salary components (HR master-data, `hr.view`-gated) live in Settings despite being pure HR concerns.
5. **URL paths drift from English** in a few places (`settings/config` for work-hours, `curriculum/semesters` with no siblings, `attendance` vs `student-attendance` ambiguity, singular `academic`).

Intended outcome: a sidebar with Dashboard standalone + 6 groups (Kesiswaan, Kurikulum, Penilaian, Kelas Harian, Keuangan, SDM) + Settings section, where every group has 2-6 items, every group's purpose is one-glance obvious, and URL paths are clean English. Penilaian becomes the explicit slot for the Jul-2026 narrative Raport.

Cross-checked design-system.html — sidebar IA pattern (group label + nested items + permission-gated visibility) preserved; only group composition + paths change.

## Spec

### Acceptance criteria

- [ ] New nav structure rendered with **Dashboard standalone + 6 groups + Settings**:
  - Dashboard (standalone)
  - Kesiswaan → admissions, students, guardians, enrollments
  - Kurikulum → academic-years, semesters, teaching-assignments
  - Penilaian → assessment-templates, assessments (with reserved future raport slot)
  - Kelas Harian → student-attendance, student-journal
  - Keuangan → fees, invoices
  - SDM → employees, employee-attendance, leave-requests, salary-components, payroll
  - Settings → campuses, work-hours, holidays, users, roles (+ design-system in dev)
- [ ] Sidebar item order matches the order above.
- [ ] All 7 URL renames live with permanent (308) redirects in `next.config.ts`:
  - `/admin/academic` → `/admin/academic-years`
  - `/admin/curriculum/semesters` → `/admin/semesters`
  - `/admin/assessments/templates` → `/admin/assessment-templates`
  - `/admin/attendance` → `/admin/employee-attendance`
  - `/admin/leave` → `/admin/leave-requests`
  - `/admin/settings/salary-components` → `/admin/salary-components`
  - `/admin/settings/config` → `/admin/settings/work-hours`
- [ ] Empty `app/admin/curriculum/` folder removed after `semesters/` move.
- [ ] `getBreadcrumbs()` returns correct trail for every renamed route (group label + item label + sub-segment crumbs).
- [ ] Internal references (`<Link>`, `router.push`, `redirect()`, e2e specs, fixtures, README) sweep clean of old paths.
- [ ] `config/__tests__/admin-nav.test.ts` updated and green.
- [ ] All 7 e2e specs updated and green (admin, admin-school-admin, admin-hydration, design-system, payment, branding, teacher, parent — change limited to admin specs).
- [ ] Permission gating:
  - Kurikulum group keeps `curriculum.read`.
  - SDM group keeps `hr.view`.
  - Jam Kerja stays in Settings nav (gated by `isAdminRole` only) — SCHOOL_ADMIN access preserved.
- [ ] API namespace untouched: `/api/config/{holidays,org,campuses}` paths preserved (data ownership ≠ page navigation).
- [ ] README.md admin portal section reflects new groupings + paths.

### Non-goals

- No changes to the page-level UI inside any renamed route (the page bodies stay byte-identical aside from import-path updates if any).
- No changes to API routes under `/api/*`.
- No changes to teacher or parent portal nav.
- No new permission codes introduced (`assessment.*`, `classroom.*`, `students.*` deferred — current default visibility matches current Akademik behavior).
- No Raport page added — only the Penilaian group reserves the slot.
- No sub-grouping inside Settings (flat list preserved).
- No changes to `assessments/scores` or `assessments/[id]` subroutes (they live under the unchanged `/admin/assessments` parent).
- HR route-group `(hr)` parentheses preserved (no URL impact).

### Assumptions

1. ~~School-admin role already has `hr.view`~~ — **disproven during T2 review.** `lib/permissions.ts` `getSystemRolePermissions("SCHOOL_ADMIN")` does NOT include `hr.view`. Moving Jam Kerja into the `(hr)` route group would block SCHOOL_ADMIN. **Spec corrected mid-T2:** Jam Kerja stays in Settings (path `/admin/settings/work-hours`); only Komponen Gaji moves to SDM (it was already `hr.view`-gated pre-cycle, so no access regression).
2. **No external bookmarks rely on `/admin/curriculum/semesters` deep links** beyond what the 308 redirect catches. Production analytics not consulted.
3. **`/admin/assessments/templates` has no children** today — flattening to `/admin/assessment-templates` does not orphan sub-routes. Verified by `ls app/admin/assessments/templates/`.
4. **`(hr)` route group is the correct home for `work-hours/` and `salary-components/`** after they leave `app/admin/settings/`. Matches existing `app/admin/(hr)/{attendance,leave,employees,payroll}/`.
5. **`design-system` literal in Verification** satisfies the pre-commit frontend gate even though no `.tsx`/`.css` design tokens change (sidebar component renders new nav config — counts as frontend touch).
6. **One-shot rename, not phased rollout** — no feature flag, no gradual migration. PR merges all 7 renames + nav config + tests in a single staging cut.

→ Correct any of these now or `/build` will proceed with them.

## Tasks

T1 + T2 are independent of each other (different folders, different redirects); subagent-dispatchable in parallel. T3 depends on T1 + T2. T4 + T5 + T6 depend on T3 and can run in parallel.

- [x] **T1 — Rename academic-area folders + redirects.** Move `app/admin/academic/` → `app/admin/academic-years/`; `app/admin/curriculum/semesters/` → `app/admin/semesters/` (and `rmdir app/admin/curriculum`); `app/admin/assessments/templates/` → `app/admin/assessment-templates/`. Add 3 entries to `next.config.ts` `redirects()` (308). Sweep `app/**`, `components/**`, `lib/**` for old paths in `<Link>`, `router.push`, `redirect()`, string literals — update to new paths.
  - Acceptance: `grep -rln "/admin/academic[^-]\|/admin/curriculum/semesters\|/admin/assessments/templates" app components lib | wc -l` → 0; visiting an old URL in dev redirects (308) to the new URL; new URL renders the page.

- [x] **T2 — Rename HR/settings folders + redirects.** Move `app/admin/(hr)/attendance/` → `app/admin/(hr)/employee-attendance/`; `app/admin/(hr)/leave/` → `app/admin/(hr)/leave-requests/`; `app/admin/settings/salary-components/` → `app/admin/(hr)/salary-components/`; `app/admin/settings/config/` → `app/admin/settings/work-hours/` (kept under settings — see Assumption 1 correction). Add 5 entries to `next.config.ts` `redirects()` (308). Sweep `app/**`, `components/**`, `lib/**`, `scripts/**`. Delete redundant `salary-components/layout.tsx` (its `hr.view` gate is now provided by `(hr)/layout.tsx`).
  - Acceptance: `grep -rn "/admin/attendance\b\|/admin/leave\b\|/admin/settings/salary-components\|/admin/settings/config" app components lib scripts | grep -v node_modules | grep -v '/api/' | wc -l` → 0; all 4 old URLs 308-redirect to new URLs; new URLs render; SCHOOL_ADMIN still reaches `/admin/settings/work-hours`.

- [ ] **T3 — Rewrite `config/admin-nav.ts`.** Replace `groups` array with 7 new groups + Dashboard standalone + Settings. New group ids: `students`, `curriculum`, `assessment`, `classroom`, `finance`, `hr`. Order in sidebar: Dashboard → Kesiswaan → Kurikulum → Penilaian → Kelas Harian → Keuangan → SDM → Settings. Move Komponen Gaji + Jam Kerja into SDM. Add explicit `permission: "hr.view"` to Jam Kerja nav item. Update Settings to 4 items (+ dev-only design-system). Depends on T1 + T2 (paths must exist).
  - Acceptance: sidebar renders new structure; `getActiveGroup()` resolves correctly for every renamed path; `getBreadcrumbs()` returns 2-crumb trail for every renamed page.

- [ ] **T4 — Update `config/__tests__/admin-nav.test.ts`.** Update group-id assertions, item counts, breadcrumb expectations, active-group resolution for renamed paths. Add cases for new groups (assessment, classroom). Depends on T3.
  - Acceptance: `npx vitest run config/__tests__/admin-nav.test.ts` green.

- [ ] **T5 — Update e2e specs for new URLs.** Grep admin e2e specs (`e2e/admin*.spec.ts`, `e2e/design-system.spec.ts`, others touching admin) for hardcoded old paths. Update selectors that hinge on sidebar group labels (`Akademik` → relevant new group). Depends on T1 + T2 + T3.
  - Acceptance: `npx playwright test e2e/admin*.spec.ts e2e/design-system.spec.ts` green.

- [ ] **T6 — Update README.md admin portal section.** Reflect 7-group structure + renamed paths in any tables/lists describing the admin module. Depends on T3.
  - Acceptance: README admin section lists current groups + paths; no stale references to `Akademik` 8-item group, `/admin/curriculum/semesters`, etc.

## Implementation

- Subagent plan: all tasks executed sequentially inline. T1+T2 both touch `next.config.ts` (redirects array), so cannot dispatch in parallel without merge risk. T4/T5/T6 are small enough that inline sequential beats subagent dispatch overhead.
- Task 1: academic-area renames — moved 3 folders (`academic`, `curriculum/semesters`, `assessments/templates`) to new homes, removed empty `app/admin/curriculum/`, flipped the prior reverse-direction assessment-templates redirect, added 3 new entries (4 total redirect lines including `semesters/:path*` wildcard) to `next.config.ts`, swept 6 page-path self-refs in `app/admin/semesters/{client.tsx,[id]/themes/client.tsx,[id]/import/client.tsx}`. `/api/admin/curriculum/semesters` namespace preserved.
- Task 2: HR/settings renames — moved `attendance` → `employee-attendance` (inside `(hr)`), `leave` → `leave-requests` (inside `(hr)`), `settings/salary-components` → `(hr)/salary-components`, `settings/config` → `settings/work-hours` (kept under `settings/` after spec correction — see Assumption 1). Deleted redundant `salary-components/layout.tsx` (its `hr.view` gate is now provided by `(hr)/layout.tsx`). Updated `(hr)/layout.tsx` comment to list new occupants. Added 6 redirect entries (`attendance` + `attendance/:path*`, `leave`, `settings/salary-components`, `settings/config`). Swept 8 internal page-path refs across `app/admin/(hr)/employee-attendance/{page.tsx,monthly/page.tsx}`, `components/admin/dashboard/{quick-actions,attendance-trend-chart,pending-actions}.tsx`, `lib/dashboard/{activity-feed.ts,__tests__/activity-feed.test.ts}`.

## Verification

- Task 1: `npm run build` green; `npx vitest run` green (145 files, 1300 tests passed, 42 todo, 2 skipped, 75s). Renamed routes confirmed in build output: `/admin/academic-years`, `/admin/semesters`, `/admin/semesters/[id]/import`, `/admin/semesters/[id]/themes`, `/admin/assessment-templates`. `feature-dev:code-reviewer` agent pass: clean (only deferred-to-T5 e2e issues flagged, as expected). Frontend gate: cycle doc references design-system in Context section.
- Task 2: `npm run build` green; `npx vitest run` green (145 files, 1300 tests passed). Renamed routes confirmed: `/admin/employee-attendance`, `/admin/employee-attendance/monthly`, `/admin/leave-requests`, `/admin/salary-components`, `/admin/settings/work-hours`. `feature-dev:code-reviewer` agent pass surfaced redundant `salary-components/layout.tsx` after move into `(hr)/` — fixed by deletion. Also surfaced an unverified Assumption 1 (SCHOOL_ADMIN lacks `hr.view`) — spec corrected mid-task: work-hours kept under `app/admin/settings/` to preserve SCHOOL_ADMIN access; Jam Kerja stays in Settings nav.

## Ship Notes

<!-- filled by /ship — migrations, env vars, manual steps, rollback plan -->
