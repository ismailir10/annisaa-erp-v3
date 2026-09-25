# Intuitive UI: reusable foundation and trustworthy context

## Context

The CTO user approved the [realistic HTML concept](assets/talib-ux-concept.html) from the radical UX audit and requested implementation across all screens and core flows, through merge to staging. This first cycle establishes reusable shadcn styling and fixes trust/context defects before role-home implementation. Baseline: e630a231, origin/staging. Existing root and audit-worktree edits remain untouched.

## Spec

- Apply Don't Make Me Think: obvious next actions, scannable hierarchy, recognizable context, predictable destinations, consistent controls, progressive disclosure, and truthful outcomes/recovery. Prefer obvious steps over fewer clicks.
- Preserve Talib light theme, Plus Jakarta Sans, teal with readable dark text, dark admin sidebar, five mobile navigation slots, existing routes and business capabilities.
- Extend existing shadcn Base UI/base-nova primitives, semantic tokens and Tailwind variants. Reuse Card/Item/Button/Badge/Progress, DataTable, forms and overlays; custom CSS only for a documented gap. No dependency/library migration.
- Shared task rows, section/card hierarchy, context and save states support the approved role homes. Maintain keyboard/focus/contrast, readable labels and touch targets.
- Parent child identity survives journal/nav/back/reload/payment return. URL parameters cannot declare settlement. School-date calculations agree at WIB boundaries. Server ownership remains authoritative.
- Queue/navigation and relevant enrollment endpoints use consistent permissions. Failed summaries are unavailable, never fabricated zero.
- Later cycles implement teacher, parent, admin, then all-route consistency. No new schema or generic completion endpoint.

## Tasks

- [ ] Foundation slice: shared visual patterns plus independent parent trust and permission fixes. Acceptance: focused regressions pass, shared components compose over existing shadcn, build and full Vitest pass, independent review clears.
- [ ] Verify and ship foundation: document design-system decisions and UAT changes; run full gates and preview verification; merge only with required checks green.

## Implementation

- Subagent plan: driver=gpt-6-astra, implementation=gpt-6-sol; independent shared UI, parent context/payment, and admin permission/state subparts run in parallel with exclusive file ownership. Driver reviews integration, runs gates, and ships. Subsequent role cycles are sequential after foundation.
- Skill workflow: build, ship, using-superpowers, subagent-driven-development, and relevant better-* craft skills; shadcn current documentation already consulted through Context7. User explicitly authorized implementation and merge, so no repeated plan approval is required.
- Shared UI implemented: TaskList/TaskRow (href XOR onClick), ContextStrip, SaveStatus; token-based headers/cards, readable primary foreground, coarse-pointer button/select targets, labeled pagination/row actions. Portal standards now describe task-first homes and forbid inferring attendance from missing records.
- Parent trust implemented: validated child URL helpers, journal child selection via URL, parent navigation context, owned invoice callback reconciliation and authoritative payment messaging, callback-only query cleanup, uncached guardian-scoped invoice reads, WIB attendance/payment dates. Parent UAT catalog updated as code/regression review, not real user UAT.
- Admin trust implemented: explicit nav permissions/shared visibility helper, enrollment session endpoints require admissions.view/edit, payroll summaries distinguish loading/error/ready with retry. Applicant token endpoints untouched. The HR group retains hr.view because its layout requires it. Two pre-existing forbidden page exports moved into ordinary modules to unblock Next build.

### Cloud continuation checkpoint — 25 September

User requested moving this ongoing work to cloud. This is a WIP transfer checkpoint, not a completed build-cycle commit or release; unchecked tasks and failing/unverified checks are intentionally preserved. No PR or merge has occurred. Do not treat the checkpoint as passing release gates.

**Start with these unresolved items:**

1. Fix the confirmed parent journal response race in app/parent/student-journal/page.tsx: initial fetch and post-mutation refresh unconditionally replace loadedWeek. A requested → switch B → B resolves → A resolves leaves the current view permanently loading. Guard stale success/error/loading updates by request identity/abort. Test B-before-A response order and a child/week switch while mutation refresh is pending. Fix was NOT applied before transfer.
2. Admin implementer saved final canEdit response/UI gating for enrollment detail during interruption, but its planned test assertion was not saved; rerun tests/lint. Review read-only admissions role mutation affordances on the legacy admissions page and align with server permissions without weakening token flows.
3. Rerun production build and full Vitest after the final edits; investigate the two full-suite timeouts below. Complete independent security review of enrollment/tenant/role changes. The shared UI + parent review found only item 1, with no RSC defect in the installed Base UI useRender path.

**Remaining approved implementation (all still required):**

- Teacher cycle: current class/next action first; collapse completed personal check-in while preserving clock-in/out functionality; real saved attendance counts; journal completion = all active SCHOOL indicators checked per student/date (zero indicators means setup incomplete). Reuse teacher-scoped class-grid data and link with class/date. Surface unread guardian replies into existing threads. Use Buka penilaian rather than inventing assessment percentages. Preserve classroom attendance versus session pickup save semantics.
- Parent cycle: family action-first home, explicit child signal destinations, persistent child identity strip in details, outstanding invoice task before history/filter controls. Reuse actual observations/replies/ownership; never infer absence from missing attendance or payment settlement from callback parameters. Selected child survives back/reload/navigation/payment return.
- Admin cycle: permission/tenant-filtered queue for EnrollmentApplication SUBMITTED/UNDER_REVIEW with studentId null, PENDING leave, invoices with PENDING_PAYMENT_LINK, and DRAFT payroll requiring approval. Use real detail destinations. Item disappears only on authoritative domain state change, never a generic local mark-complete toggle. Show actual deadlines only. Preserve all module destinations and school context. Make unknown/error counts explicit.
- Consistency cycle: inventory and cover all admin/teacher/parent page routes (audit baseline 41/13/8), including list/detail/form/settings/loading/empty/error/disabled states. Reuse shadcn Base UI/base-nova, DataTable, responsive dialogs/sheets, Item/Card/Button/StatusBadge/Progress; use existing ChartContainer/Recharts for meaningful secondary analytics. Tokens/Tailwind variants first, custom CSS only for documented gaps. Keep five mobile navigation slots. Do not copy demo role switcher, fictional data or prototype JS into the application.
- Visual acceptance: match approved assets/talib-ux-concept.html hierarchy, Talib light theme/teal/dark admin sidebar/Plus Jakarta Sans. Allow documented accessibility corrections to tiny prototype text/targets. Check 320/390/768/1440px, 200% zoom, keyboard/focus, mobile keyboard, reduced motion and long Indonesian names. Each first viewport answers where am I, whose data, what matters, and next action. Test multiple children/classes, no data, request/save failures and all payment states. No measured user-usability claim without representative user sessions.
- Continue separate reviewable cycles with meaningful regression tests, per-task gates/review, cycle docs/UAT maintenance, PRs to staging and required checks. User explicitly expects completion through merge to staging; production promotion is separate. No new task-management schema or generic completion endpoint. Deeper report-readiness/academic-setup/assessment workflow redesign remains excluded.

**Transfer boundaries:** repository and concept are on the checkpoint branch; local .env files, role verification accounts, browser sessions, generated clients/build caches and tokens are excluded. Cloud uses its configured environment. Do not recreate secrets from public docs or bypass auth. The desktop user confirmed role-preview accounts in the local gitignored file, but the signed-in Chrome profile is local. Required authenticated preview verification must genuinely pass; if cloud cannot perform it, return the ready PR for the local verifier rather than merging without that gate.

## Verification

- Canonical visual reference: design-system plus approved standalone HTML. No production visual/functional pass claimed yet.
- Shared UI focused checks: 25 tests across 6 files, scoped ESLint and diff check passed.
- Parent focused checks: 77 tests across 7 files, scoped ESLint and diff check passed before the outstanding race fix.
- Admin focused checks: 65 tests across 9 files and scoped ESLint passed before final canEdit detail edits; those edits remain unverified.
- First production build compiled but failed Next route-export validation; the two exported helpers were then relocated. A subsequent webpack build produced .next/BUILD_ID, but its final process result was lost when the turn was interrupted, so no final build pass is claimed. A temporary local-only webpack cache=false setting was restored after the run; no next.config.ts change is part of this checkpoint. Low local disk caused cache-write warnings.
- Full Vitest run: 346 files passed, 2 failed, 2 skipped; 3335 tests passed, 2 failed, 42 todo. Failures were 30-second timeouts in app/admin/raport/__tests__/raport-editor.test.tsx (calls onBack immediately when no edits) and app/admin/classes/[id]/__tests__/client.test.tsx (AGE_OUT_OF_RANGE override flow). Build and multiple test processes ran concurrently; contention is a hypothesis, not a proven excuse. Diagnose and rerun, use project flake-hunt where appropriate; do not raise per-test timeouts or skip tests.
- Playwright: local run deferred to required CI because config refused remote shared staging DATABASE_URL. No override was used; cloud should use local/ephemeral Postgres or the required CI Playwright E2E check.
- Preview verification, final security review, final lint/typecheck/build/full tests and ship gates remain pending.

## Ship Notes

- No planned migrations or new environment variables. Rollback through PR revert. Preserve role permissions, parent ownership and settlement truth. Production promotion remains separate.
