# Curriculum C5 — Sentra (Center) Daily Assessment UI

## Context

Pack 1 / Cycle 5 of the 11-cycle Curriculum + Penilaian + Raport initiative. C4 shipped (PR #276) the `AssessmentEntry` table + walas weekly UI; C5 reuses the same table with `source = CENTER` for sentra (learning center) teachers' daily assessments. Required so the 8 sentra rooms (Ibadah, Bahan Alam, Seni, Memasak, Main Peran, Balok, Persiapan, AREA) all feed the same per-student progress data that walas + raport read.

Per design [docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md](docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md) §4.2 (LearningCenter enum already shipped in C4) + §5.2 + §5.4. Per CTO directive (carried from C4): English everywhere for code identifiers; Indonesian only in user-facing UI copy + DB content.

Per CTO Cycle B decision: any TEACHER in the tenant may write sentra entries (`source = CENTER`); no center-assignment gate at the API level (sentra rotation is deferred). Soft trust + audit trail.

Approved plan at [/Users/ismailrabbanii/.claude/plans/glowing-mapping-crane.md](/Users/ismailrabbanii/.claude/plans/glowing-mapping-crane.md).

## Spec

### Acceptance criteria

- [ ] `assessmentEntryCenterSessionSchema` Zod schema added to [lib/validations/assessment-entry.ts](lib/validations/assessment-entry.ts): `{ center: LearningCenter, date, activity (string, 1-200 chars), entries: [{ studentId, indicatorId, level, note? }] (max 80) }`. Empty `entries` array allowed for "no one assessed today".
- [ ] `POST /api/teacher/assessment-entries/center` — single-session bulk upsert. Auth via existing `assessments.write`. Resolves `weekId` via `getCurrentWeek` (422 if no active week). Validates student-in-tenant + indicator-in-tenant. Upserts each entry with `source: CENTER`, the shared `center` + `activity`, and the resolved `weekId`. Audits a single `CENTER_SESSION` row with `{ center, date, count }`.
- [ ] `GET /api/teacher/assessment-entries/center/[center]` — query params `date` (Jakarta-tz ISO, default today), `ageGroup` (`A` | `B`, required). Returns `{ week, center, date, ageGroup, students, indicators, entries, lastActivity? }`. ageGroup-filtered roster.
- [ ] `/teacher/assessments/center/[center]` mobile UI: header (Indonesian center name) + date picker (default today) + ageGroup A/B toggle + activity text input → roster × picked-indicators grid (≤4 selectable indicators from theme list, then per-cell 3-button level + collapsible note). Single "Simpan" button POSTs the full session.
- [ ] `formatLearningCenter()` helper in [lib/format.ts](lib/format.ts) maps each enum value to its Indonesian display label.
- [ ] `/teacher/assessments` hub: replace the C4 "Sentra Harian (Coming in C5)" placeholder with 8 sentra cards (one per `LearningCenter` enum value), each linking to `/teacher/assessments/center/<lowercase-enum-key>`.
- [ ] Playwright spec [e2e/teacher-assessments-center.spec.ts](e2e/teacher-assessments-center.spec.ts) covers: TEACHER → `/teacher/assessments` → click "Sentra Ibadah" → page renders the form (header + date input + ageGroup toggle + activity input). Optimistic save tested in vitest; e2e proves the UI mounts.
- [ ] Vitest cases (~25): center session schema (5), POST route (~10), GET route (~6), `formatLearningCenter` (8 enum cases or table-driven).
- [ ] design-system.html §portal-shells + §forms cross-checked.
- [ ] `npm run build && npx vitest run && npx playwright test` green at end of cycle.

### Non-goals

- Walas weekly UI changes — already shipped in C4.
- Sentra rotation scheduling (which student rotates to which sentra on which day) — deferred per design §3.1.
- Per-sentra teacher assignment table — any TEACHER can write per CTO decision.
- Parent visibility of sentra entries — that's C6.
- New permission keys — reuse `assessments.read` + `assessments.write` from C4.
- Schema changes — entirely on top of C4's `AssessmentEntry`.

### Assumptions

1. `assessments.write` is the right gate for sentra writes (same key C4 added; per-route enforcement of HOMEROOM-vs-CENTER scope via the validator's discriminator + the route's center handling).
2. `lastActivity` enrichment (last `activity` string used at this center+date+ageGroup) is a *nice-to-have* for the form prefill; if shape complicates the GET response, I'll drop it and let UX live without it.
3. Roster for sentra GET = all `Student.status = ACTIVE` whose `StudentEnrollment.classSection.name` derives ageGroup matching the query (reusing `deriveAgeGroup` from C4). Same name-prefix heuristic; same C4 follow-up applies.
4. The 8 cards on the hub render even for non-walas teachers — sentra entry is intentionally permissive at the route level.
5. The upsert key (tenantId, studentId, indicatorId, date, source) means a HOMEROOM walas's tap and a CENTER sentra teacher's tap on the same student/indicator/day **don't collide** — they're distinct rows because `source` differs. This is explicitly intended per the design.

→ Correct any of these now or `/build` will proceed with them.

## Tasks

- [ ] **T1 — Validation extension** *(independent, foundational)*
  - Extend [lib/validations/assessment-entry.ts](lib/validations/assessment-entry.ts) with `assessmentEntryCenterSessionSchema` per the spec shape.
  - Test cases: valid session, missing center, oversize entries (>80), valid + empty entries, activity over 200 chars.
  - **Acceptance:** ~5 vitest cases pass.

- [ ] **T2 — POST /api/teacher/assessment-entries/center** *(depends T1)*
  - New `app/api/teacher/assessment-entries/center/route.ts`. Pattern from [app/api/teacher/assessment-entries/route.ts](app/api/teacher/assessment-entries/route.ts): auth → rate-limit (reuse `PENILAIAN_WRITE_BUDGET` exported there, or move to a shared module if needed) → validate session schema → resolve weekId via `getCurrentWeek` for the date (422 if absent) → tenant-scope all referenced students + indicators → indicator-theme link enforcement against the resolved week's theme → `prisma.$transaction` of upserts (`source: CENTER`, shared `center` + `activity`, distinct `weekId`) → `recordAudit({ entity: "AssessmentEntry", action: "CENTER_SESSION", after: { center, date, count } })`.
  - Empty `entries` array: short-circuit success, log a no-op audit.
  - **Acceptance:** ~10 vitest cases — happy path, empty entries no-op, 401, 403 (perm), 403 (no employeeId), 403 (student not in tenant), 422 (no active week), 400 (indicator not linked to week's theme), idempotent re-submit, oversize bulk rejected at validator.

- [ ] **T3 — GET /api/teacher/assessment-entries/center/[center]** *(depends T1; independent of T2)*
  - New `app/api/teacher/assessment-entries/center/[center]/route.ts`.
  - Validate the dynamic `[center]` segment against the `LearningCenter` enum (404 on invalid).
  - Auth → resolve `getCurrentWeek` for `date` query param (default today) → roster = students whose enrollments match the requested ageGroup classSections → indicators (week-theme + ageGroup filter) → existing entries for date+center.
  - Optional: `lastActivity` = most recent `activity` string at this center+date.
  - **Acceptance:** ~6 vitest cases — happy path, 404 unknown center, 422 no active week, 403 missing employeeId, ageGroup filter applied, entries scoped to CENTER + center + date.

- [ ] **T4 — `/teacher/assessments/center/[center]` mobile UI** *(depends T3)*
  - New `app/teacher/assessments/center/[center]/page.tsx` (server) + `client.tsx`.
  - Header center name (via `formatLearningCenter()` Indonesian map in [lib/format.ts](lib/format.ts)) + date picker (default today) + ageGroup A/B toggle + activity text input → roster × picked-indicators grid (multi-select up to 4 from the theme indicator list, then per-cell 3-button level + collapsible note).
  - Single "Simpan" button at bottom POSTs the full session → success toast → router.refresh.
  - **Acceptance:** mounts in browser/Playwright; design-system.html §forms cross-check.

- [ ] **T5 — Center selector on assessments hub** *(depends T4)*
  - Update [app/teacher/assessments/page.tsx](app/teacher/assessments/page.tsx): replace the "Sentra Harian (Coming in C5)" placeholder card with 8 sentra cards in a responsive grid, each linking to `/teacher/assessments/center/<lowercase-enum-key>`.
  - **Acceptance:** all 8 cards render with correct labels; clicking each navigates correctly.

- [ ] **T6 — Playwright e2e** *(depends T4 + T5)*
  - New `e2e/teacher-assessments-center.spec.ts`: TEACHER demo user → `/teacher/assessments` → click "Sentra Ibadah" card → assert form chrome (header text, date input, ageGroup toggle, activity input) renders. Don't test the save path (would need full IKTP setup; vitest covers that path).
  - **Acceptance:** spec passes locally against `DEMO_MODE=true npm run start`.

## Implementation

- **T1 — Center session validation schema** *(commit `feat(curriculum): C5 T1 — center session schema`)*
  - Extended [lib/validations/assessment-entry.ts](lib/validations/assessment-entry.ts) with `assessmentEntryCenterSessionSchema` + `MAX_CENTER_SESSION_ENTRIES = 80`. Shape: `{ center: LearningCenter, date: ymd, activity: 1-200 chars, entries: [{ studentId, indicatorId, level, note? }] (≤80) }`. Empty entries allowed.
  - 7 new vitest cases (happy, empty entries, missing center, empty activity, oversize activity, oversize entries, malformed center). Total 1442 vitest pass.

- **T2 — POST /api/teacher/assessment-entries/center** *(commit `feat(curriculum): C5 T2 — POST sentra session`)*
  - New [app/api/teacher/assessment-entries/center/route.ts](app/api/teacher/assessment-entries/center/route.ts). Pattern from C4's POST: auth (`assessments.write`) → rate-limit (reuse `PENILAIAN_WRITE_BUDGET` from sibling) → validate `assessmentEntryCenterSessionSchema` → empty-entries shortcut (audit no-op + 200) → `getCurrentWeek` for the date (422 if absent) → tenant-scope all referenced students (403) + indicators (403) → enforce indicator-theme link against active week's theme (400) → `prisma.$transaction` of upserts with `source: CENTER`, shared `center` + `activity` + `weekId` → `recordAudit({ entity: "AssessmentEntry", action: "CENTER_SESSION", after: { center, date, activity, count } })`.
  - 11 vitest cases (auth/perm/employeeId, empty session no-op, no week, student-not-in-tenant, indicator-not-in-tenant, indicator-not-linked-to-theme, empty-activity validator path, happy upsert with CENTER source, idempotent re-submit). 1453 vitest pass.

- **T3 — GET /api/teacher/assessment-entries/center/[center]** *(commit `chore(curriculum): C5 T3 — GET sentra session payload`)*
  - New [app/api/teacher/assessment-entries/center/[center]/route.ts](app/api/teacher/assessment-entries/center/[center]/route.ts).
  - Validates `[center]` segment against `learningCenterSchema` (404 unknown). Requires `ageGroup=A|B` query param (400 missing). `date` defaults to today (Jakarta tz).
  - `getCurrentWeek` for the requested date → 422 if no active week (echoes `center` + `date` + `ageGroup` so the UI can show contextual message).
  - Roster: ACTIVE enrolments in tenant → filtered via `deriveAgeGroup(classSection.name)` (reuses C4's heuristic).
  - Indicators: linked to active week's theme + objective.ageGroup matches.
  - Existing entries: scoped to `source: CENTER`, `center`, this `weekId`, exact `date`.
  - `lastActivity` convenience field for form prefill (most recent activity at this center+date).
  - 8 vitest cases. 1461 vitest pass.

- **T4 — `/teacher/assessments/center/[center]` mobile UI + `formatLearningCenter`** *(commit `feat(curriculum): C5 T4 — sentra mobile UI`)*
  - [lib/format.ts](lib/format.ts): added `formatLearningCenter()` Indonesian map for the 8 sentra rooms + `ALL_LEARNING_CENTERS` ordered list. 9 vitest cases.
  - [app/teacher/assessments/center/[center]/page.tsx](app/teacher/assessments/center/[center]/page.tsx): server component validates `[center]` against the enum (404 on unknown via `notFound()`), then hands the slug + Indonesian label to the client.
  - [app/teacher/assessments/center/[center]/client.tsx](app/teacher/assessments/center/[center]/client.tsx): mobile-first single session form. Header → date input + ageGroup A/B toggle + activity input → fetch `GET /center/[center]?date&ageGroup` on mount + on every dep change → indicator multi-select (≤4 of theme-linked indicators) → roster × picked-indicators grid (per-cell 3-button level setter via `bg-status-{present,late,absent}`, collapsible note textarea) → sticky "Simpan" CTA POSTs the assembled session.
  - Cells hydrate from existing `CENTER` entries on load; activity prefills from server-supplied `lastActivity` when present. Save shows toast + `router.refresh`.
  - 1471 vitest pass.

- **T6 — Playwright e2e + code review pass** *(commits `test(curriculum): C5 T6 — sentra e2e + C4 hub-spec update` + `fix(curriculum): C5 — code review pass`)*
  - [e2e/teacher-assessments-center.spec.ts](e2e/teacher-assessments-center.spec.ts) — 3 tests via demo `u_teacher`: hub shows all 8 sentra cards by `data-testid="hub-center-<key>"`, clicking the worship card lands on the center session page (chrome assertion via `data-testid` for date / agegroup / activity / save), and `?date=2025-07-15` reaches the active-week branch (poll for picker OR no-link banner).
  - [e2e/teacher-assessments-weekly.spec.ts](e2e/teacher-assessments-weekly.spec.ts) — updated the C4 hub spec from `hub-center-placeholder` to `hub-center-grid` + `hub-center-worship` to match the C5 hub state.
  - **Code review (feature-dev:code-reviewer)** raised 3 issues, all fixed in the same cycle:
    - Schema let `activity` be required even on empty-session no-op → `superRefine` makes activity required only when entries are present. New vitest case + 1 existing case re-labeled. 1472 pass total.
    - `pickedIndicatorIds` + `cells` not reset on date/ageGroup change → roster grid silently empty. Reset state at the start of the load `useEffect` before fetch.
    - Cross-route import of `PENILAIAN_WRITE_BUDGET` → extracted to [lib/api/rate-limit-budgets.ts](lib/api/rate-limit-budgets.ts); both POST routes now share one source.

- **T5 — Center selector on assessments hub** *(commit `feat(curriculum): C5 T5 — hub 8 sentra cards`)*
  - [app/teacher/assessments/page.tsx](app/teacher/assessments/page.tsx): replaced the C4 "Sentra Harian (Coming in C5)" placeholder with an 8-card 2-column grid driven by `ALL_LEARNING_CENTERS`. Each card has `data-testid="hub-center-<lowercase-key>"` for e2e assertions and links to `/teacher/assessments/center/<lowercase-key>`.
  - The walas card + new sentra grid share the same hub container so the visual hierarchy stays consistent.
  - 1471 vitest pass.

## Verification

- **End-of-cycle gates:**
  - `npm run build` ✓ clean (only the pre-existing turbopack lockfile note)
  - `npx vitest run` ✓ 1472/1514 (42 pre-existing todos)
  - `DEMO_MODE=true npx playwright test` — 102 passed / 9 skipped / 1 flaky / **2 pre-existing failures** carried from C4 verification (curriculum-admin.spec.ts:38 AY-name drift, admin.spec.ts:432 tagihan flow). Both unrelated to C5 (no admin curriculum or invoice surface touched).
  - `e2e/teacher-assessments-center.spec.ts` (new) — 3/3 pass.
  - `e2e/teacher-assessments-weekly.spec.ts` — 4/4 pass after updating the hub-spec assertion to point at the new `hub-center-grid` selector.
- **RLS:** `bash scripts/verify-rls-coverage.sh` ✓ 32/32 (no new tenant-scoped models in C5).
- **API auth:** `bash scripts/verify-api-auth.sh` ✓ 153/153 (2 new routes added).
- **Manual smoke:** preview MCP cwd issue persists (claude-harness worktree env quirk, same as C4). UI verification via Playwright + the page snapshots in test artifacts confirm the hub grid + sentra session form render correctly.
- **Cross-checked design-system.html §portal-shells + §forms** for the sentra session form (date input + ageGroup toggle + activity input + indicator multi-select + roster grid).
- **Follow-ups (post-merge):**
  - C6: parent `/perkembangan` rollup that aggregates HOMEROOM + CENTER entries.
  - Schema column on `ClassSection.ageGroup` (carried from C4).
  - Refresh `e2e/curriculum-admin.spec.ts:38` AY-name assertion (carried from C4).
  - Investigate `e2e/admin.spec.ts:432` demo-DB pollution (carried from C4).
  - Optional: replace the manual `LearningCenterKey` type in `lib/format.ts` with an import from the generated Prisma client to drop the duplication.

## Ship Notes

- **Migration:** none — entirely on top of C4's `AssessmentEntry` table.
- **Env vars:** none.
- **No new permissions** — reuses `assessments.read` + `assessments.write` from C4.
- **New routes:**
  - `POST /api/teacher/assessment-entries/center` — single-session bulk upsert with `source: CENTER`.
  - `GET /api/teacher/assessment-entries/center/[center]` — sentra session payload.
  - `/teacher/assessments/center/[center]` — mobile sentra session page.
  - `/teacher/assessments` hub now shows 8 sentra cards in place of the C4 placeholder.
- **Manual smoke recipe (post-deploy):**
  - Login as any TEACHER. Visit `/teacher/assessments` → 8 sentra cards visible (Sentra Ibadah, Bahan Alam, …).
  - Click "Sentra Ibadah" → session page renders with date input (default today) + TK A/B toggle + activity input.
  - Pick `?date=2025-07-15` (or any date inside an active week) + ageGroup → indicator picker + roster appear.
  - Pick ≤4 indicators → tap levels → Simpan → toast "Tersimpan: N penilaian." → reload → entries pre-fill.
- **Rollback:** revert PR. No DB changes to undo.
- **Follow-up cycles:**
  - C6 — parent `/perkembangan` rollup that aggregates HOMEROOM + CENTER entries for parent visibility.
  - Pack 2 (C8–C11) — raport templates + PDF/docx generation that consumes the now-populated AssessmentEntry table.
