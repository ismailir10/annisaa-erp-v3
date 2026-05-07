# Talib — by An Nisaa' Sekolahku

> **🚧 v2 Rebuild In Progress (May–July 2026)**
>
> This codebase is undergoing a foundation rebuild. v1 domain code (admin/teacher/parent UI, domain API routes, seeds, validators, e2e specs) was hard-deleted on 2026-05-04 (Phase 0). Phase 1 cycle 1 (2026-05-04) reset the Prisma schema to a 5-model tenancy skeleton (Tenant, Campus, Program, AcademicYear, AcademicTerm) — migrations 00 + 01 per foundation spec §6.1. Phase 1 cycle 2 (2026-05-05, this cycle) added migration 02 — User/Role/Permission/UserRole/RolePermission with composite-FK pattern (spec §6.4), SELECT-only RLS retroactively covering tenancy tables (spec §6.3, `verify-rls-coverage.sh` strict mode resumed), and a Supabase Custom Access Token Hook injecting `tenant_id` + `role` into JWT claims (spec §6.5). The v1 finance / xendit / payroll / audit / dashboard / parent-helpers libraries that Phase 0 preserved have been removed because they referenced dropped schema models; they will be re-introduced incrementally per foundation spec §18.1 (Phase 3 finance cycles, Phase 5+ teacher/parent portals). v1 final state preserved at git tag `v1-final-2026-05-04`.
>
> **Active design specs:**
> - [Foundation & MVP Architecture](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md)
>
> **Field research:**
> - [Teacher insights](docs/research/2026-05-04-nisaa-teacher-insights.md)
> - [v1 ERP audit](docs/research/2026-05-04-existing-erp-audit.md)
>
> Sections below describe v1 architecture and remain historical until per-domain v2 cycles reintroduce each module — consult the foundation spec for the v2 design intent. Currently live in v2: homepage placeholder, `/api/health`, `/api/csp-report`, legal pages, the Supabase + security middleware in `proxy.ts`, the tenancy schema, and the seed orchestrator.

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
| **students** | Student lifecycle: Household, Student, StudentIdentifier (NIS history), StudentIdentifierSequence (NIS allocator anchor), Guardian, StudentGuardian (m2m w/ relationship enum + relationship-scoped PRIMARY), GuardianInvitation, enrollments, admissions |
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
- **Teacher** — check-in/out with optimistic card flip (tap → immediate UI update; network resolves in background; error reverts + inline message), attendance calendar with month-prefetched (prev + next) records and prefetched leave balance & history (leave sheet opens with instant content on warm cache; cold-load shows skeleton), class attendance with skeleton-on-date-change (list freezes replaced by animated placeholder rows matching last-loaded student count while fetch resolves), Nilai Siswa (lazy-mounted assessments accordion — rubric DOM only mounted on expand, collapsed students contribute zero DOM; with live-announced pre-publish missing-score warning), Buku Penghubung (school scope), tappable salary slip rows → in-app detail (`/teacher/slips/[id]`) + portrait-fit A4 PDF download per row (single-column layout, no horizontal scroll at 414 px viewport) + missing-period placeholder (with empty-history fallback line) when prior month slip is not yet published, profile.
- **Admin** — dashboard (shadcn `ChartContainer` + `components/admin/dashboard/*` split; Pending Admissions row + Recent Activity feed via `AuditLog`; `Promise.allSettled` per-section degradation), employees, attendance (daily/monthly/LEAVE override), payroll (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT`), settings.

All four portals share the same brand chrome — An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label. Login screen carries the tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." (Bu Sari voice, see [`.claude/standards/voice.md`](./.claude/standards/voice.md)). Outbound emails (salary slips today; invoices via Xendit) use sender display `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` — Resend DKIM/SPF/DMARC verified for `annisaasekolahku.com`. Public legal pages live at `/legal/terms` and `/legal/privacy` (Indonesian PDP boilerplate, footer-linked from login).

---

## Architecture Decisions

Constraints actively shaping work in the last 60 days. Cells ≤ 2 sentences + cycle link; pre-commit rejects > 400 chars. Pre-2026 baseline + process-meta ADRs live in [`docs/adrs/archive.md`](docs/adrs/archive.md). Pre-May-2026 cycle docs live in [`docs/cycles/archive/`](docs/cycles/archive/) — see the 2026-05-03 tech-debt sweep cycle for archival rationale.

| Date | Decision | Why |
|---|---|---|
| 2026-05-08 | v2 scaffold entity-actions — `/api/scaffold/[entity]` relation-list endpoint w/ fail-closed allowlist (new `lib/scaffold/relation-lookups.ts`); renderer URL `/api/${r}` → `/api/scaffold/${r}`; 8 idempotent demo Households (P2002-swallow); `detailActions` Arsipkan + Pulihkan for student/guardian/household w/ voice.md confirms; Playwright +12 assertions | Closes 3 canary deferrals so admin scaffold pages support full CRUD round-trip end-to-end. Locks renderer-policy round-trip for next ~6 admin cycles — see [cycle](docs/cycles/2026-05-08-p2-entity-actions.md) |
| 2026-05-07 | Canonical ship-state ledger — foundation md `## 18A. Phase Status` (sha-grain row per merged cycle); CLAUDE.md `## Ground-truth check` section + required-reading bump; `/ship` Step 3 update-in-place on slug match; `/spec` Preflight `AskUserQuestion` on shipped-slug match; authority split codified (foundation md §18A = ship-state grain; README ADR = constraint/decision grain) | Catches session-start drift on hand-written prompts that restate stale staging tips; surfaces shipped-cycle list to assistant inline rather than per-session `git log` re-derive — see [cycle](docs/cycles/2026-05-07-p2-spec-sync-canary-shipped.md) |
| 2026-05-07 | v2 scaffold canary — first admin Playwright spec + CI Playwright re-enable; OWN_STUDENT resolver wired (parent studentIds via studentGuardian-join, fail-closed only when no Guardian); upload route consumes `policy.fileKindAllowlist[role]` via new `_registry.ts`; storage.objects RLS audit (Outcome A); `/api/_demo/login` → `/api/demo/login` (private folder bug); `08-demo-users` seed | Closes 4 p2-scaffold deferrals + unblocks every subsequent cycle's CI Playwright gate — see [cycle](docs/cycles/2026-05-07-p2-scaffold-canary.md) |
| 2026-05-07 | v2 scaffold pages — admin pages × 4 (list/new/detail/edit) for Student/Guardian/Household at `/admin/akademik/{siswa,wali,keluarga}/*` + 12 CRUD server actions w/ `assertScope` strict-ALL on writes + `ActionResult<T>` + `ScaffoldFormSpec` RSC→Client extraction; SessionContext widened (+role +currentTermId); `OwnStudentUnresolvedError` page-layer fail-closed | First admin-portal pages on the v2 scaffold engine. Strict-ALL writes compensate for absent portal-role gating until `p2-portal-shell-sidebar` — see [siswa](docs/cycles/2026-05-07-p2-scaffold-pages.md) + [wali/keluarga](docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md) |
| 2026-05-06 | v2 scaffold registries — `lib/entities/{student,guardian,household,student-identifier,guardian-invitation}/{schema,entity,policy}.ts` + `_types.ts` shared `EntityPolicy` + barrel + 5 tests (+64 cases). `scaffold.md` standard codifies per-entity conventions. dataFetcher admin tenant-scoped only; OWN_STUDENT throw deferred to p2-scaffold-pages | First scaffold-engine consumers (engine 0→5); unblocks p2-scaffold-pages (admin × 5 × 4 page types) + p2-scaffold-canary (Playwright + FileKind gating) — see [cycle](docs/cycles/2026-05-06-p2-scaffold-registries.md) |
| 2026-05-06 | v2 guardians schema — migration `08_guardians` adds Guardian + StudentGuardian + GuardianInvitation (RLS 32/32) w/ composite FKs §6.4, relationship-scoped partial-unique PRIMARY guard (FATHER + MOTHER coexist), column-list `SET NULL ("userId")` (PG 15.4+) + split-view Prisma FK (Prisma #25061). audit-pii 5/5: Guardian.nik + Guardian.phone | Completes Phase 2 student-domain schema; p2-students-guardians-scaffold (next) wires admin pages + entity registries + Playwright canary — see [cycle](docs/cycles/2026-05-06-p2-guardians.md) |
| 2026-05-06 | v2 students/household + platform plumbing — migration `07_students` adds Household/Student/StudentIdentifier/StudentIdentifierSequence (RLS 29/29) w/ composite FKs §6.4, soft-delete-aware partial-unique PRIMARY guard, storage.objects RLS folded inline. NIS allocator app-layer `pg_advisory_xact_lock`. Rate-limit + MIME verify on upload/callback/demo-login. `permission.ts` supabaseUserId fix. | First Phase 2 cycle; unblocks p2-guardians + p2-students-guardians-scaffold + p2-addresses-idn-chain + p2-admission-funnel — see [cycle](docs/cycles/2026-05-06-p2-students-guardians-household.md) |
| 2026-05-06 | v2 Google OAuth callback + auth surface — `/auth/callback` PKCE exchange + email-based User resolve + CAS supabaseUserId backfill + 3-layer `?next=` validation; `lib/auth/{callback-origin,demo-cookie,session}` (NEXT_PUBLIC_SITE_URL pin, HMAC demo cookie, demo+Supabase resolver); `/api/demo/login` DEMO_MODE-404; `/auth/error` page; JWT-hook dashboard runbook | Closes Phase 1 final cycle (auth was the last `getSession()` deferral). Phase 1 foundation truly DONE. p2 entity cycles unblock — see [cycle](docs/cycles/2026-05-06-p1-auth-google-oauth.md) |
| 2026-05-06 | v2 sharp + Supabase Storage upload pipeline — `POST /api/upload` route + `lib/storage/{supabase,sharp}.ts` wrappers + `lib/auth/session.ts` minimal `getSession()` shim. One bucket per FileKind w/ tenantId path prefix, sharp 1920px / JPEG-80 / mozjpeg / EXIF-stripped + `limitInputPixels: 24M` DoS guard, lazy upload on submit, FAILED rows persist for ops, 24h signed URL | Closes Phase 1 final cycle-6 deferral; Phase 1 foundation DONE; p2+ entity cycles consume route via the scaffold renderer — see [cycle](docs/cycles/2026-05-06-p1-upload-route-sharp.md) |
| 2026-05-06 | v2 timeline registry + emit middleware + audit bridge | `TIMELINE_EVENTS` frozen registry (8 seed kinds, Zod-validated payloads), `emitTimelineEvent` server-only generic over kind w/ tx threading + subjectKind mismatch guard, `writeAuditLog` SOFT_DELETE/RESTORE bridge via `RESOURCE_TO_SOFT_DELETE_KIND` map (Student + Employee starter set), `timeline.md` standards | Cycle-6 timeline-registry deferral cleared; 1 of 4 cycle-6 deferrals remain (`p1-upload-route-sharp`); p2+ entity cycles extend the registry per domain — see [cycle](docs/cycles/2026-05-06-p1-timeline-registry.md) |
| 2026-05-05 | v2 audit write middleware — `lib/audit/write.ts` exposes `writeAuditLog(input, tx?)`: JSON-normalises `before`/`after` (Date/Decimal-safe), pipes through PII redactor, INSERTs into partitioned AuditLog inside the caller tx. `defineAction` opt-in `audit?` config wires post-success audit. Live-DB trigger test gated by `TEST_DATABASE_URL` | Cycle-6 T6 deferral cleared; p2+ CRUD routes audit through one entry point with atomic tx semantics — see [cycle](docs/cycles/2026-05-05-p1-audit-write-middleware.md) |
| 2026-05-05 | v2 scaffold renderers complete — `FIELD_RENDERERS` filled 1/15 → 15/15 (textarea/number/decimal/currency/date/datetime/boolean/select/multiselect/email/phone/relation/file/enum). Currency+Phone store raw, display formatted via `fmt.*`; DateTime ISO uses explicit `+07:00` offset (Asia/Jakarta) | Any `EntityDef` can now mount via §5.2 4-line page pattern; 3 of 4 cycle-6 deferrals remain — see [cycle](docs/cycles/2026-05-05-p1-scaffold-renderers.md) |
| 2026-05-05 | v2 scaffold engine skeleton — `lib/scaffold/*` adds `fmt` helpers (§5.9), `FieldDef` registry / 15 renderer kinds (§5.5), `EntityDef<T>` (§5.10), permission resolver w/ materialized ID Sets + 5-min LRU + 5k JOIN-fallback (§4.2/§6.4), List/Form/Detail shells (§5.7-§5.8), `defineAction` override hatch (§5.3), `scaffold-check` CLI (§18.7) | 14 renderer impls + audit write + upload + timeline-registry split into 4 follow-up cycles per §18.2 cap — see [cycle](docs/cycles/2026-05-05-p1-scaffold-engine-skeleton.md) |
| 2026-05-05 | v2 audit + timeline + files foundation — migrations `06_audit_timeline` + `16_scaffold` add 8 tenant-scoped models (AuditLog partitioned, TimelineEvent, FileAsset, ExportJob, EmailLog, WebhookEvent, OrgConfig, Holiday) + 6 enums; 18 monthly AuditLog partitions inline (2026-05 → 2027-10); append-only trigger; `/// @PII` redactor generator + verifier CI gate | RLS strict 25/25; partition-drop retention per §4.5; auto-create + retention-drop crons deferred to p3+ — see [cycle](docs/cycles/2026-05-05-p1-audit-timeline-files.md) |
| 2026-05-05 | v2 employees + classes + sentra + sessions — migrations `03_employees` + `04_classes` + `05_sessions` add 8 tenant-scoped models (Employee, ClassSection, Sentra, TeachingDefault, SentraRotation, ClassSession, SessionTeacher + Employee↔Campus join) + 2 enums (SessionStatus, SessionTeacherRole §4.5); composite-FK §6.4 on join tables; seed `07-sentra` adds 8 PAUD catalog rows | RLS strict 17/17 (9 prior + 8 new); single-PRIMARY-per-session partial-unique guard on SessionTeacher; backfill composite uniques on Campus/Program/AcademicYear/AcademicTerm; `version Int` on Employee/ClassSection/ClassSession ahead of `17_version_triggers` — see [cycle](docs/cycles/2026-05-05-p1-employees-classes-sentra.md) |
| 2026-05-05 | v2 regions reference data + public-read RLS — migration `09_regions` adds `Province`/`Regency`/`District`/`Village` (BPS-code CHAR PKs, ~91.6k rows from `idn-area-data` v4.0.1) + `RegencyType` enum; non-tenant-scoped global reference tables with `USING (true)` SELECT for `authenticated` + `anon`; `no_writes_via_postgrest` + REVOKE close all write paths | Stable BPS PKs let p2 Address chain reference deterministic ids; anon SELECT supports public admission form `/daftar`; non-tenant-scoped excludes these tables from `verify-rls-coverage.sh` (still 9/9 strict) — see [cycle](docs/cycles/2026-05-05-p1-regions-seed.md) |
| 2026-05-05 | v2 identity + RLS + JWT hook — migration `02_identity` adds `User`/`Role`/`Permission`/`UserRole`/`RolePermission` with composite-FK pattern (spec §6.4); SELECT-only RLS retroactively covers tenancy tables; Supabase Custom Access Token Hook injects `tenant_id` + `role` into JWT claims | Tenant isolation enforced at DB layer (defense-in-depth alongside service-role writes); composite FKs prevent cross-tenant joins; `verify-rls-coverage.sh` resumes strict mode (9/9) — see [cycle](docs/cycles/2026-05-05-p1-identity-rls.md) |
| 2026-05-04 | v2 schema reset — drop all v1 migrations + re-author from foundation spec §6.1 starting with `00_extensions` + `01_tenancy` (Tenant, Campus, Program, AcademicYear, AcademicTerm) | Greenfield migration history, modular seed orchestrator (`prisma/seed/index.ts`), partial unique + CHECK constraints via raw SQL — see [cycle](docs/cycles/2026-05-04-p1-extensions-tenancy.md) |
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
npx prisma generate && npx prisma migrate dev && npx prisma db seed
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
