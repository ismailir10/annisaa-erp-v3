# Talib — by An Nisaa' Sekolahku

School management platform for **An Nisaa' Sekolahku** — Islamic PAUD/TKIT in Bekasi, Indonesia. 2 campuses, 40+ teachers, 500+ students. Single-tenant deployment under the brand "Talib by An Nisaa' Sekolahku" (Talib = طالب, "seeker of knowledge"). Multi-tenant requires tenant-from-host resolution in `lib/auth.ts` before onboarding a second tenant (resolver currently keys on email, guarded by `assertSingleTenant()`).

**Production:** [talib.annisaasekolahku.com](https://talib.annisaasekolahku.com) · **Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

> Engineering identifier: `school-erp` (npm package + repo name). Product name: Talib. Both refer to the same codebase.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Database | Supabase Postgres (prod + staging Singapore `ap-southeast-1`); Prisma datasource is Postgres-only — local dev points `DATABASE_URL` at a Postgres too |
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

Nine domain modules — seven stable, plus `curriculum` and `reportCard` mid-cutover for the July 2026 PROMES/Penilaian/Raport switch. Parent Portal is a view *across* students + finance + learning, not its own module.

| Module | Domain |
|--------|--------|
| **core** | Auth, tenant, multi-campus config, holiday calendar, email log |
| **hr** | Staff lifecycle: employees, attendance, leave, payroll, salary components — gated by `hr.*` permissions |
| **academic** | School structure: academic year (with one-click roll-forward), programs, classes (consolidated per-year management surface at `/admin/classes` with roster + teacher + health snapshot + sessions calendar; `ClassTrack` lineage stays as silent plumbing — find-or-created on POST), daily class sessions (per-class calendar + substitute-teacher swap), teaching assignments, bulk class promotion ("Naik Kelas Massal" dialog on `/admin/classes` wiring `GET/POST /api/promotions` — roster preview, exclude list, capacity hint) |
| **students** | Student lifecycle: students (with auth-proxied photo upload via `lib/storage` adapter — files outside `public/`, MIME magic-byte validated, opaque storage tokens), guardians (full 13-field edit + detail page with list row-click nav), enrollments, admissions (admin CRM + public `/daftar` entry + sibling auto-detect on submit) |
| **finance** | Fees & payments: invoice state machine, Xendit checkout, manual + bulk generate, kuitansi PDF, payments-received ledger (`/admin/payments` — date-range cash recap + per-method summary + CSV via `GET /api/payments/{,export}`) |
| **learning** | Academic outcomes: attendance (incl. admin Rekap Bulanan tab on `/admin/student-attendance` + CSV export — `GET /api/student-attendance/{recap,export}`). Legacy `AssessmentTemplate` + BB/MB/BSH/BSB `StudentAssessment` scoring still backs the `/admin/assessment-templates` surface but is being retired by the `curriculum`/`reportCard` cutover (3-level skala) — no longer read by any parent surface |
| **student-journal** | Buku Penghubung — bi-directional school + home indicators with audit trail |
| **curriculum** *(cutover in progress)* | PROMES spine: Semester → Theme → SubTheme → Week, LearningObjective → AchievementIndicator → IndicatorThemeLink. Shipped: schema + admin CRUD APIs (`/api/admin/curriculum/{semesters,themes,subthemes,weeks}`) + admin pages (`/admin/semesters`, `/admin/semesters/[id]/{themes,objectives,import}`); PROMES xlsx import (`POST /api/admin/curriculum/import-promes`); Objective/IKTP/ThemeLink CRUD; the `AssessmentEntry` write path — walas weekly (`/teacher/assessments/weekly`) + sentra/CENTER daily (`/teacher/assessments/center/[center]`) via `POST /api/teacher/assessment-entries`, with `voidedAt` soft-void; admin Penilaian monitor (`/admin/penilaian`); parent perkembangan rollup (`/parent/perkembangan`). 3-level skala (Konsisten/Belum/Penguatan). Permissions: `curriculum.read` (TEACHER + SCHOOL_ADMIN + SUPER_ADMIN), `curriculum.write` (SUPER_ADMIN), `assessments.read` (+ GUARDIAN), `assessments.void` (SCHOOL_ADMIN). Feeds the `reportCard` module; per-cycle history in `docs/cycles/`. |
| **reportCard** *(cutover in progress — admin authoring + parent read shipped)* | Triwulan report card aggregating penilaian. Schema (`Term`, `ReportCardEntry`, `StudentMeasurement`, `ReportSection` enum) + admin surface `/admin/raport`: per-student raport auto-drafted from `AssessmentEntry` (`lib/curriculum/raport-aggregator.ts` — dominant `AchievementLevel` per curriculum element, lower-achievement tie-break; `PERFORMANCE_SHOWCASE` pools MOTOR_SKILLS+ART) + auto-pulled attendance, admin override of any field, publish, PDF. APIs: `GET/POST /api/admin/terms` + `PATCH /api/admin/terms/[id]` (triwulan setup), `GET /api/admin/raport` (roster+status), `GET/PUT /api/admin/raport/[studentId]/[termId]` (draft-or-saved / upsert), `POST .../publish` + `.../unpublish`, `GET .../pdf` (`@react-pdf/renderer` report card, `lib/pdf/report-card.tsx`). Permissions `reportCard.read`/`reportCard.write`/`reportCard.publish` (SUPER_ADMIN + SCHOOL_ADMIN). **Parent surface (2026-06-16):** `/parent/reports` renders the PUBLISHED `ReportCardEntry` (`getPublishedReportCardsForStudent` → narrative sections + 3-level skala + Kehadiran/measurements + `GET /api/guardian/raport/[studentId]/[termId]/pdf`, GUARDIAN-gated); the legacy `StudentAssessment` parent read path was dropped. Section/PDF assembly is shared via `lib/raport/build.ts`. Kisi-kisi narrative templates, teacher/walas authoring, parent sign, docx are later phases — [archived design spec](docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md). |

---

## Portals

| Portal | Route | Role | Layout | Access |
|---|---|---|---|---|
| Public (applicant) | `/daftar` | (none — public) | Mobile-first vertical | Public admission entry — three-step form (applicant → parent → preference) |
| Admin (owner) | `/admin` | `SUPER_ADMIN` | Desktop sidebar | Everything incl. payroll, salary, bank |
| Admin (staff) | `/admin` | `SCHOOL_ADMIN` | Desktop sidebar | Students, admissions, academics, attendance, invoices, employees (no salary/payroll) |
| Teacher | `/teacher` | `TEACHER` | Mobile-first `max-w-md` | Own attendance + leave; assigned classes only |
| Parent | `/parent` | `GUARDIAN` | Mobile-first `max-w-md` | Own child only |

- **Parent** — home (greeting + Hijri date + per-kid card), invoices (Xendit), attendance week grid, reports, profile, Buku Penghubung (read school, edit home + notes).
- **Teacher** — check-in/out with optimistic card flip (tap → immediate UI update; network resolves in background; error reverts + inline message), today's class sessions on the dashboard linking to per-session roster pages (`/teacher/sessions/[id]` — cycle-tap status, Tap In / Tap Out timestamps, pickup relation + name capture), attendance calendar with month-prefetched (prev + next) records and prefetched leave balance & history (leave sheet opens with instant content on warm cache; cold-load shows skeleton), class attendance with skeleton-on-date-change (list freezes replaced by animated placeholder rows matching last-loaded student count while fetch resolves), Nilai Siswa (lazy-mounted assessments accordion — rubric DOM only mounted on expand, collapsed students contribute zero DOM; with live-announced pre-publish missing-score warning), Buku Penghubung (school scope), tappable salary slip rows → in-app detail (`/teacher/slips/[id]`) + portrait-fit A4 PDF download per row (single-column layout, no horizontal scroll at 414 px viewport) + missing-period placeholder (with empty-history fallback line) when prior month slip is not yet published, profile.
- **Admin** — dashboard (shadcn `ChartContainer` + `components/admin/dashboard/*` split; Pending Admissions row + Recent Activity feed via `AuditLog`; `Promise.allSettled` per-section degradation), employees, attendance (daily/monthly/LEAVE override), payroll (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT`), penilaian monitor (`/admin/penilaian` — read-only walas-weekly + sentra-daily `AssessmentEntry` completion via `GET /api/admin/penilaian`, gated by `assessments.read`), raport (`/admin/raport` — triwulan report card auto-drafted from penilaian, override + publish + PDF, gated by `reportCard.read`), kehadiran siswa (daily list + Rekap Bulanan tab with per-student monthly counts + CSV export), penerimaan (`/admin/payments` — date-range payments-received ledger + per-method summary + CSV export), settings.

All four portals share the same brand chrome — An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label. Login screen carries the tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." (Bu Sari voice, see [`.claude/standards/voice.md`](./.claude/standards/voice.md)). Outbound emails (salary slips today; invoices via Xendit) use sender display `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` — Resend DKIM/SPF/DMARC verified for `annisaasekolahku.com`. Public legal pages live at `/legal/terms` and `/legal/privacy` (Indonesian PDP boilerplate, footer-linked from login).

---

## Architecture Decisions

Constraints actively shaping work in the last 60 days. Cells ≤ 2 sentences + cycle link; pre-commit rejects > 400 chars. Pre-2026 baseline + process-meta ADRs live in [`docs/adrs/archive.md`](docs/adrs/archive.md). Pre-May-2026 cycle docs live in [`docs/cycles/archive/`](docs/cycles/archive/) — see the 2026-05-03 tech-debt sweep cycle for archival rationale.

| Date | Decision | Why |
|---|---|---|
| 2026-06-05 | Single-active invariant: activating an `AcademicYear` (other ACTIVE→PLANNING) or `Semester` (in-year siblings→INACTIVE) demotes siblings in a transaction; year status allowlisted. `/admin/classes` resolves its default year by date-coverage, not API order. `playwright.config` refuses a non-local `DATABASE_URL` (E2E_ALLOW_REMOTE_DB=1 to override) | Multiple simultaneously-ACTIVE years/semesters made current-period unresolvable + Kelas defaulted to an empty E2E year; local e2e wrote to staging (DEMO_MODE switches only auth, not the DB) — UAT 2026-06-04 — see [cycle](docs/cycles/2026-06-05-staging-hygiene-active-year.md) |
| 2026-05-19 | Storage adapter (`lib/storage/`) swapped from local disk to Supabase Storage `attachments` bucket (private, service-role only, 5 MB cap, JPEG/PNG/PDF whitelist); token prefix `supabase:v1:`; legacy `local:v1:` tokens parse but `streamFile`/`deleteFile` no-op (4 stale staging rows NULLed) | PR #294 local-disk adapter 500'd on Vercel (`ENOENT` — read-only fs); auth-proxy still gates KTP/KK reads (UU PDP 27/2022) — see [cycle](docs/cycles/2026-05-19-storage-supabase-swap.md) |
| 2026-05-19 | Curriculum C7a — `AssessmentEntry` gains `voidedAt`/`voidedById`/`voidReason` + `voidedBy Employee?` relation + `@@index([voidedAt])`; permission `assessments.void` granted to SCHOOL_ADMIN (NOT TEACHER); existing `@@unique` preserved — partial-unique swap deferred to C7b alongside the C4/C5 upsert refactor | Schema-readiness for C7b `/admin/assessments` rebuild + Category-C admin override on the modern Penilaian stack; first of 4 cycles unifying Penilaian and retiring legacy AssessmentTemplate — see [cycle](docs/cycles/2026-05-19-penilaian-c7a-void-schema.md) |
| 2026-05-19 | `/admin/classes` consolidates the old class-tracks UI + embedded sections + global teaching-assignments into one per-year management page; `ClassTrack` stays as schema plumbing. Nav group `Struktur Akademik` → `Akademik`. Race-safe via `pg_advisory_xact_lock` | Three admin surfaces made "manage TKIT A this year" a context-switch — see [cycle](docs/cycles/2026-05-19-kelas-page.md) |
| 2026-05-18 | Kesiswaan CRUD parity (in flight): superset parent-option constants; Student photo + Parent KTP/KK uploads; metadata editor; "Riwayat Status"; create-full-field-set; Admission `campusPreference` + stash on Student.metadata; unified `GuardianFormBody`; race-safe `isPrimary`+`childOrder`; KK preview via primary guardian; sibling-detect confirm + 409 email-conflict; guardian-detail Dokumen card | Closes UU PDP 27/2022 gap; race-safe primary toggle; convert no longer P2002s on email collision — see [cycle](docs/cycles/2026-05-18-kesiswaan-crud-audit.md) |
| 2026-05-20 | Curriculum cutover prep: `ClassSection.ageGroup` enum column promoted from `deriveAgeGroup` name-heuristic; legacy assessment page gains tenant-scope; PROMES re-import becomes status-aware | Heuristic silently null'd for non-A/B class names → empty walas indicators + sentra cohort + perkembangan rollup; 3 RLS regressions in 6 weeks justify defense-in-depth scope — see [cycle](docs/cycles/2026-05-20-curriculum-cutover-prep.md) |
| 2026-05-16 | CRUD consistency audit: admission conversion copies parent fields + `parentRelationship`; guardian CRUD surfaces expanded | Fix data loss on convert; new guardian detail page; expand list edit form — see [cycle](docs/cycles/2026-05-16-crud-consistency-audit.md) |
| 2026-05-16 | Nav reshuffle: Tahun Ajaran + Guru Pengajar moved Kurikulum → Struktur Akademik; ClassTrack label "Rombongan Belajar" → "Identitas Kelas"; teaching-assignments gains create button | Structural setup ≠ curriculum content; "Rombongan Belajar" is ClassSection not ClassTrack — see [cycle](docs/cycles/2026-05-16-academic-nav-reshuffle.md) |
| 2026-05-14 | Curriculum C6 (in flight) — parent perkembangan rollup; `assessments.read` granted to GUARDIAN; `loadStudentPerkembangan` aggregates per-element counts + latest-pekan preview; `/parent/perkembangan` mobile pages + `Perkembangan minggu ini` card on parent home | Closes parent-visibility loop on C4+C5 entries — see [cycle](docs/cycles/2026-05-14-curriculum-c6-parent-perkembangan.md) |
| 2026-05-14 | Curriculum C5 — sentra (CENTER) daily assessment on top of C4's `AssessmentEntry`; mobile UI at `/teacher/assessments/center/[center]` + POST/GET sentra session APIs (≤80 entries/session, ageGroup-filtered roster) | Reuses C4 schema with `source = CENTER` so 8 sentra rooms feed the same per-student data — see [cycle](docs/cycles/2026-05-14-curriculum-c5-center-assessments.md) |
| 2026-05-14 | Curriculum C4 — `AssessmentEntry` + `AssessmentSource`/`LearningCenter` enums; walas weekly mobile UI at `/teacher/assessments/weekly` writes via `POST /api/teacher/assessment-entries` | First write path against curriculum indicators; English-only code identifiers (Indonesian only in UI copy) per CTO directive — see [cycle](docs/cycles/2026-05-14-curriculum-c4-weekly-assessments.md) |
| 2026-05-13 | Parent.email backfilled from User.email — one-shot Postgres migration + session-resolve `selfHealParentEmail()` in `lib/auth.ts` keep them aligned going forward | F-7 from 2026-05-13 staging E2E sweep: 200 wali rows had Parent.email NULL while User.email was set, silently breaking outbound reads — see [cycle](docs/cycles/2026-05-13-staging-sweep-majors-cycle1.md) |
| 2026-05-13 | Admin sidebar regrouped: 6 groups (Kesiswaan, Kurikulum, Penilaian, Kelas Harian, Keuangan, SDM) + flat Settings; 7 paths renamed (academic-years, semesters, assessment-templates, employee-attendance, leave-requests, salary-components, settings/work-hours) with 308 redirects in `next.config.ts` | Old Akademik bloated to 8 items; Kurikulum had a single child; Penilaian needs its own slot before Jul-2026 Raport. Jam Kerja stays under `/admin/settings/` — SCHOOL_ADMIN lacks `hr.view` — see [cycle](docs/cycles/2026-05-13-admin-nav-reorg.md) |
| 2026-05-12 | Curriculum C2 — PROMES xlsx import: `lib/curriculum/promes-parser.ts` (exceljs) + `POST /api/admin/curriculum/import-promes` (multipart preview/commit, prisma.$transaction + audit, 409 on collision, 413 row-cap) + 3-stage admin page at `/admin/semesters/[id]/import` | Parser dep `xlsx` → `exceljs` over CVE-2023-30533. Conflict policy locked hard-reject; C3 CRUD UI handles surgical edits — see [cycle](docs/cycles/2026-05-12-curriculum-promes-import.md) |
| 2026-05-12 | Curriculum schema + admin landing (C1 of 11) — Prisma adds Semester / Theme / SubTheme / Week / LearningObjective / AchievementIndicator / IndicatorThemeLink; admin CRUD APIs + Semester page; sidebar gains "Kurikulum" group; permissions `curriculum.read` + `curriculum.write` | First cycle of July 2026 PROMES cutover. Soft-delete via `status` per crud.md (overrides design-doc §4 `deletedAt` footnote); date fields are `DateTime` per design doc; junction `IndicatorThemeLink` mirrors StudentGuardian (no tenantId) — see [cycle](docs/cycles/2026-05-12-curriculum-schema-and-admin.md) |
| 2026-05-12 | Pedagogy stack (Curriculum + Penilaian + Raport) designed: PROMES-canonical IKTP, 3-level scale (Konsisten/Belum/Penguatan), template-driven Raport with PDF+docx | Replaces 60+ weekly xlsx; July cutover for Curriculum+Penilaian, Sept ship for Raport — see [archived spec](docs/archive/superpowers-legacy/specs/2026-05-12-curriculum-penilaian-raport-design.md) |
| 2026-05-12 | Drop `REGISTERED` admission state — 5-state vocab (`INQUIRY` \| `VISIT_SCHEDULED` \| `VISITED` \| `ADMITTED` \| `CANCELLED`); `Admission.studentId` nullable FK is the single "converted" signal | Cycle 2.1 first-principles audit replaced the planned v2 8-state lift as overcomplicated for the Indonesian school workflow; backfill `UPDATE` migrates 1 demo row, 0 prod rows; convert-flow gate stays `status="ADMITTED"`, status no longer flips — see [cycle](docs/cycles/2026-05-12-admission-lifecycle-simplification.md) |
| 2026-05-11 | Sibling auto-detect on admission submit — tenant-scoped email > phone match against `Parent`; persists `Admission.detectedParentId` (additive nullable FK); `/admin/admissions` shows "Saudara terdeteksi" chip + edit-sheet banner. `getClientIp` now reads `x-forwarded-for[0]` (Vercel-correct) | Phase 1.2. Applicant-facing `/daftar` UX unchanged (admin-only per plan §7 q6). Closes cycle 1.1 `daftar-rate-limit-ip-extraction-hardening` before publicised launch — see [cycle](docs/cycles/2026-05-11-sibling-auto-detect.md) |
| 2026-05-11 | Public-repo prep: `prisma/data/students.ts` marked synthetic-only; `.env.example` aligned with README (XENDIT_SECRET_KEY corrected, SUPABASE_SERVICE_ROLE_KEY + STAGING_EMAIL_OVERRIDE + CRON_SECRET documented); README `Next.js 15`→`16`; CLAUDE.md file-structure counts updated | Light-touch hygiene ahead of repo public-flip. Owner-email scrub skipped — same email already in migration SQL + git history forever, so source-tip scrub is cosmetic — see [cycle](docs/cycles/2026-05-11-public-repo-prep.md) |
| 2026-05-10 | Public `/daftar` admission entry — three-step form (applicant → parent → preference) writes `Admission` rows in `INQUIRY` status; `POST /api/admission/submit` rate-limited 5/min/IP via in-memory bucket; Resend confirmation email best-effort | First Phase 1 feature post v2 rollback. Reuses v1 single-parent `Admission` schema (no migration); admin `/admin/admissions` flow unchanged — see [cycle](docs/cycles/2026-05-10-daftar-public-form.md) |
| 2026-05-10 | Phase 0 perf sweep — `e2e/perf-budget.spec.ts` 4-s page-load regression guard; `data-testid="roster-row"` + `data-empty-state` anchors on `/teacher/class-attendance` | All 4 UAT perf findings (U3 / U7 / U8 / U9) healed by rollback alone (medians 119–541 ms vs UAT figures 2.1–15 s); guard locks the post-rollback envelope. Closes Phase 0 — see [cycle](docs/cycles/2026-05-10-phase0-perf-sweep.md) |
| 2026-05-10 | Tighten `_getParentWithChildren` invariants (require tenantId + parentId-or-email; throw on contract violation); reuse existing `scripts/backfill-pending-payment-links.ts` for U2 backlog | Closes UAT U10 latent fan-out (200 staging null-email Parent rows would leak via a session with both `parentId` and `email` null); U2 surfaced as 25 stale test artifacts (plan's 364 was pre-rollback) — see [cycle](docs/cycles/2026-05-10-phase0-finance-backlog-drain.md) |
| 2026-05-10 | Explicit `Cache-Control: no-store` on `POST /api/auth/logout`; portal trees rely on Next.js dynamic-route default | Closes UAT U6 sign-out bfcache leak. Portals already inherit `no-store` because `getSession()` marks routes dynamic; logout was the gap. UAT U1 healed by rollback to PR #177 — see [cycle](docs/cycles/2026-05-10-phase0-admin-hydration-and-bfcache.md) |
| 2026-05-03 | Supabase SSR auth + tenant filter via app layer; RLS for SELECT only | Service-role writes need explicit `tenantId` filter; SSR side-steps PKCE cookie issues — see [ADR](docs/adrs/2026-05-03-supabase-ssr-auth.md) |
| 2026-05-03 | Role split `SUPER_ADMIN` vs `SCHOOL_ADMIN`; permission-based RBAC for HR | `hasPermission()` replaces role-string checks; salary/payroll gated by `hr.*` — see [ADR](docs/adrs/2026-05-03-role-split-super-admin-school-admin.md) |
| 2026-05-03 | Query optimization Phase 6: mandatory `select:`, default `take:`, two-query budget on detail pages | Eliminate N+1, fat rows, unbounded fetches — see [ADR](docs/adrs/2026-05-03-query-optimization-phase-6.md) |
| 2026-05-03 | Pin `resend@6.10.x`, defer `svix→uuid<14` CVE chain | Vulnerable surface not reachable; `audit fix --force` would breaking-downgrade to 6.1.3 — see [ADR](docs/adrs/2026-05-03-resend-cve-deferred.md) |
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
npm run dev                          # http://localhost:3000 — DEMO_MODE bypasses Google auth (DB still required)
```

Tests: `npm run build && npx vitest run` (mandated gate before every commit), `npx playwright test`, `npm run lint`. Type-check on demand: `npm run typecheck` (runs `prisma generate` + `tsc --noEmit`).

### Environment variables

Copy `.env.example` to `.env`. Per-env values:

| Variable | Local | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | local Postgres (`postgresql://…@localhost:5432`) | Supabase Singapore pooler (6543) | Supabase Singapore pooler (6543) |
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
| Local | any | localhost:3000 | local Postgres | Demo mode (auth bypassed; DB still required) |
| Staging | `staging` | [preview](https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/) | Supabase Singapore (staging project) | Safe data |
| Production | `main` | talib.annisaasekolahku.com | Supabase Singapore (prod project) | Real users |

Vercel builds via [`scripts/vercel-build.sh`](./scripts/vercel-build.sh); `prisma migrate deploy` runs on `staging` + `main`. Preview branches use staging DB and skip migrate deploy. CI runs three required checks per PR: `Lint, Typecheck & Test` (incl. RLS + API-auth coverage guards), `Build`, `Playwright E2E`.

Reseed runbook: [`docs/runbooks/reseed-staging.md`](docs/runbooks/reseed-staging.md).

---

Private — An Nisaa' Sekolahku. How we work (workflow, safety, standards): see [CLAUDE.md](./CLAUDE.md).
