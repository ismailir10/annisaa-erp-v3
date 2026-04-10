# School ERP — Operating Manual

> **Read this file completely before making any changes.** This is the single source of truth for all AI development sessions.

## Project

**An Nisaa' School ERP** — school management system for An Nisaa' Sekolahku, an Islamic PAUD/TKIT in Bekasi, Indonesia. 2 campuses, 40+ teachers, 500+ students. SaaS-ready architecture (single tenant MVP, multi-tenant foundation).

**Production:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)
**Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase PostgreSQL |
| ORM | Prisma 7 |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI | Shadcn UI + TanStack Table |
| Styling | Tailwind CSS + CSS variables |
| Fonts | Plus Jakarta Sans + JetBrains Mono |
| Payment | Xendit Checkout Session API |
| Email | Resend |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |
| CI | GitHub Actions |
| Testing | Vitest (unit) + Playwright (E2E) |

---

## 6 Modules

| Module | Domain | Key Models |
|--------|--------|------------|
| **core** | Auth, tenant, config | Tenant, User, Campus, OrgConfig, Holiday, EmailLog |
| **hr** | Staff management | Employee, SalaryComponentDef, PayrollRun, PayrollItem, AttendanceRecord, LeaveRequest |
| **academic** | School structure | AcademicYear, Program, ClassSection, TeachingAssignment |
| **students** | Student lifecycle | Student, Guardian, StudentEnrollment, Admission |
| **finance** | Fees & payments | FeeComponentDef, ProgramFeeStructure, Invoice, InvoiceLine, Payment |
| **learning** | Academic outcomes | StudentAttendance, AssessmentTemplate, AssessmentCategory, StudentAssessment |

**Parent Portal** = view across students + finance + learning (not a module).

### 3 Portals

| Portal | Route | Role |
|--------|-------|------|
| Admin | `/admin` | SCHOOL_ADMIN |
| Teacher | `/teacher` | TEACHER |
| Parent | `/parent` | GUARDIAN |

---

## Development Workflow

### Agent Skills Lifecycle

Follow [agent-skills](https://github.com/addyosmani/agent-skills) (`.agent-skills/`):

```
/spec → /plan → /build → /test → /review → /ship
```

| Phase | Skill | Do |
|-------|-------|----|
| Define | `spec-driven-development` | Write spec BEFORE code. Surface assumptions. |
| Plan | `planning-and-task-breakdown` | Atomic tasks with acceptance criteria. |
| Build | `incremental-implementation` | One vertical slice at a time. Test each. |
| Build | `frontend-ui-engineering` | Shadcn components. Follow UI standards. |
| Build | `api-and-interface-design` | Pagination, Zod, standard responses. |
| Test | `test-driven-development` | Tests for critical paths. |
| Review | `code-review-and-quality` | Code Reviewer persona before merge. |
| Review | `security-and-hardening` | Security Auditor for auth/tenant. |
| Simplify | `code-simplification` | Reduce complexity after feature complete. |
| Ship | `git-workflow-and-versioning` | PR staging→main. |

**Personas** (`.agent-skills/agents/`): Code Reviewer, Test Engineer, Security Auditor.

### Git Rules

1. Work on `staging` branch only
2. Push → Vercel preview auto-deploys
3. Test on preview URL
4. PR: `staging` → `main`
5. CI must pass (lint + typecheck + test)
6. **NEVER** push directly to `main`

### Before Every Commit

```bash
npm run build && npx vitest run
```

---

## UI Standards

### Rule: Shadcn FIRST. Never build custom when Shadcn has it.

**All 62 Shadcn components are installed.** Use them. Do not build custom.

| Need | Use | NEVER |
|------|-----|-------|
| Sidebar / Nav | `<Sidebar>` + all sub-components | Custom `<aside>` with hardcoded styles |
| Collapsible section | `<Collapsible>` | Custom toggle with useState |
| Page location | `<Breadcrumb>` | Custom breadcrumb divs |
| Sidebar trigger | `<SidebarTrigger>` | Custom hamburger button |
| Sidebar layout | `<SidebarProvider>` + `<SidebarInset>` | Manual `lg:pl-60` offsets |
| Data list | `<DataTable>` | Custom card loops |
| Status | `<StatusBadge>` | Inline `<Badge>` with hardcoded colors |
| Empty list | `<EmptyState>` | Plain `<p>` |
| Confirm | `<ConfirmDialog>` | `window.confirm()` |
| Destructive confirm | `<AlertDialog>` | `window.confirm()` for delete |
| Form field | `<FormField>` | Raw `<Label>` + `<Input>` |
| Loading | `<Skeleton>` | `animate-pulse` divs |
| Progress | `<Progress>` | Custom progress bars |
| Accordion | `<Accordion>` | Custom expand/collapse |
| Scroll area | `<ScrollArea>` | Custom overflow divs |
| Currency | `formatRupiah()` | Inline formatting |
| Date | `formatDate()` / `formatDateShort()` | Inline `.toLocaleDateString()` |

**Note:** Shadcn `base-nova` style uses `render` prop (not `asChild`) for composition:
```tsx
// Correct (base-nova):
<SidebarMenuButton render={<Link href="/admin" />}>
<BreadcrumbLink render={<Link href="/admin" />}>

// Wrong (old style):
<SidebarMenuButton asChild><Link href="/admin">
```

### DataTable Standard

Any list >10 items: use `<DataTable>` with server-side pagination, column sorting, search, status filter.

**Current gaps (Phase 1A):**
- Column sorting: APIs support `sortBy`/`sortOrder` but frontend doesn't wire header clicks yet
- Loading skeleton: no loading indicator during data fetch
- Row click navigation: requires action button, should support row click → detail page

### Shadcn Components to Add (Phase 1A)

| Priority | Component | Use Case |
|----------|-----------|----------|
| P0 | `Skeleton` | Loading states on all data-fetching pages |
| P0 | `AlertDialog` | Destructive confirms (delete, void) |
| P1 | `Calendar` | Attendance calendar, date pickers |
| P1 | `Progress` | Payroll processing, slip sending |
| P1 | `Breadcrumb` | Detail page navigation hierarchy |
| P1 | `Accordion` | Payroll item expansion |
| P2 | `ScrollArea` | Long lists in modals/sheets |
| P2 | `Drawer` | Mobile sidebar navigation |
| P2 | `RadioGroup` | Form options with few choices |

### Brand

| Token | Value |
|-------|-------|
| Primary | `#5DB4B8` (teal) |
| Sidebar | `#1A2E2F` (dark teal) |
| Success | `#00B37E` |
| Warning | `#FF8C00` |
| Error | `#FF3B3B` |

---

## API Standards

### GET Lists

Support: `?page=1&pageSize=20&search=X&sortBy=field&sortOrder=asc&status=Y`

Use: `lib/api/pagination.ts`, `lib/api/response.ts`

Response: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`

### Mutations (POST/PUT/DELETE)

1. `getSession()` → auth check
2. `session.role` → role check
3. `tenantId` → tenant ownership
4. Zod validation → reject bad input
5. Structured errors: `{ error: "message" }`

---

## Security

1. Every mutation: `getSession()` + role + tenant
2. Rate limiting on writes (`lib/rate-limit.ts`)
3. Zod validation on all inputs (`lib/validations/`)
4. No Float for money — Decimal only
5. Audit trail on financial models
6. Teacher sees only own data
7. Parent sees only own child
8. Xendit webhook: verify `x-callback-token`

---

## Current Phase

**Phase 1A: UI Polish + Harden** (see `prd.md` Section 20 for full roadmap)

1. **1A.1 — DataTable Completion:** sorting, skeleton loading, row click navigation
2. **1A.2 — Shadcn Gaps:** install missing components (Skeleton, AlertDialog, Calendar, etc.)
3. **1A.3 — E2E Tests + Onboarding:** Playwright tests, email verification, teacher onboarding

**Completed:** Foundation refactor (Steps 1-6), PostgreSQL migration, DataTable + paginated APIs, security hardening, UI standardization.

---

## File Structure

```
app/admin/          22 admin pages
app/teacher/        6 teacher pages
app/parent/         4 parent pages
app/api/            69 API routes (organized by domain)
components/ui/      62 Shadcn components (full library)
config/             Nav config, app constants
lib/                Business logic, utilities, API helpers
lib/api/            Shared pagination, validation, response
lib/validations/    Zod schemas per domain
lib/payroll/        Payroll calculation engine
lib/xendit/         Xendit API client
lib/email/          Resend integration
prisma/             Schema + seed data
```

---

## Environments

| Env | Branch | DB | URL |
|-----|--------|-----|-----|
| Local | any | `supabase start` | localhost:3000 |
| Staging | `staging` | Supabase Tokyo | Vercel preview |
| Production | `main` | Supabase Mumbai | annisaa-erp-v3.vercel.app |

---

## Testing

```bash
npx vitest run        # Unit tests
npx playwright test   # E2E tests
npm run build         # Build check
npm run lint          # Lint
```

Run ALL before every commit.

---

## Key Documents

| Doc | Purpose |
|-----|---------|
| `CLAUDE.md` | This file — AI operating manual |
| `prd.md` | Product spec + roadmap + architecture decisions (single source of truth) |
| `README.md` | Setup guide |
