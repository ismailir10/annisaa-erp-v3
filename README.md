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
| **students** | Student lifecycle: students (with auth-proxied photo upload via `lib/storage` adapter — files outside `public/`, MIME magic-byte validated, opaque storage tokens), guardians (full 13-field edit + detail page with list row-click nav), enrollments, admissions (admin CRM + public `/daftar` entry + sibling auto-detect on submit; **Kirim Formulir** invites the parent by email — or returns a copyable link to share via WhatsApp — to a tokenized, prefilled rich `EnrollmentApplication`, reviewed + status-worked at `/admin/enrollments`, then converted to a Student + both Parents — Cycle A), filtered data export (admin picks row criteria + columns → CSV via `GET /api/students/export`, formula-injection-guarded) |
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
| Public (applicant) | `/pendaftaran/[token]` | (none — tokenized) | Mobile-first vertical | Rich enrollment form reached via emailed token — 6-step wizard (anak → ayah → ibu → program → persetujuan + dual e-signature → tinjau), autosave + resume (Cycle A) |
| Admin (owner) | `/admin` | `SUPER_ADMIN` | Desktop sidebar | Everything incl. payroll, salary, bank |
| Admin (staff) | `/admin` | `SCHOOL_ADMIN` | Desktop sidebar | Students, admissions, academics, attendance, invoices, employees (no salary/payroll) |
| Teacher | `/teacher` | `TEACHER` | Mobile-first `max-w-md` | Own attendance + leave; assigned classes only |
| Parent | `/parent` | `GUARDIAN` | Mobile-first `max-w-md` | Own child only |

- **Parent** — home (greeting + Hijri date + per-kid card), invoices (Xendit), attendance week grid, reports, profile, Buku Penghubung (read school, edit home + notes).
- **Teacher** — check-in/out with optimistic card flip (tap → immediate UI update; network resolves in background; error reverts + inline message), today's class sessions on the dashboard linking to per-session roster pages (`/teacher/sessions/[id]` — cycle-tap status, Tap In / Tap Out timestamps, pickup relation + name capture), attendance calendar with month-prefetched (prev + next) records and prefetched leave balance & history (leave sheet opens with instant content on warm cache; cold-load shows skeleton), class attendance with skeleton-on-date-change (list freezes replaced by animated placeholder rows matching last-loaded student count while fetch resolves), Nilai Siswa (lazy-mounted assessments accordion — rubric DOM only mounted on expand, collapsed students contribute zero DOM; with live-announced pre-publish missing-score warning), Buku Penghubung (school scope), tappable salary slip rows → in-app detail (`/teacher/slips/[id]`) + portrait-fit A4 PDF download per row (single-column layout, no horizontal scroll at 414 px viewport) + missing-period placeholder (with empty-history fallback line) when prior month slip is not yet published, profile.
- **Admin** — dashboard (shadcn `ChartContainer` + `components/admin/dashboard/*` split; Pending Admissions row + Recent Activity feed via `AuditLog`; `Promise.allSettled` per-section degradation), employees, attendance (daily/monthly/LEAVE override), payroll (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT`), penilaian monitor (`/admin/penilaian` — read-only walas-weekly + sentra-daily `AssessmentEntry` completion via `GET /api/admin/penilaian`, gated by `assessments.read`), raport (`/admin/raport` — triwulan report card auto-drafted from penilaian, override + publish + PDF, gated by `reportCard.read`), kehadiran siswa (daily list + Rekap Bulanan tab with per-student monthly counts + CSV export), penerimaan (`/admin/payments` — date-range payments-received ledger + per-method summary + CSV export), siswa (`/admin/students` — list/CRUD + **Unduh Data** export dialog: row criteria + per-group column picker → filtered CSV), settings.

All four portals share the same brand chrome — An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label. Login screen carries the tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." (Bu Sari voice, see [`.claude/standards/voice.md`](./.claude/standards/voice.md)). Outbound emails (salary slips today; invoices via Xendit) use sender display `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` — Resend DKIM/SPF/DMARC verified for `annisaasekolahku.com`. Public legal pages live at `/legal/terms` and `/legal/privacy` (Indonesian PDP boilerplate, footer-linked from login).

---

## Architecture Decisions

Constraints actively shaping work in the last 60 days. Cells ≤ 2 sentences + cycle link; pre-commit rejects > 400 chars. Pre-2026 baseline + process-meta ADRs live in [`docs/adrs/archive.md`](docs/adrs/archive.md). Pre-May-2026 cycle docs live in [`docs/cycles/archive/`](docs/cycles/archive/) — see the 2026-05-03 tech-debt sweep cycle for archival rationale.

| Date | Decision | Why |
|---|---|---|
| 2026-06-23 | Enrollment Application (Cycle A, in flight): rich `EnrollmentApplication` model — 1:1 continuation of an `Admission` inquiry reached via an unguessable emailed token; bulk paper-form fields (student bio/health, Ayah+Ibu blocks, 16-clause consent + dual signature) live in JSON blobs, only query/gate/display fields are first-class columns | Digitizes the An Nisaa' paper admission form; thin `Admission`/`/daftar` stays the inquiry funnel; fee-gated acceptance deferred to Cycle B — see [cycle](docs/cycles/2026-06-23-enrollment-application.md) |
| 2026-06-05 | Single-active invariant: activating an `AcademicYear` (other ACTIVE→PLANNING) or `Semester` (in-year siblings→INACTIVE) demotes siblings in a transaction; year status allowlisted. `/admin/classes` resolves its default year by date-coverage, not API order. `playwright.config` refuses a non-local `DATABASE_URL` (E2E_ALLOW_REMOTE_DB=1 to override) | Multiple simultaneously-ACTIVE years/semesters made current-period unresolvable + Kelas defaulted to an empty E2E year; local e2e wrote to staging (DEMO_MODE switches only auth, not the DB) — UAT 2026-06-04 — see [cycle](docs/cycles/2026-06-05-staging-hygiene-active-year.md) |
| 2026-05-20 | Curriculum cutover prep: `ClassSection.ageGroup` enum column promoted from `deriveAgeGroup` name-heuristic; legacy assessment page gains tenant-scope; PROMES re-import becomes status-aware | Heuristic silently null'd for non-A/B class names → empty walas indicators + sentra cohort + perkembangan rollup; 3 RLS regressions in 6 weeks justify defense-in-depth scope — see [cycle](docs/cycles/2026-05-20-curriculum-cutover-prep.md) |
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

Vercel builds via [`scripts/vercel-build.sh`](./scripts/vercel-build.sh); `prisma migrate deploy` runs on `staging` + `main`. Preview branches use staging DB and skip migrate deploy. CI runs four required checks per PR: `Docs sync`, `Lint, Typecheck & Test` (incl. RLS + API-auth coverage guards), `Build`, `Playwright E2E`.

Reseed runbook: [`docs/runbooks/reseed-staging.md`](docs/runbooks/reseed-staging.md). Pilot cross-role manual test scenarios: [`docs/runbooks/pilot-cross-role-test-scenarios.md`](docs/runbooks/pilot-cross-role-test-scenarios.md).

---

Public source repo; school data and secrets stay private. How we work (workflow, safety, standards): see [CLAUDE.md](./CLAUDE.md).
