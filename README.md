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
| Payment | Pluggable `PaymentGateway` port ([`lib/payments/`](lib/payments/)) — DOKU Checkout (Virtual Account) and Xendit Checkout Session, selected by `PAYMENT_GATEWAY` |
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
| **academic** | School structure: academic year (with one-click roll-forward), programs, classes (consolidated per-year management surface at `/admin/classes` with roster + teacher + health snapshot + sessions calendar; `ClassTrack` lineage stays as silent plumbing — find-or-created on POST), daily class sessions (per-class calendar + substitute-teacher swap), teaching assignments, bulk class promotion ("Naik Kelas Massal" dialog on `/admin/classes` wiring `GET/POST /api/promotions` — roster preview, exclude list, capacity hint). Class names are campus-free (`TK B 3`, not `TK B Metland 3`) and unique per `(tenant, tahun ajaran, kampus, nama)`; kampus shows as its own column and badge. Enroll/promote pickers are searchable, offer only ACTIVE/PLANNING years, and group by kampus; enroll, promote and bulk promote reject an archived-year target server-side |
| **students** | Student lifecycle: students (with auth-proxied photo upload via `lib/storage` adapter — files outside `public/`, MIME magic-byte validated, opaque storage tokens), guardians (full 13-field edit + detail page with list row-click nav), enrollments, admissions (admin CRM + public `/daftar` entry + sibling auto-detect on submit; **Kirim Formulir** invites the parent by email — or returns a copyable link to share via WhatsApp — to a tokenized, prefilled rich `EnrollmentApplication`, reviewed + status-worked at `/admin/enrollments`, then converted to a Student + both Parents — Cycle A), filtered data export (admin picks row criteria + columns → CSV via `GET /api/students/export`, formula-injection-guarded) |
| **finance** | Fees & payments: invoice state machine, hosted checkout via the `PaymentGateway` port (`lib/payments/` — DOKU Virtual Account or Xendit, selected by `PAYMENT_GATEWAY`; notifications land on `POST /api/doku/webhook` / `/api/xendit/webhook` and share one durable two-phase processor; admins can also reconcile on demand via "Perbarui pembayaran" on the invoice detail page → `POST /api/invoices/[id]/refresh-payment`, which polls the gateway's status endpoint and replays the *same* processor — the fallback when a notification never arrives), manual + bulk generate, kuitansi PDF, payments-received ledger (`/admin/payments` — date-range cash recap + per-method summary + CSV via `GET /api/payments/{,export}`) |
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

- **Parent** — home (greeting + Hijri date + per-kid card), invoices (hosted checkout via the `PaymentGateway` port), attendance week grid, reports, profile, Buku Penghubung (read school, edit home + notes).
- **Teacher** — check-in/out with optimistic card flip (tap → immediate UI update; network resolves in background; error reverts + inline message), today's class sessions on the dashboard linking to per-session roster pages (`/teacher/sessions/[id]` — cycle-tap status, Tap In / Tap Out timestamps, pickup relation + name capture), attendance calendar with month-prefetched (prev + next) records and prefetched leave balance & history (leave sheet opens with instant content on warm cache; cold-load shows skeleton), class attendance with skeleton-on-date-change (list freezes replaced by animated placeholder rows matching last-loaded student count while fetch resolves), Nilai Siswa (lazy-mounted assessments accordion — rubric DOM only mounted on expand, collapsed students contribute zero DOM; with live-announced pre-publish missing-score warning), Buku Penghubung (school scope), tappable salary slip rows → in-app detail (`/teacher/slips/[id]`) + portrait-fit A4 PDF download per row (single-column layout, no horizontal scroll at 414 px viewport) + missing-period placeholder (with empty-history fallback line) when prior month slip is not yet published, profile.
- **Admin** — dashboard (shadcn `ChartContainer` + `components/admin/dashboard/*` split; Pending Admissions row + Recent Activity feed via `AuditLog`; `Promise.allSettled` per-section degradation), employees, attendance (daily/monthly/LEAVE override), payroll (`DRAFT → APPROVED → EXPORTED → SLIPS_SENT`), penilaian monitor (`/admin/penilaian` — read-only walas-weekly + sentra-daily `AssessmentEntry` completion via `GET /api/admin/penilaian`, gated by `assessments.read`), raport (`/admin/raport` — triwulan report card auto-drafted from penilaian, override + publish + PDF, gated by `reportCard.read`), kehadiran siswa (daily list + Rekap Bulanan tab with per-student monthly counts + CSV export), penerimaan (`/admin/payments` — date-range payments-received ledger + per-method summary + CSV export), siswa (`/admin/students` — list/CRUD + **Unduh Data** export dialog: row criteria + per-group column picker → filtered CSV), settings.

All four portals share the same brand chrome — An Nisaa' logo + "Talib" wordmark + "by An Nisaa' Sekolahku" sub-label. Login screen carries the tagline "Sahabat belajar anak — kehadiran, jurnal, tagihan dalam satu pintu." (Bu Sari voice, see [`.claude/standards/voice.md`](./.claude/standards/voice.md)). Outbound emails (salary slips today; invoices via the active payment gateway) use sender display `RESEND_FROM_EMAIL="Talib by An Nisaa' <noreply@annisaasekolahku.com>"` — Resend DKIM/SPF/DMARC verified for `annisaasekolahku.com`. Public legal pages live at `/legal/terms` and `/legal/privacy` (Indonesian PDP boilerplate, footer-linked from login).

---

## Architecture Decisions

Constraints actively shaping work in the last 60 days. Cells ≤ 2 sentences + cycle link; pre-commit rejects > 400 chars. Pre-2026 baseline + process-meta ADRs live in [`docs/adrs/archive.md`](docs/adrs/archive.md). Pre-May-2026 cycle docs live in [`docs/cycles/archive/`](docs/cycles/archive/) — see the 2026-05-03 tech-debt sweep cycle for archival rationale.

| Date | Decision | Why |
|---|---|---|
| 2026-07-29 | Class pickers scope by `AcademicYear.status`, not `ClassSection.status`: `GET /api/class-sections` takes an opt-in `yearStatus` allowlist, write-path pickers request `ACTIVE,PLANNING`, and enroll / promote / bulk-promote reject an archived-year target server-side with 403 `YEAR_ARCHIVED` | Every prod class row is `status: ACTIVE` regardless of year, so the picker listed all 53 sections across 5 years when only 16 were valid targets; a client-side year selector is not an enforcement boundary — pilot feedback 2026-07-29 — see [cycle](docs/cycles/2026-07-29-class-picker-year-scoping.md) |
| 2026-07-28 | Manual payment reconciliation ("Perbarui pembayaran") polls the gateway and replays `processPaymentEvent` rather than owning its own transitions; the poll is added to the `PaymentGateway` port as `fetchPaymentStatus`, and the synthesized `eventId` is `manual:<provider>:<invoiceId>:<state>[:<paymentId>]` | Manual fallback and webhook must never drift, so there can only be one crediting implementation; a deterministic (un-hashed) eventId makes repeat clicks dedup at the existing `WebhookEvent` unique index instead of needing new locking — see [cycle](docs/cycles/2026-07-28-manual-payment-refresh.md) |
| 2026-07-27 | Payment gateway becomes a port: `PaymentGateway` interface in `lib/payments/`, with DOKU Checkout (Virtual Account only) and Xendit as adapters selected by `PAYMENT_GATEWAY`. DB columns keep their `xendit*` names this cycle — recorded debt, renamed when the Xendit adapter is deleted | Pilot moves to DOKU with zero settled payments in prod, so rollback is an env flip rather than a code revert; VA is webhook-completed (parents pay hours later at an ATM), so the notification is the only reliable signal — see [cycle](docs/cycles/2026-07-27-doku-payment-gateway.md) |
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
| `PAYMENT_GATEWAY` (`xendit` \| `doku`; unset → `xendit`) | — | `doku` | `doku` |
| `DOKU_CLIENT_ID` / `DOKU_SECRET_KEY` / `DOKU_ENV` | — | Sandbox, `DOKU_ENV=sandbox`⁴ | Production, `DOKU_ENV=production` |
| `DOKU_CHECKOUT_VERSION` (`v1` \| `v2`; unset → `v1`) | — | `v1` until v2 is proven⁵ | `v1` until v2 is proven⁵ |
| `NEXT_PUBLIC_APP_URL` | — | Staging Vercel preview URL² | `https://talib.annisaasekolahku.com`² |
| `CRON_SECRET` | — | `openssl rand -hex 32` | `openssl rand -hex 32` |

¹ **`DIRECT_URL` mandatory on Vercel.** `build` runs `prisma migrate deploy`, which needs port 5432 — pooler 6543 (PgBouncer transaction mode) doesn't support advisory locks.
² **`NEXT_PUBLIC_APP_URL` per-env, throws if missing.** Origin for payment-gateway return URLs when no request scope (reseed/cron). No silent prod fallback.
³ **Gateway health:** `GET /api/health/payments` reports the active gateway (`/api/health/xendit` kept as an alias for existing monitors). Tier comes from the `XENDIT_SECRET_KEY` prefix for Xendit and from `DOKU_ENV` for DOKU, whose keys do not encode tier. Under DOKU the notification is the only reliable completion signal — Virtual Account payments land hours later at an ATM — so each session sends its own origin as `additional_info.override_notification_url` (`<origin>/api/doku/webhook`), and the same URL should *also* be registered per channel in DOKU Back Office (Settings → Payment Settings → Virtual Account → *[channel]* Configure) as the fallback if the override is ever ignored. The request sends **no `payment_method_types`**, so DOKU Checkout offers whatever channels are active on the merchant account: naming an inactive channel rejects the entire session with `PAYMENT CHANNEL IS INACTIVE` (confirmed by DOKU support, 2026-07-30), and production has neither BCA nor Mandiri active, so a hardcoded list would have produced zero payment links. **Consequence: the Virtual-Account-only rule is now enforced in DOKU Back Office, not in code** — activating a card, QRIS, e-wallet or paylater channel on either account puts it in front of parents and costs the school card MDR. Audit Settings → Payment Settings on both brands before each billing run.

**Do not rely on the notification alone.** An audit on 2026-07-29 found that *no* DOKU notification has ever verified — every DOKU payment to date was credited by an admin pressing "Perbarui pembayaran", while the Xendit webhook has real deliveries. A daily cron, `POST /api/cron/reconcile-payments` (00:30 UTC, deliberately *before* `finance-maintenance` at 01:00 so a paid invoice is not then promoted to OVERDUE), therefore polls the gateway for every outstanding invoice that has a payment link and credits anything that settled, routing through the same processor as the webhook (so it is idempotent and cannot double-credit). It is the safety net, not a replacement: a delivered notification still credits immediately and the sweep then no-ops. Hourly would be better, but **Vercel's Hobby plan allows cron jobs only once per day, max two per project** — a deployment carrying `0 * * * *` is rejected outright. Until the plan changes, "Perbarui pembayaran" on the invoice detail page is how an admin credits a payment immediately.

⁴ **Testing a payment end to end.** A sandbox Virtual Account has no real bank behind it, so nothing ever settles on its own — you must fire the payment yourself from **[DOKU's sandbox simulator](https://sandbox.doku.com/integration/simulator/)**. Paste the VA number from the checkout page, submit, and DOKU sends a real `SUCCESS` notification to `/api/doku/webhook`, which is what moves the invoice to `PAID`. Without the simulator a sandbox invoice sits at `SENT` forever and it looks like a bug.

Two places to watch while testing: Back Office → Settings → Notification → **HTTP Notifications → Notifikasi** lists every delivery attempt with its endpoint URL, transaction status and delivery status; and the app logs `[DOKU WEBHOOK] inbound { hasSignature, bodyBytes, … }` for **every** inbound request before any rejection, then `[DOKU WEBHOOK] signature verified { target: … }` on each accepted one. The first line is what distinguishes "DOKU never sent it" from "DOKU sent it and we rejected it" — a rejected notification writes no `WebhookEvent` row, so the database alone cannot tell them apart. `DEMO_MODE=true` short-circuits session creation and returns a synthetic URL, so the simulator does not apply under it; it is set only in CI, not on Vercel preview deploys, which talk to the real DOKU sandbox.

⁵ **`DOKU_CHECKOUT_VERSION` — an open experiment, not a tuning knob.** DOKU support stated (2026-07-30) that `additional_info.override_notification_url` "is supported for the API V2 Checkout". Their docs publish only `POST /checkout/v1/payment`, but `/checkout/v2/payment` is real: as of 2026-07-31 it **accepts our exact production body and returns a working checkout link**, verified against the sandbox. It answers a *different envelope* — flat (no `response` wrapper), `token` rather than `token_id`, `message` a string rather than an array, no expiry field, and links on `sandbox.doku.com/checkout/link/…` rather than `staging.doku.com/checkout-link-v2/…`. The adapter reads both shapes and both live captures are replayed as regression tests. **But it does not notify either.** A v2 session carrying `override_notification_url`, settled through the sandbox simulator (BCA VA, `PROBE-V2-1785465169298`), produced **zero** inbound requests at that URL — while DOKU's own status endpoint reports the payment `SUCCESS` *and echoes the override URL back*. So DOKU recorded the settlement, retained the destination, and dispatched nothing; the webhook's unconditional arrival log rules out a signature rejection. The flag therefore stays `v1`, the daily reconcile sweep stays the mechanism that credits DOKU payments, and the open item is a DOKU support escalation for their server-side dispatch log. Run the probe against the sandbox first, and flip the flag only after a notification is observed arriving.

Prefer **`POST /api/doku/probe`** (bearer `CRON_SECRET`, body `{"version":"v2"}`) — `DOKU_CLIENT_ID` and `DOKU_SECRET_KEY` are marked *Sensitive* in Vercel, so `vercel env pull` returns them empty and no local run is possible without copying a live secret onto a laptop. The route creates the session from inside the deployment via the same `createDokuSession` real parents use, writes nothing to the database, and refuses under `DOKU_ENV=production` or `DEMO_MODE`. `scripts/doku-probe-checkout.mjs --version v2` does the same experiment locally for anyone holding the credentials out-of-band (`--notify <bin-url>`, `--channels` to opt back into `payment_method_types`). Delete the route once notifications are confirmed working. Full procedure: [`docs/cycles/2026-07-30-doku-checkout-v2-notification.md`](docs/cycles/2026-07-30-doku-checkout-v2-notification.md), [`docs/cycles/2026-07-31-doku-v2-probe.md`](docs/cycles/2026-07-31-doku-v2-probe.md).

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
