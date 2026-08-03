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

- [ ] **Task 2 — Separate leave error recovery from empty state** (independent): represent leave-request loading, success, empty, and fetch failure explicitly; add a retry path and consequence-specific destructive copy.  
  Acceptance: request failure renders actionable error copy, empty renders only after a successful empty response, and confirmations name the action.

- [x] **Task 3 — Complete assessment keyboard interaction** (independent): replace or complete custom weekly day/level radio behavior using the established component and APG keyboard pattern.  
  Acceptance: Tab enters each group once; Arrow keys, Home, End, Enter/Space, checked state, and focus state work without pointer input.

- [ ] **Task 4 — Respect reduced motion in routine teacher surfaces** (independent): add reduced-motion handling to dashboard transitions and remove cumulative roster entrance staggering from daily attendance/session flows.  
  Acceptance: reduced-motion renders immediate stable content and routine rosters remain scannable without per-row delay.

- [ ] **Task 5 — Consolidated interface verification** (depends on Tasks 1–4): run targeted unit/component tests, between-task and end-of-cycle gates, then inspect keyboard, 320–375px, loading/empty/error, and reduced-motion states against `design-system.html` §§14–16.  
  Acceptance: no actionable `HIGH`, `MEDIUM`, or scoped `LOW` `better-interface` finding remains; verification evidence and any environment-bound Playwright deferral are recorded.

## Implementation

- Subagent plan: driver=gpt-5.5 high, dirty-work=gpt-5.6-terra low; Tasks 1 and 3 parallel, Tasks 2 and 4 sequential after overlapping-file slices, Task 5 sequential verification.
- Task 1: Repair daily-flow semantics and labels — `app/teacher/attendance/page.tsx`, `app/teacher/class-attendance/page.tsx`, `app/teacher/sessions/[id]/client.tsx`, `components/teacher/leave-sheet.tsx`, `components/teacher/__tests__/leave-sheet.test.tsx` — converted the leave card to a semantic button and associated visible labels with scoped controls.
- Task 3: Complete assessment keyboard interaction — `app/teacher/assessments/weekly/client.tsx`, `app/teacher/assessments/weekly/__tests__/client.test.tsx` — replaced click-only custom radios with native grouped inputs plus wrapping Arrow/Home/End and Enter/Space behavior while preserving visual treatment.

## Verification

- Task 1: focused leave-sheet tests passed (2); TypeScript passed; full gate passed after network-enabled font fetch (`npm run build`, 258 Vitest files passed / 2 skipped, 2552 tests passed / 42 todo).
- Task 3: focused weekly-assessment tests passed (7 across client and helper suites); full build and Vitest gate covered the staged implementation and passed with Task 1.

## Ship Notes
