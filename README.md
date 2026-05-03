# Talib — by An Nisaa' Sekolahku

School management platform for **An Nisaa' Sekolahku** — Islamic PAUD/TKIT in Bekasi, Indonesia. 2 campuses, 40+ teachers, 500+ students. Single-tenant deployment under the brand "Talib by An Nisaa' Sekolahku" (Talib = طالب, "seeker of knowledge"). Multi-tenant requires tenant-from-host resolution in `lib/auth.ts` before onboarding a second tenant (resolver currently keys on email, guarded by `assertSingleTenant()`).

**Production:** [talib.annisaasekolahku.com](https://talib.annisaasekolahku.com) · **Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

> Engineering identifier: `school-erp` (npm package + repo name). Product name: Talib. Both refer to the same codebase.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Database | Supabase Postgres (prod + staging Singapore `ap-southeast-1`) / SQLite (local dev) |
| ORM | Prisma 7 |
| Auth | Supabase Auth (Google OAuth + Magic Link) |
| UI | Shadcn UI + Tailwind + TanStack Table; fonts Plus Jakarta Sans + JetBrains Mono |
| Payment | Xendit Checkout Session API |
| Email | Resend |
| PDF | `@react-pdf/renderer` |
| Hosting | Vercel (region pinned `sin1`) |
| CI | GitHub Actions: build, typecheck, vitest, Playwright |

---

## Modules

Seven domain modules. Parent Portal is a view *across* students + finance + learning, not its own module.

| Module | Domain |
|--------|--------|
| **core** | Auth, tenant, multi-campus config, holiday calendar, email log |
| **hr** | Staff lifecycle: employees, attendance, leave, payroll, salary components — gated by `hr.*` permissions |
| **academic** | School structure: academic year, programs, class sections, teaching assignments |
| **students** | Student lifecycle: students, guardians, enrollments, admissions |
| **finance** | Fees & payments: invoice state machine, Xendit checkout, manual + bulk generate, kuitansi PDF |
| **learning** | Academic outcomes: attendance, assessment templates, BB/MB/BSH/BSB scoring |
| **student-journal** | Buku Penghubung — bi-directional school + home indicators with audit trail |

---

## Portals

| Portal | Route | Role | Layout | Access |
|---|---|---|---|---|
| Admin (owner) | `/admin` | `SUPER_ADMIN` | Desktop sidebar | Everything incl. payroll, salary, bank |
| Admin (staff) | `/admin` | `SCHOOL_ADMIN` | Desktop sidebar | Students, admissions, academics, attendance, invoices, employees (no salary/payroll) |
| Teacher | `/teacher` | `TEACHER` | Mobile-first `max-w-md` | Own attendance + leave; assigned classes only |
| Parent | `/parent` | `GUARDIAN` | Mobile-first `max-w-md` | Own child only |

- **Parent** — home (greeting + Hijri date + per-kid card), invoices (Xendit), attendance week grid, reports, profile, Buku Penghubung (read school, edit home + notes).
- **Teacher** — check-in/out with optimistic card flip (tap → immediate UI update; network resolves in background; error reverts + inline message), attendance calendar, class attendance with skeleton-on-date-change (list freezes replaced by animated placeholder rows matching last-loaded student count while fetch resolves), Nilai Siswa (with live-announced pre-publish missing-score warning), Buku Penghubung (school scope), tappable salary slip rows → in-app detail (`/teacher/slips/[id]`) + portrait-fit A4 PDF download per row (single-column layout, no horizontal scroll at 414 px viewport) + missing-period placeholder (with empty-history fallback line) when prior month slip is not yet published, profile.
- **Admin** — dashboard (shadcn `ChartContainer` + `components/admin/dashboard/*` split; Pending Admissions row + Recent Activity feed via `AuditLog`; `Promise.allSettled` per-section degradation), employees, attendance (daily/monthly/LEAVE override), payroll (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT`), settings.

All four portals share the same brand chrome — An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label. Login screen carries the tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." (Bu Sari voice, see [`.claude/standards/voice.md`](./.claude/standards/voice.md)). Outbound emails (salary slips today; invoices via Xendit) use sender display `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` — Resend DKIM/SPF/DMARC verified for `annisaasekolahku.com`. Public legal pages live at `/legal/terms` and `/legal/privacy` (Indonesian PDP boilerplate, footer-linked from login).

---

## Architecture Decisions

Constraints actively shaping work in the last 60 days. Cells ≤ 2 sentences + cycle link; pre-commit rejects > 400 chars. Pre-2026 baseline + process-meta ADRs live in [`docs/adrs/archive.md`](docs/adrs/archive.md). Pre-May-2026 cycle docs live in [`docs/cycles/archive/`](docs/cycles/archive/) — see the 2026-05-03 tech-debt sweep cycle for archival rationale.

| Date | Decision | Why |
|---|---|---|
| 2026-05-03 | Supabase SSR auth + tenant filter via app layer; RLS for SELECT only | Service-role writes need explicit `tenantId` filter; SSR side-steps PKCE cookie issues — see [ADR](docs/adrs/2026-05-03-supabase-ssr-auth.md) |
| 2026-05-03 | Role split `SUPER_ADMIN` vs `SCHOOL_ADMIN`; permission-based RBAC for HR | `hasPermission()` replaces role-string checks; salary/payroll gated by `hr.*` — see [ADR](docs/adrs/2026-05-03-role-split-super-admin-school-admin.md) |
| 2026-05-03 | Query optimization Phase 6: mandatory `select:`, default `take:`, two-query budget on detail pages | Eliminate N+1, fat rows, unbounded fetches — see [ADR](docs/adrs/2026-05-03-query-optimization-phase-6.md) |
| 2026-05-03 | Pin `resend@6.10.x`, defer `svix→uuid<14` CVE chain | Vulnerable surface not reachable; `audit fix --force` would breaking-downgrade to 6.1.3 — see [ADR](docs/adrs/2026-05-03-resend-cve-deferred.md) |
| 2026-04 | Xendit over Midtrans for parent payments | Cleaner Checkout Session API + webhook semantics |
| 2025-04 | Bundle perf phase 2: analyzer + dynamic imports | Initial bundle was >400KB — see [cycle](docs/cycles/archive/2025-04-15-performance-optimization-phase2.md) |
| 2026-04-21 | Single `StudentJournalTemplate` with `scope` enum (SCHOOL/HOME) | One admin page + shared `<WeekGrid>`; one audit table — see [cycle](docs/cycles/archive/2026-04-21-student-journal.md) |
| 2026-04-24 | Teachers use `/api/teacher/students?classId=…`, not admin `/api/students` | Closes PII enumeration leak — see [cycle](docs/cycles/archive/2026-04-24-critical-money-and-auth-hotfix.md) |
| 2026-04-24 | `ConfirmDialog` rebuilt on AlertDialog (Base UI), stays open on `onConfirm` reject | Caller toasts and user retries — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Date helpers use `getYmdInTimezone(d, "Asia/Jakarta")` not `toISOString()` | UTC fallback returned yesterday's data 00:00–06:59 WIB on Vercel — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | Capacity check inside `$transaction` with `SELECT … FOR UPDATE OF cs` | Closes over-enrollment race on concurrent promote |
| 2026-04-24 | Prisma: `@@unique([tenantId, email])`, explicit `onDelete` everywhere | Schema matches multi-tenant intent — see [cycle](docs/cycles/archive/2026-04-24-alertdialog-jakarta-schema-alignment.md) |
| 2026-04-24 | RLS = tenant-scoped SELECT only; writes via `service_role` | App-layer `tenantId` filter is real write isolation; CI guard `verify-rls-coverage.sh` — see [cycle](docs/cycles/archive/2026-04-24-stress-review-followups.md) |
| 2026-04-24 | Accept prefix collision on `20260424000000_*` migrations | Already applied; rename would break Prisma `_migrations` state. Future migrations must avoid `YYYYMMDD000000` when one exists |
| 2026-04-24 | `Content-Security-Policy-Report-Only` added; `@libsql/*` removed | Logs without blocking — graduate after console clean — see [cycle](docs/cycles/archive/2026-04-24-outstanding-findings-audit.md) |
| 2026-04-25 | Parent kuitansi PDF route `GET /api/guardian/invoices/[id]/pdf` | Detail-sheet link previously 404'd — see [cycle](docs/cycles/archive/2026-04-25-parent-portal-design-fixes.md) |
| 2026-04-25 | Permission-based RBAC for HR replaces role-string checks | `hasPermission()` from `session.permissions`; `SCHOOL_ADMIN` excludes `hr.*` — see [cycle](docs/cycles/archive/2026-04-25-super-admin-rbac-sidebar-fix.md) |
| 2026-04-25 | Tagihan async pipeline: `PENDING_PAYMENT_LINK` status, chunked bulk-gen, retry endpoint, manual single-student create | Vercel free 60s ceiling forces ≤25-row chunks + `pLimit(5)`; durable failure state — see [cycle](docs/cycles/archive/2026-04-25-tagihan-fixes-async-bulk-manual-create.md) |
| 2026-04-26 | Finance Robustness: `InvoiceNumberSequence` allocator, two-phase webhook, bulk retry orchestrator, parent allow-list | Eliminates P2002 race on `POST /api/invoices`; new `CRON_SECRET` env — see [cycle](docs/cycles/archive/2026-04-26-finance-robustness-a-b-c.md) + [follow-ups](docs/cycles/archive/2026-04-26-finance-followup-fixes.md) |
| 2026-04-27 | Invoice creation auto-retry: typed `XenditApiError` + `withXenditRetry` (3 attempts, honors `Retry-After`) | Transient 5xx/408/429/network retried inline before persisting failure — see [cycle](docs/cycles/archive/2026-04-27-invoice-create-auto-retry.md) |
| 2026-04-28 | Bulk fan-out throttled: concurrency=2, 1s inter-chunk pacing, 2-attempt 429 budget | Rate-limit storm fits 60s function ceiling — see [cycle](docs/cycles/archive/2026-04-28-finance-bulk-throttle.md) |
| 2026-05-02 | `AuditLog` table for sensitive mutations (salary, payroll approve/cancel, employee status) | Append-only history with before/after JSON; tenant-scoped + RLS; tx-mode re-throws for atomic audit — see [cycle](docs/cycles/2026-05-02-hr-module-bugs-and-gaps.md) |
| 2026-05-02 | `OrgConfig.lemburCompliant` flag for UU 13/2003 §78(4) tiered overtime | Default off (flat); flag on switches to 1.5× first hour / 2× thereafter. Holiday OT (§85) deferred — see [cycle](docs/cycles/2026-05-02-hr-module-bugs-and-gaps.md) |
| 2026-05-02 | Migration `20260421000002_rls_fk_indexes` renamed to `20260421160000_*` | Index referenced `ProgramFeeStructure.tenantId` added by sibling whose timestamp sorted later — see [cycle](docs/cycles/2026-05-02-migration-ordering-fix.md) + [runbook](docs/runbooks/fresh-db-bootstrap.md) |

---

## Setup

```bash
git clone https://github.com/ismailir10/annisaa-erp-v3.git
cd annisaa-erp-v3
npm install
./scripts/install-hooks.sh           # required: pre-commit, prepare-commit-msg, commit-msg, pre-push
npx prisma generate && npx prisma db push && npx prisma db seed
npm run dev                          # http://localhost:3000 — demo mode, no Supabase
```

Tests: `npm run build && npx vitest run` (mandated gate before every commit), `npx playwright test`, `npm run lint`. Type-check on demand: `npm run typecheck` (runs `prisma generate` + `tsc --noEmit`).

### Environment variables

Copy `.env.example` to `.env`. Per-env values:

| Variable | Local | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Supabase Singapore pooler (6543) | Supabase Singapore pooler (6543) |
| `DIRECT_URL` | optional | Supabase Singapore direct (5432) — required¹ | Supabase Singapore direct (5432) — required¹ |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | — | Staging | Production |
| `RESEND_API_KEY` (omit → emails simulated) | — | Resend key | Resend key |
| `STAGING_EMAIL_OVERRIDE` | — | Admin email | — |
| `XENDIT_SECRET_KEY` / `XENDIT_WEBHOOK_TOKEN` | — | Sandbox | Production |
| `NEXT_PUBLIC_APP_URL` | — | Staging Vercel preview URL² | `https://talib.annisaasekolahku.com`² |
| `CRON_SECRET` | — | `openssl rand -hex 32` | `openssl rand -hex 32` |

¹ **`DIRECT_URL` mandatory on Vercel.** `build` runs `prisma migrate deploy`, which needs port 5432 — pooler 6543 (PgBouncer transaction mode) doesn't support advisory locks.
² **`NEXT_PUBLIC_APP_URL` per-env, throws if missing.** Origin for Xendit return URLs when no request scope (reseed/cron). No silent prod fallback.

---

## Environments

| Environment | Branch | URL | Database | Purpose |
|---|---|---|---|---|
| Local | any | localhost:3000 | SQLite | Demo mode |
| Staging | `staging` | [preview](https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/) | Supabase Singapore (staging project) | Safe data |
| Production | `main` | talib.annisaasekolahku.com | Supabase Singapore (prod project) | Real users |

Vercel builds via [`scripts/vercel-build.sh`](./scripts/vercel-build.sh); `prisma migrate deploy` runs on `staging` + `main`. Preview branches use staging DB and skip migrate deploy. CI runs three required checks per PR: `Lint, Typecheck & Test` (incl. RLS + API-auth coverage guards), `Build`, `Playwright E2E`.

Reseed runbook: [`docs/runbooks/reseed-staging.md`](docs/runbooks/reseed-staging.md).

---

Private — An Nisaa' Sekolahku. How we work (workflow, safety, standards): see [CLAUDE.md](./CLAUDE.md).
