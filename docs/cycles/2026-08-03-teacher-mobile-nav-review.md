# Teacher Mobile Navigation and Page Quick Wins

## Context

Teacher mobile navigation currently fits validated 320–375px widths, but five peer-level destinations create cognitive density, especially because `Kehadiran` and `Kelas` both represent attendance-related work. Parent navigation already applies a clearer shared principle: four frequent destinations plus a fifth `Lainnya` action for lower-frequency routes. This cycle applies that principle to teacher workflows without copying parent destinations blindly: daily teaching work remains direct, while personal attendance, salary slips, and profile move into an accessible bottom sheet. A route-by-route audit expanded the cycle to include bounded mobile quick wins across every teacher page: actionable fetch recovery, visible loading states, correct safe-area clearance, 44px controls, focus treatment, and removal of dead-end or misleading states. Pages already following the shared design principles remain unchanged. The 2026-06-04 teacher UAT walkthrough sits exactly at the 60-day boundary but is still possibly stale under the newer-cycle rule because it predates the 2026-08-03 teacher interface cycle; its assessment-footer overlap was revalidated against current code. Older salary-slip discoverability findings remain background only. The selected navigation direction is Option 1 from the review.

## Spec

### Acceptance criteria

- [ ] Teacher bottom navigation shows exactly five equal-width slots in this order: `Beranda`, `Kelas`, `Jurnal`, `Penilaian`, `Lainnya`.
- [ ] `Beranda`, `Kelas`, `Jurnal`, and `Penilaian` remain direct links to their existing routes.
- [ ] `Lainnya` opens a teacher-specific bottom sheet using the existing parent overflow interaction and shared `PortalBottomNav` primitive.
- [ ] The sheet exposes `Kehadiran Saya` (`/teacher/attendance`, including the existing `Cuti & Izin` flow), `Slip Gaji` (`/teacher/slips` and detail routes), and `Profil Saya` (`/teacher/profile`).
- [ ] `Lainnya` appears active while the sheet is open or while the current route starts with `/teacher/attendance`, `/teacher/slips`, or `/teacher/profile`.
- [ ] Existing direct-route active states continue to work for nested teacher routes, including assessment routes.
- [ ] Navigation remains usable without horizontal overflow at 320px, 360px, and 375px, keeps labels at least 12px, and keeps every target at least 44px.
- [ ] Sheet and bottom navigation preserve keyboard activation, visible focus, `aria-current`/navigation labelling, safe-area spacing, and reduced-motion behavior.
- [ ] Existing header access to `Profil Saya` remains available as intentional redundant access.
- [ ] Teacher navigation unit tests cover exact slot order, destinations, overflow open/close behavior, active matching, keyboard behavior, and nested salary-slip routes.
- [ ] Teacher Playwright coverage exercises the mobile `Lainnya` path and confirms core destinations remain reachable.
- [ ] Teacher dashboard shows a visible hydration/loading skeleton, places `Status Hari Ini` immediately after the primary clock flow, and gives dashboard links visible keyboard focus.
- [ ] Personal attendance, class attendance, journal entry/week, assessment-center, and salary-list fetch failures render explicit actionable error states with retry instead of empty-looking content or permanent skeletons.
- [ ] Class attendance stacks class/date controls when narrow, exposes current student attendance state to assistive technology, and visibly announces autosave progress/result.
- [ ] Session attendance sticky save control clears both bottom navigation and device safe area, uses an explicit batch-save label, and gives status controls at least 44px targets with visible focus.
- [ ] Journal direct links with missing parameters resolve to a useful state instead of permanent loading; week navigation meets touch/focus requirements; read-only history no longer looks editable.
- [ ] Weekly and center assessment controls meet 44px touch-target and keyboard/focus requirements; weekly no-active-week state offers a real date-changing action.
- [ ] Assessment-center sticky save is hidden for empty/error states, clears navigation/safe area when shown, and preserves entered context across retry where practical.
- [ ] Shared header/profile controls have visible focus; salary list has retry; salary detail uses shared date/header patterns and remains readable with long labels/amounts at 320–375px.
- [ ] Every teacher route is covered by implementation notes or an explicit no-change audit result; no page receives cosmetic churn without a usability, consistency, or accessibility reason.
- [ ] Focused component tests cover rejected client fetches, visible failure-not-empty states, retry transitions, and successful recovery for every changed client-fetch surface.
- [ ] Teacher salary Playwright coverage traverses list to detail and verifies back navigation, long label/amount resilience, and bottom-navigation clearance.
- [ ] Portal standards and teacher UAT jobs reflect the new navigation and corrected page behavior, with changes cross-checked against `design-system.html`.

### Non-goals

- Changing teacher route URLs, APIs, permissions, or data models.
- Redesigning teacher dashboard content, attendance, journal, or assessment pages.
- Changing parent navigation.
- Adding a sixth bottom-navigation slot or shrinking labels/icons to fit more destinations.
- Removing the existing profile entry from the teacher header.
- Adding profile-photo self-service, new teacher routes, or new backend capabilities.
- Rebuilding page visual identity, replacing working component patterns, or polishing low-value spacing without evidence.
- Adding page-specific loading boundaries where the root boundary is already sufficient unless verification shows a real delay.

### Assumptions

- Daily teaching work means `Kelas`, `Jurnal`, and `Penilaian` deserve direct navigation; personal attendance history and leave remain reachable through `Lainnya`.
- Teacher clock-in/out and current-day attendance status remain sufficiently visible on `Beranda`.
- `Kehadiran Saya` is one sheet destination because `Cuti & Izin` is already embedded on `/teacher/attendance`; no separate leave route is needed.
- Parent and teacher portals should share geometry, interaction, accessibility, and overflow principles while keeping role-specific destination priorities.
- Existing parent bottom-sheet composition can be reused without changing the shared primitive API unless implementation proves a small generic extraction safer.
- “Every page is taken care of” means every route is reviewed and relevant quick wins are fixed; pages with no material finding remain unchanged and are recorded as such.
- Existing API response shapes and route permissions are sufficient for retry/error-state improvements.
- Quick wins are limited to high/medium low-effort findings plus small shared accessibility fixes; larger feature work becomes a separate cycle.

### Route audit disposition

- `/teacher` — change: hydration feedback, information order, focus visibility.
- `/teacher/attendance` — change: explicit fetch error and retry.
- `/teacher/class-attendance` — change: fetch recovery, narrow toolbar, accessible cycle state, autosave feedback.
- `/teacher/sessions/[id]` — change: safe-area sticky action, target size/focus, clearer save copy.
- `/teacher/student-journal` — no page-specific UI change; existing picker, CTA, and empty state already follow the daily-entry pattern.
- `/teacher/student-journal/entry` — change: malformed-link recovery and fetch retry.
- `/teacher/student-journal/students/[id]` — change: fetch retry, navigation targets/focus, read-only history affordance.
- `/teacher/assessments` — no page-specific UI change; current hub hierarchy remains appropriate.
- `/teacher/assessments/weekly` — change: touch targets and actionable no-active-week recovery.
- `/teacher/assessments/center/[center]` — change: accessible controls, retry, and sticky-footer conditions.
- `/teacher/profile` — shared focus treatment only; current content hierarchy remains appropriate.
- `/teacher/slips` — change: explicit fetch error and retry.
- `/teacher/slips/[id]` — change: shared header/date pattern, focus, and narrow-row resilience.
- Shared teacher shell/header — change only where required by navigation, focus, or safe-area behavior.
- `app/teacher/loading.tsx` — no change; existing root route-transition skeleton remains sufficient.
- `app/teacher/error.tsx` — no change; existing root error boundary remains fallback protection, while client-fetch failures gain local recovery.
- `app/teacher/attendance/loading.tsx` — no change; existing attendance route skeleton remains sufficient.
- `app/teacher/student-journal/loading.tsx` — no change; existing journal route skeleton remains sufficient.
- `app/teacher/student-journal/error.tsx` — no change; existing route error boundary remains fallback protection, while client-fetch failures gain local recovery.

## Tasks

- [x] **Task 1 — Add teacher overflow sheet and focused tests.** Reuse the parent `Lainnya` sheet pattern to expose `Kehadiran Saya`, `Slip Gaji`, and `Profil Saya`, including safe-area, focus, keyboard, and active-row behavior.
  - Acceptance: Component tests prove all three existing destinations and accessible open, close, focus, and keyboard interaction.
  - Dependencies: None.

- [x] **Task 2 — Replace fifth direct-link layout with selected navigation IA.** Wire teacher bottom navigation as `Beranda`, `Kelas`, `Jurnal`, `Penilaian`, `Lainnya`; preserve direct and overflow active states through the shared `PortalBottomNav`.
  - Acceptance: Unit tests prove exact order, five-slot ceiling, sheet open/close behavior, and active state across direct and overflow routes.
  - Dependencies: Task 1.

- [x] **Task 3 — Improve teacher home hierarchy and loading feedback.** Replace the blank hydration guard with a compact dashboard skeleton, move `Status Hari Ini` directly below the clock/error flow, and add visible focus treatment to quick/session links.
  - Acceptance: Dashboard priority remains stable at 320–375px, hydration never appears blank, and keyboard users can see focus on every dashboard link.
  - Dependencies: None.

- [x] **Task 4 — Add personal-attendance fetch recovery.** Distinguish a failed current-month request from an empty month and provide a visible `Coba lagi` action without turning background prefetch failures into noisy errors.
  - Acceptance: Focused tests prove rejected fetch, failure-not-empty rendering, retry, and successful calendar recovery.
  - Dependencies: None.

- [x] **Task 5 — Harden class-attendance daily entry.** Add fetch recovery, stack class/date controls at narrow widths, expose current state through accessible cycle-button labels/focus, and render autosave progress/result.
  - Acceptance: Focused tests prove rejected fetch and retry; class attendance remains operable at 320px and announces each row state plus save status.
  - Dependencies: None.

- [x] **Task 6 — Fix session attendance mobile controls.** Make the sticky save area safe-area aware, enlarge/focus-style status controls, and use an explicit batch-save label.
  - Acceptance: Save CTA never overlaps bottom navigation or gesture inset, every cycle control is at least 44px, and CTA states the affected student count.
  - Dependencies: Task 2 for final bottom-navigation clearance verification.

- [x] **Task 7 — Harden journal entry direct links and fetch recovery.** Resolve missing class/date parameters without permanent loading and add an actionable local error/retry state for grid fetch failures.
  - Acceptance: Focused tests prove malformed-link recovery, rejected fetch, failure-not-empty rendering, retry, and successful grid recovery.
  - Dependencies: None.

- [x] **Task 8 — Clarify journal week history.** Add week-fetch recovery, enlarge/focus-style week navigation, use deterministic back navigation, and replace checkbox-like read-only cells with explicit history semantics.
  - Acceptance: Focused tests prove rejected fetch/retry; navigation targets meet 44px; history announces and looks read-only.
  - Dependencies: None.

- [x] **Task 9 — Improve weekly-assessment recovery and targets.** Raise day controls to 44px and give the no-active-week state a real date-changing action.
  - Acceptance: Touch and keyboard operation remain correct, and the error-state instruction always maps to an available control.
  - Dependencies: None.

- [x] **Task 10 — Align center-assessment controls and sticky states.** Reuse the weekly native-radio keyboard/focus pattern, raise controls to 44px, add retry while preserving entered context where practical, and hide the sticky footer for non-writable states.
  - Acceptance: Focused tests prove rejected fetch/retry and footer suppression; controls work by touch and keyboard; sticky save clears navigation and safe area.
  - Dependencies: Task 2 for final bottom-navigation clearance verification.

- [x] **Task 11 — Add salary-list fetch recovery.** Distinguish failed loading from no slips and provide visible retry.
  - Acceptance: Focused tests prove rejected fetch, failure-not-empty rendering, retry, and successful list recovery.
  - Dependencies: None.

- [x] **Task 12 — Align shared account focus behavior.** Add visible focus treatment to shared header actions and the profile salary link without changing account hierarchy.
  - Acceptance: Shared header and profile tests assert visible focus styling while existing link/logout behavior remains intact.
  - Dependencies: None.

- [x] **Task 13 — Align salary-detail patterns and mobile resilience.** Reuse shared date/header conventions and ensure long labels/amounts remain readable at 320–375px.
  - Acceptance: Focused coverage confirms shared formatting and narrow-row layout behavior without changing salary data or authorization.
  - Dependencies: Task 11.

- [x] **Task 14 — Align standards, JTBD, and end-to-end verification.** Update `.claude/standards/portal.md` to state the shared four-direct-plus-overflow principle with role-specific destinations, update only affected steps in `docs/uat/jobs/teacher.md`, add lean Playwright coverage for navigation and salary traversal, and record route dispositions against `design-system.html`.
  - Acceptance: Playwright traverses salary list → detail → back and checks long-row and bottom-nav clearance; at 320px, 360px, and 375px, recorded checks show no overflow, truncation, overlap, dead-end state, or sub-44px target in scope; documentation changes stay limited to corrected navigation and JTBD behavior.
  - Dependencies: Tasks 2–13.

## Implementation

- Subagent plan: driver=gpt-5.5 high reasoning, dirty-work=gpt-5.6-terra low reasoning; Tasks 1→2→6/10→14 are dependency-sequenced, Tasks 3–5/7–9/11–13 are scope-independent but implementation is serialized in the shared cycle worktree so each task receives an isolated build+Vitest gate and commit; parallel subagents perform bounded context preparation and mandatory review.
- Task 7: `app/teacher/student-journal/entry/page.tsx` now sends malformed links to picker recovery, distinguishes grid-fetch failures with `Coba lagi`, and version-guards stale responses; focused tests cover malformed links, retry recovery, failure-not-grid, and deferred A→B response ordering. Cross-checked `design-system.html` §15 and portal recovery consistency.
- Task 9: weekly day controls now meet 44px targets with visible keyboard focus; no-active-week recovery supplies a required GET date form, and blank/malformed/impossible dates normalize safely before loading. Focused tests cover target/focus, recovery form contract, and normalization.
- Task 1: Add teacher overflow sheet and focused tests — `components/teacher/more-sheet.tsx`, `components/teacher/__tests__/more-sheet.test.tsx` — added parent-consistent teacher overflow destinations with nested-route active state, safe-area layout, focus treatment, and focused interaction coverage.
- Task 2: Replace fifth direct-link layout with selected navigation IA — `components/teacher/bottom-nav.tsx`, `components/teacher/__tests__/bottom-nav.test.tsx` — changed teacher navigation to four direct teaching destinations plus `Lainnya`, preserving nested direct and overflow active states through shared primitives.
- Task 3: Improve teacher home hierarchy and loading feedback — `app/teacher/home-client.tsx`, `app/teacher/__tests__/home-motion.test.tsx` — replaced blank hydration with an accessible skeleton, moved current-day status beside the clock flow, and added visible keyboard focus to dashboard links.
- Task 4: Add personal-attendance fetch recovery — `app/teacher/attendance/page.tsx`, `app/teacher/attendance/__tests__/page.test.tsx` — added explicit current-month failure/retry, kept background prefetch quiet, and prevented stale or aborted month requests from overwriting cached foreground state.
- Task 5: Harden class-attendance daily entry — `app/teacher/class-attendance/page.tsx`, `app/teacher/class-attendance/__tests__/page.test.tsx` — added assignment/roster recovery, responsive selectors, accessible cycle controls, live save feedback, stale-roster guards, and per-student serialized saves so last tap wins in UI and persistence.
- Task 6: Fix session attendance mobile controls — `app/teacher/sessions/[id]/client.tsx`, `app/teacher/sessions/[id]/__tests__/client.test.tsx` — moved sticky save above nav plus safe area, enlarged/focus-styled status controls, exposed current state, and clarified batch-save copy.
- Task 8: Clarified journal week history — retryable error distinct from empty, stale week request guard, deterministic back, 44px/focus controls, readonly caption and contextual accessible ✓/— glyphs; focused tests added.
- Task 10: Center assessment now uses native keyboard radios with min-44/focus, retry and stale-request guard, API writable contract, truly read-only disabled controls/copy, and a writable-only safe-area save footer; focused client/API tests added.
- Task 11: Salary slips now distinguish loading, fetch failure, and a successful empty response; rejected and non-OK requests show a local retry state, request IDs prevent stale results, and the retry CTA meets 44px and visible-focus requirements.
- Task 12: Shared parent/teacher PortalHeader profile and logout controls now meet min-44/focus treatment; the teacher profile salary link has matching focus treatment; focused tests added.
- Task 13: Salary detail now uses the shared PageHeader and formatDate with Jakarta-safe current-date handling, keeps back/PDF actions at 44px with visible focus, and keeps long labels wrapping beside non-shrinking tabular amounts; focused tests include the Jakarta date-boundary case.
- Task 14: Portal standards now codify teacher four-direct-plus-`Lainnya` overflow, active-state, and parent/teacher parity rules; affected teacher JTBDs reconcile shipped autosave, read-only, recovery, and salary flows; teacher E2E adds 320/360/375 five-slot geometry, overflow/direct active states, and `Lainnya` → `Slip Gaji` → detail → Back traversal.
- Task 14 holistic-review P2 resolution: salary-detail E2E now uses a stable seeded multiword component at 320px and 375px, asserts no document horizontal overflow, footer clearance above the fixed nav, and does not silently skip when no slip is available; re-review clean.

## Verification

- Task 7: focused Vitest 3/3 passed; full `npm run build` passed and `npx vitest run` passed (2,579 passed / 42 todo); staged review clean.
- Task 12: focused Vitest 9/9 passed; full build passed; full Vitest 2,595 passed / 42 todo; staged review clean; design-system shared portal parity checked.
- Task 10: focused Vitest 13/13 passed; full build passed; full Vitest 2,590 passed / 42 todo; review clean; design-system, portal, and security checks completed.
- Task 9: focused Vitest 5/5 passed; full `npm run build` passed and `npx vitest run` passed (2,585 passed / 42 todo); staged review clean. Cross-checked design-system mobile targets and recovery behavior.
- Task 11: focused Vitest 3/3 passed; full build passed; full Vitest 2,593 passed / 42 todo; staged review clean. Cross-checked design-system and portal recovery behavior.
- Task 13: focused Vitest 3/3 passed; full build passed; full Vitest 2,598 passed / 42 todo; staged review clean. Cross-checked design-system and portal narrow-layout behavior.
- Task 14: E2E ESLint and diff check passed; full build passed; full Vitest 2,598 passed / 42 todo; E2E and docs staged reviews clean after corrections. Local Playwright deferred because its remote-`DATABASE_URL` safety guard identified `aws-1-ap-southeast-1.pooler.supabase.com`; required CI `Playwright E2E` remains the gate. Cross-checked design-system portal shell, safe area, 44px targets, and focus behavior.
- Task 8: focused Vitest 6/6 passed; full build passed; full Vitest 2,583 passed / 42 todo; staged review clean; cross-checked `design-system.html` and portal readonly/target guidance.

- Task 1: gates passed (`npm run build`; `npx vitest run` — 260 files passed, 2 skipped; 2,557 tests passed, 42 todo); focused More-sheet tests 3/3 passed; mandatory staged review clean; cross-checked `design-system.html` §14 portal shell and accessibility rules.
- Task 2: gates passed (`npm run build`; `npx vitest run` — 261 files passed, 2 skipped; 2,565 tests passed, 42 todo); focused teacher/shared navigation tests 21/21 passed; mandatory staged review clean; `design-system.html` portal shell, five-slot width, focus, motion, and safe-area rules preserved.
- Task 3: gates passed (`npm run build`; `npx vitest run` — 261 files passed, 2 skipped; 2,566 tests passed, 42 todo); focused home hierarchy/motion tests 2/2 passed; mandatory staged review clean; cross-checked `design-system.html` §14 teacher dashboard order, Shadcn Skeleton, and focus rules.
- Task 4: gates passed after review fixes (`npm run build`; `npx vitest run` — 262 files passed, 2 skipped; 2,568 tests passed, 42 todo); focused attendance recovery/race tests 2/2 passed; first review found foreground month races, fixes re-gated, second mandatory review clean; teacher error/retry copy matches voice rules and `design-system.html` network-loss guidance.
- Task 5: gates passed after race hardening (`npm run build`; `npx vitest run` — 263 files passed, 2 skipped; 2,573 tests passed, 42 todo); focused class-attendance tests 5/5 passed; mandatory review iterations found stale roster, stale UI/toast, and persisted write-order races, all fixed and re-gated; fourth review clean; `design-system.html` §16 cycle-tap, 44px focus, responsive toolbar, and live-save guidance preserved.
- Task 6: gates passed (`npm run build`; `npx vitest run` — 264 files passed, 2 skipped; 2,576 tests passed, 42 todo); focused session tests 3/3 passed; mandatory staged review clean; `design-system.html` §16 sticky action, 44px target, focus, and safe-area rules preserved.
- End-of-cycle: final `npm run build` passed; `npx vitest run` passed (271 files passed / 2 skipped; 2,598 passed / 42 todo); `npm run lint` exited 0 with 0 errors and 60 existing warnings. `npx playwright test` was attempted and safely refused the remote DB host `aws-1-ap-southeast-1.pooler.supabase.com`, so it is deferred to the required CI `Playwright E2E` check per project policy. Holistic review is clean after the P2 coverage fix.
- Ship gate re-run on the shipped commit `17fb7145`: `npm run build` passed; `npx vitest run` passed (271 files passed / 2 skipped; 2,598 passed / 42 todo); soft-skip/DEMO_MODE delta vs `origin/staging` = 0; `/audit-docs` re-run reported 0 `fail` (route count 185/185, portal pages 41/13/8, components 65/65, e2e specs 33/33, standards files and File Structure paths present). Playwright remains CI-gated per the deferral above.
- Preview-verify iteration 1 (https://annisaa-erp-v3-git-feat-teache-786b65-ismails-projects-196d40d3.vercel.app, PR #448, Chrome MCP as `ismail10rabbanii@gmail.com`): flows=[teacher home → `Lainnya` overflow sheet, `Lainnya` → `Slip Gaji` → slip detail → back, class-attendance cycle-tap autosave], blockers=0, minors=1.
  - Navigation renders exactly five slots (`Beranda`, `Kelas`, `Jurnal`, `Penilaian`, `Lainnya`); the sheet exposes `Kehadiran Saya`, `Slip Gaji`, and `Profil Saya`; `Lainnya` stays active on `/teacher/slips` and its detail route; dashboard shows the hydration skeleton and `Status Hari Ini` directly below the clock flow.
  - Salary detail uses the shared header/date pattern (`1 Maret 2026 s/d 31 Maret 2026`, print date `3 Agustus 2026`), wraps the long bank name without overflow, and clears the fixed bottom navigation at the end of the page; `Kembali ke Slip Gaji` returns to the list.
  - Class attendance stacks the class/date controls, cycles a student through states with `Tersimpan` feedback and live counters, and persists each tap (`POST /api/student-attendance/mark` ×4, all 200); the verification tap was cycled back to the original `Hadir` state.
  - No console errors; all application requests returned 200 (`/api/teaching-assignments/my`, `/api/student-attendance`, `/api/student-attendance/mark`).
  - CI iteration 1 was red on `Lint, Typecheck & Test` and `Playwright E2E`; the `/build` gate had run `npm run build` + `npx vitest run` but not `npm run typecheck`, which is where both defects hid. Three fixes: `e2e/teacher.spec.ts` read `boundingBox().bottom` (not a property of Playwright's box — derived from `y + height`); `app/teacher/sessions/[id]/__tests__/client.test.tsx` inferred `null`-typed roster fields, so the exported `RosterRow` type now annotates the fixture; and `e2e/teacher-assessments-center.spec.ts` still asserted an unconditional `center-save`, which contradicts Task 10's writable-only sticky footer — it now asserts save-or-read-only-or-recovery. Re-gated locally: `npm run typecheck` clean, `npm run lint` 0 errors / 60 existing warnings, `npm run build` passed, `npx vitest run` 2,598 passed / 42 todo.
  - Minor: intermittent 503s on Vercel edge/protection paths and some RSC prefetches (`/.well-known/vercel/jwe`, `OPTIONS /`, `HEAD`/`?_rsc=` requests). No user-visible failure — every navigation rendered, Vercel `get_runtime_errors` reports no runtime errors, and this cycle changes no server route, middleware, or dependency (`package.json` is unchanged vs `origin/staging`). Treated as preview-platform noise, not a blocker.

## Ship Notes

- No migrations or new environment variables.
- No route, entity, or module additions; README update is not required.
- Rollout changes teacher mobile navigation placement (four direct destinations plus `Lainnya`) and page resilience/accessibility only.
- Roll back by reverting this cycle/PR.
- Preview verification remains required during `/ship`; it was not performed during `/build`.
