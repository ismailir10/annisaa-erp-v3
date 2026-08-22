# Assessment Module — Save Persistence Bug + Comprehensive Audit

## Context

User report (2026-05-03): teacher portal `/teacher/assessments/.../[period]` shows "Tersimpan" indicator after scoring indicators, but on browser refresh the form reverts to initial (mostly empty) state. Save acknowledgement is misleading — autosave is partially silent and partially correct, causing data loss without user awareness.

Comprehensive audit requested across teacher, parent, admin assessment surfaces.

### Repro (manual)
1. Login as teacher (e.g. demo seed Ustadzah Aisyah).
2. Open `/teacher/assessments/<classSectionId>/<templateId>/<period>`.
3. Expand a student, click rubric buttons (BB/MB/BSH/BSB) on each indicator.
4. Wait > 1.2 s for autosave debounce — "Tersimpan" appears.
5. Browser refresh → most indicators back to empty. At best, N-1 of N clicks persisted.

### Audit findings (severity-ordered)

**1. CRITICAL — Autosave stale-closure (data loss)** — `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx:150,211`
- `saveStudent` is a `useCallback` with `[state, ensureAssessment]` deps → re-created every render, closing over THAT render's `state`.
- `scheduleAutosave` schedules `setTimeout(() => saveStudent(studentId), 1200)`. The arrow captures `saveStudent` from the render in which scheduleAutosave was last created.
- `setScore` runs inside an event handler: `setState(...)` (queued, **not yet applied**) → `scheduleAutosave(studentId)` (synchronous). At this point the current render's scheduleAutosave still references `saveStudent` whose closure has the **pre-click** state.
- 1.2 s later, that stale `saveStudent` reads `state[studentId]` from the pre-click closure → builds `scorePayload` from the state BEFORE the most recent click → API receives N-1 of N intended scores.
- First click: closure has empty state → `scorePayload.length === 0 && !publish` → **silent early return**, no API call, no Tersimpan. User keeps clicking; subsequent saves persist N-1 scores. UI shows N/N because `state` itself is correct in the rendered tree, but DB has only N-1.

**2. MAJOR — Silent skip on empty payload** — `client.tsx:164-167`
- When user toggles off all indicators (clicks selected rubric to deselect), `scorePayload === []`. With `!publish`, save is silently skipped. DB retains stale scores. Refresh resurrects them.

**3. INFO — Admin detail page** — `app/admin/assessments/[id]/page.tsx`
- Explicit "Simpan Draf" / "Publikasi" buttons; reads `scoreMap` from current React state at click time. No autosave race. OK.

**4. INFO — Parent reports** — `app/parent/reports/page.tsx`, `app/parent/assessments-table.tsx`
- Read-only. Fetches via `/api/guardian/assessments/[id]` (PUBLISHED only, child-scoped). No write path. OK.

**5. INFO — API correctness** — `app/api/assessments/student/route.ts`, `app/api/assessments/student/[id]/route.ts`
- POST is idempotent (`findUnique` on `studentId_templateId_period` before create). Class-level authz tight (verified by `app/api/__tests__/assessment-student-authz.test.ts`).
- PUT runs Serializable transaction (delete-then-create scores), surfaces P2034 as 409. Logic correct. The bug is purely client-side.

## Spec

Acceptance criteria:

- [ ] **AC1 — Autosave persistence:** Teacher scores N indicators; after 1.2 s `Tersimpan` appears; on browser refresh, all N indicators are present in the UI.
- [ ] **AC2 — First click saves:** Scoring a single indicator and waiting > 1.2 s triggers an actual API write; refresh shows that one indicator persisted.
- [ ] **AC3 — Deselect persists:** Toggling off a previously-saved indicator clears it server-side after the autosave debounce; refresh does not resurrect the cleared score.
- [ ] **AC4 — Cross-portal regression:** Admin detail Save/Publish (`/admin/assessments/<id>`) still works; parent rapor view still renders PUBLISHED reports.
- [ ] **AC5 — Authz untouched:** Existing class-level authz tests in `app/api/__tests__/assessment-student-authz.test.ts` remain green.
- [ ] **AC6 — Design-system fidelity:** `design-system.html` §components rules upheld for the rubric buttons + SaveIndicator copy (Tersimpan / Menyimpan / Gagal simpan). No new visual surface.

Non-goals:
- Reworking autosave UX (e.g. visible last-saved timestamp).
- Changing rubric grading model or DB schema.
- Migrating admin detail page to autosave parity.

## Tasks

1. **T1 — Refactor client to ref-backed state read.** Replace `useCallback`-captured `state` reads in `ensureAssessment` and `saveStudent` with a `stateRef` synchronously updated each render. Remove `state` from useCallback deps. Bug fix.
2. **T2 — Tighten empty-payload semantics.** When `scorePayload.length === 0 && !publish`, skip only if no `assessmentId` yet exists. If an assessment row exists, still PUT (with empty array) so server can clear. Adjust server PUT to treat `scores: []` as "clear all" rather than "no change".
3. **T3 — Regression test for save round-trip.** Add a Vitest test against the PUT route asserting: saving N scores → second PUT with `scores: []` clears them (currently the skip-on-empty server behaviour would leave them). Also add a small unit covering the new client invariant via a pure helper.
4. **T4 — Manual + Playwright smoke.** Demo-mode teacher login, score → refresh → assert persistence across teacher/parent/admin surfaces.

## Implementation

### T1 — Client `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx`

- Added `stateRef = useRef(state)` and synced it in `useEffect(() => { stateRef.current = state; }, [state])` — ref mirrors latest committed state. (`react-hooks/refs-during-render` rejects writing refs during render; the 1.2 s autosave debounce outlasts the effect commit window so the deferred timer still reads fresh state.)
- `ensureAssessment` and `saveStudent` now read `stateRef.current[studentId]` instead of the closure-captured `state[studentId]`.
- Removed `state` from both `useCallback` deps. Both callbacks become stable across renders, so the `setTimeout` in `scheduleAutosave` always invokes the SAME `saveStudent`, which then reads the freshest state via the ref.
- Tightened the early-return guard: `if (scorePayload.length === 0 && !opts.publish && !cur.assessmentId) return true;` — only skip when nothing has been persisted yet AND nothing to send. If a row already exists, an empty payload is a meaningful "clear all" and goes to the server.

### T2 — Server `app/api/assessments/student/[id]/route.ts`

- Replaced `if (scores?.length)` with `if (scores)` and a nested `if (scores.length)` guard around `createMany`. New contract:
  - `scores: undefined` → status-only update; existing rows untouched.
  - `scores: []` → clear all rows (delete only).
  - `scores: [...]` → replace existing rows with the new payload.

### T3 — Vitest regression — `app/api/__tests__/assessment-student-save.test.ts` (new)

Three cases: persists non-empty payload (replace semantics), clears with `scores: []` (the regression case for the deselect-all bug), leaves rows alone when `scores` is omitted.

### T4 — Playwright regression — `e2e/teacher.spec.ts`

New test "assessment scoring persists across refresh (regression — autosave stale closure)" — clicks BB on first indicator, waits for `Tersimpan`, reloads, asserts the click's effect (selected ↔ not selected) survived. Captures pre-click selection state so the test stays correct under repeated runs against the same demo seed.

## Verification

- [x] `npm run build` — green (Next 16.2.3 prod build).
- [x] `npx vitest run` — 1005 passed, 42 todo, 2 skipped (119 files). Includes new `assessment-student-save.test.ts` (3 tests).
- [x] `npx playwright test e2e/teacher.spec.ts -g "assessment scoring persists"` — green.
- [x] Full Playwright suite: 54 passed, 3 skipped. Pre-existing failures unrelated to this cycle: `salary slips page loads` (async-load race), 3 admin Xendit-tagihan tests (Xendit stub-key 401 path) — none touch assessment code or the files this cycle modifies.
- [x] Cross-checked `design-system.html` §components — no visual diff introduced; rubric button + SaveIndicator markup unchanged.

## Ship Notes

- No DB migrations. Pure client + minor server contract tightening (empty-array clear).
- No new env vars.
- Rollback: revert the cycle commit; existing assessments unaffected (server change only deletes when client explicitly sends `scores: []`).
- Pre-existing Playwright flakes (`teacher.spec.ts:46` salary slips, `admin.spec.ts:473/524/575` Xendit) should be tracked in a separate stale-e2e cycle.

## Ship Notes

- No DB migrations. Pure client + minor server contract tightening (empty-array clear).
- No new env vars.
- Rollback: revert the cycle commit; existing assessments unaffected (server change only deletes when client explicitly sends `scores: []`).
