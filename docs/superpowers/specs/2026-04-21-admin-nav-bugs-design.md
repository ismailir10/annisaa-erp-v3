# Fix Admin Nav Active State + Breadcrumbs

## Context

Admin sidebar navigation has three bugs in `config/admin-nav.ts`:

1. **Active state false highlight** — `/admin/assessments` matches `/admin/assessments/templates` and `/admin/assessments/scores` via `pathname.startsWith(item.href + "/")`. Two sibling nav items share a prefix; the shorter one falsely highlights on the longer one's page.
2. **Breadcrumb wrong label** — `getBreadcrumbs` returns on first match. For `/admin/assessments/scores`, it matches "Penilaian Siswa" (`/admin/assessments`) instead of the correct parent, and shows "Detail" instead of "Nilai".
3. **Breadcrumb group label linked** — On exact match, breadcrumb group label gets `href: item.href`. Clicking the group label navigates to the item page instead of being a non-linked section header.

All three bugs stem from one root cause: prefix collision when nav items share a path prefix.

## Spec

### Acceptance criteria

- [ ] On `/admin/assessments/templates`, only "Template" sidebar item highlights (not "Penilaian Siswa")
- [ ] On `/admin/assessments/scores`, only "Penilaian Siswa" sidebar item highlights
- [ ] Breadcrumb on `/admin/assessments/scores` shows "Penilaian > Penilaian Siswa > Nilai"
- [ ] Breadcrumb on `/admin/assessments/templates` shows "Penilaian > Template"
- [ ] Breadcrumb group labels are non-linked (no `href`)
- [ ] All other pages unchanged in behavior

### Scope

Single file: `config/admin-nav.ts`. No component changes.

## Tasks

1. Fix `isItemActive` / iteration order — sort items by href length descending in `getActiveGroup` and `getBreadcrumbs` to prefer longest-prefix match
2. Fix `getBreadcrumbs` — remove href from group label, add "scores" → "Nilai" to sub-label map
3. Run between-task gate: `npm run build && npx vitest run`
4. Run end-of-cycle gate: `npm run build && npx vitest run && npx playwright test`

## Implementation

(To be filled during `/build`)

## Verification

(To be filled during `/build`)

## Ship Notes

(To be filled during `/ship`)
