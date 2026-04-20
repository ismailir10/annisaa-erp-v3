# Navigation & IA Hygiene

## Context

The 2026-04-21 review sweep (`docs/reviews/2026-04-21-sweep.md` §7) found navigation and information-architecture regressions introduced when the Penilaian (assessment) feature landed across all three portals. Four distinct labels for the same `StudentAssessment` concept appear across nav + page headers; the admin assessment detail page uses query-param routing (`/admin/assessments/scores?id=<id>`) that diverges from every other admin entity and breaks `getBreadcrumbs()` + deep-links; `getBreadcrumbs()` itself collapses every depth ≥3 admin path to the literal label "Detail"; teacher bottom-nav grew to 5 tabs in a `max-w-md` container that starts truncating labels on 320 px viewports; and the admin sidebar does not auto-expand the active group after navigation. This cycle is frontend-only (zero schema / API changes) and unblocks subsequent cycles that may add more admin detail routes.

Cites finding IDs: §7 Major 1–4, §7 Minor 1–3, §7 Nit 1. Also verifies §7 Minor 3 against code — the teacher header already links to `/teacher/profile` via avatar (`components/teacher/header.tsx:27`), so that finding is stale and will be marked ✅ without code change.

## Spec

**Acceptance criteria:**

- [ ] Admin sidebar group `id` renamed `learning` → `assessment`; label stays `Penilaian` (`config/admin-nav.ts:88`).
- [ ] Teacher bottom-nav label `Nilai` → `Penilaian`; teacher page header `Nilai Siswa` → `Penilaian` (both routes of `app/teacher/assessments/page.tsx`).
- [ ] Parent keeps nav label `Rapor` (parents expect a report card, per sweep recommendation). Parent page header `Laporan Perkembangan` stays — documented as the one intentional nav/header divergence (brand name vs descriptive title) and will not be flagged as a violation.
- [ ] Admin assessment detail route migrates from `/admin/assessments/scores?id=<id>` to `/admin/assessments/[id]`. Old path redirects server-side (Next.js `redirect()`) so bookmarks + toast links keep working. Row-action callers updated (`app/admin/assessments/page.tsx:162,167`).
- [ ] `getBreadcrumbs()` (`config/admin-nav.ts:135`) generalized: handles arbitrary path depth; recognizes `new` → "Tambah", `edit` → "Ubah", `[id]` segment → "Detail" (or entity-specific label via a small lookup table keyed on group/item). Nested routes like `/admin/assessments/templates/[id]` render a full trail, not `Pengaturan/Detail`.
- [ ] Teacher bottom-nav reduced to **4 tabs** (Beranda / Kehadiran / Kelas / Penilaian). "Gaji" (`/teacher/slips`) moves off the bottom-nav and is reachable from the teacher profile page (`app/teacher/profile/page.tsx`) as a linked card/button. Rationale: low-frequency (monthly), no ambient re-entry needed. Header avatar → profile link already exists, so discoverability is preserved.
- [ ] Admin sidebar auto-expands the group containing the active pathname on mount and on subsequent navigation (`components/admin/sidebar.tsx:101` → `useEffect` hooked to `pathname`). Manually-collapsed state for non-active groups is preserved.
- [ ] Parent bottom-nav query-string pass-through whitelists `child` only (`components/parent/bottom-nav.tsx:32`). Unknown params are dropped to prevent future leakage (e.g. invoice filters bleeding into reports tab).
- [ ] Sweep doc `docs/reviews/2026-04-21-sweep.md` §7 has resolved findings marked in-place with `✅ [cycle: 2026-04-21-nav-ia-hygiene]`.
- [ ] All three portal smoke tests (`e2e/admin.spec.ts`, `e2e/teacher.spec.ts`, `e2e/parent.spec.ts`) still pass.

**Non-goals:**

- No schema changes. No API contract changes.
- No data migration — `StudentAssessment` model, enums, and scoring logic untouched.
- No CRUD gap-fill (Cycle 6 owns missing admin UIs).
- No settings-group subdivision (§7 Nit 2 stays deferred — sweep marked "not urgent").
- No sweeping copy pass — only the assessment-feature labels mentioned above. Other feature labels are out of scope.

**Assumptions:**

1. Parent portal's nav/header divergence (`Rapor` vs `Laporan Perkembangan`) is intentional parent-facing product language and not a consistency bug — documented, not changed. *If you want parent header aligned to `Rapor`, say so before /build.*
2. Moving "Gaji" off the teacher bottom-nav into the profile page is the preferred fix for the 5-tab overload. Alternatives were: (a) combine Kelas+Penilaian into a single tab with sub-nav (rejected — distinct JTBDs), (c) accept 5 tabs + <360 px overflow scroll (rejected — worse touch-target ergonomics on target Android devices).
3. Old `/admin/assessments/scores?id=<id>` URLs may appear in browser history or manually-shared links. A server-side redirect is added (cheap insurance) even though no external system embeds these URLs.
4. `getBreadcrumbs()` entity-name lookup uses the nav item label itself as the fallback (e.g. `/admin/employees/[id]` → `SDM / Karyawan / Detail`). Per-entity custom names (e.g. "Detail Karyawan") are out of scope — a future cycle can add them if the single "Detail" leaf feels ambiguous.

## Tasks

Each task is independently committable; most are parallel-safe. Dependencies called out inline.

- [x] **T1 — Rename nav id + assessment labels across portals.** `config/admin-nav.ts:88` id `learning` → `assessment`. `components/teacher/bottom-nav.tsx:12` label `Nilai` → `Penilaian`. `app/teacher/assessments/page.tsx:59,133` header `Nilai Siswa` → `Penilaian`. No structural change — pure rename. *Acceptance:* grep shows zero remaining `"Nilai"` / `"Nilai Siswa"` strings in teacher portal files; sidebar still renders group under correct label.

- [x] **T2 — Migrate admin assessment detail from query-param to path-segment route.** Create `app/admin/assessments/[id]/page.tsx` with the current `scores/page.tsx` logic (read `id` from `params` instead of `useSearchParams`). Update the two callers in `app/admin/assessments/page.tsx:162,167` to push to `/admin/assessments/${id}`. Replace `app/admin/assessments/scores/page.tsx` with a server component that calls `redirect()` when `id` query param present (preserves bookmarks), else redirects to `/admin/assessments`. Verify breadcrumb renders correctly on new path after T3 lands. *Acceptance:* navigating via row-action "View" lands on `/admin/assessments/<id>`; old query-param URL 308-redirects to new path; no lingering `useSearchParams("id")` in assessment code.

- [x] **T3 — Generalize `getBreadcrumbs()` for arbitrary depth.** Refactor `config/admin-nav.ts:135`. Parse all segments after the matched nav item; map each: `new` → "Tambah", `edit` → "Ubah", `monthly` → "Bulanan", `templates` → "Template", `[id]` (detected via not-in-known-segments heuristic) → "Detail". Return the full trail. *Acceptance:* unit assertions (or `/uat` quick pass) show `/admin/employees/abc123/edit` → `SDM / Karyawan / Detail / Ubah`, `/admin/assessments/xyz` → `Penilaian / Penilaian Siswa / Detail`, `/admin/assessments/templates/tmpl1` → `Penilaian / Template / Detail`. Depends on T2 for the `/admin/assessments/[id]` path-shape case.

- [x] **T4 — Reduce teacher bottom-nav to 4 tabs; surface "Gaji" in profile page.** Remove the `Gaji` tab from `components/teacher/bottom-nav.tsx:13`. In `app/teacher/profile/page.tsx`, add a linked card/section "Slip Gaji" → `/teacher/slips`. *Acceptance:* bottom-nav renders 4 tabs; teacher can still reach `/teacher/slips` in two taps (avatar → profile → slip gaji card); `e2e/teacher.spec.ts` updated if it asserted tab count. Independent of T1/T2/T3.

- [x] **T5 — Admin sidebar auto-expands active group.** In `components/admin/sidebar.tsx` (around the `useState` at :101), add a `useEffect` that calls `getActiveGroup(pathname, visibleGroups)` whenever `pathname` changes and forces that group `open: true` in the state map, leaving other groups' user-chosen state alone. *Acceptance:* collapse "Akademik", then click a breadcrumb into an academic route — sidebar now shows "Akademik" expanded with the active item highlighted. Independent.

- [x] **T6 — Parent bottom-nav query-param whitelist.** `components/parent/bottom-nav.tsx:32`. Replace `searchParams.toString()` with an explicit construction that only carries `child` (if present). Unknown params dropped. *Acceptance:* navigating `/parent/invoices?child=c1&month=2026-04` then tapping "Rapor" tab lands on `/parent/reports?child=c1` (no `month`). Independent.

- [x] **T7 — Sweep doc in-place resolution markers.** Edit `docs/reviews/2026-04-21-sweep.md` §7: append `✅ [cycle: 2026-04-21-nav-ia-hygiene]` next to each resolved finding (Majors 1–4, Minors 1–2, Nit 1). For Minor 3 (teacher/profile surface), append `✅ stale — header avatar already links to /teacher/profile` with the same cycle tag. Run after T1–T6 merge on the branch. *Acceptance:* grep for `✅ [cycle: 2026-04-21-nav-ia-hygiene]` in sweep doc returns 8 hits. No other sweep-doc section touched.

## Implementation

- Subagent plan: T1, T3 share `config/admin-nav.ts` → sequential. T1, T4 share `components/teacher/bottom-nav.tsx` → sequential. All tasks executed inline in declared order for safety.
- Task 1: Rename nav id + assessment labels — `config/admin-nav.ts` (id `learning`→`assessment`), `components/teacher/bottom-nav.tsx` (label `Nilai`→`Penilaian`), `app/teacher/assessments/page.tsx` (header `Nilai Siswa`→`Penilaian`), `e2e/teacher.spec.ts` (test name + selectors updated). Pure rename, no logic change.
- Task 2: Migrate admin assessment detail route — created `app/admin/assessments/[id]/page.tsx` (copy of scoring UI, reads id via `useParams()`); replaced `app/admin/assessments/scores/page.tsx` with server-side redirect to `/admin/assessments/${id}` (preserves bookmarks); updated two callers in `app/admin/assessments/page.tsx` to push to new path.
- Task 3: Generalize `getBreadcrumbs()` — added `SEGMENT_LABELS` map (`new`/`edit`/`monthly`/`templates`/`guardians`/`score[s]`); unknown segments render as "Detail" (assumed dynamic id); settings paths now also support sub-trails. Added `config/__tests__/admin-nav.test.ts` with 10 cases covering dashboard, 2-level, 3-level ([id]), 4-level (id/edit), settings, unknown paths.
- Task 4: Teacher bottom-nav 5→4 tabs — removed `Gaji`/`Wallet` from `components/teacher/bottom-nav.tsx`; added a "Slip Gaji" quick-link card at the top of `app/teacher/profile/page.tsx` (`Link`→`/teacher/slips` with Wallet icon + description). Tabs now: Beranda / Kehadiran / Kelas / Penilaian. Existing `/teacher/slips` route and e2e `salary slips page loads` test unchanged (direct `page.goto`).
- Task 5: Admin sidebar auto-expand — added `useEffect` on `pathname` in `components/admin/sidebar.tsx` that sets the active group's open state to `true` (functional setState bails out when already open, preserving user-collapsed state for inactive groups). Also expands Settings group if the active route is a settings item.
- Task 6: Parent bottom-nav query whitelist — added `PARENT_NAV_FORWARDED_PARAMS = ["child"]` in `components/parent/bottom-nav.tsx`; href constructed from a filtered `URLSearchParams` containing only allowed keys. Unknown params (e.g. invoice month filter) are dropped on tab switch.
- Task 7: Sweep doc markers — 8 entries in `docs/reviews/2026-04-21-sweep.md` §7 now carry `✅ [cycle: 2026-04-21-nav-ia-hygiene]` (Majors 1–4, Minors 1–2, Nit 1, plus Minor 3 as `✅ stale` with an explanatory note pointing at `components/teacher/header.tsx:27`).

## Verification

- Task 1: gates passed — `npm run build` ✅, `npx vitest run` ✅ 18 files / 157 tests. No teacher-portal `"Nilai"`/`"Nilai Siswa"` strings remain (grep clean).
- Task 2: gates passed — build shows `/admin/assessments/[id]` + legacy `/admin/assessments/scores` routes both compiled; vitest 18/157 still green. Grep confirms no live callers of `assessments/scores?id=` remain (only the redirect page's own comment).
- Task 3: gates passed — build ✅, vitest 19 files / 167 tests (added 10 new breadcrumb cases). All key shapes verified: `/admin/employees/abc123/edit` → `SDM / Karyawan / Detail / Ubah`; `/admin/assessments/abc123` → `Penilaian / Penilaian Siswa / Detail`; `/admin/assessments/templates/tmpl1` → `Penilaian / Template / Detail`.
- Task 4: gates passed — build ✅, vitest 19/167. Teacher bottom-nav renders 4 tabs; `/teacher/slips` reachable in 2 taps (avatar → profile → "Slip Gaji" card).
- Task 5: gates passed — build ✅, vitest 19/167. Effect dep = `pathname` only; functional setState shape (`prev[activeGroupId] ? prev : {...prev, [activeGroupId]: true}`) prevents unnecessary re-renders.
- Task 6: gates passed — build ✅, vitest 19/167. Whitelist constant co-located with nav config for easy future additions.
- Task 7: verification — `grep -c "\[cycle: 2026-04-21-nav-ia-hygiene\]" docs/reviews/2026-04-21-sweep.md` returns 8. No other sweep-doc section modified.

**End-of-cycle gates:** `npm run build` ✅. `npx vitest run` ✅ 19 files / 167 tests. `npx playwright test` — 22 passed, 5 failed in `e2e/admin-school-admin.spec.ts` (payroll/salary role-gate assertions for the `u_school_admin` demo persona). Investigation:
- All 5 failures are in a spec this cycle does not modify; cycle diff against `origin/staging` for `app/api/payroll`, `app/api/employees/[id]/salary`, `middleware.ts`, `lib/auth.ts`, `app/admin/employees/[id]/page.tsx`, and `components/admin/sidebar.tsx`'s `superAdminOnly` filter shows zero overlap (only an additive `useEffect` in sidebar — unrelated to role filtering).
- `gh run list --branch staging` shows the current staging tip (`95cb992`) CI passed on the same spec file → failures are not a regression caused by this cycle.
- Most likely cause: local demo DB is missing the `u_school_admin` seed row or is stale. Not actionable from inside this cycle. Surfacing in Ship Notes for manual verification on the PR preview build.

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Manual smoke on preview URL:**
  1. Log in as an admin → sidebar shows "Penilaian" group (was "learning" id, now "assessment"). Collapse another group (e.g. "Akademik"), then click a breadcrumb into an admin entity under a third group — previously collapsed groups stay collapsed, active group auto-expands.
  2. Navigate to `/admin/assessments` → click a row's ⋮ menu → "Detail"/"Edit Nilai" — URL is `/admin/assessments/<id>` (path segment, not `?id=<id>`).
  3. Hit old bookmark `/admin/assessments/scores?id=<real-id>` → 307/308 to `/admin/assessments/<id>`.
  4. Log in as a teacher → bottom-nav shows 4 tabs (Beranda / Kehadiran / Kelas / Penilaian). Tap avatar → profile page has a "Slip Gaji" card at top that links to `/teacher/slips`.
  5. Log in as a parent → navigate `/parent/invoices?child=<child-id>&month=2026-04` → tap "Rapor" tab → URL is `/parent/reports?child=<child-id>` (no `month`).
  6. Admin breadcrumbs render correctly on deep paths: `/admin/employees/<id>/edit` → `SDM / Karyawan / Detail / Ubah`; `/admin/assessments/templates/<id>` → `Penilaian / Template / Detail`.
- **Known local test noise:** 5 Playwright tests in `e2e/admin-school-admin.spec.ts` (SCHOOL_ADMIN role restrictions) fail locally. Verified unrelated to this cycle — staging CI is green on the same spec file at HEAD. Likely local demo-DB is missing the `u_school_admin` seed row. CI on the PR will be authoritative.
- **Rollback plan:** single-squash revert is safe. All changes are frontend-only, no schema, no API contract change. Worst-case regression is a cosmetic label or breadcrumb difference — no data impact.
- **README.md update:** not required for this cycle — no new modules, routes (new detail path replaces old query-param path, zero new entities), CRUD status changes, or ADRs. The route migration is an internal refactor.
