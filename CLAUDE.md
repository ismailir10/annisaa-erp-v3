# School ERP — Operating Manual

> **Read this file completely before making any changes.** This is the operating manual for AI development sessions on this repo. For project status, modules, roadmap, and architecture decisions, see [README.md](./README.md).

## Project quick reference

**An Nisaa' School ERP** — school management system for An Nisaa' Sekolahku (Islamic PAUD/TKIT, Bekasi). 2 campuses, 40+ teachers, 500+ students. SaaS-ready single-tenant MVP.

**Production:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)
**Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

Tech stack, module list, CRUD status, roadmap, and architecture decisions all live in **README.md**. This file is the *how*; README is the *what*.

---

## Development Workflow — The 3-Step Loop

Every development cycle uses exactly these three commands and exactly **one** markdown file (`docs/cycles/YYYY-MM-DD-<slug>.md`):

```
/spec   →   /build   →   /ship
```

The upstream `agent-skills` plugin (addyosmani/agent-skills) remains installed — it still provides the underlying skills. Our three project-level commands wrap the plugin's skills and fold all 20 of them into the 3-step flow, so nothing from the upstream framework is lost.

### Coverage mapping — nothing is dropped

| Upstream skill | Folded into |
|---|---|
| `idea-refine` | `/spec` (when the request is vague) |
| `spec-driven-development` | `/spec` |
| `planning-and-task-breakdown` | `/spec` |
| `context-engineering` | `/spec` + `/build` |
| `source-driven-development` | `/build` |
| `incremental-implementation` | `/build` |
| `frontend-ui-engineering` | `/build` (auto on `components/`, `app/*/page.tsx`) |
| `api-and-interface-design` | `/build` (auto on `app/api/`) |
| `security-and-hardening` | `/build` (auto on `app/api/`, `lib/auth`, `middleware.ts`) |
| `test-driven-development` | `/build` |
| `browser-testing-with-devtools` | `/build` |
| `debugging-and-error-recovery` | `/build` |
| `code-review-and-quality` | `/build` |
| `code-simplification` | `/build` |
| `performance-optimization` | `/build` (when the spec mentions perf) |
| `git-workflow-and-versioning` | `/ship` |
| `ci-cd-and-automation` | `/ship` |
| `documentation-and-adrs` | `/ship` |
| `deprecation-and-migration` | `/ship` (only when the spec declares a deprecation) |
| `shipping-and-launch` | `/ship` |

### Per-command responsibilities

**`/spec`** — define + plan. Creates the cycle doc with Context / Spec / Tasks sections. Surface assumptions before handing off to `/build`.

**`/build`** — loops over the cycle doc's Tasks, one at a time:
- Implement the slice
- Run the **between-task gate**: `npm run build && npx vitest run` — must pass before moving on
- Review + simplify the diff
- Update the cycle doc's Implementation + Verification sections
- Commit (one commit per task, not per cycle)
- After the **last task**: run the **end-of-cycle gate** before committing (see below)
- Fill Ship Notes in the cycle doc

**`/ship`** — create a PR from the feature branch to `staging` and hand off a two-command merge instruction to the user. `/ship` opens the PR and stops; the user watches CI (`gh pr checks <number> --watch`) and merges manually (`gh pr merge <number> --squash --delete-branch`) when all four checks are green. **Both `cto` and `product-builder` use this same flow — no direct pushes to `staging` or `main` for anyone.**
- `/ship` → PR feat/* → staging, merged manually by the author when CI is green
- `/ship --to-main` → PR staging → main, merged manually by the CTO when CI is green (explicit ask only; CTO-initiated)

Playwright must have passed (recorded in the cycle doc Verification section) before running `/ship`.

### Testing gates

Two-tier system — fast unit gate between every task, Playwright smoke once per cycle:

| Gate | Command | When |
|------|---------|------|
| Between-task (fast) | `npm run build && npx vitest run` | Before every commit during `/build` |
| End-of-cycle (smoke) | `npm run build && npx vitest run && npx playwright test` | After the last task, before the final commit |

**Why two tiers:** Playwright spins up a dev server and runs ~20 browser tests (~2 min cold). Running it between every task adds 10+ min to a 5-task cycle. Running it once at the end catches UI regressions without slowing iteration.

**Playwright notes:**
- Tests live in `e2e/` — three portals: `admin.spec.ts`, `teacher.spec.ts`, `parent.spec.ts`
- Uses demo-mode auth (cookie-based, direct cookie injection — no login UI, no rate-limit exposure)
- Runs against the **production build** (`DEMO_MODE=true npm run start`) — not dev server. Requires `npm run build` first.
- `reuseExistingServer: !process.env.CI` — reuses a running server locally; forces a fresh server in CI
- Chromium only (no multi-browser), workers: 1 (demo mode is stateful)
- If a Playwright test fails at end-of-cycle, fix it before committing the last task

If you're committing manually outside `/build`, run at minimum:
```bash
npm run build && npx vitest run
```

### Standalone: `/uat` — heuristic user-acceptance testing

`/uat <area>` is **not** part of the 3-step loop. Run it on demand when you want a synthetic first-pass on UX friction and performance in a specific portal area — e.g. `/uat parent/invoices`, `/uat teacher/class-attendance`, `/uat admin/payroll`.

The command role-plays a fixed persona (Pak Budi, Bu Sari, or Ibu Nur) through scripted Jobs-to-be-Done via Playwright MCP, measures page/API/click-to-visible timings against strict thresholds, and produces a severity-gated report at `docs/uat/reports/YYYY-MM-DD-<area>.md`.

**Key points:**
- **Heuristic, not real UAT.** An LLM persona cannot replicate thumb reach, sunlight glare, or emotional distrust. The report is a cheap first pass, not a substitute for real users.
- **Reports are gitignored by default.** They only enter git when a `/spec` cycle consumes one (via `git add -f`).
- **`/spec` integration:** when starting a new cycle, `/spec` reads the latest relevant UAT report, applies a 60-day staleness rule, and surfaces blocker/major findings into the cycle doc's Context.
- **`/build` maintenance:** after each task that changes user-facing capability, update `docs/uat/jobs/<portal>.md` to keep the JTBD library current.
- **Performance thresholds** (page load >4s = blocker, API >2s = blocker, click-to-visible >3s = blocker) are strict for the Indonesian PAUD/TKIT deployment reality (mid-range Android + intermittent 4G).

Jobs library: `docs/uat/jobs/{admin,teacher,parent}.md`. Personas: `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md`. Skill definition: `.claude/skills/uat/SKILL.md`.

---

## Multi-LLM Safety

Other LLMs (Sonnet, Haiku, GLM 5.2, GPT, etc.) may work on this repo. Three mechanisms keep this safe:

### 1. Session role (`.claude/session-role`)

Every session declares its role on turn one. File format:
```
role=cto              # opus sessions — can push staging directly
model=claude-opus-4-6 # or claude-sonnet-4-6, glm-5.2, gpt-5, human
```

If the file is missing or stale (>12h), the `SessionStart` hook (`scripts/check-role.sh`) prints an instruction telling the assistant to ask the user. The three slash commands refuse to run until it's set.

**Role override on every session start (critical):** The file persists between sessions and can carry a stale role from a previous AI session. To prevent this, the `SessionStart` hook always prints a reminder. The assistant MUST follow this rule:

> **If the user's first message in a session declares a role — "you are cto", "act as product-builder", "i am cto", "cto mode", or any clear equivalent — the assistant MUST immediately rewrite `.claude/session-role` with the declared role and its own model ID before taking any other action, even if the file already exists and is fresh.**

This overrides whatever the file currently says. There is no "it's already set" exception.

**No env var reads.** Claude Code doesn't reliably export `CLAUDE_MODEL` to subprocesses and other CLIs use different variables. The file is the single source of truth.

### 2. Git hooks (`.githooks/`)

Installed via `scripts/install-hooks.sh` which sets `core.hooksPath=.githooks` and writes `.githooks/.installed` as a marker.

- **`pre-commit`** — enforces the markdown allowlist (one-file-per-cycle rule), doc-sync (code changes must stage cycle doc, README.md, or CLAUDE.md), and seed drift prevention (`prisma/seed.ts` cannot be committed without `lib/db.ts` also staged).
- **`prepare-commit-msg`** — appends `Model-Trailer: <model>` and `Role: <role>` from `.claude/session-role` to every commit that doesn't already have them.
- **`pre-push`** — blocks direct pushes to `staging` or `main` for **all roles** (including `cto`). Everyone uses `/ship` to open a PR instead. Direct pushes to feature branches (`feat/*`) are always allowed.

### 3. Worktree isolation (every session gets its own working tree)

**Every session works in its own dedicated git worktree — one worktree per cycle, created fresh at session start.** This applies to all roles (cto, product-builder, etc.).

**Why:** Worktrees prevent parallel sessions from stomping on each other's lockfiles and build artifacts. They also give each session a clean slate — no dirty state inherited from a crashed previous session.

**Rule:**
- **Every session — regardless of role — MUST work in a worktree.** No exceptions. `check-role.sh` enforces this for all roles.
- `role=cto` → worktree required. Uses `/ship` (PR model) like everyone else — no direct push to staging.
- `role=product-builder` → **every new session = new worktree, no exceptions.** `check-role.sh` blocks `/spec`, `/build`, and `/ship` until the session is inside a worktree.

**The user never touches worktree setup.** When the user opens a Claude Code session in the main checkout and types anything (e.g. `/spec build the crud sweep`), the AI detects it is in the main checkout via the `SessionStart` hook and does the setup automatically regardless of role:

1. Derives a kebab-case slug from the user's request
2. Runs `bash scripts/setup-worktree.sh <slug>` via the Bash tool
3. Uses `EnterWorktree` to move into `.worktrees/<slug>`
4. Rewrites `.claude/session-role` with its own model ID
5. Proceeds with the user's original request

`setup-worktree.sh` does everything in one step:
- `git worktree add .worktrees/<slug> -b feat/<slug> origin/staging` — always branches from latest `origin/staging`, never from a stale local HEAD
- Symlinks `.env` and `.env.local` from the main checkout (fixes "missing env" errors)
- Symlinks `node_modules` from the main checkout (no `npm install` needed)
- Runs `install-hooks.sh` inside the worktree

**`.env` / `node_modules` in worktrees:** Both are gitignored and absent from fresh worktrees. The setup script symlinks them so `npm run dev`, `npm run build`, and Prisma work immediately. If a branch changes `package.json` dependencies, run `npm install` inside the worktree to replace the `node_modules` symlink.

**Cleanup when the cycle is merged:**
```bash
git worktree remove .worktrees/<slug>
git branch -D feat/<slug>
```

### 4. GitHub branch protection (the real boundary)

Client hooks can be bypassed with `--no-verify`. **GitHub branch protection is the actual enforcement layer.** Required settings:

- **`staging`**: require PR, no direct push for anyone (including owner), status checks must pass before merge
- **`main`**: require PR from `staging` only, same status checks

**Required GitHub Actions CI checks on every PR to `staging` and `main`:**
```
build         # npm run build
typecheck     # tsc --noEmit
test          # npx vitest run
e2e           # npx playwright test (production server)
```

`/ship` opens the PR and stops — the author merges manually after confirming all four checks are green. (Note: branch protection, required status checks, and "Allow auto-merge" require GitHub Pro and are **not active** on this repo today. The settings above are the aspirational target for when the repo moves to Pro. On the free plan, the only real safety net is the `pre-push` hook blocking direct pushes to `staging`/`main` plus the CTO's discipline to wait for green CI before clicking merge.)

**staging → main cadence:** After every 2-4 merged cycles on staging (or when the user says "ship to prod"), CTO runs `/ship --to-main` to create the staging → main PR. CTO reviews and merges after CI passes.

If you are setting up a fresh clone or forking this repo, configure the Actions workflow and branch protection before running `/ship`.

### Commit attribution

Every commit carries:
```
Model-Trailer: claude-opus-4-6
Role: cto
Co-Authored-By: Claude <noreply@anthropic.com>
```

This is appended automatically by the `prepare-commit-msg` hook. `/build` also includes it in the commit HEREDOC as a belt-and-suspenders measure. If both fail, the commit still lands but with `Model-Trailer: human` — surface this to the user so they can investigate.

---

## One-File-Per-Cycle Rule

**Only these markdown files are allowed in the repo:**
- `README.md`, `CLAUDE.md`, `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` (root)
- `docs/**` (including `docs/cycles/YYYY-MM-DD-<slug>.md`, **one per cycle**)
- `.github/**`, `.claude/**`, `.agent-skills/**`, `.githooks/**`

Any other staged `.md` file is rejected by the `pre-commit` hook with an error pointing at this rule.

**Never create `SPEC.md`, `PLAN.md`, `TEST-REPORT.md`, `NOTES.md`, `PHASE1-VERIFY.md`, or similar scratch files.** Everything that belongs to a cycle goes into the cycle doc's six sections. If you feel the urge to drop a sibling file, resist — the hook will reject it anyway.

The cycle doc template:
```markdown
# <Cycle Title>
## Context       <!-- /spec: why we're doing this -->
## Spec          <!-- /spec: acceptance criteria -->
## Tasks         <!-- /spec: ordered atomic tasks -->
## Implementation <!-- /build: per-task files + summary -->
## Verification   <!-- /build: gates + manual smoke -->
## Ship Notes     <!-- /ship: migrations, env vars, rollback -->
```

**`/ship` preflight checklist** (must pass before opening PR):
- [ ] `npm run build && npx vitest run && npx playwright test` all green
- [ ] Verification section in cycle doc filled
- [ ] **README.md updated** — mandatory if cycle adds/changes modules, routes, CRUD status, or entities
- [ ] Ship Notes filled (migrations, new env vars, rollback plan)

---

## Documentation Maintenance

Two docs are kept current every cycle:

| Document | Role | Update when |
|---|---|---|
| **README.md** | Single source of truth — project map, modules, CRUD status, roadmap, ADRs, workflow, setup | Modules change, CRUD status changes, roadmap shifts, architecture decisions made, new user-facing features |
| **CLAUDE.md** | This file — operating manual for AI agents (standards, patterns, rules) | UI/CRUD/API standards change, security practices change, workflow process changes |

**`prd.md` is retired.** All product/roadmap/ADR content lives in README.md. Do not recreate prd.md.

**The cycle doc** is where per-cycle history lives. Do not duplicate cycle details into README.md or CLAUDE.md — link to the cycle doc instead.

The `pre-commit` hook enforces that code changes stage at least one of: the current cycle doc, README.md, or CLAUDE.md. This catches missed doc updates before they become drift.

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

Use `<DataTableRowActions>` component (`components/ui/data-table-row-actions.tsx`). The prop you pass for the terminal action depends on the entity's CRUD category (see `## CRUD Standard` below):

| Category | Terminal prop | Menu label |
|---|---|---|
| A — Binary soft-delete | `onDeactivate` / `onActivate` + `isActive` | Nonaktifkan / Aktifkan |
| B — State-machine (Admission) | `onCancel` | Batalkan |
| B — State-machine (Invoice) | `onVoid` | Batalkan |
| C — Event-log (StudentAttendance) | `onVoid` | Batalkan |

- **Primary:** "Lihat" button (Eye icon) — visible, navigates to detail or opens Sheet. Only pass `onView` when a detail route exists.
- **Dropdown (⋮):** `onEdit` + one terminal prop (`onDeactivate` | `onCancel` | `onVoid`).
- Never hard delete. Never use `extraActions` for "Batalkan" / "Nonaktifkan" — use the dedicated prop so menu labels and icons stay consistent.
- `extraActions` is reserved for **domain-specific** actions (e.g. "Konversi ke Siswa" on Admission, "Setujui" / "Tolak" on LeaveRequest approval queue).

```tsx
// Category A — binary:
<DataTableRowActions
  onView={() => router.push(`/admin/students/${row.original.id}`)}
  onEdit={() => setEditTarget(row.original)}
  onDeactivate={() => setDeactivateTarget(row.original)}
  isActive={row.original.status === "ACTIVE"}
/>

// Category B — state-machine (Invoice):
<DataTableRowActions
  onView={() => router.push(`/admin/invoices/${inv.id}`)}
  onVoid={canVoid ? () => setVoidTarget(inv) : undefined}
/>
```

**Workflow-queue exceptions** (documented — do NOT "fix"):
- **PayrollRun list** (`/admin/payroll`): row shows `onView` only. All state transitions (approve, export, send-slips) happen on the detail page. The list is a directory, not an editor.
- **LeaveRequest approval queue** (`/admin/leave`): `onView` + `extraActions` ("Setujui" / "Tolak"). Approvals ARE the domain action — there is no generic edit or deactivate.
- **Daily attendance views** (`/admin/attendance`, `/admin/assessments/*` score entry): single-purpose cell editors, no terminal state. Override-only is correct.

---

## CRUD Standard (Inspired by ERPNext)

> Every entity in the system MUST support full CRUD. No create-only or read-only entities.

Entities fall into **three categories**. Pick the right one before you build — forcing the wrong pattern makes the UI lie.

### Category A — Binary soft-delete entities (default)

**Who:** User, Campus, Holiday, OrgConfig, Employee, Student, Guardian (StudentGuardian), StudentEnrollment, TeachingAssignment, Program, ClassSection, FeeComponentDef, ProgramFeeStructure, AcademicYear, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, SalaryComponentDef, LeaveRequest.

| Operation | UI Pattern | API Pattern |
|-----------|-----------|-------------|
| **Create** | Dialog form or `/new` page | `POST /api/{entity}` with Zod validation |
| **Read** | DataTable (list) + Detail page/Sheet | `GET /api/{entity}` paginated, `GET /api/{entity}/[id]` |
| **Update** | Edit dialog (same form as create, pre-filled) | `PUT /api/{entity}/[id]` with Zod validation |
| **Deactivate** | ConfirmDialog via dropdown action | `PUT /api/{entity}/[id]` with `{ status: "INACTIVE" }` |

- **NEVER hard delete records.** Use `status` field with `ACTIVE` / `INACTIVE`.
- All list queries default to `WHERE status IN ('ACTIVE')` unless filter says otherwise.
- DataTable status filter always includes "Semua Status", "Aktif", "Tidak Aktif".
- DataTable action column: `<DataTableRowActions>` with `onView` + `onEdit` + `onDeactivate`.

### Category B — State-machine entities (workflow)

**Who:** Admission, Invoice, PayrollRun.

Status is a state machine, not a binary flag — `Deactivate` doesn't apply. The terminal action is named for the domain:

| Entity | States | Terminal action | UI label | API |
|--------|--------|-----------------|----------|-----|
| Admission | `INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → REGISTERED` · `CANCELLED` | Cancel | "Batalkan" | `PUT /api/admissions/[id]` with `{ status: "CANCELLED" }` |
| Invoice | `DRAFT → SENT → PARTIALLY_PAID → PAID` · `OVERDUE` · `CANCELLED` | Void | "Batalkan" | `POST /api/invoices/[id]/void` |
| PayrollRun | `DRAFT → APPROVED → SLIPS_SENT` | (none — workflow-only) | — | `POST /api/payroll/[id]/{approve,send-slips,export/bsi}` |

- Row action column: `<DataTableRowActions>` with `onView` + `onEdit` + `onCancel` **or** `onVoid` (domain-appropriate). Terminal action is **hidden or disabled** when the row is already in a terminal state (`CANCELLED` / `PAID` / `VOIDED`).
- PayrollRun has no terminal "cancel" — its actions are workflow transitions handled on the detail page, not the list. Its list row exposes `onView` only; this is a **documented exception**.
- All mutation endpoints still require Zod validation and `canViewSalary(session.role)` where relevant.

### Category C — Event-log entities (no CRUD, event + void)

**Who:** AttendanceRecord (employee check-in/out), StudentAttendance (daily marking).

Immutable events appended by the system; correction via override/void, not edit.

| Operation | UI Pattern | API Pattern |
|-----------|-----------|-------------|
| Create | Auto (check-in/out) or bulk-mark dialog | `POST /api/attendance/check-in`, `POST /api/student-attendance/mark` |
| Read | Daily/monthly grid (not a DataTable of events) | `GET /api/attendance?date=...` |
| Correct | Override modal on the event row | `POST /api/attendance/[id]/override`, `PUT /api/student-attendance/[id]` |
| Void | Dropdown action — clears the event | `isVoided = true` (boolean flag, not `status`) |

- These entities intentionally use `isVoided: Boolean` instead of `status: String` because voiding is reversible audit, not a lifecycle state.
- Daily-view pages (AttendanceRecord) do **not** use the standard list layout — they render a per-day grid or today-only view. Documented exception.

### Which category fits a new entity?

- Does the entity have a single "trash it" meaning? → **Category A**.
- Does it have multiple states with different terminal outcomes (cancel vs complete vs void)? → **Category B**.
- Is it an immutable event the system generates? → **Category C**.

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

### Empty State Contract

**Every conditional list render MUST have an explicit else branch that renders visible content.** Rendering nothing in the empty case is a Playwright test failure waiting to happen — every E2E test asserts visible text on the page.

```tsx
// CORRECT — always render something
{items.length > 0 ? (
  <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
) : (
  <EmptyState title="Belum ada data" description="Data akan muncul setelah ditambahkan" />
)}

// WRONG — renders literally nothing when empty (test will fail)
{items.length > 0 && (
  <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
)}
```

**Rule:** If a page or component conditionally renders a list based on fetched data, it MUST render an `<EmptyState>` or at minimum visible text in the empty branch. This applies to all portals (admin, teacher, parent) and all page types (list pages, detail pages, dashboard cards).

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
| `SUPER_ADMIN` | All tenant data, including payroll and salary fields |
| `SCHOOL_ADMIN` | All tenant data **EXCEPT**: `/api/payroll/*`, `/api/employees/*/salary`, and salary fields stripped from employee responses |
| `TEACHER` | Own attendance, own slips, assigned classes only |
| `GUARDIAN` | Own child's data only (invoices, attendance, reports) |

**Auth helpers** (`lib/auth.ts`):
- `isAdminRole(role)` — true for both `SUPER_ADMIN` and `SCHOOL_ADMIN`; use for general admin gates
- `canViewSalary(role)` — true for `SUPER_ADMIN` only; use for payroll/salary routes and UI

### Security Checklist for New Routes

- [ ] `getSession()` at top of handler
- [ ] Role check: `!isAdminRole(session.role)` (for general admin routes)
- [ ] Salary-bearing routes: use `!canViewSalary(session.role)` — not just `isAdminRole()`
- [ ] Tenant filter: `where: { tenantId: session.tenantId }`
- [ ] Zod validation on request body
- [ ] Rate limiting: `rateLimit()` on POST/PUT
- [ ] `Number()` on any Decimal field used in arithmetic
- [ ] Never hard delete — use status change
- [ ] Xendit webhook: verify `x-callback-token`

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
docs/cycles/        One markdown file per development cycle
.claude/skills/     Project slash commands (spec/, build/, ship/ — each a SKILL.md)
.githooks/          Pre-commit, prepare-commit-msg, pre-push hooks
scripts/            check-role.sh, install-hooks.sh
```

---

## Testing

```bash
# Between-task gate (run before every commit)
npm run build && npx vitest run

# End-of-cycle gate (run after last task, before final commit)
npm run build && npx vitest run && npx playwright test

# Lint
npm run lint
```

E2E specs: `e2e/admin.spec.ts` (9 tests), `e2e/teacher.spec.ts` (5 tests), `e2e/parent.spec.ts` (6 tests).
All use demo-mode auth — no live Supabase or env vars required to run locally.

---

## Key Documents

| Doc | Purpose | Updated |
|-----|---------|---------|
| `README.md` | Project map: modules, CRUD status, roadmap, ADRs, workflow, setup | Every cycle |
| `CLAUDE.md` | This file — AI operating manual (standards, patterns, rules) | When standards or workflow change |
| `docs/cycles/YYYY-MM-DD-<slug>.md` | One per cycle — Context / Spec / Tasks / Implementation / Verification / Ship Notes | Created by `/spec`, updated by `/build` and `/ship` |
| `.claude/personas/*.md` | Fixed UAT personas (Pak Budi, Bu Sari, Ibu Nur) — device, context, frustrations, give-up triggers | Rarely — personas are stable |
| `docs/uat/jobs/*.md` | Per-portal Jobs-to-be-Done library — maintained by `/build` when user-facing capability changes | Each cycle that touches portal UX |
| `docs/uat/reports/*.md` | UAT reports (gitignored) — produced by `/uat`, consumed by `/spec` | On demand |

**Last updated:** 2026-04-18 (/ship switched to manual-merge-on-green — GitHub free plan does not support branch protection or auto-merge)
