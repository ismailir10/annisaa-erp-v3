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
| CI | GitHub Actions (lint, typecheck, vitest) |
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

### CRUD completion status

Audited 2026-04-19 after the CRUD Standard Completion cycle (see [`docs/cycles/2026-04-19-crud-standard-completion.md`](docs/cycles/2026-04-19-crud-standard-completion.md)). CLAUDE.md now splits the standard into three categories — see [CLAUDE.md `## CRUD Standard`](CLAUDE.md) for the canonical definitions.

**Category A — Binary soft-delete (19/27): ✅ Complete**
User, Campus, Holiday, OrgConfig, AcademicYear, Program, ClassSection, FeeComponentDef, SalaryComponentDef, LeaveRequest, Student, Employee, StudentGuardian, StudentEnrollment, TeachingAssignment, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, Guardian.

**Category B — State-machine (3/27): ✅ Complete**
Admission (Cancel), Invoice (Void), PayrollRun (workflow-only — list view is `onView` only, transitions on detail page).

**Category C — Event-log (2/27): ✅ Complete**
AttendanceRecord (override-only, daily view), StudentAttendance (edit + void via `isVoided` flag).

**Intentionally no standalone admin UI (3/27):**
- InvoiceLine, PayrollItem — nested children of Invoice / PayrollRun, managed via their parent's detail page.
- EmailLog — observability surface only; no user-facing CRUD required.

**Overall: 100% CRUD coverage** across the CRUD Standard's three categories (27/27 admin-relevant entities conform to their assigned category; 24 have UI, 3 are structurally nested/observability).

| Module | Category A | Category B | Category C | Nested/Log |
|---|---|---|---|---|
| CORE | User, Campus, Holiday, OrgConfig | — | — | EmailLog |
| HR | Employee, LeaveRequest, SalaryComponentDef | PayrollRun | AttendanceRecord | PayrollItem |
| ACADEMIC | AcademicYear, Program, ClassSection, TeachingAssignment | — | — | — |
| STUDENTS | Student, StudentGuardian, StudentEnrollment | Admission | — | — |
| FINANCE | FeeComponentDef, ProgramFeeStructure | Invoice | — | InvoiceLine, Payment¹ |
| LEARNING | AssessmentTemplate, AssessmentCategory, AssessmentIndicator | — | StudentAttendance | — |

¹ Payment is managed via Invoice detail page (record payment dialog), not a top-level list.

**Cycle highlights:**
- CRUD Standard in CLAUDE.md now formally defines Category A / B / C — prior sweeps couldn't close Admission/Invoice/PayrollRun because the old standard forced binary soft-delete on state-machine entities.
- Program migrated from `isActive: Boolean` to `status: String` — fixes a silent bug where the admin deactivate action wrote to a nonexistent field.
- Zod validation added to `PUT /api/{programs,class-sections,admissions,invoices}/[id]`.
- `DataTableRowActions` gained `onCancel` / `onVoid` props; Invoice + StudentAttendance converted from `extraActions` label → dedicated props. Workflow-queue exceptions (PayrollRun list, LeaveRequest approval, daily attendance editors) now documented in CLAUDE.md.

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

**Parent Portal** — Dashboard (child overview + unpaid invoices), Invoices (pay via Xendit, PDF download), Attendance (30 days), Reports (published assessments)

**Teacher Portal** — Check-in/out (GPS as documentation), Attendance Calendar (with inline Cuti/Izin bottom sheet), Salary Slips (PDF), Profile (accessible via header avatar)

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
- **CRUD Standard completion (2026-04-19)**: Category A/B/C framework (binary soft-delete / state-machine / event-log); Zod on Program + ClassSection + Admission + Invoice PUTs; Program `isActive` → `status` migration; DataTableRowActions gains `onCancel`/`onVoid`; standardized action columns across Admissions, Invoices, Student Attendance — see [`docs/cycles/2026-04-19-crud-standard-completion.md`](docs/cycles/2026-04-19-crud-standard-completion.md)

**In progress:**
- Audit logging: record critical operations

---

## Roadmap

Next 2–3 cycles, in order:

1. **Audit logging** — record critical operations (payroll approve, attendance override, invoice void) with actor + timestamp + before/after. E2E tests for new CRUD flows.

Future cycles, unscheduled: admissions pipeline, report card publishing workflow, multi-tenant hardening, parent self-service profile edits.

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

This enables pre-commit (markdown allowlist + doc sync), prepare-commit-msg (model trailer), and pre-push (role gate). Without this, commits may be rejected by CI or GitHub branch protection later.

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
| `DATABASE_URL` | `file:./dev.db` | Supabase Tokyo pooler | Supabase Mumbai pooler |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Staging Supabase URL | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Staging anon key | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Staging service key | Production service key |
| `RESEND_API_KEY` | — | Resend key | Resend key |
| `STAGING_EMAIL_OVERRIDE` | — | Admin email | — |
| `XENDIT_SECRET_KEY` | — | Staging key | Production key |
| `XENDIT_CALLBACK_TOKEN` | — | Staging token | Production token |

Without `RESEND_API_KEY`, emails are simulated (logged, not sent).

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

See **[CLAUDE.md](./CLAUDE.md)** for the operating manual: UI standards, CRUD standard, API standards, security checklist, color tokens, file structure. CLAUDE.md is the *how*; this README is the *what*.



