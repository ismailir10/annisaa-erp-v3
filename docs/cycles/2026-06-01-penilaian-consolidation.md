# Penilaian Consolidation — One Path + Admin Visibility

## Context

A 2026-06-01 state audit of the Curriculum/Penilaian initiative (cycles C1–C7a) found the Penilaian pillar **functionally complete but not consolidated**, ahead of the staff-first pilot and July 1 hard cutover. Two assessment systems run side-by-side: the NEW IKTP-driven `AssessmentEntry` flow (C4 walas-weekly `source=HOMEROOM` + C5 sentra-daily `source=CENTER`, 3-level `AchievementLevel`) and the LEGACY `AssessmentTemplate`/`StudentAssessment` flow. The teacher hub (`app/teacher/assessments/page.tsx`) renders both — new cards plus a live section titled "Penilaian lama (template)". The admin "Penilaian" nav group (`config/admin-nav.ts`) exposes **only** legacy pages (`/admin/assessment-templates`, `/admin/assessments`); the new penilaian has zero admin surface. `AssessmentEntry` is read only by teacher + parent (`lib/curriculum/{weekly-assessment-loader,perkembangan-loader}.ts`) — SCHOOL_ADMIN/Kepala Divisi Pendidikan cannot monitor walas/sentra entry progress. This cycle collapses penilaian to **one path** (retire legacy UI) and gives admins a **read-only monitoring surface** over the new data — directly de-risking the pilot and laying the admin-read groundwork the later C8 Raport aggregation needs. `assessments.read` is already granted to SCHOOL_ADMIN (`lib/permissions.ts:144-149`, comment anticipates "the new admin" surface).

## Spec

**Acceptance criteria**
- [ ] Teacher penilaian hub (`/teacher/assessments`) shows ONLY the new flow (Penilaian Pekanan walas-gated + Sentra grid). The "Penilaian lama (template)" section + its `AssessmentTemplate`/`StudentAssessment` data fetching are gone.
- [ ] Admin sidebar "Penilaian" group no longer links the legacy `/admin/assessment-templates` + `/admin/assessments` pages.
- [ ] A new read-only admin surface `/admin/penilaian` shows AssessmentEntry completion for the active semester: walas-weekly per class (entered / not-entered per enrolled student for the current/selected week) and sentra-daily per center. Gated by `assessments.read` (SCHOOL_ADMIN + SUPER_ADMIN).
- [ ] Admin "Penilaian" nav group points to `/admin/penilaian`. Legacy `/admin/assessments*` + `/admin/assessment-templates` + the legacy teacher route redirect (no dead URLs, no 404 from a bookmark).
- [ ] Legacy `AssessmentTemplate` / `StudentAssessment` / `StudentAssessmentScore` **schema and API routes remain intact** (UI deprecation only — per design-spec risk row). No destructive migration.
- [ ] Between-task gate green every task: `npm run build && npx vitest run`. End-of-cycle: + `npx playwright test`.
- [ ] Frontend diffs cross-checked against `design-system.html` (portal shell, list/grid, status colors); recorded in Verification.

**Non-goals**
- Raport (C8–C11) — Sept track, untouched.
- Real-data seed (prod empty; blocked on school PROMES authoring + roster spreadsheet).
- Dropping legacy tables/columns or legacy API routes (schema stays; only UI retires).
- `curriculum.write` role change (stays SUPER_ADMIN-only per design §3.2).
- Sentra rotation scheduling; any new write path on AssessmentEntry.

**Assumptions**
1. Soft-retire legacy via nav removal + redirects (not file deletion) — keeps diff focused, reversible, avoids churning legacy page tests this cycle. Full file/route deletion is a later cleanup.
2. Admin monitor is **read-only** — no admin entry/edit of AssessmentEntry (teachers own entry).
3. **Completion semantics differ by source.** Walas-weekly HAS a denominator: enrolled active students in the class for the selected week → show "entered N / M". Sentra-daily has NO fixed denominator (rotation deferred, any age-eligible student) → show **entries-made counts** (# entries, # distinct students assessed) for the selected day/center, not a hard X-of-Y. Per-IKTP completeness out of scope.
4. Monitor scopes to the active `AcademicYear` + current semester; week/day selectable, defaulting to current via `lib/curriculum/week-resolver.ts`.
5. Reuse `lib/curriculum/{homeroom,week-resolver,weekly-assessment-loader,perkembangan-loader}.ts` + `lib/format.ts` (`ALL_LEARNING_CENTERS`, `formatLearningCenter`) rather than new aggregation from scratch.
6. **Commit hygiene (commit-msg hook):** `feat:`/`perf:` commits touching `app/**` or `lib/**` MUST stage `README.md` in the same commit. So T2 + T3 (new feature) use `feat:` and fold their README module/route updates inline. T1 + T4 (legacy removal / nav + redirects) use `refactor:` → covered by broad doc-sync (cycle doc staged). T5 carries only CLAUDE.md counts + the `/audit-docs` final pass.

## Tasks

- [x] **T1 — Retire legacy teacher penilaian section.** (`refactor:`) Remove the "Penilaian lama (template)" block from `app/teacher/assessments/page.tsx` plus its `assessmentTemplate`/`studentAssessment` queries + now-dead helpers. Keep new Pekanan + Sentra cards. Update `e2e/teacher.spec.ts` "assessments landing" test (lines ~61-83) to assert the new `hub-weekly-card` / `hub-center-*` testids instead of legacy `a[href*="Semester"]` template links. *Accept:* teacher hub renders only the new flow; teacher e2e asserts new cards; `npm run build && npx vitest run` green. (independent)
- [ ] **T2 — Admin penilaian monitoring loader + API.** (`feat:` — stage README) Add `lib/curriculum/penilaian-monitor.ts` (reuse week-resolver + loaders): walas-weekly entered-N/M per class (HOMEROOM, denominator = enrolled active students) + sentra-daily entries-made counts per center (CENTER, no denominator) for active AY/semester + selected week/day. Add `GET /api/admin/penilaian` gated by `assessments.read`, tenant-filtered per security.md. Fold the README module/route line in this commit. *Accept:* vitest covers aggregation (both source semantics) + auth gate (SCHOOL_ADMIN allow, TEACHER/GUARDIAN deny); build+vitest green. (independent)
- [ ] **T3 — Admin monitoring page `/admin/penilaian`.** (`feat:` — stage README) Server page + client per patterns.md Admin List / Workflow-Queue recipe: walas-weekly N/M table per class + sentra entries-made per center, week/day selector, empty-state contract, completion badges using status colors. Cross-check `design-system.html`. *Accept:* page renders from T2 data; build+vitest green. (depends T2)
- [ ] **T4 — Repoint admin nav + legacy redirects.** (`refactor:`) Update `config/admin-nav.ts` "Penilaian" group → single "Penilaian" item → `/admin/penilaian`; drop the two legacy items + fix breadcrumb segments. Add server redirects: `/admin/assessments*` + `/admin/assessment-templates` + legacy teacher `assessments/[classSectionId]/[templateId]/[period]` → new surfaces. Update `e2e/admin.spec.ts` lines ~87-88 (legacy `/admin/assessments/templates` → `/admin/assessment-templates` redirect assertion) to the new target. *Accept:* sidebar shows new entry only; legacy URLs 3xx to new path; admin e2e updated; build+vitest green. (depends T3)
- [ ] **T5 — Docs sync.** (`docs:`) CLAUDE.md File Structure counts (routes/pages) if changed; record design-system cross-check in this doc's Verification. (README already updated in T2/T3.) *Accept:* `/audit-docs` zero `fail`; doc-sync pre-commit gate passes. (depends T1–T4)

## Implementation

- Subagent plan: T1 + T2 are independent (teacher page vs new lib/api) but executed inline; T3→T4→T5 sequential (page→nav/redirects→docs). No parallel subagent dispatch — small fork, avoids orchestration + verbatim-report risk.
- Task 1: Retire legacy teacher penilaian section — `app/teacher/assessments/page.tsx` (removed "Penilaian lama (template)" block + `assessmentTemplate`/`studentAssessment` queries + `Card`/`Badge` imports; "no class" guard now via `teachingAssignment.count`), `e2e/teacher.spec.ts` (landing test asserts new `hub-center-grid`; deleted legacy autosave-stale-closure regression test that drove the retired template route). Cross-checked design-system.html portal shell — hub uses existing compliant card/empty-state markup, unchanged.

## Verification

- Task 1: gates passed — `npm run build` ok; `npx vitest run` 1874 passed / 2 skipped / 42 todo (87s). Inline code review (feature-dev:code-reviewer agent unavailable — pinned to inaccessible glm-5): no dangling legacy refs, eslint clean, e2e balanced, empty-state guard equivalent to prior `classSections.length===0`.

## Ship Notes
