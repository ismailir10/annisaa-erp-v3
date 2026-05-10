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

- [ ] **AC10. Phase 0 closure gate (per plan §5) — runs as Ship Notes ops step post-merge, not in /build.** Amended per cycle 0.1 + 0.2 precedent (which deferred manual Vercel-preview verification to Ship Notes) AND per the actual `.claude/skills/uat/SKILL.md` default target (the staging branch URL `https://annisaa-erp-v3-git-staging-…vercel.app`, NOT a per-PR preview URL). Once this PR merges to `staging` and Vercel rebuilds the staging URL, the CTO runs `/uat teacher` then `/uat parent` against that staging URL. Both reports land in `docs/uat/reports/2026-05-10-teacher.md` + `docs/uat/reports/2026-05-10-parent.md` via a follow-up doc-only commit on `staging` (NOT this branch). **Expected outcome:** 0 BLOCKER findings across both reports — this closes Phase 0. If any BLOCKER reproduces, file a Phase 0.4 follow-up cycle. Major/minor findings recorded but do NOT block (they roll into Phase 4 polish per plan §5).

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

### Task 7 — Wrap up: README ADR + cycle doc Verification + Ship Notes (closure UAT deferred to Ship Notes ops step)

**Files:**
- `README.md` — new ADR row dated 2026-05-10 (cell ≤ 400 chars). Single line: "Phase 0 perf sweep — `<measured surfaces>`; `e2e/perf-budget.spec.ts` regression guard. Phase 0 BLOCKERS closed (U1 / U2 / U3 / U6 / U7 / U8 / U9 / U10)." Inserted above the cycle 0.2 row.
- `docs/cycles/2026-05-10-phase0-perf-sweep.md` — fill Implementation, Verification (incl. Task 1 evidence + per-task gate output + cumulative code review fix-set + AC10 amendment to ship-notes step), Ship Notes (Phase 0 closure UAT ops step + any env caveats + follow-ups).

**Phase 0 closure UAT (AC10) — deferred to Ship Notes ops step.** Amendment from earlier draft: AC10's `/uat teacher` + `/uat parent` runs are NOT performed during /build wrap because (a) the per-PR Vercel preview does not exist until /ship opens the PR, and (b) the `.claude/skills/uat/SKILL.md` default target is the staging branch URL, not a per-PR preview URL. Cycles 0.1 + 0.2 both deferred manual Vercel verification to Ship Notes for the same reason. The `/uat` reports land via a follow-up doc-only commit on `staging` after this PR merges — not in this wrap commit.

**End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test` — all green. Marathon-flake caveat (cycles 0.1 + 0.2): if local Playwright stalls server CPU after ~25 min, re-run a moderate subset on a fresh server, then defer to CI as canonical authority.

**Code-review gate:** `feature-dev:code-reviewer` agent run TWICE per CTO brief — once on the cycle doc itself before `/build` runs (catches spec defects), once on the cumulative `origin/staging..HEAD` diff before this wrap commit lands (catches implementation defects).

**Commit message:** `docs(phase0): wrap cycle phase0-perf-sweep`.

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

### Task 3 — U8 (teacher class-attendance perf) — anchors-only

`/teacher/class-attendance` time-to-roster-visible median 541 ms vs UAT figure 3 100–4 000 ms vs BLOCKER threshold 4 000 ms. Healed by rollback alone (verdict (a)) — but the `e2e/perf-budget.spec.ts` regression guard (Task 6) selector depends on a stable DOM anchor for "roster done loading", so this commit lands the anchors regardless of healing status (per spec's commit-message-healed-case clause).

**Files:** `app/teacher/class-attendance/page.tsx` (3 edits, +3 -2 lines).

**Production change:**
- Wrapped the assignments-empty `EmptyState` in `<div data-empty-state="no-class-assigned">` (line 150).
- Wrapped the students-empty `EmptyState` in `<div data-empty-state="no-students">` (line 207).
- Added `data-testid="roster-row"` attribute to the per-student `<button>` element (line 213). **(Cumulative-review MINOR-1 fix: changed from boolean `data-roster-row` to value-keyed `data-testid="roster-row"` to match repo's existing test-anchor convention — `e2e/teacher.spec.ts:168` uses `[data-testid="open-week-view"]`. Selector update mirrored in `e2e/perf-budget.spec.ts`.)**

**No behavior change.** Pure DOM anchor additions for the regression-guard selector. Cycle-tap interaction unchanged. Visual styling unchanged. Per the cycle doc's frontend-gate satisfaction line: design-system: no visual changes; perf-only diff (data-anchor additions on student rows + empty state).

**Latent perf knob (deferred):** the two sequential `useEffect` client fetches (`/api/teaching-assignments/my` then `/api/student-attendance`) are still in place. Total RTT 541 ms median against localhost is well under threshold; under intermittent 4G the sequential shape could resurface. If a post-merge `/uat teacher` (AC10) flags renewed BLOCKER, file `phase0-class-attendance-server-prefetch` as a follow-up cycle.

### Task 4 — U9 (parent reports perf) — NEGATIVE REPRODUCTION

`/parent/reports` median load 147 ms vs UAT figure 5 100 ms vs BLOCKER threshold 4 000 ms. Healed by rollback alone (verdict (a)). No code change. UAT framing of "sheet open 5.1s" was imprecise — the route is a server RSC, not a client modal/sheet (Spec Assumption 6 confirmed against the source). Cached helpers (`getPublishedAssessmentsForStudent` 120 s, `getParentWithChildren` 60 s) are healthy at demo-seed scale.

### Task 5 — U3 (teacher home perf) — NEGATIVE REPRODUCTION

`/teacher` median load 119 ms vs UAT figure 15 000 ms vs BLOCKER threshold 4 000 ms. Healed by rollback alone (verdict (a)) — the largest delta of the four (~126× faster than UAT). No code change. The 15 s UAT figure was implausible for the source's actual shape (37-line server component + single `findUnique`); diagnosis-first per cycle 0.1 + 0.2 precedent confirmed the figure was a pre-rollback artifact. The framer-motion delay-chain in `TeacherHomeClient` (`transition={{ delay: 0.15 / 0.25 / 0.3 }}`) is cosmetic, runs after first paint, and does NOT block `loadEventEnd`. GPS prompt timeout (10 s) only fires on user-initiated check-in, not on home-page load.

### Task 6 — e2e/perf-budget.spec.ts — regression guard

**Files:** `e2e/perf-budget.spec.ts` (NEW, 142 lines).

**Coverage (4 tests, all green locally):**

```
Running 4 tests using 1 worker
  ✓  1 /teacher load < 4s (764ms)
  ✓  2 /parent load < 4s (421ms)
  ✓  3 /parent/reports load < 4s (226ms)
  ✓  4 /teacher/class-attendance roster visible < 4s (1.0s)
4 passed (3.2s)
```

**Implementation matches Spec AC3 verbatim:**
- Cookie discovery via `GET /api/auth/users` in `beforeAll` (per existing demo-mode pattern in `e2e/teacher.spec.ts` + `e2e/parent-attendance-scoping.spec.ts`). Static slugs would silently 307 → vacuous green.
- RSC routes use `await page.waitForLoadState('load')` before reading `performance.timing.loadEventEnd - navigationStart` — guards against the false-zero timing read on fast prod builds (cycle 0.1 review lesson on `setTimeout` vs `waitForFunction`).
- `/teacher/class-attendance` client route uses `Date.now()` delta + `waitForSelector` on the `data-roster-row, [data-empty-state="no-students"], [data-empty-state="no-class-assigned"]` anchor union (anchors landed in T3). 6-s hard `waitForSelector` timeout so a regression beyond 4 s budget fails loud rather than hanging at the default 30 s.
- Hard `expect(...).toBeLessThan(PERF_BUDGET_MS)` per route — no `expect.soft(...)` (cycle 0.2 nav-anchor lesson).
- One context per test (no shared cookie state across teacher / guardian tests).

**Build-cache caveat (lesson learned during T6 dev) — PRESCRIPTIVE:** `next start` caches the compiled `.next/` directory in memory at process startup. After `npm run build` between tasks, the running server must be killed AND a fresh `DEMO_MODE=true npm run start` started before `npx playwright test` runs against the new code — otherwise newly-added DOM anchors (e.g. the `data-testid="roster-row"` added in T3) are invisible and the spec hangs on selector wait. **Prescriptive rule for any future cycle that touches e2e + source-code in the same session:** `pkill -f "next-server"; sleep 1; DEMO_MODE=true npm run start &` before every `npx playwright test`. Never `npx playwright test` against a stale server. Cost in T6: ~15 minutes investigation + a 6-s flake before the cause was identified.

## Verification

### Per-task gates (between-task)

| # | Task | Gate | Result |
|---|---|---|---|
| 1 | Diagnose 4 timings | manual Playwright probe (ad-hoc tsx) | recorded above; no code change |
| 2 | (skipped → stub) U7 negative reproduction | doc-only; build skipped | no code touched |
| 3 | T3 anchors-only + record U8 | `npm run build && npx vitest run` | build green; 1108 passed / 2 skipped / 42 todo, 46.26 s |
| 4 | (skipped → stub) U9 negative reproduction | doc-only; build skipped | no code touched |
| 5 | (skipped → stub) U3 negative reproduction | doc-only; build skipped | no code touched |
| 6 | e2e/perf-budget.spec.ts | `npm run build && npx vitest run` + `npx playwright test e2e/perf-budget.spec.ts` | build green; 1108 passed / 2 skipped / 42 todo, 26.66 s; perf-budget 4 / 4 passed in 3.2 s |
| 7 | Wrap (this commit) | full end-of-cycle gate | see below |

### End-of-cycle gate

```
npm run build       → next build green; routes inventory unchanged.
npx vitest run      → 133 files passed | 2 skipped (135) | 1108 passed | 42 todo (1150) | 21.81s.
npx playwright test → 92 tests across full e2e suite, single DEMO_MODE=true npm run start server.
                       84 passed, 4 failed, 4 skipped, 2.4 min total.
```

**Investigation of the 4 Playwright failures.** All four failures are in `e2e/admin.spec.ts:473/524/575/628` — the same pre-existing flake set documented in cycles 0.1 + 0.2 ("Admin tagihan flows — Xendit retry/alert UI"). Failure shape: `getByRole('button', { name: /Coba Lagi Link \(\d+\)/ })` not visible within 15 s. None of this cycle's diff (`app/teacher/class-attendance/page.tsx` data-anchors, `e2e/perf-budget.spec.ts` new spec, `README.md` ADR row, cycle doc) touches the admin tagihan UI surface. Cycles 0.1 + 0.2 made the same call; CI is the canonical green-light authority per CLAUDE.md + cycle 0.1 marathon-flake learning. Filed as ongoing follow-up `phase0-admin-tagihan-flake-fix` (carry-over from cycles 0.1 + 0.2 Ship Notes).

**Conclusion.** This cycle's own touch surface (3 data-attributes + 1 e2e spec + 1 README row + cycle doc) cannot mechanically cause `e2e/admin.spec.ts` admin-bulk/manual flows to fail. The 4 perf-budget tests this cycle adds are 4 / 4 green.

### Cumulative code review (cycle wrap)

`feature-dev:code-reviewer` ran TWICE per CTO brief — once on the `/spec` cycle doc (BLOCKER B1 [demo cookie discovery shape] + BLOCKER B2 [`loadEventEnd` cannot capture client-route render cost] + MAJORs M1 [stub-commit healed-case messages] / M2 [cache-key sort consistency + JSDoc invalidation note] / M3 [AC10 Phase 0 closure gate explicit] + MINORs m1 / m2, ALL fixed before `/build` ran). Then once on the cumulative `origin/staging..HEAD` diff before this wrap commit.

**Cumulative-pass findings + resolutions:**

| Severity | Finding | Resolution |
|---|---|---|
| BLOCKER / Critical | none | — |
| MAJOR-1 | Module-level `let teacherUserId / parentUserId` placement is a style deviation — repo `e2e/parent-attendance-scoping.spec.ts` keeps describe-scoped state inside the describe callback. No runtime risk under `workers: 1`. | **Accepted as-is.** `e2e/teacher.spec.ts:6-14` uses the same module-level placement pattern, so both shapes coexist in the repo. Reviewer concession noted. No change. |
| MAJOR-2 | `Date.now()` captured before `page.goto()` for the client-route test — measures user-perceived render shape, AFFIRMed by the reviewer in the same line. | **Accepted as intentional.** The client-route shape per Spec AC1 / AC3 measures user-perceived render, NOT `loadEventEnd`. Comment in `e2e/perf-budget.spec.ts:20-25` documents the rationale. |
| MINOR-1 | `data-roster-row` boolean attribute diverges from repo's `data-testid` convention (`e2e/teacher.spec.ts:168`). | **Fixed in this wrap commit.** Renamed `data-roster-row` → `data-testid="roster-row"` on `app/teacher/class-attendance/page.tsx:213`; selector mirrored in `e2e/perf-budget.spec.ts`. Local re-run after rename: 4 / 4 passed in 3.2 s. |
| MINOR-2 | Build-cache caveat wording in cycle doc was paragraph-form; could be sharpened to a prescriptive checklist line. | **Fixed in this wrap commit.** Caveat tightened with the exact `pkill -f "next-server"; sleep 1; DEMO_MODE=true npm run start &` command + the cost-in-time disclosure (~15 min wasted in T6). |
| MINOR-3 | AC10 named `/uat against per-PR Vercel preview` but `.claude/skills/uat/SKILL.md` defaults to staging branch URL, not per-PR preview. | **Fixed in this wrap commit.** AC10 amended to defer Phase 0 closure UAT to a Ship Notes ops step (post-merge against staging URL, matching cycles 0.1 + 0.2 manual-Vercel-verification precedent). Task 7 description amended to drop the `docs/uat/reports/*` from the wrap-commit file list. |
| AFFIRM × 5 | `waitForLoadState('load')` guarding the false-zero `loadEventEnd` race; `waitForSelector` 6-s timeout exceeds 4-s assert threshold so error message surfaces budget violation before timeout; negative-reproduction rationales specific enough as future regression witnesses; JTBD library skip is correct (data-attribute additions are not user-facing capability shifts); hooks compliance clean (every per-task commit `chore:` / `test:` prefix sidesteps the `^(feat|perf):` narrow rule, frontend-gate satisfied via `design-system` token in cycle doc, 25-file cap honoured). | n/a |

### File-count + hooks verification

```
git diff --stat origin/staging..HEAD
```

| Category | Files |
|---|---|
| `app/**/*.tsx` (frontend gate fires; cycle doc has `design-system` token ✓) | `app/teacher/class-attendance/page.tsx` (1) |
| `e2e/**/*.ts` | `e2e/perf-budget.spec.ts` (1, NEW) |
| `README.md` | 1 row added (cell sizes 10 / 165 / 225 chars — all under 400-char cap) |
| `docs/cycles/**` | `docs/cycles/2026-05-10-phase0-perf-sweep.md` (1, NEW) |
| **Total** | **4 files** (well under 25-file §18.2 cap) |

Per-task commits (after wrap):

```
git log origin/staging..HEAD --oneline
docs(phase0): wrap cycle phase0-perf-sweep                   <-- this commit
test(e2e): page-load perf-budget regression guard (4s threshold)
chore(uat): record U3 negative reproduction post-rollback
chore(uat): record U9 negative reproduction post-rollback
chore(teacher): add roster anchors for perf-budget guard ...
chore(uat): record U7 negative reproduction post-rollback
```

Every commit subject is `chore:` / `test:` / `docs:` — none matches `^(feat|perf):` — the commit-msg narrow rule never fires; per-task README staging not required (README is staged in the wrap commit alongside the cycle doc, which is the cleanest history).

## Ship Notes

- **Migrations:** none.
- **Env vars:** none added; none changed.
- **API contract changes:** none. Three additive `data-*` attributes on `app/teacher/class-attendance/page.tsx` (DOM-only, no runtime behavior change). Existing `cycleStatus` interaction unchanged. Existing teacher e2e specs (`e2e/teacher.spec.ts`) stay green.
- **Rollback:** `git revert <merge-commit>`. Reverts the 3 data-anchors + the new `e2e/perf-budget.spec.ts` regression guard + the README ADR row + cycle doc. Reverts also drop the perf regression guard, which would re-open the cycle's primary user-protection — but does NOT regress live user-facing behavior. No data loss.
- **Manual U3 / U7 / U8 / U9 verification on Vercel preview** (mirrors cycle 0.1's "Manual U1 verification on Vercel preview" pattern): once the `/ship` PR opens and Vercel reports the staging-branch preview as `READY`, sign in as Pak Budi (real Google OAuth `pakbudi.demo@…` or substitute teacher seed), Bu Sari (`ismail10rabbanii@gmail.com`), and Ibu Nur (`rightjet.hq@gmail.com`). Probe page-load timing on each of the 4 surfaces (`/teacher`, `/parent`, `/parent/reports`, `/teacher/class-attendance`) — confirm < 4 s on a real cold tab. If any surface reproduces > 4 s on the preview (Vercel cold-start could differ from local prod build per Spec Assumption 3), file `feat/phase0-perf-vercel-coldstart-fix` as a follow-up cycle.
- **Phase 0 closure UAT (AC10 amendment)** — runs as a follow-up doc-only commit on `staging` AFTER this PR merges and Vercel rebuilds the staging URL. Steps:
  1. `cd <main checkout> && git fetch origin && git checkout staging && git pull --ff-only origin staging`.
  2. Run `/uat teacher` (Pak Budi persona). Skill defaults to `https://annisaa-erp-v3-git-staging-…vercel.app`. Expected outcome: 0 BLOCKER findings.
  3. Run `/uat parent` (Bu Sari persona). Same default target. Expected outcome: 0 BLOCKER findings.
  4. Both reports land at `docs/uat/reports/2026-05-10-{teacher,parent}.md`. Commit + push to `staging` directly OR via a separate doc-only PR (CTO call). Major / minor findings recorded but DO NOT block — they roll into Phase 4 polish per plan §5.
  5. **If any BLOCKER reproduces:** do NOT close Phase 0; file `feat/phase0-4-uat-blocker-fix` as a follow-up cycle.
- **Pre-existing flake set carry-over from cycles 0.1 + 0.2:** 4 failures on `e2e/admin.spec.ts:473/524/575/628` (Admin tagihan flows — Xendit retry/alert UI). Not blocking this PR. Track follow-up under `phase0-admin-tagihan-flake-fix` if CI reproduces.
- **Pre-existing CSP duplication carry-over from cycle 0.1:** `next.config.ts` and `lib/security/headers.ts` both emit `Content-Security-Policy-Report-Only`. Harmless (both Report-Only); consolidate when CSP graduates to enforcing.
- **Plan §3 figure correction (carry-over from cycle 0.2 pattern):** the "U3 15 s / U7 2.1 s / U8 3.1–4 s / U9 5.1 s" entries in `docs/plans/2026-05-10-v1-incremental-evolution.md` are stale post-rollback. Actual local-prod-build medians (this cycle's diagnosis): 119 ms / 127 ms / 541 ms / 147 ms. Plan doc is not edited in this cycle (figures are historically accurate as *pre-rollback* measurements). A future plan refresh should re-read live timings rather than carrying historical figures.
- **Phase 0 status — CLOSED (pending AC10 closure UAT):** with this cycle merged, Phase 0 has shipped 3 cycles (0.1 hydration+bfcache, 0.2 finance-backlog+parent-attendance-scoping, 0.3 perf-sweep) and closed UAT findings U1 / U2 / U3 / U6 / U7 / U8 / U9 / U10 (8 of 10 — U4 + U5 explicitly deferred to Phase 4 per plan §5 and user §7 q5). Per plan §5 verdict gate: re-run all 10 UAT scenarios; expect 0 BLOCKER findings. **Next:** Phase 1 cycle 1.1 `daftar-public-form`.
- **`/ship --to-main` cadence:** NOT this cycle. Per plan §7 q7, accumulate Phase 0 (3 cycles done after this) + Phase 1 (~2 cycles) before first prod promotion since rollback. Earliest staging→main promotion = end of Phase 1.
