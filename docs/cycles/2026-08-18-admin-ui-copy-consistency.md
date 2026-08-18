# Admin UI and Copy Consistency

## Context
The admin portal still has a high-impact shell contrast defect: the default dark Talib wordmark renders on the dark sidebar at roughly 1.23:1 contrast. A focused review of current `origin/staging` also confirmed duplicate main landmarks, shared header and dashboard token drift, undersized raw icon controls, a misleading admission conversion action, and several remaining non-actionable admin messages. This cycle fixes those systemic defects without expanding into legacy page, dialog, or table redesigns. The 2026-06-04 admin UAT report is older than 60 days and is treated as historical context only; current source independently confirms the admission-action issue.

## Spec
- [ ] Admin sidebar wordmark uses its on-dark presentation and remains legible against the sidebar background.
- [ ] Admin shell exposes exactly one `<main>` landmark without changing routing, authorization, or page layout.
- [ ] Shared admin headers wrap actions safely at narrow widths and use Talib spacing and typography tokens from `design-system.html`.
- [ ] Dashboard stat values use stable numeric typography and attendance chart colors come from semantic CSS variables, not hardcoded hex values.
- [ ] Confirmed raw icon controls use the existing Shadcn `Button` variants, preserve accessible names, and meet the 24px WCAG target floor.
- [ ] `Konversi ke Siswa` appears only for `ADMITTED` applications; earlier admission states do not offer an action the server will reject.
- [ ] Remaining scoped admin errors identify the failed action and give a safe recovery step; selected empty states explain the next step.
- [ ] User-facing terminology uses `Templat` and device-neutral `Pilih`; code identifiers, API paths, route segments, canonical Title Case labels, and `Ya, <Verb>` destructive labels remain unchanged.
- [ ] No public API, database, schema, dependency, or route changes.
- [ ] Non-goals: full detail-page recipe migration, legacy Dialog/Sheet migration, raw-table replacement, broad checkbox normalization, and whole-admin spacing redesign.

## Tasks
- [x] **Task 1 — Fix admin shell contrast and landmark semantics** *(independent)*
  - Acceptance: sidebar wordmark uses `tone="onDark"`; admin renders one populated `<main>`; unit and E2E regressions cover both behaviors.
- [x] **Task 2 — Normalize shared admin visual tokens** *(independent)*
  - Acceptance: shared page/detail headers wrap safely and use project tokens; stat-card typography is tokenized with tabular values; attendance chart has no hardcoded series hex colors.
- [x] **Task 3 — Replace undersized admin icon controls** *(independent)*
  - Acceptance: confirmed campus, student-detail, employee-detail, and payroll-detail raw icon buttons use Shadcn `Button`, retain accessible labels, and employee month navigation uses Lucide chevrons.
- [x] **Task 4 — Tighten admin workflow and recovery copy** *(independent)*
  - Acceptance: admission conversion is gated to `ADMITTED`; scoped fallback errors are actionable; remaining `Templat`, device-neutral attendance, and academic empty-state copy follow `voice.md`.

## Implementation

- Subagent plan: driver=gpt-5.5 high, dirty-work=gpt-5.5 low; Tasks 1, 2, and 4 parallel, Task 3 dispatched when a slot clears; driver sequences review, gates, cycle-doc updates, and one commit per task.
- Task 1: Fix admin shell contrast and landmark semantics — admin layout/sidebar plus brand and E2E regressions — applied the existing on-dark wordmark tone and reduced the shell to one populated main landmark.
- Task 2: Normalize shared admin visual tokens — shared headers, stat card, and attendance chart — tokenized spacing/typography, enabled narrow-width action wrapping, stabilized numerals, and routed chart series through semantic CSS variables.
- Task 3: Replace undersized admin icon controls — campus, student, employee, and payroll detail controls — replaced raw buttons with accessible Shadcn icon buttons and Lucide month chevrons while preserving destructive visual cues.
- Task 4: Tighten admin workflow and recovery copy — admissions, settings, HR, academic-year, student-journal surfaces, and admin JTBD — gated conversion to accepted applications, replaced scoped generic messages with canonical actionable Indonesian copy, and updated the UAT job contract.

## Verification

- Task 1: gates passed (`npm run build` + full `npx vitest run`: 301 files passed, 2 skipped; 2,937 tests passed, 42 todo); focused wordmark test passed; staged-diff review clean. Cross-checked `design-system.html` sidebar brand/colors and accessibility landmark guidance.
- Task 2: gates passed (`npm run build` + full `npx vitest run`: 301 files passed, 2 skipped; 2,937 tests passed, 42 todo); ESLint passed for all four files; staged-diff review confirmed Tailwind tokens and `ChartContainer` CSS-variable wiring. Cross-checked `design-system.html` spacing, typography, status colors, and chart-adjacent token rules.
- Task 3: gates passed (`npm run build` + full `npx vitest run`: 301 files passed, 2 skipped; 2,937 tests passed, 42 todo); scoped ESLint passed with only pre-existing legacy warnings; staged-diff review clean. Icon targets use `size="icon-sm"` (28px), above the 24px WCAG target floor, with preserved accessible names.
- Task 4: gates passed (`npm run build` + full `npx vitest run`: 301 files passed, 2 skipped; 2,937 tests passed, 42 todo); focused admissions, roles, journal, and category tests passed; staged-diff review clean. Admin audience, glossary terms, actionable errors, and empty-state next steps cross-checked against `voice.md` and `design-system.html` §18.
- End-of-cycle gate: `npm run build` passed; full `npx vitest run` passed (301 files passed, 2 skipped; 2,937 tests passed, 42 todo).
- Playwright: local run deferred to CI because `playwright.config.ts` refused the configured remote Supabase `DATABASE_URL` before tests executed. Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.
- Local browser smoke: deferred with Playwright to avoid mutating the configured remote database. Preview verification will cover admin shell/dashboard, admissions, campuses/monthly attendance, and student/employee/payroll detail controls on the Vercel preview.

## Ship Notes

- Migrations: none.
- Environment variables: none.
- Preview smoke: verify sidebar wordmark contrast and one main landmark; resize admin headers to 320px and 200% zoom; confirm admissions conversion is absent before `ADMITTED` and present after; keyboard-check campus, student, employee, and payroll icon controls; review dashboard chart colors and scoped Indonesian copy.
- Rollback: revert the feature PR. No persistent data or schema changes require cleanup.
