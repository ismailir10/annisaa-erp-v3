# Curriculum C6 — Parent Perkembangan Rollup

## Context

Pack 1 / Cycle 6 of the 11-cycle Curriculum + Penilaian + Raport initiative. C4 (PR #276) shipped the `AssessmentEntry` table + walas weekly UI; C5 (PR #277) shipped the sentra (CENTER) UI. C6 closes the parent-visibility loop: GUARDIAN sees their child's progress per `CurriculumElement` (count of `CONSISTENT` / `EMERGING` / `NEEDS_REINFORCEMENT` rows) over the active semester, plus a "latest pekan" preview block on the parent home greeting card. Required so families have something to look at against the indicators walas + sentra teachers are now recording.

Per design [docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md](docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md) §2.4 + §3.2 + §5.3. Per CTO directive (carried from C4/C5): English everywhere for code identifiers; Indonesian only in user-facing UI copy + DB content.

**Term substitution:** design §2.4 says "for the term" but the `Term` model lands in C8. C6 aggregates over the **active Semester** instead — the rollup is the same shape, only the date bracket differs. Flip to Term in C8 with no UI change.

## Spec

### Acceptance criteria

- [ ] `assessments.read` permission added to GUARDIAN default. Scope is enforced at the route layer: GUARDIAN may only read entries for students linked to their Parent via `StudentGuardian`.
- [ ] `lib/parent-helpers.ts` gains `getParentChildById(session, studentId)` — returns the matching `ParentChild` row or null. Reuses existing `getParentWithChildren(session)` cache.
- [ ] `lib/curriculum/perkembangan-loader.ts` exports `loadStudentPerkembangan(tenantId, studentId)` — loads active Semester, all `AssessmentEntry` rows for the student in semester window, groups by `LearningObjective.element` × `level`, returns counts + latest 3 entries per child for the home preview.
- [ ] `GET /api/parent/perkembangan/[studentId]` — auth → GUARDIAN → resolve child via `getParentChildById` (404 on mismatch — never echo "wrong parent") → `loadStudentPerkembangan` → JSON.
- [ ] `/parent/perkembangan` list page — multi-kid households see a card per child linking to `/parent/perkembangan/[studentId]`. Single-kid households auto-redirect to that child.
- [ ] `/parent/perkembangan/[studentId]` page — mobile-first. Header (child name + class). 5-row element progress block (Nilai Agama / Jati Diri / STEAM / Motorik / Seni) — each row shows level counts as a 3-segment bar + numeric. "Pekan ini" preview block listing latest 3 indicator entries this week (indicator content + level chip).
- [ ] Parent home (`app/parent/page.tsx`) gains "Perkembangan minggu ini" card visible per kid (top 3 indicators with level for the active week, links to `/parent/perkembangan/[studentId]`).
- [ ] `components/parent/bottom-nav.tsx` gains a "Perkembangan" entry routing to `/parent/perkembangan`.
- [ ] Playwright spec `e2e/parent-perkembangan.spec.ts` — GUARDIAN demo user lands on `/parent/perkembangan` → list of children visible OR auto-redirect to single child → element rows visible.
- [ ] Vitest cases (~25): `getParentChildById` (4), `loadStudentPerkembangan` (8), GET route (~8), helper math (~5).
- [ ] design-system.html §portal-shells + §dashboard cross-checked.
- [ ] `npm run build && npx vitest run && npx playwright test` green; `/audit-docs` clean; preview-verify clean.

### Non-goals

- Term model (deferred to C8).
- Per-week timeline UI (just "this pekan" + total).
- PDF / docx download (raport, deferred to C11).
- Parent comment / e-sign (raport workflow, deferred to C11).
- Sentra-vs-walas split in the UI — both feed the same per-element count.
- Schema changes (zero migration).
- New permission keys beyond granting existing `assessments.read` to GUARDIAN.

### Assumptions

1. Active `Semester.status = "ACTIVE"` per tenant is the right window. If multiple ACTIVE semesters exist (data error), the loader picks the most recent `startDate`.
2. `getParentWithChildren(session)` already correctly tenant-scopes (closed via cycle 2026-05-10-phase0-finance-backlog-drain.md). C6 reuses it; no new auth surface to harden.
3. Latest-pekan preview reuses `getCurrentWeek(tenantId, today)` from C4. Falls back to "Belum ada Pekan aktif" empty state when null — same copy walas weekly page uses.
4. Counts include both HOMEROOM + CENTER source rows (both feed parent visibility per design §2.4).
5. Multi-kid household is rare but real. Single-kid auto-redirect per design §5.3.
6. `Student.assessmentEntries` relation is the canonical query path (added in C4).

→ Correct any of these now or `/build` will proceed with them.

## Tasks

- [ ] **T1 — `assessments.read` for GUARDIAN + child-scope helper** *(independent, foundational)*
  - [lib/permissions.ts](lib/permissions.ts): add `assessments.read` to `getSystemRolePermissions("GUARDIAN")`. Existing permissions test updated.
  - [lib/parent-helpers.ts](lib/parent-helpers.ts): export `getParentChildById(session, studentId): Promise<ParentChild | null>` — thin wrapper over `getParentWithChildren` that returns the child whose `studentId` matches, or null. The 404 path keeps the message neutral (no "this isn't your child" leak).
  - **Acceptance:** ~6 vitest cases (perm grant + 4 helper paths + null path).

- [ ] **T2 — Perkembangan loader + GET route** *(depends T1)*
  - [lib/curriculum/perkembangan-loader.ts](lib/curriculum/perkembangan-loader.ts): `loadStudentPerkembangan(tenantId, studentId)` — finds active Semester, fetches all `AssessmentEntry` rows for student via `indicator.objective.semesterId === semester.id` (so we naturally clip to the active semester window without joining on date), groups by element × level, optionally fetches "this pekan" entries for the preview. Returns:
    ```ts
    {
      semester: { id, number, academicYear: { name } } | null,
      elements: Array<{ element: CurriculumElement, counts: { CONSISTENT, EMERGING, NEEDS_REINFORCEMENT, total } }>,
      latestThisWeek: Array<{ indicatorContent, element, level, date, source, center? }>,
      hasActiveWeek: boolean,
    }
    ```
  - [app/api/parent/perkembangan/[studentId]/route.ts](app/api/parent/perkembangan/[studentId]/route.ts): auth → GUARDIAN gate → `getParentChildById` (404 on null) → `loadStudentPerkembangan` → JSON.
  - **Acceptance:** ~12 vitest cases — loader (active semester missing, no entries, mixed sources, 5-element fan-out, this-pekan filter) + route (401, 403 non-GUARDIAN, 404 wrong child, 200 happy with shape echo).

- [ ] **T3 — `/parent/perkembangan` pages** *(depends T2)*
  - [app/parent/perkembangan/page.tsx](app/parent/perkembangan/page.tsx) — server component. List children. Single-kid → `redirect("/parent/perkembangan/<id>")`. Multi-kid → card grid linking each.
  - [app/parent/perkembangan/[studentId]/page.tsx](app/parent/perkembangan/[studentId]/page.tsx) — server component. Calls `loadStudentPerkembangan` directly (DRY with the GET route via the loader). Renders header + 5-element progress block + "Pekan ini" preview list.
  - New [components/parent/element-progress-row.tsx](components/parent/element-progress-row.tsx) — pure presentational. 3-segment bar (`bg-status-present` / `bg-status-late` / `bg-status-absent`) sized by ratio, plus numeric "12 Mampu · 4 Belum · 1 Perlu". Indonesian element labels via a small map (`formatCurriculumElement` to add to `lib/format.ts`).
  - **Acceptance:** mounts via Playwright; design-system.html §dashboard cross-check.

- [ ] **T4 — Parent home preview card** *(depends T2)*
  - [app/parent/page.tsx](app/parent/page.tsx) — server-side: load each child's "Pekan ini" preview (top 3 entries) via the loader (cached). Pass to `ParentHome`/`HouseholdOverview` for render.
  - The card per kid is hidden when no entries exist this week (no empty-state spam on quiet days). Each card links to `/parent/perkembangan/<id>`.
  - **Acceptance:** snapshot via Playwright + design-system.html §parent-home cross-check.

- [ ] **T5 — Bottom-nav + Playwright e2e** *(depends T3 + T4)*
  - [components/parent/bottom-nav.tsx](components/parent/bottom-nav.tsx): add "Perkembangan" entry between "Beranda" and "Kehadiran". Icon: `LineChart`.
  - New [e2e/parent-perkembangan.spec.ts](e2e/parent-perkembangan.spec.ts) — GUARDIAN demo user → `/parent/perkembangan` → list-or-redirect → element rows visible. Reuses the demo cookie pattern from `e2e/parent.spec.ts`.
  - **Acceptance:** spec passes against `DEMO_MODE=true npm run start`.

## Implementation

- **T1 — GUARDIAN `assessments.read` + `getParentChildById` helper** *(commit `feat(curriculum): C6 T1 — GUARDIAN assessments.read + getParentChildById`)*
  - [lib/permissions.ts](lib/permissions.ts): added `assessments.read` to `getSystemRolePermissions("GUARDIAN")` default array. Permissions test updated + 2 new defensive cases (asserts read, asserts NOT write).
  - [lib/parent-helpers.ts](lib/parent-helpers.ts): exported `getParentChildById(session, studentId)` — thin wrapper over `getParentWithChildren` (60-s cache reused). Returns null when studentId is empty / bogus / belongs to another family / parent has no children. The flat-null contract keeps the route's 404 from leaking studentId existence.
  - 5 new vitest cases for the helper (happy lookup, wrong-family null, no-children null, empty studentId short-circuit, no-tenant short-circuit) + 3 updated for the GUARDIAN permission set. 1479 vitest pass.

- **T2 — perkembangan loader + GET route** *(commit `feat(curriculum): C6 T2 — perkembangan loader + GET route`)*
  - [lib/curriculum/perkembangan-loader.ts](lib/curriculum/perkembangan-loader.ts): `loadStudentPerkembangan(tenantId, studentId)` resolves active Semester (newest `startDate` if multiple ACTIVE) → fetches all `AssessmentEntry` rows where `indicator.objective.semesterId = semester.id` → groups by `element × level` via pure `aggregateByElement()` helper → fetches latest 3 entries this week (via `getCurrentWeek(today)`) for preview. Returns `{ semester, elements (5 fixed), latestThisWeek (≤3), hasActiveWeek }`. Term substitution documented inline (Term model is C8).
  - [app/api/parent/perkembangan/[studentId]/route.ts](app/api/parent/perkembangan/[studentId]/route.ts): `requirePermission("assessments.read")` → GUARDIAN gate → `getParentChildById` (flat 404 with neutral "Anak tidak ditemukan." copy) → loader → JSON `{ child, semester, elements, latestThisWeek, hasActiveWeek }`.
  - 14 new vitest cases: 3 for `aggregateByElement` (empty, counts, unknown-element drop), 4 for `loadStudentPerkembangan` (no semester, semester-scoped findMany, week preview, no-week empty), 7 for the route (401, 403 non-GUARDIAN, 403 missing perm, 404 wrong-child, 404 neutral message, 200 happy, 200 no-week).
  - 1493 vitest pass total. RLS coverage unchanged (no new tenant-scoped models).

- **T3 — Perkembangan list + detail pages** *(commit `feat(curriculum): C6 T3 — perkembangan list + detail pages`)*
  - [lib/format.ts](lib/format.ts): added `formatCurriculumElement(element)` Indonesian map (Nilai Agama & Budi Pekerti / Jati Diri / STEAM / Literasi / Motorik / Seni) + `CurriculumElementKey` type. Same fallback pattern as `formatLearningCenter`.
  - [components/parent/element-progress-row.tsx](components/parent/element-progress-row.tsx): pure server component. 3-segment proportional bar (`bg-status-{present,late,absent}` per [.claude/standards/colors.md](.claude/standards/colors.md)) + numeric "N Mampu · N Belum · N Perlu". Empty-row branch shows "Belum ada catatan untuk semester ini." instead of a misleading bar.
  - [app/parent/perkembangan/page.tsx](app/parent/perkembangan/page.tsx): server component. Lists `getParentWithChildren`. Single-kid → auto-redirect to detail page. Multi-kid → card grid linking to each.
  - [app/parent/perkembangan/[studentId]/page.tsx](app/parent/perkembangan/[studentId]/page.tsx): server component. Calls `getParentChildById` → `notFound()` on null. Calls `loadStudentPerkembangan` directly (DRY with the API route via the loader). Renders header (child name + class) + "Capaian per elemen" 5-row block + "Pekan ini" preview list with level chip + element label + center label (when CENTER source).
  - Cross-checked design-system.html §portal-shells + §dashboard.
  - Build clean. 1493 vitest pass (no behavior tests for pages — Playwright covers in T5).

- **T4 — Parent home "Perkembangan minggu ini" card** *(commit `feat(curriculum): C6 T4 — home perkembangan-minggu-ini card`)*
  - [app/parent/page.tsx](app/parent/page.tsx): extended the existing `Promise.all` to fan out `loadStudentPerkembangan` per kid (bounded by `kidIds.length`). Added a `Perkembangan minggu ini` section between "Anak Anda" and "Tagihan" that surfaces a card per kid showing up to 3 latest-week entries (element label + indicator content + level chip + sentra name if CENTER). Section is hidden entirely when no kid has entries this week, so the home stays calm on quiet days.
  - Each card links to `/parent/perkembangan/[studentId]`.
  - Build clean. 1493 vitest pass.

- **T5 — Bottom-nav + Playwright e2e** *(commit `feat(curriculum): C6 T5 — bottom-nav Capaian entry + parent perkembangan e2e`)*
  - [components/parent/bottom-nav.tsx](components/parent/bottom-nav.tsx): added "Capaian" tab routing to `/parent/perkembangan` between "Beranda" and "Kehadiran". Short label "Capaian" (not "Perkembangan") chosen to fit the 6-tab bottom nav at mobile widths; URL slug + page title stay "Perkembangan" so the surface name matches the design spec + the in-page header text "Capaian per elemen". Documented inline.
  - New [e2e/parent-perkembangan.spec.ts](e2e/parent-perkembangan.spec.ts) — 5 chromium tests via the GUARDIAN demo cookie:
    1. Bottom-nav exposes the Capaian link pointing to `/parent/perkembangan`.
    2. `/parent/perkembangan` resolves (list OR auto-redirected detail).
    3. Detail page renders 5 element rows.
    4. `GET /api/parent/perkembangan/[studentId]` returns the design-locked payload shape end-to-end.
    5. `GET /api/parent/perkembangan/[studentId]` returns 404 with neutral copy for a wrong-child id.
  - 5/5 pass locally. Full Playwright suite: 108 passed, 2 pre-existing failures carried (admin-tagihan + curriculum-admin AY-name drift), 1 flaky (sibling-detect).

## Verification

- **End-of-cycle gates:**
  - `npm run build` ✓ clean
  - `npx vitest run` ✓ 1493/1535 (42 pre-existing todos)
  - `DEMO_MODE=true npx playwright test` — 108 passed / 9 skipped / 1 flaky / **2 pre-existing failures** carried from C4+C5 (curriculum-admin AY-name drift + admin-tagihan flow). Both unrelated to C6.
  - `e2e/parent-perkembangan.spec.ts` (new) — 5/5 pass.
- **RLS:** `bash scripts/verify-rls-coverage.sh` ✓ 32/32 (no new tenant-scoped models).
- **API auth:** `bash scripts/verify-api-auth.sh` ✓ 154/154 (1 new route added).
- **Cross-checked design-system.html** §portal-shells + §dashboard for the 5-row element block + "Pekan ini" preview list + parent-home card.
- **Manual smoke:** preview-verify against staging Vercel after PR merge — Chrome MCP using `ismailir10@gmail.com` Google SSO (per CTO authorization).
- **Follow-ups (post-merge):**
  - C8 — Term model + flip the perkembangan loader from "active Semester" to "active Term". Also hoist the per-loader semester lookup out of the per-student fan-out (today's home renders `N × 1` redundant `Semester.findFirst` reads for an N-kid household; not a bug, but easy cleanup once Term lands).
  - Schema column on `ClassSection.ageGroup` (carried from C4).
  - Refresh `e2e/curriculum-admin.spec.ts:38` AY-name assertion (carried from C4).
  - Investigate `e2e/admin.spec.ts:432` demo-DB pollution (carried from C4).
- **Code review pass (feature-dev:code-reviewer):** 1 fix landed pre-ship — progress bar in `components/parent/element-progress-row.tsx` gained `role="img"` + Indonesian `aria-label` summarising the level counts so screen-reader users hear the same data sighted users see. Semester-fan-out N+1 deferred to C8. Naming split (Capaian tab / Perkembangan page) accepted as documented.
- **CI typecheck fix:** stale `@ts-expect-error` in `lib/__tests__/parent-helpers.get-child-by-id.test.ts` mock literal failed `tsc --noEmit` on CI (TS2578 unused directive). Removed the directive + added the required `customRoleCode: null` field so the mock matches `SessionUser` exactly.

## Ship Notes

- **Migration:** none — entirely on top of C4's `AssessmentEntry`.
- **Env vars:** none.
- **New permissions:** `assessments.read` granted to GUARDIAN default (route layer enforces per-child scope via `getParentChildById`).
- **New routes:**
  - `GET /api/parent/perkembangan/[studentId]` — payload `{ child, semester, elements, latestThisWeek, hasActiveWeek }`.
  - `/parent/perkembangan` — list page with single-kid auto-redirect.
  - `/parent/perkembangan/[studentId]` — detail page with 5-element rollup + Pekan-ini preview.
  - Parent home gains "Perkembangan minggu ini" card section per kid.
  - Parent bottom-nav gains "Capaian" tab.
- **Manual smoke recipe (post-deploy):**
  - Login as a GUARDIAN whose linked child has at least one `AssessmentEntry` row in the active Semester.
  - `/parent` → "Perkembangan minggu ini" section visible (only if entries exist this week).
  - `/parent/perkembangan` → either child list OR auto-redirect to detail.
  - `/parent/perkembangan/<studentId>` → 5-row element bars + Pekan-ini preview.
  - `/parent/perkembangan/stu-not-mine` → "Anak tidak ditemukan." (404, no leak).
- **Rollback:** revert PR. No DB changes to undo.
- **Follow-up cycles:**
  - **C7** — TA 26/27 SMT 1 PROMES seed + ClassSection audit.
  - **C8** — Raport schema + admin (introduces `Term` model; the perkembangan loader flips from "active Semester" to "active Term" with no UI change).
  - **C11** — Raport PDF + docx + parent sign workflow (replaces the legacy `/parent/reports` AssessmentTemplate readout).
