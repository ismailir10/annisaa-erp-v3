# Talib: radical UI/UX audit and proposed redesign

## Context

Talib has capable modules and reusable interface patterns, but people still have to assemble their own workflow across them. The proposed change is to organize the product around the next useful action: **admin resolves school work; teacher runs today's class; parent understands and responds to their children's needs.** This audit applies the principles of Steve Krug's *Don't Make Me Think*: recognizable choices, obvious destinations, a clear visual hierarchy, minimal unnecessary decisions, and visible outcomes. This is an audit and proposal requested by the CTO user, not authorization to implement the redesign.

**Baseline:** `8ebcb16f` on `origin/staging`, inspected 24 September 2026 in `.worktrees/radical-ux-audit`, branch `feat/radical-ux-audit`. Main-checkout changes were left intact. Three role audits plus a shared-component review informed this synthesis. The driver checked important claims and discarded false positives.

**Evidence limits:** this is a comprehensive code-based heuristic review across the three portals, with limited live browser verification. The admin dashboard rendered successfully at 1440 × 1000; its accessibility tree and DOM confirmed hierarchy and navigation. Teacher/parent mobile browser checks did not complete because local compilation exhausted disk space. No real user research, production performance measurements, contrast certification, full keyboard/screen-reader walkthrough, payment transaction, or production UAT was performed. Recommendations and success targets below are hypotheses to test, not measured gains.

**Assumptions:** Indonesian product copy and the existing Talib identity remain; admin supports dense desktop work plus essential mobile triage; teacher and parent remain mobile-first. Existing security, guardian ownership, accounting, and assessment rules remain authoritative. Illustrative mockup people, amounts, counts, and class names are fictional.

**Research grounding:** [Steve Krug's book](https://sensible.com/dont-make-me-think/), [recognition rather than recall](https://www.nngroup.com/articles/recognition-and-recall/), and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Applied here: show frequent actions first, label secondary paths clearly, preserve context, and test whether users can predict what a click will do. Fewer clicks alone is not the goal; clear, low-effort decisions matter more.

### What should change most

| Role | Current burden | Proposed organizing question |
|---|---|---|
| Super admin / school admin / custom operational roles | Find a module, inspect its state, work out what needs attention | What requires my action today? |
| Teacher: homeroom and sentra | Select the right attendance/journal/assessment surface; remember save rules | What does this class need next? |
| Guardian: one or several children | Translate household summaries into child-specific pages; re-establish child context | How are my children, and what should I do? |

Keep the strengths: permission checks, familiar module routes, DataTable and row actions, responsive forms, portal bottom navigation, journal progress and threads, class-attendance autosave, guardian ownership checks, and the existing household overview. A redesign must improve orchestration rather than rebuild every component.

## Spec

### Proposed product direction

**1. Admin: a work queue with clear ownership and resolution.**

Make `/admin` begin with **Perlu ditangani**, filtered by actual permissions. Rows show a concrete problem, affected record(s), date/age when available, why it needs attention, and one action. Examples: an admission ready for review, payment link needing recovery, incomplete class setup, report needing review, leave awaiting approval. Group by task and urgency; avoid an unexplained aggregate “school health score.” Queue counts must come from server-authorized queries, not guessed client totals. Unknown or failed data must remain visibly unknown.

Keep a stable, permission-aware navigation path to every existing module. Introduce operational workspaces as a layer over existing routes: **Siswa & pendaftaran**, **Pembelajaran**, **Keuangan**, **Tim**, **Pengaturan**. Validate these groupings through task-based tree testing before replacing current navigation. Display the current workspace and campus/year context explicitly; avoid silently changing scope. Finance staff should land on finance work; school admins on admissions and academic operations; HR on staff work. Do not add a new role-switching capability where the account does not already have authorization.

Queue actions should open the relevant record with filters/context preserved. Resolving it returns to the same queue position and recalculates state. Do not add claim/assignment functionality until the data model supports it; show an existing responsible role where appropriate. Cross-module readiness checklists should reveal dependencies without blocking work that can safely proceed.

**2. Teacher: one daily classroom workspace.**

Before personal check-in, show a clear check-in action and the upcoming class. After check-in, collapse personal attendance into a compact saved status and promote **Kelas hari ini**. Each class displays explicit attendance, journal, and assessment progress, with a direct **Lanjutkan** action to the relevant unfinished task. Retain direct bottom-nav access for experienced users.

Carry class, school date, session, and relevant assessment context into each destination. Preserve the distinction between class attendance and session pickup/check-out: grouping the workflows must not conflate records with different business meanings. Use a consistent saving vocabulary: **Menyimpan… / Tersimpan / Belum tersimpan—coba lagi**. Save-on-tap can remain for safe independent observations; batch save remains when a grouped record requires review. The screen must explain the difference without forcing the teacher to remember it.

Assessments need complete/remaining counters tied to the actual expected observation set, an incomplete-only filter, and **Siswa berikutnya**. Missing observations must not be interpreted as the lowest developmental level or as absence. Center assessment setup appears first; once set, the roster becomes the main workspace and setup collapses to an editable summary. Keep an expert grid for fast scanning; avoid a wizard that forces teachers to hop backward repeatedly.

Promote unread guardian replies into **Balasan wali**, linking directly to the existing note thread. Reuse journal completion and notes instead of creating a separate messaging product.

**3. Parent: family overview, then an unmistakable child context.**

Keep home household-wide. Lead with genuine actions: a new teacher note, invoice due, a newly available report. Do not infer an urgent child-safety problem solely from missing attendance data. Below that, show each child's name/class, today's recorded status or “belum dicatat,” and the most relevant update. Every visible signal has the matching action: **Lihat catatan**, **Lihat perkembangan**, **Lihat tagihan**, **Lihat rapor**. A generic whole-card click must not route unrelated content to attendance.

Child-specific views carry a persistent child name/class strip with a labeled switch. Canonical child context survives navigation, refresh, back, journal tabs, and payment return. Validate ownership on every server request; a query parameter is navigation context, never authorization. Detail/back should return to the originating family or child view.

Payments begin with who/what/amount/due date and one useful action. Put search, sorting, filters, and paid history below the current payment task. Display **Menunggu konfirmasi pembayaran** until server data confirms settlement; show **Lunas** only when the authoritative balance/status supports it. Missing links get an actionable school contact or approved manual instructions; never invent bank details or payment channels. Perkembangan should begin with available teacher observations and activities, with element rollups available secondarily. Do not generate developmental conclusions unsupported by recorded observations.

### Interaction and visual contract

- Every first viewport answers: where am I, whose data is this, what matters, what can I do next?
- One dominant action per task region; secondary actions remain visibly labeled. Menus hold rare actions, never the essential next step.
- Carry filters, child/class, year, and date context through relevant journeys. Restore list position after detail/edit.
- Preserve Talib teal and familiar shells. Use dark text on the existing light teal; the shared Button already documents why white text would fail normal-text contrast.
- Reduce decorative KPI cards and repeated toolbars. Prioritize typography, section spacing, and semantic status labels. Reserve destructive red for failure, overdue risk, and destructive actions; ordinary unpaid items should not all look like errors.
- Admin: compact desktop rows, task-focused mobile summaries where needed; retain horizontal table scroll for advanced data. Parent/teacher: comfortable mobile rows, progressive detail, essential controls near the task.
- Coarse-pointer actions target 44 × 44 CSS px; keyboard focus remains visible and unobscured. This is a proposed usability target, not a claim that every current 32px control fails WCAG.
- Dialog/sheet actions remain reachable with the mobile keyboard open. Errors identify the field or record and an available recovery action. Empty states distinguish no data, filtered out, setup incomplete, and load failure.
- Respect reduced motion. No automatic carousel, celebratory distraction, or chat interface replacing routine controls.

### Prioritized findings

**Evidence key:** C = current code confirmed; B = also confirmed in live browser DOM. P1 = task continuity/trust or primary workflow; P2 = important efficiency/clarity; P3 = consistency. Severity reflects heuristic judgment, not observed failure frequency. Source references are repo-relative file:line at the baseline commit.

| ID | Priority / evidence | Finding and user cost | Proposed change | Source |
|---|---|---|---|---|
| A01 | P1 C+B | Admin dashboard leads with employee totals/attendance and HR quick actions. School and custom finance/academic roles lack equivalent relevant starting work. | Permission-aware task queues first; domain summaries second. | `app/admin/page.tsx:65`, `app/admin/page.tsx:174`, `components/admin/dashboard/quick-actions.tsx:17` |
| A02 | P1 C | Navigation filters only declared permissions; several groups/items omit them. Users can be offered destinations inconsistent with their grants. This is a navigation mismatch risk, not proof of data exposure. | Derive item visibility and route access from a shared permission mapping; test custom-role combinations. | `config/admin-nav.ts:60`, `components/admin/sidebar.tsx:110` |
| A03 | P1 C | Payroll stats start at zero and silently retain zero on a failed request. Unknown can look like a real business count. | Loading/error/known-zero states, inline retry, refresh after changes. | `app/admin/(hr)/payroll/page.tsx:173` |
| A04 | P2 C | Students and classes show first-use empty copy even when filters/year hide existing records. | Name the active scope; offer reset/switch-year for filtered empty. | `app/admin/students/page.tsx:723`, `app/admin/students/page.tsx:737`, `app/admin/classes/client.tsx:461` |
| A05 | P2 C | “Kirim Formulir” is offered for non-converted admissions before readiness such as contact details is explained; rejection arrives later. | Show missing email or completed-form state before action; provide the correction path. | `app/admin/admissions/page.tsx:613`, `app/admin/admissions/page.tsx:871` |
| A06 | P2 C | Fee setup is titled “Biaya & Tagihan” although Tagihan is a separate destination; no components can leave a structure with an empty list and a save action. | Distinguish “Struktur biaya” from invoices; lead first-use setup to components. | `app/admin/fees/page.tsx:210`, `app/admin/fees/page.tsx:285` |
| A07 | P2 C | Ordinary remaining invoice amounts use destructive red; payment ledger defaults to today, which is easy to miss during month reconciliation. | Reserve red for exceptions; make “Hari ini / Bulan ini / Rentang tanggal” explicit. | `app/admin/invoices/invoices-client.tsx:133`, `app/admin/payments/page.tsx:60` |
| A08 | P2 C | Report preparation requires translating between semester/term/class, assessment monitoring, narrative templates, and editing. Readiness is distributed. | “Siap diterbitkan” checklist with missing dependencies and direct correction links; section navigation and review before publish. | `app/admin/raport/page.tsx:266`, `app/admin/raport/raport-editor.tsx:316`, `app/admin/raport/templates/page.tsx:269`, `app/admin/penilaian/page.tsx:143` |
| A09 | P2 C | Academic year/program, classes, semester/themes/objectives are separate setup surfaces without one completion model. | Cross-page setup checklist carrying selected year/program; preserve expert direct routes. | `app/admin/academic-years/page.tsx:40`, `app/admin/semesters/client.tsx:276` |
| A10 | P2 C | Role editor exposes permission checkboxes without a clear preview of resulting capabilities/navigation. | Operational presets, readable capability summary, validation of dependencies, preview of visible workspaces. | `app/admin/settings/roles/page.tsx:145`, `lib/permissions.ts:11` |
| A11 | P2 C | Monthly employee attendance uses 20px day buttons as the primary edit targets. | Keep dense desktop overview; provide 44px effective targets or a day/employee detail editor for touch. | `app/admin/(hr)/employee-attendance/monthly/page.tsx:107`, `app/admin/(hr)/employee-attendance/monthly/page.tsx:174` |
| A12 | P2 C | Employee edit/view sections use fixed two-column grids with no narrow-screen fallback, compressing inputs and contact data. | Stack fields on narrow screens; retain paired desktop fields. Validate long values and open keyboard. | `app/admin/(hr)/employees/[id]/page.tsx:197`, `app/admin/(hr)/employees/[id]/page.tsx:244` |
| A13 | P2 C | Payroll correction actions include a small text control and 28px adjustment buttons. | Make correction actions explicit, comfortably tappable, and scoped to the employee/line being edited. | `app/admin/(hr)/payroll/[id]/page.tsx:472`, `app/admin/(hr)/payroll/[id]/page.tsx:492` |
| T01 | P1 C | Class attendance autosaves; session attendance requires final save. Both concern attendance but have different completion semantics. | Shared classroom context and explicit save state; distinguish attendance from pickup/session details. | `app/teacher/class-attendance/page.tsx:99`, `app/teacher/sessions/[id]/client.tsx:91`, `app/teacher/sessions/[id]/client.tsx:300` |
| T02 | P1 C | Assessment entry exposes controls but lacks an overall expected/complete/remaining task model. | Progress per class/context, incomplete-only view, next incomplete student. | `app/teacher/assessments/weekly/client.tsx:308`, `app/teacher/assessments/center/[center]/client.tsx:627` |
| T03 | P2 C | Personal clock-in occupies the main home region while class sessions sit lower, including after arrival. | Context-sensitive home: compact completed attendance; current/next class first. | `app/teacher/home-client.tsx:254`, `app/teacher/home-client.tsx:439` |
| T04 | P2 C | Parent replies are row badges and note threads behind student drill-in. A teacher must search for communication work. | Unread-reply queue leading directly to the existing thread. | `components/student-journal/class-day-grid.tsx:153`, `app/teacher/student-journal/students/[id]/page.tsx:249` |
| T05 | P2 C | Sentra assessment combines date, age, activity, indicators, roster, notes, and save constraints in one long surface. | Collapsible setup summary then focused roster; retain editable context and an expert grid. | `app/teacher/assessments/center/[center]/client.tsx:358` |
| P01 | P1 C | Jurnal selection uses local child state while bottom nav forwards URL child state. Selecting a child can fail to carry to the next page. | Canonical validated child route state and persistent context strip. | `app/parent/student-journal/page.tsx:133`, `app/parent/student-journal/page.tsx:298`, `components/parent/bottom-nav.tsx:34` |
| P02 | P1 C | Payment return strips all query context with `/parent/invoices`; child context can reset. | Remove only transient return parameters; preserve/reconcile child and invoice ownership. | `app/parent/invoices/client.tsx:101`, `app/parent/invoices/client.tsx:120` |
| P03 | P1 C | Payment return displays “terbayar” when URL status is paid and invoice ID is found, without checking server payment status in that handler. A confirmation can precede settlement. | Pending confirmation until server data verifies balance/status; partial payment gets its own wording. | `app/parent/invoices/client.tsx:115` |
| P04 | P1 C | Parent attendance uses server-local calendar math while Jurnal uses Jakarta date helpers; near date/week boundaries pages can disagree. Not reproduced live. | One school-timezone date contract and boundary checks. | `app/parent/attendance/page.tsx:20`, `app/parent/attendance/page.tsx:62`, `app/parent/student-journal/page.tsx:140` |
| P05 | P2 C | Child cards carry note/progress signals, but their generic link goes to attendance. Destination does not match every visible reason to tap. | Explicit per-signal actions with child context, instead of ambiguous whole-card navigation. | `components/parent/kid-card.tsx:90`, `app/parent/page.tsx:271` |
| P06 | P2 C | Invoice screen mixes current debt, sibling status, filtering, sorting, history, and detail. A parent must find the payment task among controls. | Action-first default, secondary history/search disclosure. | `app/parent/invoices/client.tsx:304`, `app/parent/invoices/client.tsx:386` |
| P07 | P2 C | Missing payment link already has contact-admin copy, but it is text rather than an actionable contact path; pending link asks the user to try later. | Configured contact action, refresh/recheck status, approved fallback instructions. Do not claim the old missing-copy bug still exists. | `app/parent/invoices/invoice-detail-sheet.tsx:321`, `app/parent/invoices/invoice-detail-sheet.tsx:350` |
| P08 | P2 C | Perkembangan leads with element counts before weekly observations. Parents must interpret the educational structure. | Available observations and activities first; element summary secondary, no invented developmental judgment. | `app/parent/perkembangan/[studentId]/page.tsx:64` |
| X01 | P2 C | Some mutations display backend-provided `error` strings directly. Whether any specific message is technical depends on API output. | Known error codes → domain copy and field-level recovery; safe fallback for unknown errors. | `app/admin/students/page.tsx:546`, `app/admin/students/page.tsx:616`, `app/admin/academic-years/page.tsx:91` |
| X02 | P2 C | Repeated “Lihat”/“Buka menu” actions lack row-specific accessible names; several row/pagination controls are 32px. | Include record name in accessible label; larger effective coarse-pointer targets. | `components/ui/data-table-row-actions.tsx:44`, `components/ui/data-table-row-actions.tsx:54`, `components/ui/data-table-pagination.tsx:56` |
| X03 | P2 C | Payroll variable/line correction dialogs bypass the existing responsive form shell; guardian edit uses a right sheet. | Use established mobile form patterns and reachable primary actions. Settings dialogs are an explicit design-system exception, so they are not counted as a standards violation. | `app/admin/(hr)/payroll/[id]/page.tsx:521`, `app/admin/(hr)/payroll/[id]/page.tsx:541`, `app/admin/guardians/page.tsx:323` |
| X04 | P3 C | Sentence case and naming vary: “Jurnal” versus “Buku Penghubung”, “Tambah Kelas”, “Simpan Perubahan”. | Consistent task labels; familiar alternate terminology in subtitles where necessary. | `components/teacher/bottom-nav.tsx:13`, `app/teacher/student-journal/page.tsx:118`, `.claude/standards/voice.md` |
| X05 | P2 C | Teacher UAT jobs describe retired assessment templates/levels and publishing behavior, while current code uses weekly/sentra IKTP flows. | Refresh task scripts before using them to judge the redesign. | `docs/uat/jobs/teacher.md:105`, `app/teacher/assessments/page.tsx:81` |

### Before → proposed journeys

| Job | Current journey from code | Proposed journey and acceptance |
|---|---|---|
| School admin: prepare reports | Pick term/class; inspect report roster; separately inspect monitoring/templates; edit/publish | Work queue → class readiness → missing item or review. Preserve scope and show why publication is blocked. |
| Finance: recover payment problem | Open finance module, locate relevant invoice, inspect/retry its link | Finance queue → affected invoices already filtered → inspect/retry with outcome. Existing manual and bulk invoice paths remain. |
| Teacher: start a class | Home clock → choose attendance or scroll to session → select context → roster | Current class → correct roster with date/class preselected. Never silently assume “present” for unmarked students. |
| Teacher: finish assessments | Hub → weekly/sentra → date/indicator setup → scan roster for omissions | Today's task → retained context → incomplete queue → explicit saved/remaining summary. |
| Parent: respond to teacher | Home child signal → generic card goes to attendance; find Jurnal and child/thread | “Catatan baru untuk Aisyah” → Aisyah's thread → return to family overview. |
| Parent: pay and return | Child invoice → external gateway → invoice sheet/toast → query cleared | Child invoice → gateway → same child/invoice → pending verification or authoritative paid receipt. |

### Success criteria for implementation

These are proposed release criteria. Establish the current baseline with the same tasks before claiming improvement.

- [ ] In moderated testing, at least 4 of 5 participants per primary persona can identify the next action within 5 seconds on their role home, without coaching. Small-sample signal, not statistical proof.
- [ ] At least 4 of 5 complete the representative role task without assistance or a wrong destination. Record completion, hesitations, backtracking, and errors; compare against baseline.
- [ ] Parent multi-child tests preserve child identity across all five main navigation slots, overflow destinations, back/reload, notes, and payment returns.
- [ ] A payment return cannot display a settled confirmation based solely on URL parameters; pending, partial, paid, failed, canceled, and stale-link scenarios have truthful next steps.
- [ ] Teachers can see class/date, completion, and save state while entering data; failed persistence stays recoverable without silently losing edits.
- [ ] Every operational role, including permission-limited custom roles, has relevant landing content and no misleading navigation invitation.
- [ ] Failed counts, empty datasets, and filtered-out datasets have distinct states and recovery; unknown never renders as a business zero.
- [ ] Keyboard-only and screen-reader checks cover navigation, row actions, dialogs, error recovery, and focus return. Verify contrast from rendered colors; no conformance claim based on code inspection alone.
- [ ] Verify 360/390px mobile, desktop, 200% zoom, long Indonesian names, multiple children/classes, no data, load failure, slow network, and stale data. Main page must not overflow horizontally; tables may intentionally scroll.
- [ ] Test production-build mobile performance with a documented device/network baseline. Use project UAT thresholds (page >4s, API >2s, click-to-visible >3s) as escalation triggers, with warm and cold cases separated. Current audit provides no valid production timing baseline.

## Tasks

Audit deliverables:

- [x] Inventory all three role route surfaces and permissions.
- [x] Review main journeys, shared controls, project standards, and stale UAT evidence.
- [x] Verify high-impact findings and remove unsupported claims.
- [x] Define target experiences, journey changes, and measurable acceptance criteria.
- [x] Finish secondary-admin review and integrate its findings, including both remaining journal routes.
- [x] Produce interactive concept for admin, teacher, and parent, clearly labeled illustrative.
- [x] Run documentation checks and prepare the reviewable proposal for this task.

Recommended implementation sequence (separate scoped cycles; not executed here):

1. **Trust and continuity.** Fix P01–P04, A03, and A02 first. Files: parent journal/invoice/attendance views, shared parent nav/context utilities, payroll stats state, admin nav/permission mapping. Acceptance: two-child round trip, verified payment confirmation, timezone boundary, failed stats, and custom-role navigation tests pass. Dependencies: none; preserve existing API authorization.
2. **Teacher classroom pilot.** Start with homeroom home + class attendance/journal; add assessment progress after expected-completion semantics are agreed. Files: teacher page/home-client, class attendance, weekly/center clients, ClassDayGrid and existing note thread. Acceptance: “open today's class → complete task → confirm saved” works on phone with failure recovery. Depends on shared state vocabulary; does not require admin home redesign.
3. **Parent family pilot.** Rework KidCard signal actions and home ordering; share child context; simplify invoice default view and observation-first progress. Files: parent page/KidCard/invoices/perkembangan, PortalHeader/nav. Acceptance: two-child parent identifies the right action and returns to the same context. Depends on task 1 continuity.
4. **Admin operational pilot.** Implement authorized queues for existing actionable records first, then academic/report readiness. Files: admin page, dashboard components, config/admin-nav, domain query helpers, report readiness integration. Acceptance: school admin and finance/HR custom-role landing pages each lead to relevant resolvable work with accurate counts. Depends on task 1 permissions/states. New queries must be batched, tenant-scoped, and permission-filtered server-side.
5. **Module consistency sweep.** Work module by module on empty states, mobile forms, accessible row labels, error translation, and copy. Reuse DataTable, ResponsiveFormDialog, StatusBadge, EmptyState, existing field errors. Acceptance: representative list → detail → edit → failure → retry → return preserves context; no new UI framework.
6. **Validation and staged rollout.** Refresh outdated UAT scripts; run baseline/comparison user sessions; enable redesigned homes by cohort with stable old routes and reversible configuration. Acceptance: no regression in task completion or permissions, production performance within agreed budgets, and role-specific preview verification completed.

Do not bundle these into one large rewrite. Each pilot should be independently usable and reversible. Proposed nav grouping needs validation before broad migration. Changes to date, child state, or payment messaging must precede cosmetic work.

## Implementation

No product implementation in this audit. The output is this cycle document and an illustrative interactive concept outside the repository (`talib-next-action.html` in the task visualization directory). Its Admin/Guru/Wali controls show queue filtering/detail, named-student attendance with updated counts, and child-specific actions with back navigation. Sample payment interaction stops at pending confirmation. It is a direction sketch, not a production-ready interface or a complete payment simulator. Reuse candidates:

- Shared shell and states: PortalHeader, PortalBottomNav, PageHeader, BackLink, SectionLabel, EmptyState, Skeleton, StatusBadge, Button.
- Admin: DataTable, DataTableRowActions, ResponsiveFormDialog, ConfirmDialog; existing manual/bulk invoice and retry flows.
- Teacher: ClassDayGrid, NoteComposeDialog, NoteThreadPanel, WeekNavigator, WeekGrid, SessionRosterClient, current session/homeroom loaders.
- Parent: KidCard, household invoice summary, child resolution utility, report cards/detail sheets and existing receipt routes.
- `QuickLinkCard` is a design-system pattern, not yet a concrete reusable component; extract an existing action-row pattern rather than assume it exists.

### 25 September: realistic HTML concept

The user requested a more realistic proposal using actual styled HTML. The [standalone prototype](assets/talib-ux-concept.html) uses the actual Plus Jakarta Sans family, Talib teal/background/border tokens, dark admin sidebar, and mobile portal proportions. It replaces the earlier direction sketch as the primary design-review surface. All records are fictional, and interactions stay local. Product application files remain unchanged.

The teacher home prioritizes the current class and incomplete attendance; the parent home shows both children with explicit attendance, notes, and family bills; the admin home presents a filterable work queue with record details. Switch roles using the tabs at the top. [Teacher screenshot](assets/concept-guru.png), [admin screenshot](assets/concept-admin.png), and [parent screenshot](assets/concept-wali.png) were captured in Chromium.

Browser verification passed for all three roles at 320, 390, 768, and 1440px with no horizontal overflow or JavaScript errors. Exercised teacher attendance (18/20 → 19/20, reflected on home), parent child context, local note reply, back navigation, and invoice remaining unpaid, plus admin filtering, search, detail dialog, Escape/focus return, and local queue completion (5 → 4). This validates the illustrated flows, not every control or accessibility conformance. The prototype uses local memory and an optional Google Fonts request; it does not connect to application services.

### Coverage ledger

The filesystem inventory contains **41 admin, 13 teacher, and 8 parent page files**. Group routes such as `(hr)` do not add a URL segment. Shared loading/error files, key clients, and related permission/data paths were reviewed where needed. Every page route received code review of its main state/action flow; this is not an assertion of line-by-line exhaustiveness for every dependent component. Coverage depth is not equal to a successful live journey.

| Surface | Code reviewed | Live verification |
|---|---|---|
| Admin home, nav, role permissions | Detailed | Admin dashboard DOM at desktop width |
| Students, guardians, admissions, enrollment, classes | Lists/actions and detail flows reviewed | Not completed |
| Fees, invoices, payments | Lists/defaults/actions and invoice detail recovery reviewed | Not completed |
| Employees, attendance, leave, payroll | Primary workflows, detail/correction forms, monthly attendance, salary components reviewed | Not completed |
| Years, semesters, themes, monitoring, reports, templates | Primary workflows, import/objectives, templates, and report editor reviewed | Not completed |
| Settings: users/roles/campuses/holidays/work-hours, design-system | Users/roles and settings route actions reviewed; canonical reference read | Not completed |
| Teacher home, class attendance, session attendance | Detailed | Attempt blocked by local disk exhaustion |
| Teacher journal picker/entry/student week | Detailed | Not completed |
| Teacher assessment hub/weekly/center | Detailed | Not completed |
| Teacher own attendance, slips/list/detail, profile | Detailed supplemental review: recovery, leave form, PDF controls, own-slip checks | Not completed |
| Parent home, invoices, attendance, journal | Detailed | Attempt blocked by local disk exhaustion |
| Parent progress picker/detail, reports, profile | Detailed | Not completed |
| Admin journal class/detail/monitoring | All four route workflows reviewed; week navigation, completion math, rollback, note deletion and return context | Not completed |
| Shared table, actions, pagination, dialogs, fields, portal nav | Detailed code review | No full keyboard/screen-reader run |

### Additional strengths from the detail-route review

- Student dossiers share one section ordering model and lazy-load detail sections (`app/admin/students/[id]/page.tsx:103`, `app/admin/students/[id]/page.tsx:229`). Reuse this structure for contextual work; avoid a wholesale replacement.
- Guardian document upload validates file formats before submission (`app/admin/guardians/[id]/page.tsx:84`).
- Admin invoice detail has an explicit reconciliation action with distinct updated/no-change/provider outcomes (`app/admin/invoices/[id]/page.tsx:191`).
- Enrollment detail surfaces the accepted-but-not-converted next action and confirmation (`app/admin/enrollments/[id]/page.tsx:160`).
- Curriculum import has validation, conflict preview, focus recovery, duplicate-submit protection, and partial-link warnings (`app/admin/semesters/[id]/import/client.tsx:111`).
- Admin student attendance uses the responsive override form; journal template setup has persistent inline field errors (`app/admin/student-attendance/page.tsx:520`, `app/admin/student-journal/page.tsx:68`).

### Additional validation notes

- Demo-only login currently sends any non-admin role to `/teacher`, including guardians (`app/api/auth/login/route.ts:52`). Correct this testing/onboarding path separately; production OAuth routing was not proven defective by this finding.
- Payment data already has an authoritative PAID-transition handler (`app/parent/invoices/client.tsx:139`). Reuse that mechanism when removing URL-only confirmation rather than introducing a second settlement model.
- Shared `.tap-target` exists (`app/globals.css:342`), but the reviewed table action and pagination controls do not use it. The same X02 pattern appears in admin journal week controls (`app/admin/student-journal/monitoring/page.tsx:227`, `app/admin/student-journal/students/[id]/page.tsx:299`). Existing teacher leave/slip controls already demonstrate the larger-target pattern.
- Admin journal student detail already preserves a supplied back source, validates week input, lazy-loads audit history, rolls back failed optimistic changes, and confirms note deletion. Keep these recovery patterns when integrating queues (`app/admin/student-journal/students/[id]/page.tsx:105`, `app/admin/student-journal/students/[id]/page.tsx:225`).

### Findings deliberately excluded or corrected

- Shared tables already scroll horizontally: `components/ui/table.tsx:10` supplies `overflow-x-auto`; the outer DataTable `overflow-hidden` is not sufficient evidence of clipping.
- Current parent home already has a household overview and child signals. The proposal improves prioritization/context; it does not claim these features are absent.
- Parent stale payment links already show contact-admin guidance. The remaining issue is actionable recovery and truthful return status.
- Current class list already shows Wali Kelas; admissions conversion is gated to eligible states; teacher journal week grid is read-only; weekly assessment has date recovery. Historical reports do not prove these are still broken.
- API/model names hidden from users are not, by themselves, UX findings.
- No fabricated usability score, assumed conversion uplift, or measured time saving is reported.

## Verification

- Inspected baseline commit and compared with current `origin/staging` (0 commits behind at start).
- Read project `spec`, design-critique, and relevant shared standards through role reviewers. Applied `design-system` as the visual reference.
- Historical reports consumed as context: April/May parent/admin reports and `2026-06-04-admin-teacher-full.md`. All are over 60 days old as of this audit and potentially superseded by later cycles; current code was required to substantiate findings.
- Live local audit used demo session routing and read-only page navigation. Admin `/admin` returned 200 and exposed the hierarchy described in A01. No payment, payroll, attendance, or enrollment mutation was exercised.
- Preview recovery: worktree Turbopack symlink problem → documented Webpack fallback; missing generated Prisma client → local generation. Subsequent teacher compilation failed with `ENOSPC`. After cache cleanup, a second mobile preview attempt also timed out; no mobile pass is claimed. The audit server was stopped; only the audit-created `.next` cache was removed and dev-generated tracked-file edits restored.
- Concept validation: local Node/jsdom checks passed for admin filtering/detail, teacher 3-of-5 to 4-of-5 attendance and matching counters, parent invoice pending-confirmation state, note read/back, and role controls. Fragment syntax, no-network behavior, and no state-save on initial load were checked. This is DOM/runtime validation, not visual or accessibility certification.
- Updated standalone HTML concept: Chromium screenshots, responsive checks across four widths, and role interaction checks passed on 25 September as recorded above. These replace the earlier fragment as the primary design-review evidence and do not change the limited live-application audit coverage.
- Performance: dev compilation times and CSP-report noise are not interpreted as production latency or product defects.
- Build/Vitest/full Playwright suite and preview-verify are skipped for this documentation-only proposal. Live browser inspection above is limited evidence, not an E2E pass. Future implementation must follow between-task, end-of-cycle, and preview gates from CLAUDE.md.
- Documentation check: `bash scripts/audit-docs.sh` passed with 13 ok, 1 existing ADR-age warning, 0 failures. Source-reference existence and line-range checks passed; `git diff --check` passed. Final re-run also passed.

## Ship Notes

Audit/proposal only. No product code change, migration, deployment, production mutation, PR, or merge. The generated docs-count block changes only because this cycle document is added. Prototype sample data is local and illustrative. Follow-up implementation should begin with trust/continuity and a teacher classroom pilot, then the parent and admin homes. User review of the direction precedes `/build` under the project workflow.
