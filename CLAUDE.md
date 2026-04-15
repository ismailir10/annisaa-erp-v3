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

### Agent Skills System

This project uses the **agent-skills** framework (via Claude Code plugin) for engineering workflows:

**Plugin Installation:**
```bash
claude plugin marketplace add addyosmani/agent-skills
claude plugin install agent-skills@addy-agent-skills
```

**Available Slash Commands (7):**
- `/spec` — Write spec before coding
- `/plan` — Create task breakdown
- `/build` — Implement incrementally
- `/test` — Run/write tests
- `/review` — Review code quality
- `/code-simplify` — Reduce complexity
- `/ship` — Create PR and merge

**Workflow:**
```
1. /spec   → Write feature spec (DEFINE phase)
2. /plan   → Break into tasks (PLAN phase)
3. /build  → Implement incrementally (BUILD phase)
4. /test   → Verify tests pass (VERIFY phase)
5. /review → Code review + security audit (REVIEW phase)
6. /ship   → Deploy to production (SHIP phase)
```

**20 Skills Included:**
- **Define:** idea-refine, spec-driven-development
- **Plan:** planning-and-task-breakdown
- **Build:** incremental-implementation, test-driven-development, frontend-ui-engineering, api-and-interface-design, context-engineering, source-driven-development
- **Verify:** browser-testing-with-devtools, debugging-and-error-recovery
- **Review:** code-review-and-quality, code-simplification, security-and-hardening, performance-optimization
- **Ship:** git-workflow-and-versioning, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, shipping-and-launch

**3 Agent Personas:**
- code-reviewer (Senior Staff Engineer)
- security-auditor (Security Engineer)
- test-engineer (QA Specialist)

**Source:** [github.com/addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)

| Phase | Agent-Skills Skill | Domain Skills (auto-load) | Do |
|-------|-------------------|--------------------------|-----|
| Define | `spec-driven-development` | — | Write spec BEFORE code. Surface assumptions. |
| Plan | `planning-and-task-breakdown` | — | Atomic tasks with acceptance criteria. |
| Build | `incremental-implementation` | nextjs, supabase, shadcn | One vertical slice at a time. Test each. |
| Build | `frontend-ui-engineering` | shadcn | Shadcn components. Follow UI standards. |
| Build | `api-and-interface-design` | nextjs, supabase | Pagination, Zod, standard responses. |
| Test | `test-driven-development` | — | Tests for critical paths. |
| Review | `code-review-and-quality` | nextjs, supabase | Code Reviewer persona before merge. |
| Review | `security-and-hardening` | supabase, vercel-functions | Security Auditor for auth/tenant. |
| Simplify | `code-simplification` | — | Reduce complexity after feature complete. |
| Ship | `git-workflow-and-versioning` | deployments-cicd | PR staging→main. |

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
| Form field | `<Field>` + `<FieldLabel>` + `<FieldDescription>` | Raw `<Label>` + `<Input>` or custom `<FormField>` |
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

**Every DataTable MUST have:**
1. Sortable column headers (`DataTableColumnHeader`)
2. Skeleton loading state (Shadcn `Skeleton`)
3. Status filter (Aktif/Tidak Aktif at minimum)
4. Action column with: **View button** + **⋮ dropdown** (Edit, Deactivate)

### DataTable Action Column Standard

Use `<DataTableRowActions>` component (`components/ui/data-table-row-actions.tsx`):
- **Primary:** "Lihat" button (Eye icon) — visible, navigates to detail or opens Sheet
- **Dropdown (⋮):** Edit, Deactivate/Activate — context-dependent actions
- Never hard delete — always soft delete via status change

```tsx
// Standard action column definition:
{
  id: "actions",
  cell: ({ row }) => (
    <DataTableRowActions
      onView={() => router.push(`/admin/students/${row.original.id}`)}
      onEdit={() => setEditTarget(row.original)}
      onDeactivate={() => setDeactivateTarget(row.original)}
      isActive={row.original.status === "ACTIVE"}
    />
  ),
}
```

---

## CRUD Standard (Inspired by ERPNext)

> Every entity in the system MUST support full CRUD. No create-only or read-only entities.

### Every Entity Must Have:

| Operation | UI Pattern | API Pattern |
|-----------|-----------|-------------|
| **Create** | Dialog form or `/new` page | `POST /api/{entity}` with Zod validation |
| **Read** | DataTable (list) + Detail page/Sheet | `GET /api/{entity}` paginated, `GET /api/{entity}/[id]` |
| **Update** | Edit dialog (same form as create, pre-filled) | `PUT /api/{entity}/[id]` with Zod validation |
| **Deactivate** | ConfirmDialog via dropdown action | `PUT /api/{entity}/[id]` with `{ status: "INACTIVE" }` |

### Soft Delete Standard

- **NEVER hard delete records.** Use `status` field with `ACTIVE` / `INACTIVE`.
- All list queries default to `WHERE status IN ('ACTIVE')` unless filter says otherwise.
- DataTable status filter always includes "Semua Status", "Aktif", "Tidak Aktif".
- Models that already have status: Employee, Student, Tenant.
- Models that need status added: Guardian, ClassSection, FeeComponentDef.
- Admission has its own pipeline (INQUIRY → REGISTERED → CANCELLED) — use that.

### List Page Layout Standard

Every admin list page follows this exact structure:
```
PageHeader (title + count + "Tambah" button)
├── StatCards (3-4 key metrics, grid cols-2 lg:cols-4)
├── DataTableToolbar (search + status filter + any domain filters)
└── DataTable (sortable columns + standard action column)
```

### Detail Page Layout Standard

```
Back link ("← Kembali ke Daftar {Entity}")
PageHeader (title + description + StatusBadge + action buttons)
├── Summary Card (read-only info grid, 2-col)
└── Tabs (if entity has multiple concerns)
    ├── Tab 1: Primary related data
    ├── Tab 2: Secondary data
    └── Tab 3: History
```

### Edit Toggle Pattern (Detail Pages)

- **View mode** (default): fields displayed as read-only text (label + value pairs)
- Click **"Edit"** button in PageHeader → switches to **Edit mode**
- Edit mode: same layout positions, values become `<Field>` + `<FieldLabel>` + `<Input>`
- **Save** + **Cancel** (X) buttons appear in the card header
- Cancel reverts to view mode (resets form state)
- Nested entities (guardians, payments) still use **Dialog** for add/edit

```tsx
// Edit toggle pattern:
const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState({ ... });

// View mode: read-only text
<div><p className="text-[10px] text-muted-foreground">Label</p><p className="text-sm font-medium">{value}</p></div>

// Edit mode: Field + Input
<Field><FieldLabel>Label</FieldLabel><Input value={editForm.field} onChange={...} /></Field>
```

### Form Field Standard

Use Shadcn `Field` component (`components/ui/field.tsx`) — **never** raw `Label` + `Input` or custom `FormField`.

```tsx
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"

<Field>
  <FieldLabel>Nama Lengkap</FieldLabel>
  <Input value={...} onChange={...} />
  <FieldDescription>Optional help text</FieldDescription>
  <FieldError>{error}</FieldError>
</Field>
```

### Edit Dialog Standard (for nested entities)

- Same form fields as create dialog, pre-filled with current values
- Title: "Edit {EntityName}" (e.g., "Edit Wali")
- Save button: "Simpan" with loading state
- Cancel button: "Batal"
- On success: `toast.success()` + close dialog + refetch data

### Color Standard

**Never use hardcoded hex colors.** Use CSS variables defined in `globals.css`:

| Need | Use | NEVER |
|------|-----|-------|
| Success/present | `text-status-present`, `bg-status-present` | `text-[#00B37E]` |
| Warning/late | `text-status-late`, `text-warning` | `text-[#FF8C00]` |
| Error/absent | `text-destructive`, `text-status-absent` | `text-[#FF3B3B]` |
| Leave/info | `text-status-leave`, `text-info` | `text-[#0EA5E9]` |
| Status text (badges) | `text-status-present-text` | `text-[#00875A]` |
| Status backgrounds | `bg-status-present-subtle` | `bg-[#E6F9F1]` |

---

## Portal Consistency Standard

> Admin, Teacher, and Parent portals MUST use the same Shadcn components and patterns.

### All Portals Must Use:

| Need | Use | NEVER |
|------|-----|-------|
| Data display | `DataTable` (if >10 items) or Card list (if <10) | Custom divs with `.map()` |
| Status display | `StatusBadge` | Inline `Badge` with hardcoded colors |
| Empty state | `EmptyState` component | Plain `<p>` or `<div>` |
| Loading state | Shadcn `Skeleton` | `animate-pulse` divs |
| Currency | `formatRupiah()` from `@/lib/format` | Inline `.toLocaleString()` |
| Dates | `formatDate()` / `formatDateShort()` from `@/lib/format` | Inline `new Date().toLocaleDateString()` |
| Time | `formatTime()` from `@/lib/format` | Inline formatting |
| Colors | CSS variables (`text-primary`, `text-destructive`, etc.) | Hardcoded hex (`text-[#5DB4B8]`, `bg-[#00B37E]`) |
| Errors | `toast.error()` from sonner | `alert()` or `console.error()` only |
| Confirmations | `ConfirmDialog` | `window.confirm()` |
| Forms | `FormField` + Zod validation | Raw `Label` + `Input` |

### Portal Navigation Standard

**Teacher Portal** (mobile-first, max-w-md):
- Header: logo + school name + user name + logout button
- Bottom nav: 5 tabs with icons + labels + active indicator
- Content: centered `max-w-md`

**Parent Portal** (mobile-first, max-w-md — MUST match teacher pattern):
- Header: logo + school name + user name + logout button (same as teacher)
- Bottom nav: 4 tabs (Beranda, Tagihan, Kehadiran, Rapor) with icons + active indicator
- Content: centered `max-w-md` (NOT max-w-2xl — parents are mobile users)
- Logout: accessible from header (same pattern as teacher)

**Both portals MUST have:**
- Active state on current tab (teal underline + icon color)
- Logout button in header with `title="Keluar"` for accessibility
- Framer Motion `layoutId` for smooth active indicator animation
- Safe area padding for mobile (`safe-area-bottom` on bottom nav)

### Error Handling Standard

Every `fetch()` call MUST check response:
```tsx
const res = await fetch("/api/...");
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  toast.error(err.error || "Terjadi kesalahan");
  return;
}
const data = await res.json();
```

Never silently ignore errors: `.catch(() => {})` is forbidden.

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

### Every API Route Must:

1. `getSession()` → auth check (return 401 if missing)
2. `session.role` → role check (return 403 if wrong role)
3. `tenantId` → tenant ownership on every query (never return cross-tenant data)
4. Zod validation on all POST/PUT inputs (`lib/validations/`)
5. Rate limiting on all write endpoints (`lib/rate-limit.ts`)
6. `Number()` wrapper on all Decimal fields from Prisma (they come as strings)

### Data Access Rules

| Role | Access |
|------|--------|
| SCHOOL_ADMIN | All tenant data |
| TEACHER | Own attendance, own slips, assigned classes only |
| GUARDIAN | Own child's data only (invoices, attendance, reports) |

### Security Checklist for New Routes

- [ ] `getSession()` at top of handler
- [ ] Role check: `session.role !== "SCHOOL_ADMIN"`
- [ ] Tenant filter: `where: { tenantId: session.tenantId }`
- [ ] Zod validation on request body
- [ ] Rate limiting: `rateLimit()` on POST/PUT
- [ ] `Number()` on any Decimal field used in arithmetic
- [ ] Never hard delete — use status change
- [ ] Xendit webhook: verify `x-callback-token`

---

## Current Phase

**Phase 1A: Standardize + Harden** (see `prd.md` Section 20 for full roadmap)

**Completed:**
- Foundation refactor (Steps 1-6)
- Shadcn sidebar + 62 components installed
- DataTable on 12+ pages with sorting + skeleton loading
- Stat cards on all list pages
- Security: tenant isolation fixes, rate limiting, email rate throttling
- CI green (lint + typecheck + test)
- Parent portal initial implementation (4 pages: dashboard, invoices, attendance, reports)
- **Parent portal standardization complete** (DataTable + error handling + accessibility)

**In Progress:**
- CRUD completion: add edit + deactivate to all entities (see CRUD Standard above)
- DataTableRowActions component for standard action column
- Admin interface for LEARNING module (assessment management, student attendance)

**System-wide CRUD Status (as of 2026-04-15):**
- **Fully Complete (6/28 entities):** User, Campus, Holiday, LeaveRequest, SalaryComponentDef, FeeComponentDef
- **Partially Complete (14/28 entities):** Missing edit/deactivate or some CRUD operations
- **Missing UI/CRUD (8/28 entities):** OrgConfig, EmailLog, PayrollItem, ProgramFeeStructure (deactivate), InvoiceLine, Payment, AssessmentCategory, AssessmentIndicator
- **Overall: ~60% CRUD completion**

**Module-by-Module Status:**
- **CORE (6 entities):** 4/6 complete (User, Campus, Holiday ✅ | OrgConfig, EmailLog ❌)
- **HR (7 entities):** 2/7 complete (LeaveRequest, SalaryComponentDef ✅ | Employee, Attendance, PayrollRun, PayrollItem, TeachingAssignment ⚠️)
- **ACADEMIC (4 entities):** 1/4 complete (AcademicYear ✅ | Program, ClassSection, TeachingAssignment ⚠️)
- **STUDENTS (3 entities):** 1/3 complete (Student ✅ | Guardian, StudentEnrollment ⚠️)
- **FINANCE (5 entities):** 1/5 complete (FeeComponentDef ✅ | ProgramFeeStructure, Invoice, InvoiceLine, Payment ⚠️)
- **LEARNING (6 entities):** 0/6 complete (StudentAttendance, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, StudentAssessment, StudentAssessmentScore ⚠️)

**Parent Portal Audit Findings (2026-04-15):**
- ✅ DataTable usage on invoices & attendance pages
- ✅ StatusBadge usage (mostly)
- ✅ Currency/date formatting consistency
- ✅ Mobile-first max-w-md layout
- ✅ Tenant isolation & security
- ✅ Error handling in client components (invoices, attendance)
- ✅ Dashboard uses DataTable for unpaid invoices (with sorting)
- ✅ Reports uses DataTable for assessments (with sorting + Sheet detail view)
- ✅ Reports page uses `<Badge>` appropriately for assessment scores (not status)
- ✅ `safe-area-bottom` CSS utility added for iPhone home indicator
- ✅ Bottom nav layoutId standardized to `bottom-nav-active` (matches teacher portal)
- ✅ ARIA labels added to all bottom navigation links

**Next (after first month of real usage):**
- Complete CRUD operations for all entities (target: 100% completion)
- Admin interface for LEARNING module (assessment management, student attendance)
- Audit logging for critical operations (payroll approve, attendance override, invoice void)
- E2E tests for new CRUD flows

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

## Documentation Maintenance

> **CRITICAL:** Every code change MUST include documentation updates to keep docs in sync with the codebase.

### Documentation Roles

| Document | Audience | Purpose | Update Frequency |
|----------|----------|---------|------------------|
| **CLAUDE.md** | AI agents + developers | Implementation guide: patterns, standards, current phase, workflow | Per feature/bugfix |
| **README.md** | Humans (users + new devs) | Project overview, features, setup, getting started | Per major feature/release |
| **prd.md** | Product + engineering | Product requirements, user stories, acceptance criteria, roadmap | Per requirement change |
| **`.agent-skills/projects/school-erp/CLAUDE.md`** | AI agents | Agent skills integration guide (hybrid system) | Per process change |

### When to Update Each Document

**Update CLAUDE.md when:**
- ✅ Adding new modules, pages, or features
- ✅ Changing UI standards or patterns
- ✅ Updating tech stack or dependencies
- ✅ Modifying security practices
- ✅ Changing project structure or file organization
- ✅ Completing phases from roadmap (Current Phase section)
- ✅ CRUD completion status changes
- ✅ Portal consistency improvements

**Update README.md when:**
- ✅ Adding new user-facing features
- ✅ Changing environment setup
- ✅ Modifying development workflow
- ✅ Updating project structure overview
- ✅ Adding new dependencies or services

**Update prd.md when:**
- ✅ Adding new requirements or user stories
- ✅ Changing acceptance criteria
- ✅ Updating roadmap milestones
- ✅ Modifying executive decisions
- ✅ Adding architecture decisions

**Update agent-skills guide when:**
- ✅ Changing agent workflow/process
- ✅ Adding new domain skills to the project
- ✅ Modifying how skills integrate
- ✅ Updating skill usage conventions

### Documentation Update Workflow

1. **Before implementing:** Read relevant sections of CLAUDE.md and prd.md
2. **While implementing:** Note any patterns that need documentation updates
3. **After implementing:** Update documentation BEFORE committing
4. **Commit message:** Include "docs:" prefix for documentation-only commits

**Example commits:**
```bash
# Feature implementation
git add app/parent/invoices/ CLAUDE.md
git commit -m "feat(parent): invoice filters + docs update"

# Documentation only
git add CLAUDE.md prd.md
git commit -m "docs: update CRUD status and roadmap"
```

**Every AI agent and human developer MUST follow this workflow.**

---

## Key Documents

| Doc | Purpose | Last Updated |
|-----|---------|--------------|
| `CLAUDE.md` | This file — AI operating manual | 2026-04-15 (Parent portal audit + agent-skills integration) |
| `prd.md` | Product spec + roadmap + architecture decisions (single source of truth) | - |
| `README.md` | Setup guide + project overview | - |
| `.agent-skills/projects/school-erp/CLAUDE.md` | Agent skills integration guide | 2026-04-15 (Hybrid system documentation) |
