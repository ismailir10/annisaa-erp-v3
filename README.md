# An Nisaa' School ERP

School management system for **An Nisaa' Sekolahku** — an Islamic PAUD/TKIT in Bekasi, Indonesia. 2 campuses, 40+ teachers, 500+ students. Single-tenant MVP; multi-tenant requires tenant-from-host resolution in `lib/auth.ts` before onboarding a second tenant (session resolver currently keys on email alone, guarded by `assertSingleTenant()`).

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
| **hr** | Staff management — gated by `hr.*` permissions; `SCHOOL_ADMIN` excluded from every HR surface (employees, attendance, leave, payroll, salary components). Custom roles can re-grant any subset. See [`docs/cycles/2026-04-25-super-admin-rbac-sidebar-fix.md`](docs/cycles/2026-04-25-super-admin-rbac-sidebar-fix.md). | Employee, SalaryComponentDef, PayrollRun, PayrollItem, AttendanceRecord, LeaveRequest |
| **academic** | School structure | AcademicYear, Program, ClassSection, TeachingAssignment |
| **students** | Student lifecycle | Student, Guardian, StudentEnrollment, Admission |
| **finance** | Fees & payments — Invoice state machine: `DRAFT → SENT → PAID \| PARTIALLY_PAID \| CANCELLED` (void serialized with webhook + manual payments via `pg_advisory_xact_lock`; `SENT` rejected from terminal states) | FeeComponentDef, ProgramFeeStructure, Invoice, InvoiceLine, Payment |
| **learning** | Academic outcomes | StudentAttendance, AssessmentTemplate, AssessmentCategory, StudentAssessment |
| **student-journal** | Buku Penghubung (school + home) | StudentJournalTemplate, StudentJournalCategory, StudentJournalIndicator, StudentJournalEntry, StudentJournalNote, StudentJournalAudit |

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

**Parent Portal** — Home (greeting + Hijri date + per-kid card with this-week mini-strip + outstanding-tagihan focal card or lunas celebration), Invoices (focal due-amount + Belum dibayar / Riwayat groups + Xendit detail sheet), Attendance (weekly grid view with bespoke chevron navigator + compact summary card + school-note list), Reports (compact celebration card + Buka rapor CTA + history), Profile (avatar-tap from home → identity + Kontak + Anak Anda + logout), Buku Penghubung (school week view read-only + home indicators editable + parent-authored home notes with edit/delete)

**Teacher Portal** — Check-in/out (GPS as documentation), Attendance Calendar (with inline Cuti/Izin bottom sheet), Nilai Siswa (per-class assessment entry with BB/MB/BSH/BSB toggle + draft autosave + publish), Buku Penghubung (school-scope indicators + teacher notes per student + week view), Salary Slips (PDF), Profile (accessible via header avatar)

**Admin Portal** — Dashboard, Employee Management, Attendance (daily + monthly grid + LEAVE override), Payroll (state machine: `DRAFT → variables → review → APPROVED → EXPORTED (BSI CSV) → SLIPS_SENT (PDF email) | CANCELLED`; edits + BSI export gated to APPROVED, send-slips is idempotent per-item via `PayrollItem.emailSent`), Settings (campus, org config, holidays, salary components)

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
| 2026-04-24 | Teachers access class rosters via `GET /api/teacher/students?classId=…` (guarded by `requireTeacherForClass`), not the admin-only `/api/students` | Closes a PII enumeration leak found in the 2026-04-24 comprehensive code review. `/api/students` and `/api/employees` are now strict-admin (with a ≤10s `userCache` staleness window — role changes propagate within one page navigation); teacher data access runs through dedicated, class-scoped routes. See [`docs/cycles/2026-04-24-critical-money-and-auth-hotfix.md`](docs/cycles/2026-04-24-critical-money-and-auth-hotfix.md) |
| 2026-04-24 | `ConfirmDialog` rebuilt on Radix-equivalent `AlertDialog` (Base UI), destructive variant uses `variant="destructive"` token, dialog stays open when `onConfirm` rejects | Lets the caller toast an error and the user retry without re-opening the host menu/sheet. Lock-modal Esc/click-outside semantics also align destructive confirmations with the design-system overlays rule. See [`docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md`](docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Date helpers in parent + admin attendance routes use `getYmdInTimezone(d, "Asia/Jakarta")` instead of `toISOString()` / host-local components | UTC fallback returned yesterday's data between 00:00–06:59 WIB; host-local fallback was a no-op on Vercel (UTC host). New `Intl.DateTimeFormat`-based helper is host-independent. See [`docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md`](docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Promote + bulk-promote capacity check happens inside `$transaction` with `SELECT … FOR UPDATE OF cs` — mirrors enroll route | Closes the over-enrollment race where two concurrent promotes both saw "one seat free" against a stale snapshot |
| 2026-04-24 | Prisma schema: `User.email` is unique per tenant (`@@unique([tenantId, email])`), every relation declares explicit `onDelete`, ClassSection + PayrollRun get composite uniques | Schema now matches the multi-tenant intent the README has been claiming; FK behavior visible without consulting Prisma defaults; DB-level guards under app-level overlap checks. See [`docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md`](docs/cycles/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | RLS enforces **tenant-scoped SELECT only**; INSERT/UPDATE/DELETE go through `service_role` (Prisma bypasses RLS). App-layer `tenantId` filtering in route handlers is the real write-side isolation — **a leaked service_role key bypasses RLS entirely.** `scripts/verify-rls-coverage.sh` is wired into CI to fail if any tenant-scoped model lacks an ENABLE + policy migration. `EmailLog.tenantId` + `OrgConfig.tenantId` FKs tightened from CASCADE to RESTRICT by `20260424120100_tenant_cascade_to_restrict`; tenant hard-delete is now blocked while audit rows or per-tenant config exist (admin must archive/export first — correct multi-tenant compliance posture). 18 tenantId/composite indexes dropped by `20260421000001_rls_security_cleanup` recreated by `20260424120000_recreate_rls_tenantid_indexes` (the other 19 were already restored by `20260421000002_rls_fk_indexes`). See [`docs/cycles/2026-04-24-stress-review-followups.md`](docs/cycles/2026-04-24-stress-review-followups.md) |
| 2026-04-24 | Accept prefix collision on `20260424000000_*` migrations (`explicit_ondelete_actions` + `fix_emaillog_rls`) — both already applied to staging and cannot be renamed | Prisma `_migrations` table keys on `migration_name`; renaming an applied migration would cause it to re-apply or break state. Lex ordering of the suffix is deterministic today. Future migrations MUST avoid the `YYYYMMDD000000` prefix when another migration already exists at that timestamp |
| 2026-04-24 | `Content-Security-Policy-Report-Only` added to `next.config.ts` security headers; `@libsql/client` + `@prisma/adapter-libsql` removed (zero usages, prototype leftovers) | Report-only logs violations without blocking — graduate to enforcing once the console is clean. Allowlist: Supabase realtime (https + wss), Xendit Checkout (`js.xendit.co`), Google Fonts, Vercel Analytics. Still uses `'unsafe-inline'` + `'unsafe-eval'` for Next.js 16 client bundles; future hardening via per-request nonces. See [`docs/cycles/2026-04-24-outstanding-findings-audit.md`](docs/cycles/2026-04-24-outstanding-findings-audit.md) |
| 2026-04-25 | Permission-based RBAC replaces role-string checks for HR surfaces. `hasPermission()` consults `session.permissions` only (derived from `customRole.permissions` JSON or `getSystemRolePermissions(role)`); `SCHOOL_ADMIN` defaults exclude every `hr.*` code; `SUPER_ADMIN` retains all. Single `assertPermission("hr.view")` in `app/admin/(hr)/layout.tsx` gates pages; `requirePermission()` gates every HR API route. Sidebar filters via `permission?: PermissionCode` on nav items (replacing `superAdminOnly`). `Pengaturan` moved out of `<SidebarFooter>` into scrollable nav. Migration `20260425000000_promote_owner_to_super_admin` promotes the live owner so HR access is retained. See [`docs/cycles/2026-04-25-super-admin-rbac-sidebar-fix.md`](docs/cycles/2026-04-25-super-admin-rbac-sidebar-fix.md) |

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
| `XENDIT_WEBHOOK_TOKEN` | — | Staging token | Production token |

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
| **Staging** | `staging` | [Vercel preview](https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/) | Supabase SG | Test with safe data (3 test users, test teacher emails) |
| **Production** | `main` | annisaa-erp-v3.vercel.app | Supabase SG | Real teachers, real payroll |

**Deployment:** Vercel builds via [`scripts/vercel-build.sh`](./scripts/vercel-build.sh); `prisma migrate deploy` runs on both `staging` and `main` refs. Preview branches (`feat/*`) use the staging DB directly and skip migrate deploy. CI (GitHub Actions) runs three required checks on every PR: `Lint, Typecheck & Test` (includes RLS + API-auth coverage guards), `Build`, and `Playwright E2E`.

### Reseeding staging

When the staging database has drifted or needs a fresh realistic dataset, the operator can rebuild it from scratch via `scripts/reseed-staging.ts`. The script wipes every application row, deletes non-preserved Supabase auth users, then rebuilds a multi-year dataset (~200 students, ~28 employees, 22 payroll runs, full attendance + journal history, and live Xendit sandbox sessions for the most-recent invoices).

**Take a manual Supabase snapshot before running.** Use the staging project's dashboard → Database → Backups → "Create backup". The script reminds the operator on every run, but cannot take the snapshot itself.

`.env.local` is reserved for local SQLite demo mode — its values do not point at staging. Reseed uses a dedicated, gitignored `.env.staging` file pulled from Vercel:

```bash
# one-time per env change in Vercel
npx vercel link            # if not yet linked
npx vercel env pull .env.staging --environment=preview
```

That populates `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `XENDIT_SECRET_KEY` (sandbox), and `XENDIT_WEBHOOK_TOKEN` into `.env.staging`. The npm script auto-loads it via `tsx --env-file-if-exists=.env.staging`, so the operator command is just:

```bash
STAGING_CONFIRM=yes npm run reseed:staging
```

`STAGING_CONFIRM=yes` is the destructive-op gate — typed at the prompt, never persisted. `STAGING_SUPABASE_REF` is auto-derived from the `<ref>.supabase.co` host so it doesn't need to live in `.env.staging` either.

| Var | Source |
|---|---|
| `STAGING_CONFIRM` | typed at the prompt |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.staging` (`npx vercel env pull`) |
| `DATABASE_URL` | `.env.staging` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.staging` |
| `XENDIT_SECRET_KEY` | `.env.staging` |
| `XENDIT_WEBHOOK_TOKEN` | `.env.staging` (must be set in Vercel preview env, otherwise webhook handler 401s every delivery) |
| `STAGING_SUPABASE_REF` | auto-derived from Supabase URL host (override only if you need to) |

The guard still refuses to run if the Supabase URL doesn't resolve to a `<ref>.supabase.co` host, the resolved ref contains a "prod"/"production"/"live" substring, the Xendit key isn't a `xnd_development_*` sandbox key, or the `DATABASE_URL` host/username doesn't reference the same ref (split-brain check). There is no way to point the script at production.

Six preserved test accounts are kept across reseeds (auth UUIDs reused if present, created if missing): `ismailir10@gmail.com` (SUPER_ADMIN), `wirarajaisme@gmail.com` (SCHOOL_ADMIN), `ismail10rabbanii@gmail.com` + `wirarajaism@gmail.com` (TEACHER, employees IR01/WR03), `rightjet.hq@gmail.com` (GUARDIAN → Bilal Hakim), `commandprompt.adhan@gmail.com` (GUARDIAN → Ahmad Faris Abdullah).

To roll back a botched reseed, restore the manual Supabase snapshot via the dashboard.

**Partial failure:** if the script crashes after the "wiping application data" stage but before completing, **restore the snapshot before re-running**. The wipe is committed by that point and re-running directly will fail with a duplicate-key error on Tenant creation (`t_annisaa` already exists). The script does not auto-rewipe — that protects against accidentally re-truncating a successful run.

**Post-reseed UAT smoke (parent payment flow):**

1. Verify the Xendit dashboard webhook URL points at the staging preview domain — `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/api/xendit/webhook` — and that `XENDIT_WEBHOOK_TOKEN` is set in Vercel preview env. If absent, every webhook delivery 401s.
2. Log in as `rightjet.hq@gmail.com` (Ibu Nurul / Bilal Hakim's parent) on staging Vercel.
3. Open Tagihan → click any Apr-2026 invoice → tap the Xendit "Bayar Sekarang" button. Browser navigates to the sandbox checkout (`dev.xen.to/...`).
4. Complete a sandbox payment (use Xendit test card / VA).
5. Within ~30 seconds the parent invoice page should refresh to `Lunas` (PAID). Watch Vercel runtime logs for the `[XENDIT WEBHOOK] Invoice INV-… → PAID eventId=...` line.
6. To verify the expired path: in the Xendit dashboard, find a sandbox session and trigger an `expired` test event; the corresponding invoice should flip to `Dibatalkan` (CANCELLED) with the Xendit fields cleared.

If the parent invoice does not flip to PAID within ~30s of completing the sandbox payment, query `WebhookEvent` directly:

```sql
SELECT "eventId", "eventType", status, "errorMessage", "createdAt"
FROM "WebhookEvent"
WHERE provider = 'xendit'
ORDER BY "createdAt" DESC
LIMIT 10;
```

Status legend: `RECEIVED` = mid-flight; `PROCESSED` = succeeded; `IGNORED` = unknown event or invoice not found (`errorMessage` will say which); `FAILED` = transient error (row was deleted, watch for re-arrival).

---

## License

Private — An Nisaa' Sekolahku

---

## For developers and AI agents

See **[CLAUDE.md](./CLAUDE.md)** for the operating manual: the 3-step `/spec` → `/build` → `/ship` loop, multi-LLM session safety, one-file-per-cycle rule, file structure. Domain standards (UI / CRUD / Portal / API / Security / Colors) live in **[`.claude/standards/*.md`](./.claude/standards)** and are loaded on demand by `/build` based on globs of staged files. CLAUDE.md is the *how*; this README is the *what*.



