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

**Fully complete (6/28):** User, Campus, Holiday, LeaveRequest, SalaryComponentDef, FeeComponentDef
**Partially complete (14/28):** Missing edit/deactivate or some CRUD operations
**Missing UI/CRUD (8/28):** OrgConfig, EmailLog, PayrollItem, ProgramFeeStructure (deactivate), InvoiceLine, Payment, AssessmentCategory, AssessmentIndicator

**Overall: ~60% CRUD completion**

| Module | Complete | Partial | Missing |
|---|---|---|---|
| CORE | 3 (User, Campus, Holiday) | — | 2 (OrgConfig, EmailLog) |
| HR | 2 (LeaveRequest, SalaryComponentDef) | 5 (Employee, Attendance, PayrollRun, PayrollItem, TeachingAssignment) | — |
| ACADEMIC | 1 (AcademicYear) | 3 (Program, ClassSection, TeachingAssignment) | — |
| STUDENTS | 1 (Student) | 2 (Guardian, StudentEnrollment) | — |
| FINANCE | 1 (FeeComponentDef) | 4 (ProgramFeeStructure, Invoice, InvoiceLine, Payment) | — |
| LEARNING | 0 | 6 (StudentAttendance, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, StudentAssessment, StudentAssessmentScore) | — |

---

## Portals

Three portals, three roles.

| Portal | Route | Role | Layout |
|---|---|---|---|
| Admin | `/admin` | `SCHOOL_ADMIN` | Desktop — sidebar + data tables |
| Teacher | `/teacher` | `TEACHER` | Mobile-first, `max-w-md`, bottom nav |
| Parent | `/parent` | `GUARDIAN` | Mobile-first, `max-w-md`, bottom nav |

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

**In progress:**
- CRUD completion: add edit + deactivate to all entities (target: 100%)
- Admin interface for LEARNING module (assessment management, student attendance)

---

## Roadmap

Next 2–3 cycles, in order:

1. **CRUD completion sweep** — bring the 14 partial entities to fully-complete (edit dialogs + deactivate), add the 8 missing-UI entities. Target all six modules at 100% CRUD.
2. **LEARNING module admin** — build the admin interface for student attendance, assessment templates/categories/indicators, and per-student scoring. Currently no admin UI exists for this module.
3. **Audit logging** — record critical operations (payroll approve, attendance override, invoice void) with actor + timestamp + before/after. E2E tests for new CRUD flows.

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
| 2026-04-15 | Role-gated push: `cto` pushes to staging, `product-builder` opens PR | Let other LLMs contribute without bypassing review |
| 2026-04-15 | `prd.md` retired; README.md becomes single source of truth for status/roadmap/ADRs | Eliminate three-way doc drift |

---

## Development Workflow

### The 3-step loop

Every cycle uses exactly these three commands and exactly **one** markdown file (`docs/cycles/YYYY-MM-DD-<slug>.md`):

```
/spec   →   /build   →   /ship
```

- **`/spec`** — define + plan. Creates the cycle doc with Context, Spec, and Tasks sections. Combines `agent-skills:spec-driven-development`, `planning-and-task-breakdown`, and (when needed) `idea-refine`.
- **`/build`** — build + test + review, looping over the tasks. One commit per task with gates (`npm run build && npx vitest run`) enforced between tasks. Combines `incremental-implementation`, `test-driven-development`, `source-driven-development`, `frontend-ui-engineering`, `api-and-interface-design`, `security-and-hardening`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `code-review-and-quality`, and `code-simplification`.
- **`/ship`** — push to staging. `cto` role pushes directly; `product-builder` role opens a PR to staging. Never touches `main`.

All 20 upstream `agent-skills:*` skills are still in play — they're folded into one of the three commands. See `CLAUDE.md` for the full coverage table.

### Multi-LLM session safety

Other LLMs (Sonnet, Haiku, GLM 5.2, GPT) may work on this repo. Three mechanisms keep this safe:

**1. Session role (`.claude/session-role`).** Every session declares `role=cto` or `role=product-builder` plus its model name on turn one. The `SessionStart` hook reminds the assistant to set this before running any command. Commands refuse to run without it. File format:
```
role=cto
model=claude-opus-4-6
```

**2. Worktree isolation.** Every `product-builder` session works in its own git worktree, never the main checkout. This prevents parallel sessions from stomping on each other's lockfiles, build artifacts, and in-progress edits.

```bash
# At the start of a product-builder cycle:
git worktree add .worktrees/<slug> -b feat/<slug>
cd .worktrees/<slug>
./scripts/install-hooks.sh
```

`cto` sessions work in the main checkout (single-threaded, human-driven). The `SessionStart` hook warns if a `product-builder` session is in the main checkout, and the three slash commands refuse to run until the session is inside a worktree.

**3. Git hooks.** Installed via `scripts/install-hooks.sh`:
- `pre-commit` — enforces the markdown allowlist (no scratch `.md` files) and doc-sync (code changes must update the cycle doc, README.md, or CLAUDE.md).
- `prepare-commit-msg` — appends `Model-Trailer` and `Role` to every commit from `.claude/session-role`.
- `pre-push` — blocks pushes to `staging` or `main` unless `role=cto`. Non-cto sessions must use `/ship` (which opens a PR).

**GitHub branch protection is the real boundary.** Client hooks can be bypassed with `--no-verify`. Enable in Settings → Branches:
- `staging`: require PR + 1 review, status checks (`lint`, `typecheck`, `test`, `build`), restrict direct push to `ismailir10`
- `main`: require PR from `staging` only, 1 review, same status checks

### One-file-per-cycle rule

The only markdown files allowed in the repo are:
- `README.md`, `CLAUDE.md`, `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` (repo root)
- `docs/**` (including `docs/cycles/YYYY-MM-DD-<slug>.md`, one per cycle)
- `.github/**`, `.claude/**`, `.agent-skills/**`, `.githooks/**`

Any other staged `.md` file is rejected by the pre-commit hook. All cycle notes live inside the cycle doc — no `PLAN.md`, `SPEC.md`, `TEST-REPORT.md`, etc.

### Documentation maintenance

Every cycle updates docs as part of `/build`:
- New module/page/feature → update README.md "Current Phase" and/or "Modules" table
- UI pattern change or new standard → update CLAUDE.md
- Cycle-specific history → the cycle doc itself (not README/CLAUDE)

The `pre-commit` hook rejects code changes that don't accompany at least one of: cycle doc, README.md, or CLAUDE.md.

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
| Teacher emails | Real | `redacted-admin@example.test`, `redacted-parent@example.test` |
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
