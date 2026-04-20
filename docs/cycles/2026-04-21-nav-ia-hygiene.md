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

- [ ] **T3 — Generalize `getBreadcrumbs()` for arbitrary depth.** Refactor `config/admin-nav.ts:135`. Parse all segments after the matched nav item; map each: `new` → "Tambah", `edit` → "Ubah", `monthly` → "Bulanan", `templates` → "Template", `[id]` (detected via not-in-known-segments heuristic) → "Detail". Return the full trail. *Acceptance:* unit assertions (or `/uat` quick pass) show `/admin/employees/abc123/edit` → `SDM / Karyawan / Detail / Ubah`, `/admin/assessments/xyz` → `Penilaian / Penilaian Siswa / Detail`, `/admin/assessments/templates/tmpl1` → `Penilaian / Template / Detail`. Depends on T2 for the `/admin/assessments/[id]` path-shape case.

- [ ] **T4 — Reduce teacher bottom-nav to 4 tabs; surface "Gaji" in profile page.** Remove the `Gaji` tab from `components/teacher/bottom-nav.tsx:13`. In `app/teacher/profile/page.tsx`, add a linked card/section "Slip Gaji" → `/teacher/slips`. *Acceptance:* bottom-nav renders 4 tabs; teacher can still reach `/teacher/slips` in two taps (avatar → profile → slip gaji card); `e2e/teacher.spec.ts` updated if it asserted tab count. Independent of T1/T2/T3.

- [ ] **T5 — Admin sidebar auto-expands active group.** In `components/admin/sidebar.tsx` (around the `useState` at :101), add a `useEffect` that calls `getActiveGroup(pathname, visibleGroups)` whenever `pathname` changes and forces that group `open: true` in the state map, leaving other groups' user-chosen state alone. *Acceptance:* collapse "Akademik", then click a breadcrumb into an academic route — sidebar now shows "Akademik" expanded with the active item highlighted. Independent.

- [ ] **T6 — Parent bottom-nav query-param whitelist.** `components/parent/bottom-nav.tsx:32`. Replace `searchParams.toString()` with an explicit construction that only carries `child` (if present). Unknown params dropped. *Acceptance:* navigating `/parent/invoices?child=c1&month=2026-04` then tapping "Rapor" tab lands on `/parent/reports?child=c1` (no `month`). Independent.

- [ ] **T7 — Sweep doc in-place resolution markers.** Edit `docs/reviews/2026-04-21-sweep.md` §7: append `✅ [cycle: 2026-04-21-nav-ia-hygiene]` next to each resolved finding (Majors 1–4, Minors 1–2, Nit 1). For Minor 3 (teacher/profile surface), append `✅ stale — header avatar already links to /teacher/profile` with the same cycle tag. Run after T1–T6 merge on the branch. *Acceptance:* grep for `✅ [cycle: 2026-04-21-nav-ia-hygiene]` in sweep doc returns 8 hits. No other sweep-doc section touched.

## Implementation

- Subagent plan: T1, T3 share `config/admin-nav.ts` → sequential. T1, T4 share `components/teacher/bottom-nav.tsx` → sequential. All tasks executed inline in declared order for safety.
- Task 1: Rename nav id + assessment labels — `config/admin-nav.ts` (id `learning`→`assessment`), `components/teacher/bottom-nav.tsx` (label `Nilai`→`Penilaian`), `app/teacher/assessments/page.tsx` (header `Nilai Siswa`→`Penilaian`), `e2e/teacher.spec.ts` (test name + selectors updated). Pure rename, no logic change.
- Task 2: Migrate admin assessment detail route — created `app/admin/assessments/[id]/page.tsx` (copy of scoring UI, reads id via `useParams()`); replaced `app/admin/assessments/scores/page.tsx` with server-side redirect to `/admin/assessments/${id}` (preserves bookmarks); updated two callers in `app/admin/assessments/page.tsx` to push to new path.

## Verification

- Task 1: gates passed — `npm run build` ✅, `npx vitest run` ✅ 18 files / 157 tests. No teacher-portal `"Nilai"`/`"Nilai Siswa"` strings remain (grep clean).
- Task 2: gates passed — build shows `/admin/assessments/[id]` + legacy `/admin/assessments/scores` routes both compiled; vitest 18/157 still green. Grep confirms no live callers of `assessments/scores?id=` remain (only the redirect page's own comment).

## Ship Notes

<!-- filled by /ship -->
