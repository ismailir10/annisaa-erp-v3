# Admin "Don't Make Me Think" Overhaul — nav hub, one-screen Dasbor, consistency sweep, Dossier

## Context

The owner asked for a radical admin UX pass, applying Krug's *Don't Make Me Think*, in one cycle. The baseline is `origin/staging` @ `2853bb19`, after #561 (the task-first redesign).

Three problems, each verified against staging:

1. **Nav mixes daily work with setup.** The sidebar has 26 entries. Setup items are scattered across five module groups:
   - Tahun Ajaran and Semester under Akademik
   - Bank Narasi under Penilaian
   - Buku Penghubung — Templat under Kelas Harian
   - Biaya under Keuangan
   - Komponen Gaji under SDM

   There are also two near-identical admissions entries ("Pendaftaran" and "Formulir Pendaftaran"). `/admin/student-journal/monitoring` has no nav entry at all.
2. **Dasbor is about 2000px tall.** It stacks:
   - a full DataTable work queue (toolbar plus 10 rows of about 90px each; the source queries are unbounded `findMany`)
   - a deadlines card and 12 activity rows
   - an employee StatGrid and a 304px trend chart
   - QuickActions that duplicate the nav

   It is trying to be an inbox, a report, and a launcher at the same time.
3. **Module pages are built inconsistently.** Fifteen confirmed inconsistencies:
   - 9 pages hand-roll a `useIsMobile` Dialog/Sheet instead of using the mandated `ResponsiveFormDialog`
   - submit-label rules are violated
   - 5 pages hand-roll stat grids next to `StatsCardsRow`
   - pages use 7 different wrapper/spacing shapes
   - raw `AlertDialog`, raw `Tabs`, and a raw `<table>` are still in use
   - detail pages come in three shapes; `students/[id]` is the only one on the Dossier pattern

The owner has also set a naming rule: **every slug, route, field, param, and identifier is English; only labels are Indonesian.** Two existing slugs break it: `penilaian` and `raport`.

**Intended outcome:**
- a 16-entry sidebar for daily work, with one "Pengaturan" hub for setup
- a Dasbor that fits one 1440×900 screen
- every admin module built from the same shared primitives
- the four biggest detail pages on the Dossier layout
- English slugs throughout

## Spec

### Decisions (approved by the owner in planning)
- Setup lives in a **settings hub page** (`/admin/settings`). The sidebar holds daily work only.
- **Kelas stays daily**, in the main nav under Kesiswaan.
- **One-screen Dasbor:** count tiles, top-5 urgent items, and a one-line attendance strip.
- **Pendaftaran and Formulir Pendaftaran merge** into one nav entry, with a link-tab strip across both pages.
- **Dossier migration is included** for `guardians/[id]`, `classes/[id]`, and `employees/[id]`.
- **English slugs:**
  - `penilaian` → `assessments`
  - `raport` → `report-cards`
  - applies to both pages and API routes; old page URLs get 308 redirects

### Acceptance criteria
- [ ] No Indonesian path segment remains under `app/admin/**` or `app/api/**`.
- [ ] `/admin/penilaian/*` and `/admin/raport/*` 308-redirect to their English equivalents.
- [ ] The sidebar renders exactly the following, with each item permission-filtered as today:
  - Dasbor
  - Kesiswaan (Pendaftaran, Siswa, Wali Murid, Kelas)
  - Harian (Kehadiran Siswa, Buku Penghubung → monitoring)
  - Penilaian (Pemantauan, Rapor)
  - Keuangan (Tagihan, Penerimaan)
  - SDM (Karyawan, Kehadiran, Pengajuan Cuti, Penggajian)
  - Pengaturan
- [ ] `/admin/settings` hub shows the following sections, filtered by the same permissions as today. The Pengaturan link is hidden when no hub item is visible.
  - Sekolah (Kampus, Tahun Ajaran, Semester, Hari Libur, Jam Kerja)
  - Akademik (Bank Narasi, Templat Buku Penghubung)
  - Keuangan & Gaji (Biaya, Komponen Gaji)
  - Akses (Pengguna, Peran & Izin)
  - Design System (dev only)
- [ ] Active nav state uses the longest-prefix match across the sidebar and the hub. Any hub route highlights Pengaturan. Hub routes get the breadcrumb `Pengaturan › <item>`.
- [ ] `/admin/admissions` and `/admin/enrollments` share a link-tab strip ("Calon Siswa" | "Formulir"). On both routes, the single "Pendaftaran" nav item is active.
- [ ] Dasbor contains only:
  - a PageHeader
  - queue count tiles, each linking to `/admin/work-queue?kind=<kind>`
  - a top-5 urgent list with "Lihat semua (N)"
  - a one-line staff attendance strip
  - a 5-row activity rail, shown at `xl` and above only
- [ ] Every Dasbor source query is bounded: a count plus `take: 5`.
- [ ] With the full-permission demo admin at 1440×900, the Dasbor has `scrollHeight <= innerHeight`. At 390px wide it is at most 2 viewports tall.
- [ ] Unavailable dashboard sources still show retry states and never a false zero.
- [ ] `/admin/work-queue` hosts the existing full `AdminWorkQueue`, with the domain filter initialised from `?kind=`.
- [ ] The attendance trend chart moves to the top of `/admin/employee-attendance`. The QuickActions component is deleted.
- [ ] No admin page hand-rolls a `useIsMobile` Dialog/Sheet; all use `ResponsiveFormDialog`.
- [ ] No raw `AlertDialog` for confirms (`ConfirmDialog` instead). No raw `<table>`. No raw `Tabs` in the admin portal (`AdminTabs` instead).
- [ ] Every toggled create/edit dialog submits with `editing ? "Simpan Perubahan" : "Tambah <Entity>"`. The report-cards Triwulan wording is consistent.
- [ ] Hand-rolled stat grids are replaced by `StatsCardsRow`. StatsCardsRow appears on operational lists only; config lists have none.
- [ ] Every admin page root is a `PageHeader` followed by `space-y-section` content, with no raw `space-y-4`/`space-y-6` wrappers.
- [ ] PageHeader descriptions are static purpose lines. Counts live in StatsCardsRow or the toolbar.
- [ ] `settings/holidays` and `settings/roles` get a `DataTableToolbar` search.
- [ ] `guardians/[id]`, `classes/[id]`, and `employees/[id]` use the Dossier pattern (`DossierNav`, `DossierSection`, `DetailRail`), mirroring `students/[id]`, with every action and permission gate preserved.
- [ ] Standards (`patterns.md`, `crud.md`, `ui.md`) codify these rules:
  - where new setup pages go (the hub)
  - the page wrapper
  - StatsCardsRow on operational lists only
  - the PageHeader description rule
  - the link-tab strip
- [ ] README reflects the new nav, `/admin/settings`, `/admin/work-queue`, and the renamed routes. `audit-docs.sh` exits 0.

### Non-goals
- No schema, migration, or dependency changes.
- Teacher and parent portals change only where the rename forces it: the parent report-card PDF API path.
- No new permissions. The hub reuses the existing codes.
- No copy rewrite beyond the rules above.

### Assumptions
1. API routes need no redirects. Client and server ship in one deploy. No external system (email or payment webhook) links to `/api/*/raport` or `/api/*/penilaian`; T0 verifies this.
2. The hub route `/admin/settings` has no page today. Its children (`/admin/settings/campuses` and so on) keep their URLs. Routes outside `/admin/settings` (for example `/admin/academic-years`, `/admin/fees`) also keep their URLs. The hub groups them by link, not by path.
3. Moving the trend chart to employee-attendance is acceptable. The data already lives there.
4. The Dossier migration preserves behaviour. Existing tests change only their locators.

## Tasks

Dependencies: T0 → T1 → (T2, T3 in parallel) → (T4, T5, T6 in parallel on disjoint files) → T7 → T8.

- [x] **T0 — English slugs.**
  - `git mv` the following, updating every reference:
    - `app/admin/{penilaian→assessments, raport→report-cards}`
    - `app/api/admin/{penilaian→assessments, raport→report-cards}`
    - `app/api/guardian/raport→report-cards`
  - Add 308 page redirects in `next.config.ts`.
  - Run `verify-api-auth` and `verify-rls-coverage`.
  - *Accept:* grep finds no `/penilaian` or `/raport` path references except the redirects; build is green.
- [x] **T1 — Nav restructure and settings hub.**
  - Files: `config/admin-nav.ts` (a `settingsHub` sections config replaces `settings`), `components/admin/sidebar.tsx`, the breadcrumbs, and a new `app/admin/settings/page.tsx`.
  - Add longest-prefix active matching and `alsoMatch`.
  - *Accept:* nav vitest covers grouping, permission filtering, active matching, and breadcrumbs.
- [x] **T2 — Pendaftaran merge.**
  - Add a link-tab strip (reuse `AdminTabs` styling, adding an href mode if needed) to admissions and enrollments.
  - In enrollments: the row action becomes `DataTableRowActions`, spacing moves to tokens, and a `StatsCardsRow` is added.
  - *Accept:* both routes show the strip and activate a single nav item.
- [x] **T3 — One-screen Dasbor.**
  - Bounded sources and `rankUrgent` in `lib/dashboard/admin-work-queue.ts`.
  - New `QueueSummaryTiles`, `UrgentList`, and `AttendanceTodayStrip`.
  - New `app/admin/work-queue/page.tsx`.
  - Move the chart to employee-attendance; delete QuickActions.
  - Rewrite `e2e/admin-dashboard.spec.ts`.
  - *Accept:* no scroll at 1440×900; vitest covers `rankUrgent` and the tiles.
- **Re-slice note (during build):**
  - T4 and T5 share files with each other and with T2: admissions, report-cards, semesters.
  - To keep parallel subagents on disjoint files, T5 is merged into T4, and T4 runs as four file-owned slices, T4a–T4d, each committed on its own.
  - T2 also owns the admissions dialog migration.
  - The acceptance criteria are unchanged.
- [x] **T4 — Consistency A: dialogs and confirms** (3 slices).
  - Move 9 hand-rolled Dialog/Sheet pages to `ResponsiveFormDialog`.
  - Fix the submit ternary in classes and semesters, and the Triwulan wording in report-cards.
  - Replace raw `AlertDialog` with `ConfirmDialog` (salary-components, payroll/[id], invoices-client).
  - `EmptyState` for payroll/[id] "not found"; `Field` in semesters import.
  - *Accept:* grep finds no `useIsMobile` in `app/admin/**` pages and no `AlertDialog` imports there.
- [x] **T5 — Consistency B (merged into T4 slices): list shape.**
  - `StatsCardsRow` in academic-years, semesters, settings/users, and payments.
  - Page-wrapper standard; toolbars on holidays and roles.
  - Monthly attendance moves to the table primitives; `AdminTabs` in student-journal.
  - Apply the PageHeader description rule.
  - *Accept:* grep finds no raw `<table`, no raw `Tabs` import, and no `space-y-4`/`space-y-6` page roots in `app/admin/**`.
- [x] **T6 — Dossier migration.**
  - `guardians/[id]`, `classes/[id]` (its stat grid moves to `StatsCardsRow`), and `employees/[id]` move to the Dossier layout.
  - *Accept:* existing tests pass; the three pages leave the patterns.md 2b backlog.
- [x] **T7 — Standards and README.**
  - Codify the rules in `patterns.md`, `crud.md`, and `ui.md`.
  - Update README for the nav, the hub, `/admin/work-queue`, and the renames.
  - Run `audit-docs.sh --write`.
  - *Accept:* `bash scripts/audit-docs.sh` exits 0.
- [x] **T8 — End-of-cycle gate and browser verification.**
  - Run build, vitest, playwright, and lint.
  - Verify in a local demo browser, checking against the design-system reference:
    - Dasbor at 1440×900 and at 390px
    - the hub
    - the sidebar
    - the tab strip
    - the Dossier pages

## Implementation

- Subagent plan: driver=claude-opus-5-5, dirty-work=claude-sonnet-5. Order:
  - T0 and T3 run in parallel: disjoint files, and T3 doesn't depend on the renamed paths.
  - Then T1, then T2.
  - T4 (3 slices), T5, and T6 (3 pages) run in parallel on disjoint file sets.
  - T7 and T8 are sequential.
  - Subagents run targeted vitest plus `tsc` only. The driver runs the full `npm run build && npx vitest run` gate, the review, and one commit per task. Concurrent `next build` in one worktree collides on `.next`.

- T0: English slugs. Five files moved with `git mv`: admin `penilaian`→`assessments` and `raport`→`report-cards` for both pages and API, plus guardian `raport`→`report-cards` for the API. About 30 reference files updated (fetch URLs, hrefs, nav, tests, e2e, comments). `next.config.ts` got 308 redirects for the old page paths.
  - Found and fixed a collision: the legacy redirect `/admin/assessments` → `/admin/penilaian` would have hijacked the new live route. It's removed, and `/admin/assessment-templates` is retargeted.
  - These were left as-is on purpose, because they're module names or labels, not URL routes (the voice.md rule): `lib/raport/*`, `lib/validations/raport*`, the `RaportEditor` identifier, and the PDF download filename.
  - Reviews: feature-dev:code-reviewer found no issues. superpowers:code-reviewer, run because this is security-sensitive, came back clean: guards are byte-identical, and the guardian PDF ownership guard is intact. The proxy doesn't gate APIs by prefix.

- T3: One-screen Dasbor.
  - Files: `app/admin/page.tsx`, the new `app/admin/work-queue/page.tsx`, `lib/dashboard/{admin-work-queue,queue-sources}.ts`, `components/admin/dashboard/*` (new `queue-summary-tiles`, `urgent-list`, `attendance-today-strip`), `app/admin/(hr)/employee-attendance/page.tsx`, the new `app/api/attendance/trend/route.ts`, `e2e/admin-dashboard.spec.ts`, and the dashboard parts of `e2e/admin.spec.ts`. README's admin-home sentence is updated.
  - The sources are bounded: each is a `count` plus `findMany({take})` sharing one `where`, loaded once in `loadAdminQueueSources`.
  - New helpers `rankUrgent` and `summarizeQueue`.
  - The Dasbor main column holds the tiles, the top-5 urgent list, and the one-line attendance strip. Activity is capped at 5 in a rail shown only at `xl`.
  - `/admin/work-queue` hosts the full `AdminWorkQueue`, now filtered by kind rather than domain (`?kind=` is validated). It shows the true total when a queue passes the 200 cap.
  - The trend chart moved to employee-attendance, fed by a new `GET /api/attendance/trend` gated on `requirePermission("attendance.view")` plus `hr.view`.
  - Deleted QuickActions, StatGrid, and PendingActions (PendingActions was already dead before this cycle).
  - Reviews:
    - feature-dev:code-reviewer: no issues. Its one sub-threshold note (the silent 200 cap) is fixed.
    - superpowers:code-reviewer: two items, both fixed. The route now uses `requirePermission`, and a trend permission-gate test is in `hr-permission-gate.test.ts`, covering 401, both one-sided 403s, 200, and the tenant-scoped `where`.

- T1: Nav restructure and settings hub.
  - Files: `config/admin-nav.ts` (a `settingsHub` of sections replaces `settings`; new `alsoMatch`, `resolveActive`/`getActiveHref`/`hasVisibleSettings`; `getActiveGroup` now takes the nav object), `components/admin/sidebar.tsx` (Pengaturan is a flat link; there is one resolver per render), the new `app/admin/settings/page.tsx` and its test, `config/__tests__/admin-nav.test.ts`, `e2e/admin-classes.spec.ts`, `e2e/curriculum-admin.spec.ts`. README gained a line on the hub.
  - The sidebar has 16 entries, and the hub has the sections Sekolah, Akademik, Keuangan & Gaji, Akses, and Pengembang (dev only).
  - Driver check: evaluating the old and new configs with tsx gives identical href→permission maps. The only differences are intended: `/admin/enrollments` is now an `alsoMatch` of Pendaftaran (same `admissions.view`), and `/admin/student-journal/monitoring` is new.
  - Edge case: `/admin/student-journal/classes/*` highlights Pengaturan, because its only matching prefix is the hub's `/admin/student-journal`.
  - Review: feature-dev:code-reviewer found no issues.

- T2: Pendaftaran merge.
  - Files: `components/admin/admin-tabs.tsx` (new additive `AdminLinkTabs`: `usePathname`, `aria-current`) and its test, `app/admin/admissions/page.tsx` and its new tsx test, `app/admin/enrollments/page.tsx` and its new test, `enrollments/[id]/page.tsx`.
  - A shared tab strip, "Calon Siswa" | "Formulir", sits on both list pages, and both pages are titled "Pendaftaran" with static descriptions.
  - The admissions form now uses ResponsiveFormDialog. It keeps the domain verb "Catat Pertanyaan" for create.
  - Enrollments: DataTableRowActions, space-y-section, and a 3-card StatsCardsRow (`cols={3}`) built from the existing `/api/enrollments` endpoint via `pageSize=1` status queries.
  - Review: feature-dev:code-reviewer found no issues. Its one cosmetic finding (3 cards in a 4-column row) is fixed here and on students.
- T4b: Kesiswaan consistency.
  - Files: `app/admin/guardians/page.tsx`, `app/admin/students/page.tsx`, `app/admin/students/[id]/page.tsx`.
  - Five hand-rolled Dialog/Sheet overlays now use ResponsiveFormDialog: guardian edit, student create, student edit, the 3-step Tambah Wali dialog, and Naik Kelas.
  - The guardians description is now a static line, and the students stat row uses `cols={3}`.
  - `useIsMobile` stays on students/[id], but only for non-dialog responsive layout.
  - Review: no issues.
- T4d: List-shape consistency.
  - Files: `academic-years`, `settings/users` (and its test), `payments`, `settings/holidays`, `settings/roles`, `(hr)/employee-attendance/monthly`, `student-journal`, `student-journal/students/[id]`, `components/admin/stats-cards-row.tsx`.
  - Config lists lose their stat grids (academic-years, and users along with its 5 count fetches). The users description is now static.
  - Payments uses `StatsCardsRow cols={2}`, a new 2-column option.
  - Holidays and roles get a DataTableToolbar search, and the holidays description is now static.
  - The monthly matrix moves to the ui/table primitives, keeping its sticky column and horizontal scroll.
  - Raw ui/tabs became AdminTabs.
  - Review: no issues.
- T4a: HR consistency.
  - Files: `(hr)/employees`, `leave-requests`, `payroll`, `payroll/[id]`, `salary-components`.
  - Dialog/Sheet overlays now use ResponsiveFormDialog, including the payroll/[id] variables and line-adjustment modals.
  - Raw AlertDialog is replaced by ConfirmDialog for payroll approve and salary deactivate. The handlers now throw on failure, so ConfirmDialog stays open for a retry, which keeps the prior UX.
  - leave-requests: Base UI `finalFocus` becomes a post-close focus effect, deep-link-only; this follows the focus/setTimeout race note.
  - payroll/[id]: not-found now renders EmptyState.
  - Live-count descriptions are now static.
  - Review: no issues. ConfirmDialog's catch-and-stay-open behavior was verified in `components/ui/confirm-dialog.tsx`.
- T4c: Finance and academic consistency.
  - The invoices/[id] payment dialog now uses ResponsiveFormDialog, and the `invoices-client` overflow AlertDialog is now a ConfirmDialog.
  - Classes and semesters use the submit ternary `Simpan Perubahan / Tambah …`. The semesters stat grid becomes StatsCardsRow, and the semesters import form uses FieldLabel.
  - report-cards: "Buat/Edit Triwulan" becomes "Tambah/Ubah Triwulan", with trigger, title and submit aligned.
  - Page wrappers are fixed on report-cards, report-cards/templates, assessments, and classes (classes keeps `min-w-0` for table overflow).
  - Review: no issues.
- T6a: guardians/[id] Dossier.
  - Files: `app/admin/guardians/[id]/page.tsx` and the new `__tests__/dossier-sections.test.tsx`.
  - AdminTabs and the loose cards become DossierNav plus 4 sections, `profile`, `documents`, `children`, `invoices`, with a DetailRail (child count, invoices, receivables tiles, quick contact, document checklist) built from the already-fetched data.
  - Hash deep-link and mobile collapse effects mirror students/[id].
  - Review: no issues on this page.

- T7: Standards and docs.
  - `patterns.md`:
    - new Settings Hub rule, with the daily vs setup definition
    - Admin Dasbor rule: one screen, counts link out, no charts or launchers
    - AdminLinkTabs note
    - page-wrapper invariant
    - Recipe 2b backlog closed: guardians, classes, and employees are adopted
  - `crud.md`: StatsCardsRow on operational lists only; static PageHeader description; Dialog Standard, which also covers action dialogs; confirms always go through ConfirmDialog.
  - `ui.md`: component-choice rows for table primitives, AdminTabs/AdminLinkTabs, and StatsCardsRow cols 2–6. The contradictory "Destructive = AlertDialog" rule is consolidated into ConfirmDialog.
  - `voice.md`: "routes may keep raport" is replaced by the English-identifiers rule.
  - `docs/uat/jobs/admin.md`: JTBD steps updated for the Dasbor, work-queue, and hub paths and the renamed routes; last audited 2026-09-26.
  - Two runbooks had old paths, now fixed.
  - README: the long line is trimmed to fit the 600-character budget.
  - CLAUDE.md: counts regenerated with `audit-docs --write`.

- T6b: classes/[id] Dossier.
  - Files: `app/admin/classes/[id]/{client,page}.tsx`, the new `components/admin/class-sessions-calendar.tsx` (the month grid, extracted), and `__tests__/client.test.tsx`.
  - PageHeader and cards become DetailPageHeader plus DossierNav, with the sections `roster`, `teachers`, and `sessions`.
  - The hand-rolled stat grid becomes a DetailRail with RailStatTiles and a Ringkasan RailKV.
  - Not-found now uses EmptyState, and loading uses DetailPageSkeleton.
  - Every handler and flow is preserved: the 409 age-override, HOMEROOM_EXISTS, the swap Sheet, and deactivate.
  - Review: 1 finding, fixed. The stat tiles were duplicated on mobile; the rail is now desktop-only, as on students and guardians, and a regression test (Roster appears once at 375px) was verified to fail on the old code.
  - Follow-up: the swap Sheet is gated on `canWrite` rather than `writeAllowed`. That predates this cycle and is out of scope.

- T6c: employees/[id] Dossier.
  - Files: `app/admin/(hr)/employees/[id]/page.tsx` and the new `__tests__/page.test.tsx`, plus `e2e/admin.spec.ts`, whose salary test now asserts `#salary` instead of clicking a tab.
  - AdminTabs becomes DossierNav plus the sections `profile`, `employment`, `leave`, `salary`, and `attendance`. Salary is rendered only when `salaryValues !== null`, and attendance is lazy (closed by default). A new DetailRail shows leave tiles, employment, contact, and bank/BPJS; bank/BPJS stays gated.
  - Review: 1 finding, fixed. The hash deep-link effect was missing; it's added and tested.
  - The fetch effect was refactored to an async `useCallback`, matching students and guardians. This cleared a `react-hooks/set-state-in-effect` lint error, and behavior is identical.

## Verification
- T0: vitest on the moved and edited suites passed 159/159 (14 files), and a broad sweep passed 1322/1322 (138 files, per the subagent). `verify-api-auth` reports 197/197 and `verify-rls-coverage` reports 42/42. Grep finds no remaining old path refs. The full build gate runs jointly with T3, because T3 was mid-edit in the same tree.

- T0+T1+T3 joint gate: `npm run build` exited 0. `npx vitest run` passed 3504 tests in 370 files (2 files skipped, 42 todo), run at 23:20. `verify-api-auth` reports 197/197.

- T7: `bash scripts/audit-docs.sh` exits 0, with 13 ok, 1 warn, 0 fail. The warning is the pre-existing ADR 60-day window.

- T8 end-of-cycle gate, on the final tree (sha e62fb761 plus the e2e locator fix):
  - `npm run build` exited 0.
  - `npx vitest run` passed 3518 tests in 375 files (2 files skipped, 42 todo).
  - `npx eslint app components lib config e2e` reported 0 errors and 46 warnings, all pre-existing.
  - `bash scripts/audit-docs.sh` exited 0.
- Playwright ran locally against a disposable local Postgres 17, mirroring CI (Homebrew `-17` binaries on :55432, `prisma db push` on the empty DB, `prisma db seed`, a `DEMO_MODE=true` production build, then `npx playwright test`).
  - First run: 152 passed, 8 skipped, 2 failed. Both failures were stale locators from this cycle's intended copy changes: the Tambah Kelas create submit is now "Tambah Kelas" rather than "Simpan", and the employees description no longer carries the count "karyawan terdaftar".
  - Both specs are updated. A re-run of `e2e/admin-dialogs.spec.ts` and `e2e/admin.spec.ts` passed 30, with 1 skipped. The required CI check `Playwright E2E` remains the merge gate.
  - Safety note: `prisma.config.ts` prefers `DIRECT_URL`, which `.env` sets to staging, so both URLs were pinned to localhost and the resolved Datasource was checked before any write.

- Local browser verification: a `DEMO_MODE` production build ran against the disposable local Postgres, driven by a Playwright script, signed in as `u_super_admin`. Checked against the design-system tokens in `design-system.html`:
  - Dasbor:
    - At 1440×900, `scrollHeight` is 900 and `innerHeight` is 900, so there is no vertical scroll.
    - At 390×844, `scrollHeight` is 1007, about 1.2 viewports, within the 2-viewport budget.
    - Tiles, the urgent list with "Lihat semua (2)", the attendance strip, and the xl activity rail all render.
  - Sidebar: the groups are Kesiswaan, Harian, Penilaian, Keuangan, and SDM, with Pengaturan pinned at the bottom.
  - `/admin/settings`: renders 4 sections, Sekolah, Akademik, Keuangan & Gaji, and Akses. The dev-only section is stripped from the production build as intended.
  - `/admin/enrollments`: the "Formulir" tab has `aria-current`.
  - `/admin/work-queue?kind=leave` renders.
  - `/admin/raport` 308-redirects to `/admin/report-cards`.
  - `/admin/classes/[id]`: Dossier nav, sections, and rail all render.
  - `/admin/employees/[id]#attendance`: the deep link expands and scrolls to Kehadiran.
  - Console errors are limited to `/_vercel/*insights` 404s, which are expected off-Vercel.
  - Screenshots are in `/tmp/dmmt-shots/`, local and not committed.
  - The guardian detail page wasn't reached by the script (the parents API shape wasn't matched); T6a is covered by vitest and CI e2e (`e2e/admin-guardian-detail.spec.ts`).

## Ship Notes

- **Migrations and env:** none. There are no schema, dependency, or env-var changes.
- **Route renames:**
  - Pages: `/admin/penilaian` → `/admin/assessments` and `/admin/raport` → `/admin/report-cards`, each with permanent 308 redirects that preserve sub-paths.
  - API: `/api/admin/penilaian` → `/api/admin/assessments`, `/api/admin/raport/**` → `/api/admin/report-cards/**`, `/api/guardian/raport/**` → `/api/guardian/report-cards/**`. These have no redirects. Client and server ship together in one deploy, and no email, webhook, or runbook links the old API paths (checked in T0).
  - The legacy `/admin/assessments` → `/admin/penilaian` redirect is removed, and `/admin/assessment-templates` now points at `/admin/assessments`.
- **New surfaces:** the `/admin/settings` hub, `/admin/work-queue`, and `GET /api/attendance/trend` (gated by `attendance.view` + `hr.view`, tenant-scoped).
- **Preview smoke steps:** open the Dasbor (it should not scroll on a laptop), Pengaturan (hub sections should match the user's permissions), Pendaftaran (switch between the two tabs), a class detail page, an employee detail page with `#attendance`, and an old `/admin/raport` bookmark.
- **Rollback:** revert the squash commit. Since there's no data change, a revert is safe, though old bookmarks will 404 again for the renamed pages until it is redeployed.
- **Follow-ups (out of scope):**
  - The classes/[id] swap Sheet is gated on `canWrite` rather than `writeAllowed`. This predates the cycle.
  - The admissions sibling-convert confirm is a plain Dialog, not a ConfirmDialog.
  - The ADR 60-day window warning.
  - A pre-existing `lib/raport/*` module rename to English (the voice.md rule now says new code must use English).
