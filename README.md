# An Nisaa' School ERP

School management system for **An Nisaa' Sekolahku** — an Islamic PAUD/TKIT in Bekasi, Indonesia. 2 campuses, 40+ teachers, 500+ students. SaaS-ready architecture (single tenant MVP, multi-tenant foundation).

**Production:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)
**Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

---

## Contents

- [Tech Stack](#tech-stack)
- [Modules](#modules)
- [Portals](#portals)
- [Current Phase](#current-phase)
- [Roadmap](#roadmap)
- [Architecture Decisions](#architecture-decisions)
- [Development Workflow](#development-workflow)
- [Setup](#setup)
- [Environments](#environments)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL (prod: Mumbai, staging: Tokyo) / SQLite (local dev) |
| ORM | Prisma 7 |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI | Shadcn UI + Tailwind CSS + TanStack Table |
| Fonts | Plus Jakarta Sans + JetBrains Mono |
| Payment | Xendit Checkout Session API |
| Email | Resend (branded HTML template + PDF attachment) |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| CI | GitHub Actions (build, typecheck, test, e2e) |
| Testing | Vitest (unit) + Playwright (E2E) |

---

## Modules

Six domain modules. Parent Portal is a view *across* students + finance + learning, not its own module.

| Module | Domain | Key Models |
|--------|--------|------------|
| **core** | Auth, tenant, config | Tenant, User, Campus, OrgConfig, Holiday, EmailLog |
| **hr** | Staff management | Employee, SalaryComponentDef, PayrollRun, PayrollItem, AttendanceRecord, LeaveRequest |
| **academic** | School structure | AcademicYear, Program, ClassSection, TeachingAssignment |
| **students** | Student lifecycle | Student, Guardian, StudentEnrollment, Admission |
| **finance** | Fees & payments | FeeComponentDef, ProgramFeeStructure, Invoice, InvoiceLine, Payment |
| **learning** | Academic outcomes | StudentAttendance, AssessmentTemplate, AssessmentCategory, StudentAssessment |
| **student-journal** | Buku Penghubung (school + home) | StudentJournalTemplate, StudentJournalCategory, StudentJournalIndicator, StudentJournalEntry, StudentJournalNote, StudentJournalAudit |

### CRUD completion status

Re-audited 2026-04-21 after the CRUD Completeness — Existing Entities cycle (see [`docs/cycles/2026-04-21-crud-completeness-existing.md`](docs/cycles/2026-04-21-crud-completeness-existing.md)). CLAUDE.md splits the standard into three categories — see [`.claude/standards/crud.md`](.claude/standards/crud.md) for the canonical definitions. A prior "100% CRUD coverage" claim was removed in this pass: 7 entities still have no standalone admin UI (scheduled for a follow-up cycle) and the 2026-04-21 sweep (`docs/reviews/2026-04-21-sweep.md` §4) documents remaining gaps.

**Category A — Binary soft-delete (19 entities, all with Deactivate row action):**
User, Campus, Holiday, OrgConfig, AcademicYear, Program, ClassSection, FeeComponentDef, SalaryComponentDef, LeaveRequest, Student, Employee, StudentGuardian, StudentEnrollment, TeachingAssignment, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, Guardian. Program/ClassSection/StudentEnrollment row actions and TeachingAssignment role edit dialog landed 2026-04-21.

**Category B — State-machine (3 entities, full CRUD against state machine):**
- Admission — contextual `Lanjutkan ke <next>` + `Batalkan`; backend rejects illegal transitions (2026-04-21).
- Invoice — Void wired on list + detail (2026-04-21).
- PayrollRun — list view is `onView` only (documented exception); detail page exposes an Edit toggle for `periodStart` / `periodEnd` / `actualWorkDays` while `status = DRAFT`, 409 otherwise; approvals and slip-sending remain on the detail page (2026-04-21).

**Category C — Event-log (2 entities, override + void, no row Edit):**
AttendanceRecord (override-only, daily view — row action explicitly labelled "Timpa (Override)" to prevent mislabel drift); StudentAttendance (override via `PUT`, void via `DELETE` flipping `isVoided`). `.claude/standards/crud.md` §Category C now pins the override-not-edit contract (2026-04-21).

**Intentionally no standalone admin UI (3 entities — structurally nested or observability):**
- InvoiceLine, PayrollItem — nested children of Invoice / PayrollRun, managed via their parent's detail page.
- Payment — recorded via Invoice detail dialog (no top-level list page today; audit page is a sweep follow-up).

**Open gaps (7 entities; tracked in sweep §4 "Missing admin UI entirely"):**
EmailLog (read-only viewer), Payment (audit list), StudentAssessment + StudentAssessmentScore (admin scoring page), ProgramFeeStructure (dedicated manager). PayrollItem and InvoiceLine stay nested by design pending confirmation. Scheduled for a follow-up cycle (§6 on the sweep triage list).

| Module | Category A | Category B | Category C | Nested/Observability |
|---|---|---|---|---|
| CORE | User, Campus, Holiday, OrgConfig | — | — | EmailLog¹ |
| HR | Employee, LeaveRequest, SalaryComponentDef | PayrollRun | AttendanceRecord | PayrollItem |
| ACADEMIC | AcademicYear, Program, ClassSection, TeachingAssignment | — | — | — |
| STUDENTS | Student, StudentGuardian, StudentEnrollment | Admission | — | — |
| FINANCE | FeeComponentDef, ProgramFeeStructure¹ | Invoice | — | InvoiceLine, Payment¹ |
| LEARNING | AssessmentTemplate, AssessmentCategory, AssessmentIndicator | — | StudentAttendance | StudentAssessment¹ |

¹ Admin UI still missing or partial — see "Open gaps" above. Schema + API exist.

**Cycle highlights:**
- **2026-04-22 — Design System Foundations** (see [`docs/cycles/2026-04-22-design-system-foundations.md`](docs/cycles/2026-04-22-design-system-foundations.md)): appended the Claude Design UI reference to the repo. New `--type-*` + `--space-*` tokens in `app/globals.css` exposed as Tailwind utilities (`text-display/h1/h2/body/small/caption`, `p-page-x`, `gap-section`, etc.). New canonical visual reference at `.claude/standards/design-system.html` (4081-line export covering tokens, overlays, portal shells, student journal, attendance flows, voice & tone). Mirror copy at `public/admin/design-system-reference.html` with a live route at `/admin/design-system` (Settings nav) that iframes the HTML for in-app browsing. New standards `.claude/standards/patterns.md` (6 page recipes) and `.claude/standards/voice.md` (3 personas + Islamic courtesy layer + copy rules). `ui.md` + `portal.md` extended (overlays rule, Household Overview pattern, WeekGrid contract, cycle-tap attendance). Pre-commit **Rule 4 — frontend gate**: frontend changes must cite `design-system` in the staged cycle doc. `e2e/design-system.spec.ts` pins the live page + static-HTML contract. Still deferred: retrofit sweep of existing pages against the new tokens.
- **2026-04-21 — CRUD completeness sweep**: closed all 5 Majors and 4 Minors under sweep §4. Program / ClassSection / StudentEnrollment — Deactivate+Reactivate row actions + status filter on `/admin/academic` and `/admin/enrollments`; `rateLimit()` added to the respective `[id]` PUTs. StudentAttendance — override + void via admin ⋮ menu (Category C). PayrollRun — new `PUT /api/payroll/[id]` (SUPER_ADMIN, DRAFT-only, period-overlap guard, rate-limited) + detail-page Edit toggle. TeachingAssignment — `PUT /api/teaching-assignments/[id]` + Edit Penugasan dialog for the `role` field. Admission — contextual transition menu + backend transition-map guard; `REGISTERED` now truly terminal (`[]`). AttendanceRecord — `onEdit` was triggering the Override modal; relabelled to `extraActions "Timpa (Override)"`; `.claude/standards/crud.md` §Category C updated to pin the contract. Invoice — Void surface added to `/admin/invoices/[id]` detail.
- **2026-04-21 — Tenant isolation hardening** (see [`docs/cycles/2026-04-21-tenant-isolation-hardening.md`](docs/cycles/2026-04-21-tenant-isolation-hardening.md)): `EmailLog.tenantId` now required with FK + index; `User.tenantId` required; `FeeComponentDef` gained `status` for soft-delete parity; added missing `@@index([tenantId])` to `Role`, `Program`, `AcademicYear`, `Holiday`, `SalaryComponentDef`, plus `[tenantId, isEnabled]` on `SalaryComponentDef` and `[tenantId, status]` on `FeeComponentDef`.
- CRUD Standard in CLAUDE.md now formally defines Category A / B / C.
- Program migrated from `isActive: Boolean` to `status: String`.
- Zod validation added to `PUT /api/{programs,class-sections,admissions,invoices}/[id]`.
- `DataTableRowActions` gained `onCancel` / `onVoid` props.

---

## Portals

Three portals, three roles.

| Portal | Route | Role | Layout |
|---|---|---|---|
| Admin (owner) | `/admin` | `SUPER_ADMIN` | Desktop — sidebar + data tables; full access including payroll |
| Admin (staff) | `/admin` | `SCHOOL_ADMIN` | Desktop — sidebar + data tables; no payroll/salary |
| Teacher | `/teacher` | `TEACHER` | Mobile-first, `max-w-md`, bottom nav |
| Parent | `/parent` | `GUARDIAN` | Mobile-first, `max-w-md`, bottom nav |

### Data Access Rules

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | Everything — payroll, salary fields, bank data, all HR data, all modules |
| `SCHOOL_ADMIN` | Students, admissions, academics, attendance, invoices, employees (basic info only — no salary/payroll) |
| `TEACHER` | Own attendance, own leave slips, assigned classes only |
| `GUARDIAN` | Own child's data only (invoices, attendance, reports) |

### Features

**Parent Portal** — Dashboard (child overview + recent activity feed), Invoices (pay via Xendit, PDF download), Attendance (server-paginated + filters), Reports (published assessments), Buku Penghubung (school week view read-only + home indicators editable + parent-authored home notes with edit/delete)

**Teacher Portal** — Check-in/out (GPS as documentation), Attendance Calendar (with inline Cuti/Izin bottom sheet), Nilai Siswa (per-class assessment entry with BB/MB/BSH/BSB toggle + draft autosave + publish), Salary Slips (PDF), Profile (accessible via header avatar)

**Admin Portal** — Dashboard, Employee Management, Attendance (daily + monthly grid + LEAVE override), Payroll (draft → variables → review → approve → BSI CSV → PDF slips → email), Settings (campus, org config, holidays, salary components)

**Payroll Engine** — 13 salary components (FIXED / PCT_OF_BASE / ATTENDANCE_BASED), auto working-days calc, pro-rating, line-by-line adjustment, BSI bank CSV export, branded PDF slips, Resend email delivery.

---

## Current Phase

**Phase 1A: Standardize + Harden**

**Completed:**
- Foundation refactor, Shadcn sidebar + 62 components installed
- DataTable on 12+ pages with sorting + skeleton loading
- Stat cards on all list pages
- Security: tenant isolation fixes, rate limiting, email rate throttling
- CI green (lint + typecheck + test)
- Parent portal initial implementation and standardization complete
- Workflow refinement (2026-04-15): 3-command loop, multi-LLM safety, one-file-per-cycle — see [`docs/cycles/2026-04-15-workflow-refinement.md`](docs/cycles/2026-04-15-workflow-refinement.md)
- **Business logic hardening phase 2 (2026-04-16)**: atomic payment/enroll/attendance/assessment transactions, Xendit webhook advisory lock, parent-portal cache isolation fix — see [`docs/cycles/2026-04-16-biz-logic-audit-phase2.md`](docs/cycles/2026-04-16-biz-logic-audit-phase2.md)
- **Teacher portal polish (2026-04-16)**: Cuti/Izin as inline bottom sheet on attendance calendar, profile accessible from header, layout padding fix, shared `formatTime` utility — see [`docs/cycles/2026-04-16-teacher-portal-audit.md`](docs/cycles/2026-04-16-teacher-portal-audit.md)
- **Student attendance history tab (2026-04-16)**: new Kehadiran tab on `/admin/students/[id]` with month filter and 4 stat cards — see [`docs/cycles/2026-04-16-crud-audit-t13.md`](docs/cycles/2026-04-16-crud-audit-t13.md)
- **Role split: SUPER_ADMIN + SCHOOL_ADMIN (2026-04-16)**: salary/payroll protected behind SUPER_ADMIN; SCHOOL_ADMIN gets full HR access minus compensation data — see [`docs/cycles/2026-04-16-role-split.md`](docs/cycles/2026-04-16-role-split.md)
- **Student & Guardian CRUD completion (2026-04-16)**: Tambah Siswa dialog, Edit + Deactivate row actions on list page, INACTIVE status support, StudentGuardian soft-delete (status field + migration), standalone `/api/guardians/[id]` PUT+PATCH — see [`docs/cycles/2026-04-16-student-crud-sweep.md`](docs/cycles/2026-04-16-student-crud-sweep.md)
- **CRUD sweep — Student + Employee list row actions (2026-04-16)**: Edit + Deactivate row actions on Student and Employee DataTables; Zod validation wired to `PUT /api/students/[id]` and `PUT /api/employees/[id]`; INACTIVE added to student status enum — see [`docs/cycles/2026-04-16-crud-sweep-list-actions.md`](docs/cycles/2026-04-16-crud-sweep-list-actions.md)
- **Perf Phase 6 — query optimization (2026-04-16)**: eliminated unbounded fetches, fat rows, and N+1 in 8 hot routes (leave balance/history, slips/my, leave submit, payroll generate + compare, monthly attendance grid, invoice batch, assessment score save); added missing `@@index` on AssessmentTemplate / InvoiceLine / StudentAttendance — see [`docs/cycles/2026-04-16-query-optimization.md`](docs/cycles/2026-04-16-query-optimization.md)
- **Parent invoice cold-nav perf (2026-04-17)**: fixed the slow first-load path on `/parent/invoices` — see [`docs/cycles/2026-04-17-parent-invoice-perf.md`](docs/cycles/2026-04-17-parent-invoice-perf.md)
- **Perf deep-fix (2026-04-18)**: observability-driven investigation — added timing instrumentation, then targeted fixes driven by real latency data — see [`docs/cycles/2026-04-18-perf-deep-fix.md`](docs/cycles/2026-04-18-perf-deep-fix.md)
- **Perf quick wins (2026-04-18)**: session cache, FK indexes, student-create path — see [`docs/cycles/2026-04-18-perf-quick-wins.md`](docs/cycles/2026-04-18-perf-quick-wins.md)
- **CRUD Standard completion (2026-04-19)**: Category A/B/C framework (binary soft-delete / state-machine / event-log); Zod on Program + ClassSection + Admission + Invoice PUTs; Program `isActive` → `status` migration; DataTableRowActions gains `onCancel`/`onVoid`; standardized action columns across Admissions, Invoices, Student Attendance — see [`docs/cycles/2026-04-19-crud-standard-completion.md`](docs/cycles/2026-04-19-crud-standard-completion.md)
- **UAT critical fixes 1–5 (2026-04-19)**: parent blockers + perf majors fixed; reusable UAT prep mechanism added — see [`docs/cycles/2026-04-19-uat-critical-fixes.md`](docs/cycles/2026-04-19-uat-critical-fixes.md)
- **Assessment bug fix (2026-04-20)**: `AssessmentTemplate` `@@unique([tenantId, programId, name, type])` + dedupe migration, `POST /api/assessments/templates` 409 guard, new teacher Nilai portal (landing page + per-student BB/MB/BSH/BSB entry with debounced autosave + publish), class-level authz tightening on `PUT/POST /api/assessments/student/*` — see [`docs/cycles/2026-04-20-assessment-bug-fix.md`](docs/cycles/2026-04-20-assessment-bug-fix.md)
- **Student Journal (Buku Penghubung) — full cycle complete (2026-04-21, T1-T11)**: Phase 8 schema (6 Prisma models), Zod validations, week helpers, idempotent seed (23 default indicators). Admin template/category/indicator CRUD at `/admin/student-journal`, monitoring + class roll-up + student detail + transactional edit + audit trail. Teacher picker + class-day entry grid (batch upsert) + student week view + note thread. Parent portal week view — Di Sekolah read-only, Di Rumah editable (optional, no nag), Catatan note thread. Shared components: `<WeekGrid>`, `<NoteThread>`, `<AuditDiff>`, `<ClassDayGrid>`. Playwright E2E smoke — one test per portal — see [`docs/cycles/2026-04-21-student-journal.md`](docs/cycles/2026-04-21-student-journal.md)

- **Parent portal polish — cycle 2 (2026-04-22, T1-T15)**: Parent header, child-selector avatar, desktop rapor drawer padding, student-journal horizontal-rhythm drop, teacher text-size sweep (23 sites → `text-xs`), new portal primitives (`PortalHeader`, `PortalBottomNav`, `PortalTabs.leading`, `QuickLinkCard`), parent home-note write/edit/delete (catatan rumah), parent Kehadiran server-paginated API + filter UI, RecentActivity feed on dashboard (replaces embedded unpaid-invoices table), uniform action column on `/parent/invoices`, reusability rule (`components/portal/**` is the 2nd-instance extraction target) — see [`docs/cycles/2026-04-22-parent-portal-polish-cycle-2.md`](docs/cycles/2026-04-22-parent-portal-polish-cycle-2.md)
- **CRUD completeness — existing entities (2026-04-21)**: closed all 5 Majors + 4 Minors under sweep §4. Program / ClassSection / StudentEnrollment Deactivate UIs + status filters on `/admin/academic` and `/admin/enrollments`; StudentAttendance override + void on `/admin/student-attendance` (Category C); new `PUT /api/payroll/[id]` (DRAFT-only, period-overlap guard) + detail-page Edit toggle; TeachingAssignment role-edit dialog; Admission contextual transitions + backend transition-map guard (`REGISTERED` terminal); AttendanceRecord mislabel drift fixed + `.claude/standards/crud.md` Category C contract pinned; Invoice Void surface wired on detail page; README §CRUD completion status re-audited (dropped false "100%" claim) — see [`docs/cycles/2026-04-21-crud-completeness-existing.md`](docs/cycles/2026-04-21-crud-completeness-existing.md)
- **Design System Retrofit Cycle 2 — in progress (2026-04-23)**: seed extended to 3-kid rightjetParent household (pre-condition for Household Overview swap), new `<HouseholdOverview>` parent-home primitive (banner + per-child row + 3-up signal cells + chevron to deep-link), WeekGrid relocated to `components/portal/`, parent portal token-aligned to `px-page-x`, worktree `.env` bootstrap guardrail, admin Dialog→Sheet mobile variant on 8 high-traffic forms (B1a), overlay inner-padding audit — see [`docs/cycles/2026-04-23-design-system-retrofit-cycle-2.md`](docs/cycles/2026-04-23-design-system-retrofit-cycle-2.md)
- **Admin Portal UX Polish Cycle 1 (2026-04-22)**: 7 shared admin primitives extracted — `<DetailPageHeader>`, `<StatsCardsRow>`, `<DetailPageSkeleton>`, `<SectionHeading>`, `<AdminTabs>` (passthrough namespace), `<DeactivateConfirmDialog>`, plus `lib/constants/filter-options.ts`. StatusBadge consolidation across assessments/employees/payroll/dashboard/leave (added `PUBLISHED` + `UNFILLED` to STATUS_MAP). Typography normalization (18 `text-[10px]` → `text-xs`), arbitrary-color sweep (zero hits confirmed), EmptyState consolidation (dead `components/ui/empty.tsx` deleted, 4 inline empties migrated). Stats-card grid standardized across 5 list pages; 5 detail pages migrated off hand-rolled back-link + PageHeader combos — see [`docs/cycles/2026-04-22-admin-ui-polish-cycle-1.md`](docs/cycles/2026-04-22-admin-ui-polish-cycle-1.md)

**In progress:**
- Audit logging: record critical operations

---

## Roadmap

Next 2–3 cycles, in order:

1. **Audit logging** — record critical operations (payroll approve, attendance override, invoice void) with actor + timestamp + before/after. E2E tests for new CRUD flows.

Future cycles, unscheduled: admissions pipeline, report card publishing workflow, multi-tenant hardening, parent self-service profile edits, Student Journal v2 (drag-and-drop category reorder, parent reply in notes thread, admin create-on-edit for missing entries).

---

## Architecture Decisions

Short log. Each entry is a decision that constrains future work.

| Date | Decision | Why |
|---|---|---|
| 2025 | Next.js App Router + Server Components by default | Supabase SSR integration, streaming, and route-handler co-location |
| 2025 | Prisma over direct Supabase client for business logic | Type safety, migration history, easier local SQLite dev |
| 2025 | Soft-delete everywhere (`status=INACTIVE`) | Audit trail, undo, no data loss |
| 2025 | Shadcn-first UI (62 components installed) | Consistency, accessibility, avoids bespoke drift |
| 2026-04 | Xendit over Midtrans for parent invoice payments | Xendit Checkout Session API is simpler and has cleaner webhook semantics |
| 2026-04 | Performance optimization phase 2: bundle analyzer + dynamic imports | Initial bundle was >400KB; see [`docs/cycles/2025-04-15-performance-optimization-phase2.md`](docs/cycles/2025-04-15-performance-optimization-phase2.md) |
| 2026-04-15 | 3-command workflow (`/spec`, `/build`, `/ship`) over upstream 7 | Lower friction for small cycles; every upstream skill is still mapped into one of the three |
| 2026-04-15 | One markdown file per cycle, enforced by pre-commit hook | Stop scratch-file proliferation from non-Opus sessions |
| 2026-04-18 | Unified PR-based `/ship`: all roles open a PR to `staging` and merge manually when CI is green — no direct pushes to `staging` or `main` | GitHub free plan doesn't support branch protection / auto-merge; manual merge + pre-push hook + CTO discipline is the enforcement layer (supersedes 2026-04-15 role-gated push) |
| 2026-04-15 | `prd.md` retired; README.md becomes single source of truth for status/roadmap/ADRs | Eliminate three-way doc drift |
| 2026-04-21 | Single `StudentJournalTemplate` with `scope` enum (SCHOOL/HOME) instead of two separate templates | Keeps admin config flat (one accordion page, two tabs); parent portal and teacher grid share the same `<WeekGrid>` component; audit trail stays on a single `StudentJournalAudit` table |

---

## Development Workflow

Every development cycle runs through three slash commands and exactly one markdown file (`docs/cycles/YYYY-MM-DD-<slug>.md`):

```
/spec   →   /build   →   /ship
```

The operating manual for these commands — per-command responsibilities, the 20 upstream `agent-skills:*` coverage mapping, the multi-LLM safety model (session role, worktree isolation, git hooks, GitHub branch protection), the one-file-per-cycle rule, and doc-maintenance rules — lives in **[CLAUDE.md](./CLAUDE.md)**. This section intentionally stays thin; CLAUDE.md is the source of truth for *how* the repo is operated.

README's job is the *what*: modules, CRUD status, roadmap, ADRs, setup, environments. When those change, update this file. When the workflow, standards, or safety model change, update CLAUDE.md.

**Standalone heuristic UAT** available via `/uat <area>` — role-plays fixed personas through scripted Jobs-to-be-Done (library in `docs/uat/jobs/`) via Playwright MCP, measures timings, produces severity-gated reports. Not part of the 3-step loop; run on demand.

---

## Setup

### Prerequisites
- Node.js 20+
- npm

### Clone and install

```bash
git clone https://github.com/ismailir10/annisaa-erp-v3.git
cd annisaa-erp-v3
npm install
```

### Install git hooks (required for contributors)

```bash
./scripts/install-hooks.sh
```

This enables pre-commit (markdown allowlist + doc sync + seed drift), prepare-commit-msg (model trailer), and pre-push (blocks direct pushes to `staging`/`main` for all roles — use `/ship` instead). Without the hooks, commits may be rejected by CI or, when the repo moves to GitHub Pro, by branch protection.

### Database (local demo mode)

```bash
npx prisma generate
npx prisma db push
npx prisma db seed    # 24 employees, 23 holidays, sample attendance + payroll
npm run dev
```

Open http://localhost:3000 — demo mode with user selector, no Supabase needed.

### Environment variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Local | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Supabase Tokyo pooler (port 6543) | Supabase Mumbai pooler (port 6543) |
| `DIRECT_URL` | — (optional) | Supabase Tokyo direct (port 5432) — **required on Vercel** | Supabase Mumbai direct (port 5432) — **required on Vercel** |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Staging Supabase URL | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Staging anon key | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Staging service key | Production service key |
| `RESEND_API_KEY` | — | Resend key | Resend key |
| `STAGING_EMAIL_OVERRIDE` | — | Admin email | — |
| `XENDIT_SECRET_KEY` | — | Staging key | Production key |
| `XENDIT_CALLBACK_TOKEN` | — | Staging token | Production token |

Without `RESEND_API_KEY`, emails are simulated (logged, not sent).

**`DIRECT_URL` on Vercel is mandatory.** The `build` script runs `npx prisma migrate deploy` before `next build`, which applies any unapplied migrations in `prisma/migrations/`. This step requires a direct (non-pooler) Postgres connection — pooler connections on port 6543 go through PgBouncer transaction mode, which doesn't support the advisory locks Prisma uses to serialize migrations. Grab the direct URL from Supabase → Project Settings → Database → Connection string → **URI (Direct connection, port 5432)**.

**Function region is pinned to `sin1` (Singapore)** via `vercel.json`. Staging Supabase is in `ap-northeast-1` (Tokyo) and most users are in Indonesia — `sin1` is ~35ms from the DB and ~15ms from Jakarta, vs ~180ms for the Vercel default `iad1` (US East). Pages making many sequential Prisma calls are dominated by RTT, so this pin alone removes roughly 1–2s of latency per page with no code change. Production DB (`ap-south-1`, Mumbai) also benefits from `sin1` (~65ms) — if prod moves to a different region later, revisit this.

### Tests

```bash
npm run build && npx vitest run   # mandated gate before every commit
npx playwright test               # E2E (selective)
npm run lint
```

---

## Environments

| Environment | Branch | URL | Database | Purpose |
|---|---|---|---|---|
| **Local** | any | localhost:3000 | SQLite (`file:./dev.db`) | Demo mode |
| **Staging** | `staging` | Vercel preview | Supabase Tokyo | Test with safe data (3 test users, test teacher emails) |
| **Production** | `main` | annisaa-erp-v3.vercel.app | Supabase Mumbai | Real teachers, real payroll |

### Key differences

|  | Production | Staging |
|---|---|---|
| Users | 25 real, 24 employees | 3 test, 2 test employees |
| Teacher emails | Real | Private — stored as repo secrets / local env vars |
| Outbound email | Sent to real teachers | Overridden to admin via `STAGING_EMAIL_OVERRIDE` |
| Banner | None | Yellow "STAGING" banner at top |

### Payroll safety rules

- Always test salary slip generation on staging first
- Staging emails go to `STAGING_EMAIL_OVERRIDE`, never to test teachers
- Verify PDF content and amounts before production runs
- BSI CSV: preview the employee list before downloading
- Once payroll is APPROVED, attendance is locked — no going back

---

## License

Private — An Nisaa' Sekolahku

---

## For developers and AI agents

See **[CLAUDE.md](./CLAUDE.md)** for the operating manual: the 3-step `/spec` → `/build` → `/ship` loop, multi-LLM session safety, one-file-per-cycle rule, file structure. Domain standards (UI / CRUD / Portal / API / Security / Colors) live in **[`.claude/standards/*.md`](./.claude/standards)** and are loaded on demand by `/build` based on globs of staged files. CLAUDE.md is the *how*; this README is the *what*.



