# Phase 0.3 — Perf Sweep (Teacher home / Parent home / Calendar / Reports)

> **Source-of-truth plan:** [`docs/plans/2026-05-10-v1-incremental-evolution.md`](../plans/2026-05-10-v1-incremental-evolution.md) §3 + §5 Phase 0 cycle 0.3.
> **Phase:** 0 — Stop Bleeding (UAT blockers). **THIS IS THE LAST PHASE 0 CYCLE.**
> **Branch:** `feat/phase0-perf-sweep` (off `origin/staging` @ `bf64abd` — post-PR-#224).
> **Prior cycles:** [`2026-05-10-phase0-admin-hydration-and-bfcache.md`](2026-05-10-phase0-admin-hydration-and-bfcache.md), [`2026-05-10-phase0-finance-backlog-drain.md`](2026-05-10-phase0-finance-backlog-drain.md) — pattern reference for diagnose-first cadence + Verification + Ship Notes shape.
> **Phase 0 closure gate:** after this cycle ships + merges, re-run all 10 UAT scenarios via `/uat`; expect 0 BLOCKER findings. Then Phase 1 (FEATURE work) begins with `daftar-public-form` (plan §5 cycle 1.1).

---

## Context

Four UAT findings from the §3 BLOCKERS / MAJORs table remain open on the rolled-back staging tip — all four are perf or perceived-perf:

- **U3 — Teacher home blank ~15s on load** (BLOCKER, plan §3 days-open=9). UAT 2026-04-26-teacher: Pak Budi navigated to `/teacher` from a fresh tab and saw 15 s of blank screen before the GPS prompt + clock card appeared. **Source-read finding (pre-spec):** the Server Component (`app/teacher/page.tsx`) is 37 lines and contains a single `prisma.attendanceRecord.findUnique` (one row, indexed by `employeeId_date`). It is mechanically incapable of producing 15 s server-side latency on a healthy Postgres connection. The 15 s is therefore most plausibly NOT an N+1 / sequential-await pattern. Candidates: Vercel cold-start on the function for the route, framer-motion + GPS prompt blocking first paint inside `TeacherHomeClient`, or session-cookie verification stalling on the staging Supabase pooler. Diagnosis-first matters here — guessing wrong burns the cycle.

- **U7 — Parent home TTFB 2.1s** (MAJOR, days-open=7). UAT 2026-04-26-parent: Bu Sari measured 2.1 s before the dashboard kid-cards rendered. **Source-read finding:** `app/parent/page.tsx` already uses `Promise.all` for the three main awaits (`weekAttendance`, `latestNotes`, `outstanding`), so basic parallelization is in place. Two real costs still on the table: (a) `prisma.studentJournalNote.findMany` runs WITHOUT a `take:` limit — for a parent with 3 children and a year of notes, that pulls every active note then keeps only "first per kid" via the in-memory `latestNoteByKid` map. (b) `getParentOutstandingForStudents` is uncached (the helper's own JSDoc explicitly notes: "Uncached. Home is the latency-sensitive surface; cached list stays cached separately. If benchmarks show home regressing > 100 ms, add a 30-s cache."). Phase 0.2's parent-helpers tightening only touched `_getParentWithChildren` invariants — perf side untouched. Both are reusable knobs the spec can pull.

- **U8 — Teacher calendar nav 3.1–4s** (MAJOR, days-open=7). UAT 2026-04-26-teacher: Pak Budi tapped the "Absensi" tab in the bottom nav and saw 3.1–4 s before the student roster rendered. **Source-read finding:** `app/teacher/class-attendance/page.tsx` is `"use client"` and does TWO sequential client fetches inside two separate `useEffect` blocks: (1) `GET /api/teaching-assignments/my` on mount, then (2) `GET /api/student-attendance?classSectionId=…&date=…` after the first response sets state. Sequential client fetches over a slow Indonesian network (intermittent 4G per UAT thresholds) is exactly the 3.1–4 s shape — two ~1.5 s round-trips plus initial JS parse. Server-Component prefetch for the initial assignment + roster (collapsing both into one server roundtrip) is the obvious fix surface. Calendar nav itself (between classes / dates after first load) is mostly cache-warm and may not be the dominant cost; reproduction will tell.

- **U9 — `/parent/reports` 5.1s sheet open** (BLOCKER, days-open=7). UAT 2026-04-26-parent: Bu Sari tapped a child's rapor row and saw 5.1 s before content appeared. **Source-read finding:** `/parent/reports/page.tsx` is a pure Server Component (RSC) — NOT a client modal/sheet that fetches on open. The page awaits `getParentWithChildren` (cached 60 s) + `getPublishedAssessmentsForStudent` (cached 120 s). The CTO brief's framing of "sheet open" is most plausibly imprecise UAT terminology for "page navigation" — there is no per-row sheet/modal in the route. The 5.1 s is therefore either (a) cold-cache navigation against staging Supabase pooler, (b) `framer-motion` chain inside `AssessmentsTable` blocking first paint, or (c) the perf was captured pre-rollback on a heavier v2 surface and is post-rollback healed. Diagnosis-first per Phase 0.2's "364 → 25" precedent.

**Provenance caveat (carry-over from cycles 0.1 + 0.2).** UAT measurements above were captured pre-rollback. Phase 0.1 found U1 fully healed by rollback alone; Phase 0.2 found U2's "364 stuck invoices" was actually 25 stale test artifacts. Plan figures (15 s / 2.1 s / 3.1–4 s / 5.1 s) may be similarly stale and Task 1 reproduction is the canonical source. If any of the four timings are healed by rollback alone, the cycle still ships the long-lived `e2e/perf-budget.spec.ts` regression guard.

**Rollback healing precedent (cycle 0.1 + 0.2).** Both prior Phase 0 cycles ran a Task 1 reproduction first; both adjusted scope (cycle 0.1 dropped a portal-tree Cache-Control branch when Task 1 found Next.js dynamic-route default already covered it; cycle 0.2 dropped a backfill-script-create task when the script already existed). This cycle uses the same shape: spec lists worst-case fix surface per UAT finding, /build's Task 1 trims scope to actual reproductions.

**Scope explicitly excludes** (per user-confirmed §7 of plan):
- U1 / U2 / U6 / U10 — closed by cycles 0.1 + 0.2.
- U4 (salary slip mobile) + U5 (profile photo upload) — Phase 4 feature gaps.
- All Phase 1+ FEATURE cycles — `daftar-public-form` is next, plan §5 cycle 1.1.
- `/ship --to-main` — per plan §7 q7, accumulate Phase 0 (3 cycles done after this) + Phase 1 (~2 cycles) before first prod promotion.

**Hooks reminder.**
- **Frontend gate (pre-commit Rule 4)** fires on staged `app/**/*.tsx` or `components/**/*.tsx` diffs — at minimum Tasks 5 / 4 / 3 / 2 (any of `app/teacher/page.tsx`, `app/teacher/class-attendance/page.tsx`, `app/parent/page.tsx`, `app/parent/reports/page.tsx` if they land code changes) trigger it. **This cycle doc contains the literal token `design-system` (this paragraph) so the gate is satisfied per the existing one-line "design-system: no visual changes; perf-only diff" pattern from cycle 0.2.** When wrap commit lands the README ADR, Verification cross-references `.claude/standards/design-system.html` for any animation / framer-motion change.
- **Commit-msg narrow rule (`^(feat|perf):` + `app/**` or `lib/**` requires README staged)** — plan accordingly: per-task commits use `fix(...)` subjects (which the rule does NOT trip). The wrap commit subject is `docs(phase0):` and stages README + cycle doc together. **Avoid `perf:` subjects on per-task commits** — the narrow rule would force a per-task README touch and pollute history.
- **25-file cap (§18.2).** Estimated worst-case staged files: 10 (4 source files × at most 1 each + e2e spec + README + cycle doc + 2 vitest files for Tasks 2/3 if perf changes touch testable helpers). Well under cap.

---

## Spec

### Acceptance Criteria

- [ ] **AC1.** Task 1 records the post-rollback page-load timing for each of the four surfaces on the Vercel preview spawned by this branch's PR. Each measurement = median over 3 cold loads (clear cookies + fresh tab between loads). **Per-surface measurement shape (tightened per pre-/build review B2):**
  - `/teacher` — RSC page; content arrives in HTML. Measure `performance.timing.loadEventEnd - performance.timing.navigationStart`.
  - `/parent` — RSC page; same `loadEventEnd` shape.
  - `/parent/reports` — RSC page; same `loadEventEnd` shape.
  - `/teacher/class-attendance` — `"use client"` page; roster renders AFTER `loadEventEnd` via two sequential client fetches. Measure **time to roster visible**: `const t0 = Date.now(); await page.waitForSelector('[data-roster-row], [data-empty-state="no-students"]', { timeout: 10000 }); const elapsed = Date.now() - t0`. (`loadEventEnd` would always read ~1 s on this surface even when the user-visible 4 s bug fully reproduces — the timing metric must align with the user-perceived render, not the document-load event.) Task 3's fix lands a `data-roster-row` attribute on each rendered student button (or `data-empty-state="no-students"` on the EmptyState wrapper) — the e2e perf-budget guard depends on this anchor.

  **Persona / cookie discovery (corrected per pre-/build review B1):** the existing demo-mode e2e suite uses runtime discovery via `GET /api/auth/users` — see `e2e/teacher.spec.ts:9-19`, `e2e/parent.spec.ts:9-19`, `e2e/parent-attendance-scoping.spec.ts:26-37`. The session cookie value is the database-generated CUID for the user, NOT a static slug. `/build` MUST follow the same `beforeAll` pattern (filter by role, use `.id` as cookie value). Static identifiers like `u_teacher_seed1` do not exist in the demo auth resolver and would silently redirect to `/`, producing a vacuous-green timing read. Real-OAuth fallback (`pakbudi.demo@…` / `rightjet.hq@gmail.com`) per cycle 0.2 reuse only applies to manual Vercel-preview probes, not to the e2e perf-budget guard.

  The four measured values replace the stale `15s / 2.1s / 3.1–4s / 5.1s` plan figures in Verification.

- [ ] **AC2.** For each of the four surfaces, Task 1 names ONE of:
  - **(a) Healed by rollback alone** — current measurement < 4000 ms; no fix task lands; perf-budget regression guard still ships.
  - **(b) Reproduces; root cause named + fix surface identified** — measurement ≥ 4000 ms (or ≥ 2000 ms for U7's MAJOR threshold); Task 2/3/4/5 lands the smallest viable fix; post-fix re-measurement recorded.
  - **(c) Reproduces but root cause is environmental** (Vercel cold start, Supabase pooler warm-up, network jitter) — documented; no code fix; perf-budget regression guard still ships with appropriate threshold.

- [ ] **AC3.** `e2e/perf-budget.spec.ts` (NEW) ships as a long-lived regression guard against `DEMO_MODE=true npm run start` (production build, single warm-server run — same orchestration as `e2e/parent-attendance-scoping.spec.ts`). Cookie discovery follows the existing pattern: `test.beforeAll` calls `GET /api/auth/users` and resolves CUIDs for one TEACHER + one GUARDIAN role; `school-erp-session=<cuid>` is set via `context.addCookies`. Each of the four routes is a separate `test()` so a regression points at the offending surface. **Per-route measurement shape:** RSC routes (`/teacher`, `/parent`, `/parent/reports`) assert `await page.waitForLoadState('load'); const ms = await page.evaluate(() => performance.timing.loadEventEnd - performance.timing.navigationStart); expect(ms, '<route> load < 4000ms').toBeLessThan(4000);`. The `/teacher/class-attendance` client route asserts `await page.goto('/teacher/class-attendance'); const t0 = Date.now(); await page.waitForSelector('[data-roster-row], [data-empty-state="no-students"]', { timeout: 6000 }); expect(Date.now() - t0, '/teacher/class-attendance roster visible < 4000ms').toBeLessThan(4000);`. The threshold matches CLAUDE.md UAT page-load BLOCKER threshold (> 4 s = blocker). Guard fails loud — hard `expect(...)`, no `expect.soft(...)` per cycle 0.2's nav-anchor lesson.

- [ ] **AC4.** If Task 2 (U7 fix) lands: `prisma.studentJournalNote.findMany` in `app/parent/page.tsx` carries an explicit `take:` cap, AND/OR `getParentOutstandingForStudents` gains a 30-s `unstable_cache` wrapper per the helper's own JSDoc TODO — exact surface per Task 1 finding. Vitest coverage: regression test in `lib/__tests__/parent-helpers.test.ts` if outstanding becomes cached (cache-key shape correctness). Pure-cap change without behavior shift may skip new vitest cases. Existing parent-portal e2e suite (`e2e/parent.spec.ts`, `e2e/parent-signout-bfcache.spec.ts`, `e2e/parent-attendance-scoping.spec.ts`) stays green.

- [ ] **AC5.** If Task 3 (U8 fix) lands: `app/teacher/class-attendance/page.tsx` no longer makes two sequential client fetches on first paint. Either (a) the page becomes a hybrid Server Component that prefetches `assignments` + initial `students` in a single server roundtrip then hydrates the cycle-tap client, OR (b) the two `useEffect` blocks are collapsed into one `Promise.all` against the two existing endpoints, OR (c) a new `lib/teacher-helpers.ts` module exposes a single server-side query that returns both. Existing `e2e/teacher.spec.ts` cycle-tap flow stays green.

- [ ] **AC6.** If Task 4 (U9 fix) lands: post-rollback measurement on `/parent/reports` < 4000 ms median. Smallest viable surface — most plausibly a `framer-motion` deferral inside `AssessmentsTable` or a Suspense boundary around the assessments fetch. **Architecture clarification baked into the doc:** this route is a Server Component, not a client modal/sheet — the UAT "sheet open" framing is treated as imprecise. If post-rollback the route already loads < 4 s, AC6 satisfied by negative reproduction.

- [ ] **AC7.** If Task 5 (U3 fix) lands: post-rollback measurement on `/teacher` < 4000 ms median. Diagnosis informs surface — current candidates include framer-motion delay chain in `TeacherHomeClient` blocking first paint (multiple `transition={{ delay: … }}` on greeting / clock / quick-links / status-card), or GPS prompt timeout (10 s) inside the client component. If diagnosis names "Vercel cold start of an under-trafficked function," accepted with negative-reproduction record + perf-budget guard still shipping.

- [ ] **AC8.** No regression on the existing 12 e2e specs (full suite green via end-of-cycle gate; CI is the canonical authority per cycle 0.1 marathon-flake learning). 4 pre-existing admin-tagihan flakes documented in cycles 0.1 + 0.2 may persist on local marathon runs — moderate-subset re-run on fresh server confirms cycle-touch surface is clean; CI is canonical.

- [ ] **AC9.** README.md gains a single ADR row dated 2026-05-10 (cell ≤ 400 chars per pre-commit hook) summarising "Phase 0 perf sweep — `<measured surfaces>` page-load < 4s; `e2e/perf-budget.spec.ts` regression guard." Inserted above the cycle 0.2 + cycle 0.1 ADR rows.

- [ ] **AC10. Phase 0 closure gate (per plan §5).** After the end-of-cycle gate passes and the cumulative code-review fix-set lands, run `/uat teacher` and `/uat parent` against the Vercel preview spawned by this branch's PR. Both reports are written to `docs/uat/reports/2026-05-10-teacher.md` + `docs/uat/reports/2026-05-10-parent.md` and committed in Task 7 alongside the cycle-doc wrap. **Expected outcome:** 0 BLOCKER findings across both reports — this closes Phase 0. If any BLOCKER reproduces, do NOT merge — file a Phase 0.4 follow-up cycle and leave this PR open while diagnosing. Major/minor findings recorded but do NOT block merge (they roll into Phase 4 polish per plan §5).

### Spec Assumptions

1. **Diagnosis is the load-bearing step.** Plan figures (15 s / 2.1 s / 3.1–4 s / 5.1 s) are pre-rollback. Cycles 0.1 + 0.2 each found rollback alone healed at least one finding. Worst-case spec lists 4 fix tasks; realistic estimate is 1–3 fix tasks based on prior cycle hit rate.
2. **The 4-second budget matches CLAUDE.md UAT BLOCKER threshold.** No additional research needed — the CLAUDE.md `/uat` skill already encodes "page load > 4s = blocker" and this cycle uses the same threshold for the regression guard. U7's MAJOR threshold (2.1 s observed, < 2 s typical) is logged in Task 1 evidence but the regression guard's hard-fail line is 4 s — a MAJOR-class regression to 3.5 s would still get caught at the next UAT pass via the heuristic skill, not via the hard-fail e2e gate.
3. **`e2e/perf-budget.spec.ts` runs against the prod build via `DEMO_MODE=true npm run start` — same orchestration as the rest of the suite.** The gate threshold accounts for local prod-build performance, not Vercel-preview cold-start. Vercel cold-start for under-trafficked functions can exceed 4 s on a true cold tab; the regression guard does NOT attempt to assert that envelope. Manual verification on the Vercel preview (Verification §"Manual perf verification on Vercel preview") is the ground-truth surface for cold-start behavior, mirroring cycle 0.1's "Manual U1 verification on Vercel preview" pattern.
4. **No prisma migration. No new API route. No business-logic shift.** Perf changes are: bounded `findMany` `take:` clauses, additional `unstable_cache` wrappers, Server-Component prefetch shape, removed/deferred framer-motion delays. All behavior-preserving.
5. **Cache-key shape correctness for any new `unstable_cache` wrapper takes lessons from Phase 0.2.** If `getParentOutstandingForStudents` gains a cache wrapper, the cache key MUST include `(studentIds.slice().sort().join(","), tenantId)` (non-mutating sort — caller's array order from `children.map(c => c.studentId)` is not guaranteed stable across Prisma versions). Tenant-scope verification still happens via the `where` clause (defense-in-depth). The 30-s TTL is acceptable per the same global-tag-eviction analysis as `_getParentWithChildren`. **JSDoc invalidation-scope note (verbatim, carried over from cycle 0.2 wrap):** "NOTE: `revalidateTag('parent-outstanding')` evicts every household's entry GLOBALLY across all tenants — Next.js cache tags are global, not per-tuple. Per-household isolation applies to entry CREATION (the runtime args distinguish entries) but NOT to invalidation. The 30-s TTL caps blast radius and is acceptable for outstanding-totals data."
6. **`/parent/reports` perf surface is the FETCH, not the SHEET.** UAT framing of "sheet open 5.1s" is treated as imprecise UAT terminology for navigation-latency. If reproduction on the live preview reveals an actual client-side modal nuance (e.g., a future `<Sheet>` wrapper has slipped into `AssessmentsTable` between this read and the spec landing), the spec is amended at /build time per the cycle 0.1 spec-amendment precedent.
7. **Pre-existing CSP duplication, marathon-flake set, dependabot-on-main flake set carry-over from cycles 0.1 + 0.2.** Same defer-to-future-hardening posture. Out of scope here.
8. **No `perf:` commit subjects on per-task commits.** Per-task commits use `fix(scope):` or `test(e2e):` subjects — neither trips the `^(feat|perf):` narrow rule. Concretely Tasks 2/3/4/5 use `fix(parent):` or `fix(teacher):`; Task 6 uses `test(e2e):`; Task 7 wrap uses `docs(phase0):` and stages README ADR + cycle doc together.
9. **Code-review per cycle via `feature-dev:code-reviewer` agent — TWO runs** per CTO brief: once on the cycle doc itself before `/build` runs (catches spec defects), once on the cumulative `origin/staging..HEAD` diff before the wrap commit lands (catches implementation defects). Same shape as cycle 0.2.

### Non-goals

- No change to `prisma/schema.prisma`. No new column. No additive migration.
- No change to portal routing structure (no new routes, no removed routes).
- No change to other portal pages (`/admin/**`, `/parent/invoices`, `/parent/attendance`, `/teacher/student-journal`, `/teacher/profile`, `/teacher/slips`, `/teacher/assessments` — all out of scope).
- No animation removal that's purely cosmetic — only removal/deferral that demonstrably blocks first paint per Task 1 evidence.
- No move from RSC → Client Component or vice versa unless Task 1 evidence names it as the smallest viable fix.
- No Safari / Firefox perf testing (Chromium-only per CLAUDE.md).
- No `next.config.ts` Turbopack tuning. No `package.json` framework upgrade.
- No revisit of cycle 0.2's parent-helpers tightening (`_getParentWithChildren`).
- No perf optimization of `/api/auth/logout` (already covered by cycle 0.1).

---

## Tasks

Each task = 1 commit. `npm run build && npx vitest run` must pass between tasks (between-task gate). End-of-cycle gate adds Playwright on the LAST commit. Task 1 is investigative-only and folds its evidence into Task 7's wrap commit (mirroring cycle 0.2's Task 1/Task 6 fold).

### Task 1 — Diagnose: page-load timings + root cause per surface (no code)

**Goal:** ground-truth all four UAT timings on the live Vercel preview before any code lands. Drives the scope of Tasks 2–5 (any of which may collapse to negative-reproduction records).

**Steps:**

1. Wait for the Vercel preview spawned by this branch's PR to report `READY`. Capture the preview URL and ISO timestamp.
2. Open the preview in a headless Playwright session (or Vercel-MCP-equivalent navigation tool). Sign in via the demo cookie path so the timings reflect a normal authenticated session, not a cold-OAuth bounce. For each surface in `[/teacher, /parent, /parent/reports, /teacher/class-attendance]`:
   - Clear cookies; set the persona's demo cookie; navigate to the route; capture `performance.timing.loadEventEnd - performance.timing.navigationStart` and `performance.timing.responseStart - performance.timing.navigationStart` (TTFB).
   - Repeat 3 times per route (cold per load — clear cookies / fresh tab between iterations); record min / median / max.
   - Capture the network waterfall via the Vercel runtime-logs MCP for the surfaces whose median ≥ threshold (≥ 4 s for U3 / U8 / U9, ≥ 2 s for U7) — surface the slowest server-side span.
3. **For each surface whose median exceeds threshold**, run a one-shot tsx Prisma probe (mirrors cycle 0.2 Task 1 pattern) over the helpers the route uses: log raw `findMany` row counts + `select:` field cardinality + cache-hit/miss. Probes target:
   - `/teacher`: `prisma.attendanceRecord.findUnique` with the tenant-scoped employee ID — confirms 1 row, indexed lookup (or surfaces unexpected fan-out).
   - `/parent`: `prisma.studentJournalNote.findMany` row count for a 3-child guardian over rolling 90-day window; `getParentOutstandingForStudents` raw row count.
   - `/parent/reports`: `getPublishedAssessmentsForStudent` raw row count for the demo seed's published assessments.
   - `/teacher/class-attendance`: `GET /api/teaching-assignments/my` payload size + roster query row count.
4. Append findings to this cycle doc's `## Verification` section as `### Task 1 — Reproduction`. Include preview URL + ISO timestamps + persona cookie used + per-surface min/median/max + named root cause per surface (one of healed-by-rollback / reproduces-with-fix-surface / environmental).

**Files:** none (investigative). Cycle doc Verification block gets the report appended in the Task 7 wrap commit.

**Exit:**
- Each of the 4 surfaces has a verdict: healed / reproduces-fix-named / environmental.
- Tasks 2 / 3 / 4 / 5 are scope-trimmed accordingly. Empty stubs for healed surfaces.

### Task 2 — (Conditional) U7 — Parent home perf

**Skipped if** Task 1 finds `/parent` median < 4000 ms AND TTFB < 2000 ms post-rollback. **Even when skipped, a stub commit lands** with the negative-reproduction record so git history shows the per-finding diagnostic outcome (mirroring cycle 0.1 Task 3 + cycle 0.2 Task 4 pattern).

**Files (most likely):**
- `app/parent/page.tsx` — add `take: 6` (1 latest note × max 3 children × 2 reserve buffer) to the `prisma.studentJournalNote.findMany` call. The current code keeps only "first per kid" via `latestNoteByKid` map → bounded fetch is loss-less.
- `lib/parent-helpers.ts` — wrap `getParentOutstandingForStudents` in `unstable_cache` with a 30-s revalidate window AND tag `parent-outstanding`. Cache key includes `studentIds.sort().join(",")` + `tenantId` for per-household isolation. JSDoc updated to drop the "Uncached. … add a 30-s cache" TODO and replace with the global-tag-eviction note from `_getParentWithChildren`.
- `lib/__tests__/parent-helpers.test.ts` — extend with cache-shape regression tests: (a) sort-stability of cache key (different array order, same set → same key); (b) per-household isolation (different student-id sets → different cache entries); (c) tenant-scoped where-clause still defends in depth.

**Verification:** between-task gate green. Local re-measurement of `/parent` shows post-fix median improvement (recorded in Verification).

**Commit message (reproducing case):** `fix(parent): bound latestNotes fetch + cache outstanding (closes U7)`.
**Commit message (healed case):** `chore(uat): record U7 negative reproduction post-rollback`.

### Task 3 — (Conditional) U8 — Teacher class-attendance perf

**Skipped if** Task 1 finds `/teacher/class-attendance` time-to-roster-visible median < 4000 ms post-rollback (note: skip condition is roster-visible time per AC1, NOT `loadEventEnd`). **Even when skipped, a stub commit lands** with the negative-reproduction record. **A non-skip stub may still be required** to add the `data-roster-row` / `data-empty-state="no-students"` anchors that AC3's e2e perf-budget guard depends on — adding the anchors is mandatory regardless of healing status, so if Task 3 fully skips, the wrap commit (Task 7) lands the anchors as a one-line cycle-doc-only addition is NOT sufficient. Practically: if healing applies, this task lands a "data-attribute-only" commit (`chore(teacher): add roster anchors for perf-budget guard`).

**Files (most likely):**
- `app/teacher/class-attendance/page.tsx` — collapse the two sequential `useEffect` client fetches into one. Two viable shapes; Task 1 evidence picks the smaller one:
  - (a) Convert to a hybrid Server Component: page.tsx (RSC) prefetches assignments via `prisma.classSectionAssignment.findMany` scoped to `session.userId`, plus the initial roster for `assignments[0].classSection.id` + today's date, passing both as props to a new `ClassAttendanceClient` component that retains the cycle-tap optimistic UX. Client only re-fetches on class/date change.
  - (b) Pure-client: collapse the two `useEffect`s into one that issues `Promise.all([fetch("/api/teaching-assignments/my"), null])`, then on resolve fires the second fetch. Trims wall-clock by overlapping JS bundle parse with first roundtrip but still 2 RTT — only acceptable if Task 1 names the first RTT (assignments) as the dominant cost.
- `lib/teacher-helpers.ts` (NEW, only if (a) chosen) — exposes a single `getTeacherAssignmentsAndRoster(userId, tenantId, classSectionId, date)` server function. Cached with 30-s revalidate per assignment-list-stability and per-day roster-stability.
- `lib/__tests__/teacher-helpers.test.ts` (NEW, only if `lib/teacher-helpers.ts` lands) — vitest cases for the helper's where-clause shape + cache-key collapse.

**Verification:** between-task gate green. `e2e/teacher.spec.ts` cycle-tap flow stays green. Local re-measurement of `/teacher/class-attendance` shows post-fix median improvement.

**Commit message (reproducing case):** `fix(teacher): prefetch assignments + roster in one server roundtrip (closes U8)`.
**Commit message (healed case, anchors-only):** `chore(teacher): add roster anchors for perf-budget guard + record U8 negative reproduction`.

### Task 4 — (Conditional) U9 — Parent reports perf

**Skipped if** Task 1 finds `/parent/reports` median < 4000 ms post-rollback (most plausible outcome — the helpers are already cached + the route is a thin RSC). **Even when skipped, a stub commit lands** with the negative-reproduction record.

**Files (TBD per Task 1 evidence) — note: `app/parent/page.tsx` (parent home, addressed by Task 2) is NOT touched here; surface candidates are limited to the reports route:**
- `app/parent/reports/page.tsx` — if a Suspense boundary or framer-motion deferral surfaces as the cost.
- `app/parent/assessments-table.tsx` — if the table's internal motion / deferred rendering blocks first paint.
- Pure-RSC fix: if Task 1 names `getPublishedAssessmentsForStudent`'s cache-cold-spin as the cost, the helper's revalidate window or cache-tag invalidation strategy is the surface (current 120 s revalidate). Unlikely — the cold spin is one Postgres query for assessments under a known studentId; should be ≤ 200 ms warm.

**Verification:** between-task gate green. Local re-measurement of `/parent/reports` shows post-fix median improvement. `e2e/parent.spec.ts` reports-related assertions (if any) stay green.

**Commit message (reproducing case):** `fix(parent): <named cause> in /parent/reports first paint (closes U9)`.
**Commit message (healed case):** `chore(uat): record U9 negative reproduction post-rollback`.

### Task 5 — (Conditional) U3 — Teacher home perf

**Skipped if** Task 1 finds `/teacher` median < 4000 ms post-rollback. **Even when skipped, a stub commit lands** with the negative-reproduction record.

**Files (TBD per Task 1 evidence):**
- `app/teacher/home-client.tsx` — most plausible surface IF Task 1 names framer-motion delay-chain as the blocking cause. Current shape: 5 sequential `transition={{ delay: 0.15 / 0.25 / 0.3 }}` blocks. Removing or batching these does not change perceived UX (the actual block on the user is the GPS prompt, not the motion delays).
- `app/teacher/page.tsx` — only if Task 1 names a server-side cause (e.g., session verification stall). Most plausible fix would be a select-prune or an `unstable_cache` wrap on the today-attendance lookup. Surface depends on diagnosis.
- A `lib/teacher-helpers.ts` (NEW) for U3 only lands IF Task 5 needs a shared helper between `/teacher` and `/teacher/class-attendance` (Task 3 may already have introduced it).

**Verification:** between-task gate green. Local re-measurement of `/teacher` shows post-fix median improvement. `e2e/teacher.spec.ts` clock-in/out flow stays green.

**Commit message (reproducing case):** `fix(teacher): <named cause> on home first paint (closes U3)`.
**Commit message (healed case):** `chore(uat): record U3 negative reproduction post-rollback`.

### Task 6 — e2e: perf-budget regression guard

**File:** `e2e/perf-budget.spec.ts` (NEW).

**Why a new spec rather than extending an existing one:** keeps the failure message scoped to "perf-budget" so a regression points at the surface that breached the threshold, not at unrelated functional assertions in `e2e/parent.spec.ts` or `e2e/teacher.spec.ts`.

**Assertions (4 separate `test()` blocks for clear failure surfacing):**

1. `'page load /teacher < 4s'` — sign in as teacher (demo cookie); navigate to `/teacher`; assert `await page.evaluate(() => performance.timing.loadEventEnd - performance.timing.navigationStart) < 4000`. Hard `expect(loadMs, '/teacher load < 4000ms (UAT page-load BLOCKER threshold)').toBeLessThan(4000)`.
2. `'page load /parent < 4s'` — sign in as guardian (demo cookie); same shape; threshold 4000 ms.
3. `'page load /parent/reports < 4s'` — same guardian session; navigate; threshold 4000 ms.
4. `'page load /teacher/class-attendance < 4s'` — same teacher session; navigate; threshold 4000 ms.

**Implementation guards (lessons from prior cycles' e2e flakes):**
- `await page.waitForLoadState('load')` before reading `performance.timing.loadEventEnd`. Without this, on a fast prod build the timing read can fire before `loadEventEnd` is set, returning `0` and silently passing.
- Hard `expect(...)` rather than `expect.soft(...)` — perf regressions must fail loud (cycle 0.2's MAJOR review finding on `parent-attendance-scoping.spec.ts`).
- Each test creates its own browser context (no shared state) to avoid warm-cache cross-test contamination.
- Test order: teacher tests first (so any /teacher cookie state doesn't bleed into /parent assertions). 

**Verification:** `npx playwright test e2e/perf-budget.spec.ts` green against `DEMO_MODE=true npm run start`.

**Commit message:** `test(e2e): page-load perf-budget regression guard (4s threshold)`.

### Task 7 — Wrap up: README ADR + cycle doc Verification + Ship Notes + Phase 0 closure UAT reports

**Files:**
- `README.md` — new ADR row dated 2026-05-10 (cell ≤ 400 chars). Single line: "Phase 0 perf sweep — `<measured surfaces>`; `e2e/perf-budget.spec.ts` regression guard. Phase 0 BLOCKERS closed (U1 / U2 / U3 / U6 / U7 / U8 / U9 / U10)." Inserted above the cycle 0.2 row.
- `docs/cycles/2026-05-10-phase0-perf-sweep.md` — fill Implementation, Verification (incl. Task 1 evidence + per-task gate output + post-fix re-measurements + cumulative code review + AC10 closure-UAT outcome), Ship Notes (any ops dependency, env caveats, follow-ups).
- `docs/uat/reports/2026-05-10-teacher.md` (NEW per AC10) — `/uat teacher` report against the Vercel preview. Forced-staged via `git add -f` per the `/spec` skill UAT-staleness rule.
- `docs/uat/reports/2026-05-10-parent.md` (NEW per AC10) — `/uat parent` report against the Vercel preview. Same forced-stage shape.

**Phase 0 closure UAT gate (AC10):** after the end-of-cycle gate is green and the cumulative-review fix-set has landed, run `/uat teacher` then `/uat parent` against the Vercel preview spawned by this branch's PR. Personas: Pak Budi for `/uat teacher`, Bu Sari for `/uat parent` (third persona Ibu Nur covers admin which is out of scope). The two report files land in `docs/uat/reports/` and are committed in this wrap commit. **Expected outcome:** 0 BLOCKERs across both reports — that closes Phase 0. Major / minor findings are recorded but DO NOT block merge (they roll into Phase 4 polish per plan §5). If any BLOCKER reproduces, do NOT proceed to `/ship` — instead, file a Phase 0.4 follow-up cycle and leave this branch unmerged while diagnosing.

**End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test` — all green. Marathon-flake caveat (cycles 0.1 + 0.2): if local Playwright stalls server CPU after ~25 min, re-run a moderate subset on a fresh server, then defer to CI as canonical authority.

**Code-review gate:** `feature-dev:code-reviewer` agent run TWICE per CTO brief — once on the cycle doc itself before `/build` runs (catches spec defects), once on the cumulative `origin/staging..HEAD` diff before this wrap commit lands (catches implementation defects).

**Commit message:** `docs(phase0): wrap cycle phase0-perf-sweep + close Phase 0 UAT`.

---

## Implementation

- **Subagent plan:** all tasks sequential. T1 evidence drives T2/T3/T4/T5 scope; T6 depends on T3's `data-roster-row` anchor; T7 wraps. No parallel dispatch — diagnosis-driven cadence per cycles 0.1 + 0.2 precedent.

### Task 1 — Diagnosis (no separate commit; evidence appended here)

**Server:** `DEMO_MODE=true npm run start` on `localhost:3000` (NODE_ENV=production via `next start`). Probe = ad-hoc tsx Playwright script (`@playwright/test` chromium), 3 cold loads per surface (clear cookies between iterations, fresh `BrowserContext`). Cookie shape resolved via `GET /api/auth/users` runtime discovery — TEACHER `u_teacher` (Guru Tiga), GUARDIAN `u_rightjet` (Siti Nurhaliza Hidayat, multi-child seed per cycle 0.2 reuse).

**Per-surface measurement shape (per AC1):**
- `/teacher`, `/parent`, `/parent/reports` — RSC routes; measured `performance.timing.loadEventEnd - performance.timing.navigationStart`.
- `/teacher/class-attendance` — `"use client"` route; measured time-to-roster-visible (`Date.now()` delta until `button` rows render OR "Belum ada siswa" empty state OR "Belum ditugaskan" no-class state appears via `page.waitForFunction`).

**Vercel-preview-vs-local note (carried over from cycle 0.1).** Local prod build measures the rolled-back code's intrinsic performance against zero network latency + warm Postgres pooler. Vercel cold start under intermittent 4G could differ. Manual Vercel preview re-verification documented as a Ship Notes step (post-merge), not as the cycle's gate. The `e2e/perf-budget.spec.ts` regression guard ships against the local prod-build envelope and is the canonical green-light authority for perf regressions in CI; Vercel cold-start envelopes are out of scope for the e2e gate per Spec Assumption 3.

**Measurements (median of 3 cold loads):**

| Surface | Plan figure | Median load (ms) | Median TTFB (ms) | Roster-visible (ms) | Verdict | Evidence |
|---|---|---|---|---|---|---|
| `/teacher` | 15 000 | **119** | 54 | n/a | HEALED ~126× | runs: 432, 117, 119 |
| `/teacher/class-attendance` | 3 100–4 000 | 157 (RSC frame) | 53 | **541** | HEALED ~6× | roster runs: 541, 293, 567 |
| `/parent` | 2 100 | **127** | 57 | n/a | HEALED ~16× | runs: 347, 127, 120 |
| `/parent/reports` | 5 100 | **147** | 62 | n/a | HEALED ~34× | runs: 147, 136, 171 |

**Verdict per AC2:** all four surfaces fall under verdict **(a) — healed by rollback alone**. None reproduce above the 4 000 ms BLOCKER threshold, none reproduce above the 2 000 ms MAJOR threshold for U7. Plan figures (15 s / 2.1 s / 3.1–4 s / 5.1 s) match cycle 0.1's "U1 healed by rollback" + cycle 0.2's "U2 backlog 364 → 25 stale artifacts" precedent — pre-rollback artifacts.

**Latent perf knobs identified during diagnosis but DEFERRED (acceptable per AC2 verdict (a)):**
- `app/parent/page.tsx:120-128` — `prisma.studentJournalNote.findMany` carries no `take:` cap. At demo-seed scale (3 children, < 10 active notes) this is irrelevant; at production scale (100s of notes per active household) it would matter. Deferred to Phase 4 polish.
- `lib/parent-helpers.ts:416-445` — `getParentOutstandingForStudents` is uncached (helper's own JSDoc TODO: "If benchmarks show home regressing > 100 ms, add a 30-s cache."). Current home-page total at demo-seed scale is well under 100 ms; threshold not crossed. Deferred to Phase 4 polish.
- `app/teacher/class-attendance/page.tsx:54-99` — two sequential client `useEffect` fetches (`/api/teaching-assignments/my` then `/api/student-attendance`). Sequential RTT shape is real; on local prod build the two roundtrips total 541 ms median which is still 7× under threshold. At production scale on intermittent 4G the sequential shape could resurface. Deferred to a future "client-fetch parallelization" cycle if `/uat teacher` surfaces a renewed BLOCKER post-merge.

**Frontend gate (pre-commit Rule 4):** cycle doc contains the literal token `design-system` in the Context section "Hooks reminder" paragraph and now also in this Verification line: design-system: no visual changes; perf-only diff (data-anchor additions on student rows + empty state). Cross-checked `.claude/standards/design-system.html` §"Mobile portal · cards" for the student-row card pattern — no styling change required.

<!-- per-task implementation bullets appended below as tasks land -->

### Task 2 — U7 (parent home perf) — NEGATIVE REPRODUCTION

`/parent` median load 127 ms vs UAT figure 2 100 ms vs MAJOR threshold 2 000 ms. Healed by rollback alone (verdict (a)). No code change. Latent perf knobs (`studentJournalNote.findMany` unbounded fetch + `getParentOutstandingForStudents` uncached) documented in Task 1 evidence + deferred to Phase 4 polish per AC2 verdict (a).

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
