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
- [x] Task 2: Make parent home and child journeys family-first with persistent identity and authoritative billing states.
- [x] Task 3: Add the permission-filtered admin work queue and close the invoice-create authorization gap.
- [x] Task 4: Apply and document shared consistency across all 62 portal page routes, recording route-level coverage and preserving capabilities.
- [ ] Task 5: Complete independent review, responsive/browser verification, full gates, and ship evidence.

## Implementation

- Subagent plan: the cloud implementation split teacher, parent, and admin work; desktop driver=gpt-6-astra continued with independent role/security reviewers and delegated corrections using exclusive file ownership. Integration, design decisions, final review, and shipping remain with the CTO driver. The recovered cloud patch was reopened after behavioral gaps were found; its earlier completion claims are not acceptance evidence.
- Task 1: Teacher daily journeys — `app/teacher/**`, `lib/teacher/**`, and guardian-unread filtering in `lib/student-journal/note-reads.ts` — current class, authoritative progress, validated Jakarta date/class context, direct guardian thread, truthful assessment action, compact recoverable personal check-in. Independent review fixed UTC-day drift, lexical slot ordering, and non-guardian/non-direct reply routing.
- Task 2: Parent family journeys — `app/parent/**` and `components/parent/kid-card.tsx` — household outstanding action first, explicit child-scoped journal/attendance/development/report/billing links, and visible persistent child identity. Independent review added the missing per-child billing destination and routes the household action to the nearest-due child rather than an unrelated selected child.
- Task 3: Admin authoritative queue and invoice authorization — admin dashboard/adapters, leave deep-link support, and invoice mutation routes — tenant-scoped domain records are visible only with matching view+action permissions; failed sources never become false zeroes; queue destinations open real records; invoice link creation requires `invoices.create`, manual receipts require `payments.record`, and cancellation requires `invoices.void`. Two independent reviews closed destination-permission, leave deep-link, unavailable-state, and direct endpoint-bypass defects.
- Task 4: 62-route consistency sweep — shared admin/portal headers, EmptyState, TaskRow, parent development selection, and both canonical design-system references — improved semantic hierarchy, long-copy wrapping, 320px/200% action reflow, shared task navigation, and documented authoritative states. The route ledger below records the full scope; browser coverage and workflow results are recorded separately under Verification.

### Route coverage ledger

Every route below was included in the first desktop browser sweep at 320/390/768/1440px. The direct/shared labels describe the initial implementation path, not the depth of browser verification. Deeper workflow exclusions do not exclude visual consistency, context, save feedback, or existing capabilities. Full source `064cb83c` coverage is recorded in `docs/cycles/screenshots/role-redesign-completion/route-coverage-064cb83c.json`; the final frame/contrast delta is verified separately against its rebuilt source.

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

- Final frame/contrast correction batch: production build passed, original Next config restored byte-for-byte, and full Vitest passed **366 suites / 3,456 tests** (two skipped suites, 42 TODO). The parent journal regression now waits for the actual child/week request effect and verifies sibling navigation preserves week/notes; its scheduling race was reproduced and resolved, then all 13 tests passed three stress runs with two CPU hogs. Scoped ESLint and independent review passed for every final changed file.
- Final contrast changes are exclusively semantic text-token substitutions: 22 meaningful text uses across 15 files. `primary-text` measures 5.00:1 against white and 4.57:1 against the attendance highlight. No layout, state, event, or permission behavior changed.
- Full local Playwright on `064cb83c`: **151 passed, eight existing skips, zero failures/retries** across 35 suites. Skips cover seed-dependent legacy cases and two pre-existing fixmes; targeted local fixtures separately exercised multiple pickup sessions, child ownership, queue permissions, and save recovery. The final reference-only E2E delta is verified after the narrow header fix; protected CI still runs the full suite on the published head.
- Definitive authorized route sweep on `064cb83c`: **62/62 routes, 260 captures at 320/390/768/1440**, zero page-overflow/heading/HTTP/page-error findings and zero unavailable routes. Role identities were explicitly bound to the fixtures. Manual review found the reference iframe restriction and low-contrast informational text; these are tracked separately until the final delta verification, rather than hidden by the automated result.
- Source `064cb83c`: targeted teacher assessment/clock/pickup E2E passed 6/6; teacher recovery/context/keyboard/responsive checks passed seven scenarios, with an initial 12-second cold-navigation timeout recorded separately and the homeroom/counts confirmed in subsequent screenshots. Parent mixed-attendance checks passed at 320/390/1440; temporary synthetic records were removed. Parent/admin targeted checks passed **14/14**, including school-admin and restricted roles. An earlier retry used a pending-link fixture changed by full E2E; restoring that exact synthetic fixture resolved the harness mismatch without application changes.
- Native Chrome **200%** zoom was observed in the browser toolbar. All three homes plus class attendance and parent bills reflowed without page overflow (720px CSS viewport/scroll width); primary class action, sibling bill disclosure/context, and admin navigation/focus return worked. Zoom returned to 100% and the injected local demo cookie was removed. Details: `docs/cycles/screenshots/role-redesign-completion/native-zoom.json`.
- The design reference iframe was blocked by a duplicate proxy `X-Frame-Options: DENY` override. A reviewed exact-path exception allows only `/admin/design-system-reference.html` to use SAMEORIGIN with matching report-only frame ancestors; every other path retains DENY. Actual iframe content will be checked after rebuilding, and E2E now guards loaded content rather than merely the iframe element.
- Final correction batch: full Vitest passed **366 suites / 3,455 tests**, with two pre-existing skipped suites and 42 TODO. The new billing class/year UI regression waits for the asynchronous Base UI popup; it also passed three repeated runs with two CPU hogs. Full ESLint passed (54 warnings); subsequent changed test/name files passed scoped lint. Independent reviewers cleared all final role and permission corrections.
- Final local production build passed with TypeScript and 154-page generation. The preceding attempt encountered ENOSPC while writing Webpack filesystem cache. The verification harness temporarily selected the documented in-memory compiler cache and restored `next.config.ts` byte-for-byte afterward; no cache/config override is shipped. Standard CI Build remains mandatory.
- Integrated candidate `3dec31b120fb9747e1939c3870d721fb1667395b`, based on staging `13661f07`: production `npm run build -- --webpack` passed including TypeScript and route generation; full Vitest passed **363 suites / 3,433 tests** (two pre-existing skipped suites, 42 TODO); ESLint exited 0 with 54 warnings; hooks 32/32 passed; documentation audit 13 OK / one existing ADR-age warning / zero failures; diff check passed.
- Standard Turbopack was attempted and blocked by local worker socket restrictions (after an initial restricted Google Fonts fetch). Webpack is a local verification-only CLI override: package/config/CI are unchanged. Required CI **Build** must pass the standard command before merge.
- First browser sweep on that candidate: **62/62 portal route patterns, 260 visits**, covering 320/390/768/1440px. Seven visits exposed horizontal overflow on six pages: monthly employee attendance, classes (320 and 768), design-system preview, roles, admin student journal detail, and parent development detail. Independent screenshot review additionally found clipped teacher date/amount controls and admin contact/payroll layouts. Corrections await a fresh sweep.
- Targeted local teacher checks passed all nine scenarios: class/date context, no-session fallback, failed attendance/journal save and retry, child-specific notes, personal check-in recovery, both pickup sessions, responsive controls, keyboard focus, and reduced motion. Parent/admin checks passed 13 scenarios: child/back/reload context, note failure/recovery, server-derived pending/partial/paid/missing-link payment states, foreign-child rejection, queue destinations, restricted finance/HR/admissions roles, dismissal persistence, mobile campus selection, and focus return. These used demo auth with disposable **loopback PostgreSQL**, not shared staging or live payment services.
- First full Playwright run: **136 passed, 14 failed, one flaky, eight skipped**. Failure review identified stale home/queue assertions, removed native invoice list semantics, a real class/year mismatch in the billing wizard, and a local pickup fixture that inadvertently replaced the active academic year. Stale assertions, native list semantics, billing scope, and exact disposable fixture-year state were corrected; the rerun remains required. This first run is not a passing final gate.
- Independent review required consistent parent attendance selection across classes: use the same authoritative classroom selector as the teacher portal, expose conflicting class statuses as “Catatan berbeda,” and never claim all-present from contradictory records. Raw attendance notes are not newly disclosed to guardians. Billing now rejects mismatched class/year scope before draft creation and clears stale class selection when the year changes.
- Independent source reviews cover classroom selector/save recovery, teacher roster authorization, parent ownership/context, invoice capability boundaries, HR umbrella/domain permissions, activity visibility, and responsive changes. Existing classroom-assignment authority is preserved; pickup retains effective-session-teacher authorization. Legacy null-session attendance has a one-pupil/date uniqueness limit; a cross-class write now reports an actionable conflict instead of overwriting another class. Supporting multiple null-session class rows requires a separate schema decision.
- Historical recovery: cloud patch `4f6714a9` was exported and recovered, then substantially corrected on desktop. Cloud dependency/build limitations were resolved with matching local dependencies and a disposable database. The first desktop unit run exposed five billing fixture assertions missing the newly required invoice capability; fixture permissions were corrected without changing billing assertions, followed by the passing full run above.
- Prototype differences are intentional: real school/date/status data replaces invented counts and times; five mobile navigation slots are retained; all session pickup destinations remain available; missing/unavailable states are explicit; readable labels, 44px controls, and full child identity take precedence over tiny prototype text. No measured usability improvement is claimed; representative users were not available.

## Ship Notes

- Runtime implementation is committed in role slices; browser-discovered corrections and final acceptance are in progress. Task 5 remains open until current-source gates and rendered verification are complete. Do not merge on pending/red checks.
- Verification route: **auth-impacting** because the diff tightens teacher roster, finance, and leave guards. Signed-in, role-specific PR preview verification is required in addition to local demo-auth/disposable-database checks. Use the already authorized local role-account configuration; do not commit account identifiers or private preview data.
- Final Playwright, rebuilt all-route screenshots/reference-frame verification, signed-in preview, and the four protected CI checks remain required. Native 200% zoom passed as recorded above. Mobile layouts and synthetic keyboard/failure checks do not constitute testing on physical mobile hardware.
- No migration, dependency change, or new environment variable. Rollback is a revert of this cycle's commits. Production promotion is separate and is not part of this cycle.
