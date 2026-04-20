# Fix Admin Nav Active State + Breadcrumbs

## Context

Admin sidebar navigation had three bugs in `config/admin-nav.ts`:
1. Active state false highlight — sibling nav items sharing a path prefix caused wrong item to highlight
2. Breadcrumb wrong label — same prefix collision caused wrong breadcrumb text
3. Breadcrumb group label incorrectly linked — group label had href pointing to item page

All three stemmed from one root cause: iteration order didn't account for prefix collision between `/admin/assessments` and `/admin/assessments/templates`.

## Spec

### Acceptance criteria
- [x] On `/admin/assessments/templates`, only "Template" sidebar item highlights
- [x] On `/admin/assessments/scores`, only "Penilaian Siswa" sidebar item highlights
- [x] Breadcrumb on `/admin/assessments/scores` shows "Penilaian > Penilaian Siswa > Nilai"
- [x] Breadcrumb on `/admin/assessments/templates` shows "Penilaian > Template"
- [x] Breadcrumb group labels are non-linked
- [x] All other pages unchanged

## Tasks

1. Fix `getActiveGroup` — sort items by href length descending (longest prefix first)
2. Fix `getBreadcrumbs` — same sort, remove group href, add "scores" → "Nilai" label
3. Build + unit test gate
4. Playwright end-of-cycle gate

## Implementation

### Task 1+2: Fix nav matching in `config/admin-nav.ts`
- Added `[...group.items].sort((a, b) => b.href.length - a.href.length)` in both `getActiveGroup` and `getBreadcrumbs`
- Removed `href: item.href` from group label breadcrumb on exact match
- Added `else if (suffix === "scores") subLabel = "Nilai"` to sub-label map

### Files changed
- `config/admin-nav.ts` — 12 insertions, 4 deletions

## Verification

- `npm run build` — pass
- `npx vitest run` — 156/157 pass (1 pre-existing failure in `app/parent/invoices/__tests__/client.test.tsx`)
- `npx playwright test` — 22/27 pass (5 pre-existing failures in `e2e/admin-school-admin.spec.ts` — SCHOOL_ADMIN role restriction tests, same failures on main checkout)
- No new test failures introduced by this change

## Ship Notes

- No migrations, no env vars, no API changes
- Rollback: revert commit `371ce9f`
- Design spec: `docs/superpowers/specs/2026-04-21-admin-nav-bugs-design.md`
