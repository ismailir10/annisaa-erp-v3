# Admin Nav: Fix Dual-Highlight + IA Tidy-Up

## Context

On `/admin/assessments/templates` the admin sidebar highlighted BOTH "Template" and "Penilaian Siswa" (see user report 2026-04-21). Prior fix `#84` sorted `getActiveGroup` / `getBreadcrumbs` by href length but the sidebar component `NavMenuItems` still called `isItemActive` per-item, so when the parent href (`/admin/assessments`) is a prefix of a child (`/admin/assessments/templates`), both matched.

User also asked to review nav ordering + grouping — "Akademik" was bloated and out of funnel order; "Penilaian" group landed after "Keuangan" despite being an academic concern.

## Spec

### Acceptance criteria
- [x] On `/admin/assessments/templates`, only "Template Penilaian" highlights in sidebar
- [x] On `/admin/assessments/scores`, only "Penilaian Siswa" highlights
- [x] On `/admin/assessments`, only "Penilaian Siswa" highlights
- [x] Akademik sub-items follow student funnel order (Tahun Ajaran → Pendaftaran → Siswa → Wali Murid → Penempatan → Guru Pengajar → Kehadiran Siswa)
- [x] Group order: Dashboard → SDM → Akademik → Penilaian → Keuangan → Pengaturan
- [x] "Template" renamed to "Template Penilaian" (disambiguates in tooltip/collapsed state)

## Tasks

1. Add `getActiveItem(pathname, items)` helper — longest-href match wins
2. Update `components/admin/sidebar.tsx` `NavMenuItems` to use `getActiveItem` instead of per-item `isItemActive`
3. Reorder Akademik sub-items; move Penilaian group above Keuangan; rename Template
4. Unit tests covering prefix collision + IA ordering
5. Build + vitest gate

## Implementation

### Files changed
- [config/admin-nav.ts](config/admin-nav.ts) — added `getActiveItem`, reordered Akademik items, moved learning group above finance, renamed "Template" → "Template Penilaian"
- [components/admin/sidebar.tsx](components/admin/sidebar.tsx) — `NavMenuItems` resolves active via `getActiveItem` once per group
- [config/__tests__/admin-nav.test.ts](config/__tests__/admin-nav.test.ts) — new; 7 tests (4 prefix-collision, 3 IA ordering)

### Root cause
Sidebar rendered `isActive = isItemActive(pathname, item)` per item. `isItemActive` returns true for any prefix match, so two siblings could both be active. Fix lifts active resolution out of the per-item loop — compute the single best (longest-href) match for the group, then the per-item check becomes identity equality.

## Verification

- `npm run build` — pass
- `npx vitest run` — 164/164 pass (original 157 + 7 new nav tests)
- Preview server could not start in worktree (npm `uv_cwd` EPERM inside symlinked `.claude/worktrees/...`). Browser verification deferred to staging deploy; logic covered by unit tests asserting exact highlight behaviour on the three problem paths (`/admin/assessments`, `/admin/assessments/templates`, `/admin/assessments/scores`).

## Ship Notes

- No migrations, no env vars, no API changes
- Rollback: revert this commit
- Follow-up: once staging deploys, manually confirm on `/admin/assessments/templates` that only one sidebar item is highlighted
