# Teacher Portal Interface

## Context

Teacher portal already shares parent portal's strongest mobile shell patterns: a constrained `max-w-md` layout, sticky portal header, five-slot bottom navigation, shared page headers, semantic tokens, and state components. Full `better-interface` source review found the highest-impact remaining friction in the daily teacher flow rather than the shell: the leave card and weekly assessment radios are not fully keyboard-operable, several attendance and leave controls lack programmatic labels, leave-request fetch failures can masquerade as an empty list, destructive confirmations use vague labels, and routine roster motion does not consistently honor reduced-motion preferences. Fresh UAT evidence from `docs/uat/reports/2026-06-04-admin-teacher-full.md` also identifies unresolved teacher assessment friction; this cycle addresses corroborated interface defects in the highest-traffic teacher workflow while preserving the parent-derived navigation contract.

## Spec

### Acceptance criteria

- [ ] Teacher can open the leave-request flow from the attendance page with pointer or keyboard, with a visible focus indicator and correct control semantics.
- [ ] Class, date, pickup-name, and leave-form controls expose programmatic labels that match their visible labels.
- [ ] Weekly assessment day and level choices support the complete keyboard interaction expected by their announced radio-group semantics.
- [ ] Leave-request loading, empty, and fetch-error states remain distinct; an API failure never claims that no requests exist and offers a clear retry path.
- [ ] Destructive confirmation actions name their exact consequence in calm Indonesian copy.
- [ ] Dashboard and roster motion honors `prefers-reduced-motion`; routine student rows do not use cumulative stagger delays.
- [ ] Existing five-slot teacher bottom navigation, shared portal shell, semantic colors, and parent-compatible portal primitives remain unchanged.
- [ ] Relevant Vitest coverage protects keyboard semantics, error-state recovery, confirmation copy, and reduced-motion behavior.
- [ ] Build, Vitest, and focused Playwright teacher smoke pass, or local Playwright deferral is recorded for CI when the harness cannot run it.
- [ ] Runtime review covers 320–375px widths, keyboard traversal, loading/empty/error states, and reduced-motion behavior.

### Non-goals

- Navigation IA changes, a sixth teacher tab, or a teacher overflow sheet.
- Parent-only child selection, household cards, finance prioritization, or guardian copy patterns.
- API contracts, database schema, teacher authorization, attendance business rules, or Jakarta-date behavior.
- Broad visual redesign of pages already conforming to shared portal standards.
- Global replacement of `transition-all` in shared UI primitives.

### Assumptions

- Scope is the highest-traffic complete teacher flow: dashboard, attendance/class and session rosters, leave requests, and weekly assessment controls.
- Current shared portal shell and five-tab mobile navigation are approved precedent and should be preserved.
- Fresh June 4 UAT findings are inputs only where current source or runtime verification confirms them.
- Indonesian remains the interface language; existing project terminology and Islamic courtesy layer remain authoritative.

## Tasks

- [x] **Task 1 — Repair daily-flow semantics and labels** (independent): make the attendance leave card a semantic keyboard trigger and associate visible labels with class, date, pickup-name, and leave-form controls.  
  Acceptance: keyboard and accessibility tests confirm every scoped control exposes name, role, state, and visible focus.

- [x] **Task 2 — Separate leave error recovery from empty state** (independent): represent leave-request loading, success, empty, and fetch failure explicitly; add a retry path and consequence-specific destructive copy.  
  Acceptance: request failure renders actionable error copy, empty renders only after a successful empty response, and confirmations name the action.

- [x] **Task 3 — Complete assessment keyboard interaction** (independent): replace or complete custom weekly day/level radio behavior using the established component and APG keyboard pattern.  
  Acceptance: Tab enters each group once; Arrow keys, Home, End, Enter/Space, checked state, and focus state work without pointer input.

- [x] **Task 4 — Respect reduced motion in routine teacher surfaces** (independent): add reduced-motion handling to dashboard transitions and remove cumulative roster entrance staggering from daily attendance/session flows.  
  Acceptance: reduced-motion renders immediate stable content and routine rosters remain scannable without per-row delay.

- [x] **Task 5 — Consolidated interface verification** (depends on Tasks 1–4): run targeted unit/component tests, between-task and end-of-cycle gates, then inspect keyboard, 320–375px, loading/empty/error, and reduced-motion states against `design-system.html` §§14–16.  
  Acceptance: no actionable `HIGH`, `MEDIUM`, or scoped `LOW` `better-interface` finding remains; verification evidence and any environment-bound Playwright deferral are recorded.

## Implementation

- Subagent plan: driver=gpt-5.5 high, dirty-work=gpt-5.6-terra low; Tasks 1 and 3 parallel, Tasks 2 and 4 sequential after overlapping-file slices, Task 5 sequential verification.
- Task 1: Repair daily-flow semantics and labels — `app/teacher/attendance/page.tsx`, `app/teacher/class-attendance/page.tsx`, `app/teacher/sessions/[id]/client.tsx`, `components/teacher/leave-sheet.tsx`, `components/teacher/__tests__/leave-sheet.test.tsx` — converted the leave card to a semantic button and associated visible labels with scoped controls.
- Task 3: Complete assessment keyboard interaction — `app/teacher/assessments/weekly/client.tsx`, `app/teacher/assessments/weekly/__tests__/client.test.tsx` — replaced click-only custom radios with native grouped inputs plus wrapping Arrow/Home/End and Enter/Space behavior while preserving visual treatment.
- Task 2: Separate leave error recovery from empty state — `app/teacher/attendance/page.tsx`, `components/teacher/leave-sheet.tsx`, `components/portal/portal-header.tsx`, focused tests — introduced explicit loading/ready/error state, retryable recovery, and consequence-specific cancel/logout labels.
- Task 4: Respect reduced motion in routine teacher surfaces — `app/teacher/home-client.tsx`, `app/teacher/class-attendance/page.tsx`, `app/teacher/sessions/[id]/client.tsx`, `app/teacher/__tests__/home-motion.test.tsx` — disabled dashboard entrance/interaction transforms for reduced-motion users and removed cumulative routine roster staggering.
- Task 5: Consolidated interface verification — `app/teacher/assessments/weekly/__tests__/client.test.tsx`, `e2e/teacher.spec.ts` — stabilized async radio assertions, synchronized the logout E2E contract, and verified the complete scoped interface against `design-system.html` §§14–16.

## Verification

- Task 1: focused leave-sheet tests passed (2); TypeScript passed; full gate passed after network-enabled font fetch (`npm run build`, 258 Vitest files passed / 2 skipped, 2552 tests passed / 42 todo).
- Task 3: focused weekly-assessment tests passed (7 across client and helper suites); full build and Vitest gate covered the staged implementation and passed with Task 1.
- Task 2: focused leave/header tests passed (10); TypeScript passed; full gate passed (`npm run build`, 259 Vitest files passed / 2 skipped, 2554 tests passed / 42 todo).
- Task 4: focused motion/state tests passed (8); TypeScript passed; full build and Vitest gate covered the staged implementation and passed with Task 2. Motion behavior follows current official `useReducedMotion` guidance and existing `framer-motion` imports.
- Task 5 browser: demo teacher session inspected at 375×812 and 320×720. Dashboard and class-attendance pages had zero horizontal overflow; five-slot navigation, page hierarchy, roster states, and fixed chrome remained legible.
- Task 5 keyboard/semantics: leave trigger exposed native button semantics; rendered leave form exposed `Jenis Cuti`, `Tanggal Mulai`, `Tanggal Selesai`, and `Alasan` labels; weekly day radios moved selection with ArrowRight and End while preserving checked/focus state.
- Task 5 states/copy: successful leave empty state rendered independently from loading/error tests; retryable error path passed focused component tests; logout alert rendered `Keluar dari akun`; reduced-motion branch passed focused component tests with all entrance states disabled.
- Task 5 rejected candidates: teacher bottom-nav redesign rejected because shared five-slot contract already passed 320–375px checks; parent child/household patterns rejected as guardian-specific; one transient React hydration warning rejected after fresh home and class-attendance tabs reproduced zero warnings and scoped diffs did not affect hydration markup.
- End-of-cycle gate: `npm run build` passed; `npx vitest run` passed (259 files passed / 2 skipped; 2554 tests passed / 42 todo). Initial red run was diagnosed as local-server resource contention plus a test-only async transition race; focused reruns and clean full rerun passed.
- Playwright: local run deferred to CI because `playwright.config.ts` safely refused the non-local staging Supabase `DATABASE_URL`. Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.

## Ship Notes

- Database migrations: none.
- New environment variables: none.
- Preview smoke:
  1. Sign in as teacher and inspect dashboard at 320px and 375px widths.
  2. Open `Kehadiran` → `Cuti & Izin`; verify keyboard activation, labeled request fields, successful empty state, and retryable network-error state.
  3. Open `Kelas`; verify class/date labels and stable roster rows with reduced motion enabled.
  4. Open `Penilaian Pekanan`; verify one Tab stop per radio group plus Arrow/Home/End/Enter/Space behavior without changing unrelated assessment data.
  5. Open logout confirmation; verify `Keluar dari akun`, then cancel.
- Playwright remains required in CI because local configuration correctly blocked the staging Supabase database.
- Rollback: revert commits `1d0fe1c4`, `7a80e05b`, `0647220b`, `6fcba981`, and `1b3fc799` in reverse order; no data rollback required.
