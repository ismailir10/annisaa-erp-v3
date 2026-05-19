# Kelas list "Lihat" button + Penempatan UI retirement

## Context

Post-merge follow-up to cycle `2026-05-19-kelas-page` (PR #295). Two issues surfaced after the merge:

1. **UI inconsistency on `/admin/classes`.** The list page made the Nama column a hyperlink to the detail page — the project standard is a `Lihat` button rendered by `DataTableRowActions` (the `onView` prop already exists and shows an `Eye` icon + "Lihat" label). The hyperlink pattern is inconsistent with every other admin list page in this codebase.

2. **`/admin/enrollments` ("Penempatan") overlaps the new `/admin/classes/[id]` Siswa table.** Same anti-pattern the previous cycle retired for class-tracks + teaching-assignments: two write surfaces for `StudentEnrollment` (the global list page + the new per-class detail page). Per the brainstorm directive — single write surface — `/admin/enrollments` should be hard-cut, and the per-student lens lives at `/admin/students/[id]`.

## Spec

- [ ] **AC-1: List page Lihat button.** `app/admin/classes/client.tsx` Nama column renders plain text (no `<Link>`); the actions cell passes `onView={() => router.push('/admin/classes/' + id)}` to `DataTableRowActions`. `Link` import dropped; `useRouter` from `next/navigation` added.

- [ ] **AC-2: Hard-cut `/admin/enrollments` UI + API.** Delete `app/admin/enrollments/`, `app/api/enrollments/route.ts`, `app/api/enrollments/[id]/route.ts`, `app/api/enrollments/stats/route.ts`. Old URLs return 404.

- [ ] **AC-3: Nav slim + activity-feed repoint.** Remove `Penempatan` (`/admin/enrollments`) from `config/admin-nav.ts` `students` (Kesiswaan) group. Update `config/__tests__/admin-nav.test.ts` Kesiswaan-group assertion. `lib/dashboard/activity-feed.ts:39` repoint the `StudentEnrollment.create` activity-feed href from `/admin/enrollments` to `/admin/classes` (per-class detail is the new lens for enrollment records).

- [ ] **AC-4: Tests + counts.** Drop or update `app/api/__tests__/stats-groupby.test.ts` cases covering `GET /api/enrollments/stats`. Bump CLAUDE.md File Structure portal pages 40 → 39 admin, routes 166 → 163.

- [ ] **AC-5: Gates green + frontend-gate token.** `npm run build && npx vitest run` between every task; `+ npx playwright test e2e/admin-classes.spec.ts` end-of-cycle. Verification line includes `design-system` token (frontend-gate Rule 4).

### Non-goals

- Per-student-lens enrollment management — already exists at `/admin/students/[id]` and stays.
- Schema changes — pure code retirement.
- Bulk-enrollment tooling — would belong at a future placement-bulk page if/when needed.
- Touching `StudentEnrollment.status` semantics or `/api/admin/classes/[id]/enrollments` (the new write surface).

### Assumptions

1. The dashboard `StudentEnrollment.create` activity-feed entry is the only consumer in `lib/dashboard/activity-feed.ts`; repointing to `/admin/classes` (the list page) is acceptable UX — the user lands on a list they can drill into.
2. `GET /api/enrollments/stats` has no production consumer outside the page being deleted; its test cases in `stats-groupby.test.ts` can be removed without touching unrelated tests in that file.
3. The detail-page navigation is a client-side `router.push` (avoids full-page reload); the route is permission-gated server-side already.

## Tasks

- [x] **1. Cycle doc + branch setup.** Create cycle doc, ensure feat branch off origin/staging, hooks installed.
- [x] **2. List Lihat button.** Edit `app/admin/classes/client.tsx` per AC-1.
- [x] **3. Hard-cut Penempatan trees + nav + activity-feed.** `git rm` the UI + API trees per AC-2; edit nav + activity-feed + tests per AC-3.
- [x] **4. CLAUDE.md counts + admin-nav test.** Per AC-4.
- [ ] **5. Gate + ship.** Run gates per AC-5; commit; push; open PR; preview-verify; merge.

## Implementation

- Task 2 — Lihat button: `app/admin/classes/client.tsx` drops the `<Link>` import, adds `useRouter` from `next/navigation`, instantiates `const router = useRouter()`, swaps the Nama column cell from `<Link href={...}>` to `<span className="text-sm font-medium">{name}</span>`, and passes `onView={() => router.push("/admin/classes/" + id)}` to `DataTableRowActions`. The action component already renders the standard "Lihat" Button with the Eye icon when `onView` is set (see `components/ui/data-table-row-actions.tsx:14`, `:43-48`) — matches the existing pattern used by every other admin list page (e.g. `/admin/admissions`, `/admin/students`, `/admin/employees`). Cross-checked against `.claude/standards/design-system.html` §DataTable row actions.
- Task 3 — Hard-cut: `git rm -r app/admin/enrollments app/api/enrollments` removed the UI page + 3 API routes (`route.ts`, `[id]/route.ts`, `stats/route.ts`). `config/admin-nav.ts` `students` group items reduced to `[Pendaftaran, Siswa, Wali Murid]` (removed "Penempatan"). `config/__tests__/admin-nav.test.ts` Kesiswaan-group assertion rewritten to match — renamed the test name to reflect that enrollment now lives on `/admin/classes`. `lib/dashboard/activity-feed.ts:39` `StudentEnrollment.create` href repointed `/admin/enrollments` → `/admin/classes`. `app/api/__tests__/stats-groupby.test.ts` removed `describe("GET /api/enrollments/stats")` block (2 cases) + dropped `enrollmentGroupBy` mock + `studentEnrollment` Prisma mock entry.
- Task 4 — Counts: `CLAUDE.md` File Structure block bumped portal pages `40 / 14 / 8 → 39 / 14 / 8` (admin -1 for deleted enrollments page) and routes `166 → 163` (-3 for the 3 deleted API routes). Verified against disk via `find` after the deletions.

## Verification

- Task 2: `npm run build` exit 0 (`/admin/classes` route still emits cleanly post-edit); `npx vitest run` full suite 1859 passed / 0 failed; `npx playwright test e2e/admin-classes.spec.ts` 5 passed / 2 graceful-skipped (matches kelas-page baseline). Cross-check against `.claude/standards/design-system.html` §DataTable row actions confirms the row-actions pattern uses `Eye` + "Lihat" label — frontend-gate Rule 4 satisfied (token `design-system` present).
- Task 3: Same gates above. `config/__tests__/admin-nav.test.ts` rewritten test passes alongside the unchanged 22 other nav cases. `find app/admin/enrollments app/api/enrollments -type f` returns nothing — trees fully removed.
- Task 4: `find app/admin -name 'page.tsx' | wc -l` returns 39; `find app/api -name route.ts | wc -l` returns 163 — CLAUDE.md matches disk.

## Ship Notes

### Migrations
None.

### Env vars
None.

### Breaking URL changes (hard cut — no redirects)
- `/admin/enrollments` (UI) → 404
- `GET/POST /api/enrollments` → 404
- `PATCH/DELETE /api/enrollments/[id]` → 404
- `GET /api/enrollments/stats` → 404

Per-class enrollment management is at `/admin/classes/[id]` Siswa tab (single write surface). Per-student lens stays at `/admin/students/[id]`. Activity-feed `StudentEnrollment.create` link repointed to `/admin/classes`.

### Manual smoke
- `/admin/classes`: row has Lihat button + dropdown menu (Edit, Nonaktifkan); clicking Lihat navigates to `/admin/classes/[id]` via client-side push.
- `/admin/enrollments`: 404.
- Sidebar `Kesiswaan` group: items reduced to Pendaftaran + Siswa + Wali Murid (no Penempatan).

### Rollback
- Revert merge commit. No DB change.
