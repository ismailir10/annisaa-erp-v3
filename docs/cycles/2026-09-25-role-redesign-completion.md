# Complete Role-Based UI Redesign

## Context

PR #559 established Talib's shared UI foundation and trustworthy context handling. The approved continuation must now apply the concept's task-first hierarchy to the actual teacher, parent, and admin workflows rather than stopping at shared primitives or screenshots. The source of truth is `docs/cycles/assets/talib-ux-concept.html` and its admin, guru, and wali renders, interpreted through the production domain model and the canonical `design-system`.

The route inventory at the start of this cycle is 41 admin pages, 13 teacher pages, and 8 parent pages. Existing capabilities, campus/year context, role permissions, guardian ownership, five-slot mobile navigation, and authoritative domain states must remain intact. This is an engineering heuristic implementation of Steve Krug's “Don't Make Me Think,” not a claim of measured user-usability improvement.

## Spec

- Teacher home leads with the current class and unfinished work. Personal check-in remains clock-capable but is compact once complete. Attendance progress comes from saved classroom records; journal completion requires every active SCHOOL indicator for every student/date, while zero configured indicators is explicitly incomplete. Valid class/date context carries into attendance and journal. Unread guardian replies open existing child threads. Assessment copy says “Buka penilaian” without invented completion, and classroom attendance remains distinct from session pickup state.
- Parent home leads with household actions and explicit per-child cards linking to notes, attendance, development, reports, and bills. A validated child selection stays visible and survives navigation, detail/back, reload, and payment return. Outstanding invoices precede history and filters. Pending, partial, paid, failed, and unavailable-link presentation is server-derived; callback parameters never settle an invoice.
- Admin home presents a tenant- and permission-filtered queue for unconverted submitted/under-review enrollments, pending leave, invoices awaiting payment links, and draft payroll awaiting approval. Each row links to its real domain action and disappears only after authoritative state changes. Unknown/error counts are explicit, deadlines appear only when supported, typed adapters join domain summaries, and invoice creation requires `invoices.create`.
- Consistency covers every inventoried portal route and its list/detail/form/settings/loading/empty/error/disabled states without removing capabilities. Shared Shadcn/Base Nova primitives, DataTable/toolbars/actions, responsive Dialog/Sheet, TaskList/TaskRow/ContextStrip/SaveStatus, semantic tokens, and the existing five-slot mobile navigation are preferred. Custom CSS is a documented last resort; no prototype JavaScript or fictional data enters production.
- The canonical `design-system.html` documents the shipped patterns. The rendered UI preserves the light Talib surface, teal accents, Plus Jakarta Sans, dark admin sidebar, recognizable role context, concise Indonesian labels, truthful async/recovery states, visible keyboard focus, reduced-motion behavior, and reflow for 320/390/768/1440 widths and 200% zoom.
- Regression coverage targets context validation, permissions, progress calculations, payment truthfulness, save/retry recovery, multiple classes/children, missing data, and guardian ownership. No schema migration, dependency, generic task-completion endpoint, deeper report-readiness redesign, academic-setup redesign, or assessment-workflow redesign is included.

## Tasks

- [x] Task 1: Make teacher home and core daily journeys task-first and truthful, with focused progress/context/recovery regressions.
- [ ] Task 2: Make parent home and child journeys family-first with persistent identity and authoritative billing states.
- [ ] Task 3: Add the permission-filtered admin work queue and close the invoice-create authorization gap.
- [ ] Task 4: Apply and document shared consistency across all 62 portal page routes, recording route-level coverage and preserving capabilities.
- [ ] Task 5: Complete independent review, responsive/browser verification, full gates, and ship evidence.

## Implementation

- Subagent plan: driver=gpt-5.6-sol, dirty-work=gpt-5.5; Tasks 1–3 run in parallel by teacher, parent, and admin implementation agents; Task 4 follows their shared-pattern output; Task 5 is independently reviewed and verified after integration.
- Desktop continuation: driver=gpt-6-astra; independent teacher/parent and admin/security reviewers assessed the recovered cloud patch, then teacher, parent, and admin corrections were delegated with exclusive file ownership. The earlier completion claims below describe the cloud handoff, not accepted completion. Tasks 1–4 were reopened after concrete behavioral and visual gaps were found.
- Task 1: Teacher daily journeys — `app/teacher/**`, `lib/teacher/**`, and guardian-unread filtering in `lib/student-journal/note-reads.ts` — current class, authoritative progress, validated Jakarta date/class context, direct guardian thread, truthful assessment action, compact recoverable personal check-in. Independent review fixed UTC-day drift, lexical slot ordering, and non-guardian/non-direct reply routing.
- Task 2: Parent family journeys — `app/parent/**` and `components/parent/kid-card.tsx` — household outstanding action first, explicit child-scoped journal/attendance/development/report/billing links, and visible persistent child identity. Independent review added the missing per-child billing destination and routes the household action to the nearest-due child rather than an unrelated selected child.
- Task 3: Admin authoritative queue and invoice authorization — admin dashboard/adapters, leave deep-link support, and invoice mutation routes — tenant-scoped domain records are visible only with matching view+action permissions; failed sources never become false zeroes; queue destinations open real records; invoice link creation requires `invoices.create`, manual receipts require `payments.record`, and cancellation requires `invoices.void`. Two independent reviews closed destination-permission, leave deep-link, unavailable-state, and direct endpoint-bypass defects.
- Task 4: 62-route consistency sweep — shared admin/portal headers, EmptyState, TaskRow, parent development selection, and both canonical design-system references — improved semantic hierarchy, long-copy wrapping, 320px/200% action reflow, shared task navigation, and documented authoritative states. Ledger records 10 direct routes, 48 shared/pattern-covered routes, and the approved deeper-workflow exclusions (overlap noted where shared primitives still apply).

### Route coverage ledger

This is the cloud worker's **source-inspection ledger**, not browser acceptance. Every route still requires the desktop sweep and relevant workflow checks. `direct` = source changed; `shared` = shared-primitives inspection only; `deferred` applies solely to deeper workflow redesign, never to visual consistency, context, save feedback, or preserved capabilities. In particular, pickup/session access remains in scope. Checkbox marks in this historical inventory do not mean rendered verification passed.

**Admin**

- [x] `app/admin/(hr)/employee-attendance/monthly/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/employee-attendance/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/employees/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/employees/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/leave-requests/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/payroll/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/payroll/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/(hr)/salary-components/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/academic-years/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/admissions/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/classes/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/classes/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/design-system/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/enrollments/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/enrollments/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/fees/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/guardians/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/guardians/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/invoices/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/invoices/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/page.tsx` — direct
- [x] `app/admin/payments/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/penilaian/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/raport/page.tsx` — shared; deferred deeper workflow (deeper report readiness excluded)
- [x] `app/admin/raport/templates/page.tsx` — shared; deferred deeper workflow (deeper report readiness excluded)
- [x] `app/admin/semesters/[id]/import/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/semesters/[id]/objectives/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/semesters/[id]/themes/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/semesters/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/settings/campuses/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/settings/holidays/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/settings/roles/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/settings/users/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/settings/work-hours/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/student-attendance/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/student-journal/classes/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/student-journal/monitoring/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/student-journal/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/student-journal/students/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/students/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/admin/students/page.tsx` — shared (portal shell/primitives reviewed; capability retained)

**Teacher**

- [x] `app/teacher/assessments/center/[center]/page.tsx` — shared; deferred deeper workflow (assessment workflow redesign excluded)
- [x] `app/teacher/assessments/page.tsx` — shared; deferred deeper workflow (assessment workflow redesign excluded)
- [x] `app/teacher/assessments/weekly/page.tsx` — shared; deferred deeper workflow (assessment workflow redesign excluded)
- [x] `app/teacher/attendance/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/class-attendance/page.tsx` — direct
- [x] `app/teacher/page.tsx` — direct
- [x] `app/teacher/profile/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/sessions/[id]/page.tsx` — shared; deferred deeper workflow (pickup/session semantics retained; redesign excluded)
- [x] `app/teacher/slips/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/slips/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/student-journal/entry/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/student-journal/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/teacher/student-journal/students/[id]/page.tsx` — shared (portal shell/primitives reviewed; capability retained)

**Parent**

- [x] `app/parent/attendance/page.tsx` — direct
- [x] `app/parent/invoices/page.tsx` — direct
- [x] `app/parent/page.tsx` — direct
- [x] `app/parent/perkembangan/[studentId]/page.tsx` — direct
- [x] `app/parent/perkembangan/page.tsx` — direct
- [x] `app/parent/profile/page.tsx` — shared (portal shell/primitives reviewed; capability retained)
- [x] `app/parent/reports/page.tsx` — direct
- [x] `app/parent/student-journal/page.tsx` — direct


## Verification

- Desktop integrated source on staging `13661f07`: production `npm run build -- --webpack` passed including TypeScript and route generation; `npx vitest run` passed **363 suites / 3,433 tests** (two pre-existing skipped suites, 42 TODO); full ESLint exited 0 with 54 warnings; hooks 32/32 passed; documentation audit 13 OK / one existing ADR-age warning / zero failures; `git diff --check` passed.
- The standard Turbopack build was attempted and blocked by local worker socket restrictions (after an initial restricted Google Fonts fetch). Webpack is a verification-only CLI override: package/config/CI are unchanged, and the required CI **Build** must pass the standard command before merge.
- Final independent review cleared the shared attendance selector/save recovery, teacher class authorization, parent ownership and billing context, invoice capability boundaries, HR umbrella/domain conjunction, and employee activity visibility. Existing classroom-assignment authority is preserved; no additional session-teacher deny was introduced.
- Staging integration `13661f07` included the shared responsive form scroll/keyboard fix. Only an admin JTBD history-line conflict occurred; both upstream form checks and redesign checks were retained. All implementation slices below were tested together after integration; role commits preserve that tested working-tree source.

- Desktop recovered cloud source `4f6714a9217544f5695a0344edc8bbd32312108a` against staging `d8b418ec3a393ff79476bf4794951470de51e63e` (37 files, +820/-196). The first export omitted the nested worktree; the worker repaired the primary checkout export without changing implementation. No PR or merge was created by that export.
- Desktop production build of the recovered patch passed with matching staging dependencies, generated Prisma client, and a disposable PostgreSQL database on loopback port 55440. Earlier cloud environment blockers below are historical. This build does not verify subsequent corrections.
- Independent review rejected the recovered patch as incomplete: missing pickup navigation, incorrect class/day attendance and active-roster journal counts, missing-record presence claims, stale attendance saves, check-in recovery, note destinations, a development Back loop, ambiguous household billing, incorrect payment capabilities, HR destination permission mismatches, and a leave dialog that reopened after dismissal. Visual hierarchy and all-route consistency also require further work. No review or usability pass is claimed.
- Local acceptance fixtures use only the disposable database: two assigned classes, three children in one household, 16 active SCHOOL indicators with complete/15-of-16/missing students, saved and missing attendance, unread guardian reply, all four queue kinds, and restricted synthetic role accounts. Fixture preparation was independently read back. No shared school database or real payment service was modified.
- Historical cloud reference review: approved concept read directly from `docs/cycles/assets/talib-ux-concept.html`; the committed admin/guru/wali renders were visually inspected. A fresh local HTML render was attempted but Playwright's Chromium executable is not installed in this environment.
- Task 4 focused verification: scoped ESLint passed; PageHeader, TaskList, and EmptyState suites passed 9/9; `git diff --check` passed.
- Task 3 focused verification: queue adapter and manual-invoice authorization suites passed 17/17 before review; scoped ESLint and diff check passed after review fixes. Full endpoint suites do not exist for every legacy invoice mutation; CI/full suite remains required.
- Task 2 focused verification: KidCard plus parent journal passed 13/13 and scoped ESLint passed; after review the isolated parent journal suite passed 12/12 and the integrated focused suite passed all other 47 assertions.
- Task 1 focused verification: 3 files / 9 tests passed before review; integrated focused set passed except one known order-sensitive parent journal assertion, whose isolated 12-test suite passed immediately afterward. TypeScript cannot complete because the transferred `node_modules` is TanStack v8 while staging requires v9; attempted install was blocked with HTTP 403 for `input-otp@1.5.0`, then the original symlink was restored.
- Initial route inventory: admin 41, teacher 13, parent 8 (62 total).
- Desktop first full Vitest: 359 suites passed, one failed, two skipped; 3,394 tests passed and five existing billing-chain assertions failed because their admin fixture omitted the newly required invoice capability. The fixture is being corrected without weakening billing assertions. This is a failure record, not a passed final gate.
- Independent desktop teacher review cleared journal all-indicator completion, reply destinations, pickup preservation, and the final shared attendance selector. Classroom status retains existing class-assignment authority and intentionally shares a sole session row; pickup actions retain effective-session-teacher authority. No authority redesign or migration is introduced.
- Legacy null-session attendance has a database uniqueness limit of one pupil/date. The corrected write cannot overwrite another class; it reports an actionable conflict. Supporting simultaneous null-session records across classes needs a separate schema decision.

## Ship Notes

- Implementation is being committed in role slices after the integrated gates. Task 5 remains open until rendered and signed-in acceptance plus protected CI pass. Do not merge until the corrected current source passes independent review, build, full Vitest, Playwright, local demo-auth browser verification with disposable PostgreSQL, and all four protected checks.
- Verification route classification: **auth-impacting**. The actual diff tightens teacher roster, finance, and leave authorization guards. Signed-in role-specific PR preview verification is required in addition to local demo-auth browser checks with disposable PostgreSQL. Browser screenshots and 320/390/768/1440, 200% reflow, keyboard/focus-return, reduced-motion, long-copy, multi-child/class, failure/save, and payment-return checks remain pending and are not claimed.
- Historical cloud limitation (resolved on desktop): `npm run build` reached Next.js but stopped at the documented worktree environment limitation: Turbopack rejects the out-of-root `node_modules` symlink. A local dependency install was attempted after removing the symlink, but registry policy returned HTTP 403 for `input-otp@1.5.0`; the original symlink was restored. The transferred modules contain TanStack React Table v8 while current staging requires v9, so TypeScript/full-suite evidence cannot be fabricated.
- Historical cloud Playwright deferral is superseded by desktop verification: matching dependencies, Chromium, and a disposable database are now available. Final local Playwright and signed-in preview are pending; required CI `Playwright E2E` still gates merge.
- Docs audit passes 13 checks with one pre-existing ADR-age warning after regenerating the owned counts block. Focused UI/domain tests and scoped ESLint are recorded above; one integrated parent-journal assertion was order-sensitive and passed 12/12 in immediate isolation.
- No migration or new environment variable. Roll back by reverting this cycle's commits. Production promotion remains separate.
