# Admin Assessment Route Consolidation

## Context

The admin "Penilaian" area has accumulated **four** pages across two uncoordinated cycles, with two of them doing the same job:

| URL | File | Origin | What it actually renders |
|---|---|---|---|
| `/admin/assessment-templates` | `app/admin/assessment-templates/page.tsx` (447 lines) | [a0afd5c](commit) — cycle `2026-04-16-learning-crud-completion` | **AssessmentTemplate list** — server pagination, status filter, stat cards, basic create (name+program+type, no categories) |
| `/admin/assessments/templates` | `app/admin/assessments/templates/page.tsx` (409 lines) | PR #71 — cycle `2026-04-16-crud-completion-sweep` | **AssessmentTemplate list** — client-side filter, no status filter, richer create (name+program+type + **nested categories + indicators**) |
| `/admin/assessments` | `app/admin/assessments/page.tsx` (231 lines) | PR #71 | **StudentAssessment list** (not templates) — paginated, status + template filters, links into `/admin/assessments/scores?id=X` |
| `/admin/assessments/scores` | `app/admin/assessments/scores/page.tsx` | PR #71 | Per-assessment scoring UI (BB/MB/BSH/BSB) |

Both template pages hit the **same** API surface (`GET/POST /api/assessments/templates`, `PUT /api/assessments/templates/[id]`) — the duplication is purely UI.

`config/admin-nav.ts` lists all three user-facing entries, in **two different groups**:

```ts
// L76 — "Akademik" group
{ label: "Template Penilaian", href: "/admin/assessment-templates", icon: ClipboardList },

// L93-L94 — "Penilaian" group
{ label: "Template",         href: "/admin/assessments/templates", icon: ClipboardList },
{ label: "Penilaian Siswa",  href: "/admin/assessments",           icon: ClipboardList },
```

A school admin lands on whichever link they click first and sees different features depending on the entry point — wrong answer.

No matching flat API tree exists: `app/api/assessment-templates/` is **not** present on staging. Nothing becomes dead after the UI delete.

### Canonical pick — **`/admin/assessments/*` (nested) wins.** The flat tree is deleted.

Reasoning:
1. **Composition.** `/admin/assessments` (student list) and `/admin/assessments/scores` (scoring) are already nested. Putting templates at a parallel flat URL fractures the tree. The three pages that a user flows through (list → scores → template reference) should share a URL root.
2. **Feature parity at the create step.** The nested page's create dialog defines **categories + indicators inline**. The flat page's create dialog only captures name/program/type — it creates a structurally empty template with no inline way to add categories (and no detail-page edit route exists for the flat tree). Users of the flat page can't actually finish the template.
3. **Nav layout.** Two of the three nav items are already in the "Penilaian" group. The flat page's "Akademik → Template Penilaian" entry is the odd one out.
4. **Recency.** PR #71 (`2026-04-16-crud-completion-sweep`) landed at the nested path *after* the flat page (`2026-04-16-learning-crud-completion`). The later author rebuilt this at the nested path — the intent was clearly to replace.

### Behavior only in the flat page — must be merged into nested before delete

Otherwise we regress the page that survives:

- **Server-side pagination** (`?page=&pageSize=&search=&isActive=`). Nested uses `useMemo(() => data.filter())` on the full list. Fine at 20 templates; breaks at 500+.
- **Status filter in `DataTableToolbar`** (`all` / `true` / `false`).
- **Status-bucketed stat cards** — three parallel `/api/assessments/templates?pageSize=1&isActive=...` count requests so the `Aktif` / `Tidak Aktif` counts are accurate across pages, not just the visible page.

The `TYPE_LABELS` for `QUARTERLY` also differ (flat: `"Triwulan"`, nested: `"Kuartal"`). Nested wins — `"Kuartal"` matches the create/edit dropdown.

## Spec

### Acceptance criteria

- [ ] Exactly **one** admin template list page lives at `/admin/assessments/templates`.
- [ ] Exactly **one** admin scoring page lives at `/admin/assessments/scores` (unchanged).
- [ ] `/admin/assessments` remains the **student-assessment list** (unchanged — note it is *not* a hub page, just a list; we are not redesigning it here).
- [ ] The surviving `/admin/assessments/templates` page has **server pagination, status filter, and status-bucketed stat cards** merged in from the deleted flat page.
- [ ] `config/admin-nav.ts` loses the duplicate `/admin/assessment-templates` entry. Only the `/admin/assessments/templates` and `/admin/assessments` entries remain, both in the "Penilaian" group.
- [ ] `/admin/assessment-templates` returns **HTTP 308** (Next.js `permanent: true`) to `/admin/assessments/templates`. Same for any hypothetical children (`/admin/assessment-templates/anything` → `/admin/assessments/templates/anything`).
- [ ] `e2e/admin.spec.ts` has a smoke test: hit `/admin/assessment-templates`, follow redirect, assert landing on `/admin/assessments/templates` and that the page renders the Template Penilaian header + DataTable.
- [ ] `npm run build && npx vitest run && npx playwright test` all green.
- [ ] README.md updated if it mentions the flat path (grep says it doesn't — spot-check during build).

### Non-goals

- Redesigning the admin Penilaian UI. This is consolidation, not UX overhaul.
- Touching the teacher Nilai portal (PR #76) or `/api/assessments/student*` endpoints (teacher-scoped, not admin).
- Anything on the `feat/crud-phase-cde` branch — that's a separate cycle.
- Renaming `/admin/assessments` into a "hub" landing page. Currently it's the student-assessment list, and keeping it that way is inside the acceptance criteria.
- Removing or renaming API routes. `/api/assessments/templates/*` and `/api/assessments/students` stay as-is; nothing is dead after the UI delete.

### Assumptions surfaced for user confirmation

1. **Canonical = nested (`/admin/assessments/templates`).** The flat `/admin/assessment-templates` is deleted. **Confirm before `/build` runs** — this is reversible only by a future cycle.
2. **`/admin/assessments` stays as the student-assessment list.** The user called it "the hub/index" but it's actually a DataTable of StudentAssessment rows. No change to its behavior in this cycle.
3. **Redirect status is Next.js `permanent: true` (HTTP 308, not 301).** Next.js canonicalizes permanent redirects on 308. Browsers and bookmarks treat this identically to 301. If the user specifically wants 301, we'd use middleware instead, but 308 is the idiomatic answer and preserves request method on the off-chance.
4. **Nav loses the "Akademik → Template Penilaian" entry outright** rather than turning it into a cross-group alias. Aliasing across groups would confuse the active-group highlight logic in `isItemActive()`.
5. **Label on the surviving nav entry stays "Template"** (under the "Penilaian" group). If "Template Penilaian" is preferred, trivial to change — flagging because the flat entry used the longer label.
6. **Create-dialog categories/indicators UI is kept as-is** from the nested page. Not re-designed. If it has bugs, they survive — this is a consolidation cycle, not a feature pass.

## Tasks

Ordered atomic slices. Each commits independently and must pass `npm run build && npx vitest run` before the next starts. Per user request: **use the `superpowers:subagent-driven-development` skill during `/build` for the independent-feel tasks (T1, T3, T5 are genuinely independent once T2 lands).**

### T1 — Merge server pagination, status filter, stat-card buckets into `/admin/assessments/templates`

**Files:**
- `app/admin/assessments/templates/page.tsx` (rewrite fetch + toolbar + stat-card section)

**What:**
- Replace client `useMemo(() => data.filter(...))` with server-side `?page=&pageSize=&search=&isActive=`.
- Add `Pagination` state the same shape as the flat page used.
- Add the status filter (`all` / `true` / `false`) to `DataTableToolbar.filters`.
- Replace the three derived stat counts with three parallel count requests (same pattern as the flat page).
- Keep the nested categories/indicators create dialog. Do not touch it.
- Keep `TYPE_LABELS.QUARTERLY = "Kuartal"`.

**Gate:** `npm run build && npx vitest run` + manual: navigate to `/admin/assessments/templates`, verify pagination, search, status filter all work.

### T2 — Delete flat tree and remove duplicate nav entry

**Files:**
- DELETE: `app/admin/assessment-templates/page.tsx` (447 lines)
- `config/admin-nav.ts` — remove L76 (`{ label: "Template Penilaian", href: "/admin/assessment-templates", ... }`)

**What:** straight delete + nav prune. Nothing else references the flat path (grep-verified: only `config/admin-nav.ts` and the cycle doc `2026-04-16-learning-crud-completion.md` do — the cycle doc is historical and stays).

**Gate:** `npm run build` must pass. Zero type errors. `/admin/assessment-templates` now 404s in dev — fixed in T3.

### T3 — Add permanent redirect

**Files:**
- `next.config.mjs` (or `.ts` — check which is in use) — add `redirects()` entry.

**What:**
```js
async redirects() {
  return [
    { source: '/admin/assessment-templates',          destination: '/admin/assessments/templates', permanent: true },
    { source: '/admin/assessment-templates/:path*',   destination: '/admin/assessments/templates/:path*', permanent: true },
  ];
}
```

If `next.config.mjs` already has a `redirects()` function, merge into it.

**Gate:** `npm run build`, then `npm run start` and `curl -I http://localhost:3000/admin/assessment-templates` — expect `308` with `Location: /admin/assessments/templates`.

### T4 — e2e smoke test

**Files:**
- `e2e/admin.spec.ts` — add one test.

**What:**
```ts
test('deleted flat assessment-templates URL redirects to nested', async ({ page }) => {
  await page.goto('/admin/assessment-templates');
  await expect(page).toHaveURL('/admin/assessments/templates');
  await expect(page.getByRole('heading', { name: /Template Penilaian/i })).toBeVisible();
});
```

**Gate:** `npx playwright test e2e/admin.spec.ts` green (production build required — see CLAUDE.md).

### T5 — README touch-up + final gate

**Files:**
- `README.md` — only if any line points at `/admin/assessment-templates`. Current grep says it doesn't. Still, spot-check during this task.
- `docs/cycles/2026-04-20-admin-assessment-route-consolidation.md` — fill `Implementation` and `Verification` sections.

**Gate (end-of-cycle):** `npm run build && npx vitest run && npx playwright test` — all green.

## Implementation

### T1 — Merge server pagination + status filter + stat-card buckets into nested templates page

**Files:** `app/admin/assessments/templates/page.tsx`

Replaced client `useMemo(() => data.filter(...))` with server-side pagination (`?page=&pageSize=&search=&isActive=`). Added `pagination` state, `isActiveFilter` state, `stats` state. Added three parallel count fetches in `fetchStats` (`?pageSize=1` with/without `isActive` params) so stat cards stay accurate across pages. Added status filter to `DataTableToolbar.filters` with all/active/inactive options. Dropped dead `Skeleton` import, added `Power` / `PowerOff` lucide icons for stat cards. Kept `TYPE_LABELS.QUARTERLY = "Kuartal"` (did not regress to flat's "Triwulan"). Did not touch the nested categories/indicators create dialog — that UI is the whole reason nested was canonical. After create/edit/toggle mutations, `refreshAll()` now re-fetches both list and stats.

### T2 — Delete flat tree and remove duplicate nav entry

**Files:** DELETE `app/admin/assessment-templates/page.tsx` (447 lines), modify `config/admin-nav.ts`.

Removed the `{ label: "Template Penilaian", href: "/admin/assessment-templates", ... }` line from the Akademik group (L76). The two Penilaian-group entries (`/admin/assessments/templates` and `/admin/assessments`) are untouched. Grep-verified before delete: only `config/admin-nav.ts` and the historical cycle doc `2026-04-16-learning-crud-completion.md` referenced the flat path — the cycle doc is history and stays.

## Verification

<!-- Filled by /build after end-of-cycle gate -->

## Ship Notes

<!-- Filled by /ship -->

- Migrations: none.
- New env vars: none.
- Rollback plan: revert the PR. The deleted `app/admin/assessment-templates/page.tsx` comes back, the nav duplicate comes back, the redirect goes away. No data model touched.
- External callers of `/admin/assessment-templates`: none known. The redirect covers bookmarks and stale tabs anyway.
