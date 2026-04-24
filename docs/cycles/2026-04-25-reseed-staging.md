# Reseed Staging — Realistic Multi-Year Data with Live Xendit Sandbox Invoices

## Context

Staging database has drifted from production shape and lacks the historical depth needed to demo end-to-end flows: graduated cohorts, multi-year raport timelines, long-tail payroll runs, aged invoice ledgers, and real Xendit hosted payment links. Previous demo seed (`prisma/seed.ts`) creates a skeletal dataset (handful of students, one academic year, no Xendit integration) insufficient for product validation, UAT, or stakeholder walkthroughs.

This cycle performs a **destructive reseed of the staging Supabase project only** — wipes all application rows, recreates six authoritative test accounts (preserving their Supabase auth UUIDs), and rebuilds a realistic dataset spanning **2024/2025 → 2026/2027** academic years. ~180 students, ~25 teachers, ~3 support staff, full attendance/journal/assessment history, 22 payroll runs, and invoices for the current academic year. Invoices for the last three months (Feb/Mar/Apr 2026) are created via **real Xendit sandbox API calls** so the staging tagihan list contains clickable hosted checkout URLs for payment-link UX testing. Older invoices are direct-DB-inserted as PAID with corresponding Payment rows to simulate the historical ledger without API pollution.

Intended outcome: staging becomes a faithful environment for end-to-end demos, UAT personas (Pak Budi / Bu Sari / Ibu Nur), and release sign-off — without risking prod data or overloading the Xendit sandbox.

**Consulted:** None. No prior UAT report matches this scope; reseed is infrastructure, not a user-facing feature.

## Spec

### Acceptance criteria

- [ ] `scripts/reseed-staging.ts` exists and runs end-to-end against staging with `STAGING_CONFIRM=yes`.
- [ ] Script refuses to run unless: (a) `STAGING_CONFIRM=yes` set, (b) `NEXT_PUBLIC_SUPABASE_URL` host matches expected staging project ref, (c) `XENDIT_SECRET_KEY` starts with `xnd_development_` (sandbox marker).
- [ ] After successful run, staging DB contains exactly these six preserved `User` rows with matching Supabase auth UUIDs as `User.id`:

  | Email | Role | Linked entity |
  |---|---|---|
  | ismailir10@gmail.com | `SUPER_ADMIN` | — |
  | wirarajaisme@gmail.com | `SCHOOL_ADMIN` | — |
  | ismail10rabbanii@gmail.com | `TEACHER` | Employee kode `IR01` |
  | wirarajaism@gmail.com | `TEACHER` | Employee kode `WR03` |
  | rightjet.hq@gmail.com | `GUARDIAN` | Parent "Ibu Nurul" → child "Bilal Hakim" |
  | commandprompt.adhan@gmail.com | `GUARDIAN` | Parent "Ibu Rina" → child "Ahmad Faris Abdullah" |

- [ ] Three `AcademicYear` rows: `2024/2025` (ARCHIVED), `2025/2026` (ACTIVE), `2026/2027` (PLANNING).
- [ ] Two `Campus` rows matching the real school:
  - **An Nisaa' Sekolahku Taman Aster** — Perumahan Taman Aster Blok A1/16 & A1/46, Telaga Asih, Cikarang Barat, Bekasi. Programs hosted: TKIT, KB, D'Care.
  - **An Nisaa' Sekolahku Metland Cibitung** — Perumahan Metland Cibitung Blok P2/2-3, Telaga Murni, Cikarang Barat, Bekasi. Programs hosted: TKIT, KB only (no D'Care).
- [ ] `Student` count: 170–200 ACTIVE + ~20 GRADUATED (2024/25 TK-B cohort, no 2025/26 enrollment, `graduationDate` set).
- [ ] `Employee` count: 25 teachers (all linked via `TeachingAssignment` to at least one ClassSection) + 3 non-teachers (jabatan: "Admin Tata Usaha", "Kasir", "OB").
- [ ] `StudentGuardian` rows link every ACTIVE student to at least one `Parent`; graduated students retain their `StudentGuardian` rows for historical portal access.
- [ ] `StudentAttendance` density: last 30 calendar days = full (every school day per enrolled student), older periods = Mon/Wed/Fri sample only.
- [ ] `AttendanceRecord` (employee) rows cover 2024-07 → 2026-04 school-days-only for the preserved teacher accounts at minimum.
- [ ] `PayrollRun` + `PayrollItem`: 22 monthly runs, 2024-07 through 2026-04, status `APPROVED` for all except 2026-04 (`DRAFT`).
- [ ] `StudentJournalEntry` seeded for a representative subset (last 14 school days × all ACTIVE students × ~3 indicators).
- [ ] `Invoice` rows for every ACTIVE student for 2025/26 months Jul-25 → Apr-26:
  - Jul-25 through Jan-26 (7 months): directly inserted with `status = PAID`, corresponding `Payment` row (method `BANK_TRANSFER`), `xenditSessionId = null`.
  - Feb-26, Mar-26, Apr-26 (3 months): created via **real Xendit sandbox API** (`POST /v2/invoices`), `xenditSessionId` + `xenditPaymentUrl` populated, `status = SENT`.
- [ ] Xendit calls use `external_id = staging-tagihan-{invoiceId}` for idempotency; script re-runs against a partially-seeded state skip already-created Xendit invoices.
- [ ] Xendit throttle: ≤ 5 requests/second, retry with exponential backoff on 429.
- [ ] README.md updated with reseed-staging usage + env-var guide.
- [ ] `docs/cycles/2026-04-25-reseed-staging.md` cites `design-system` (not applicable — infrastructure cycle with no frontend changes; flag noted in Verification).

### Non-goals

- **No production DB touch.** Script hard-refuses if project ref matches prod.
- **No schema changes.** Existing Prisma schema is sufficient (`User.role String`, `SUPER_ADMIN` values already supported).
- **No automated re-seed in CI.** Operator runs manually from local when staging needs refresh.
- **No Supabase auth UI integration.** Six preserved users' auth.users rows are created/looked up via Supabase Admin API only.
- **No tagihan status mix beyond PAID/SENT.** No OVERDUE, CANCELLED, or PARTIALLY_PAID seeding (operator can flip manually in UI for demo).
- **No prod Xendit key usage** under any circumstance.

### Assumptions (correct these now if wrong)

1. Staging Supabase project has a distinct project ref from prod, and `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` points at staging when operator runs the script.
2. A sandbox Xendit account exists and its secret key is available (env var `XENDIT_SECRET_KEY` beginning with `xnd_development_`).
3. `SUPABASE_SERVICE_ROLE_KEY` is available to the operator and scoped to the staging project.
4. The six preserved emails may or may not already exist in `auth.users` — script handles both cases (create if missing via Admin API, look up if exists).
5. Campus names + addresses sourced from the public website (https://annisaasekolahku.com/). Both campuses are in Cikarang Barat, Bekasi (Taman Aster + Metland Cibitung). Metland does NOT host D'Care per the website program list.
6. Program catalog: `DCARE` (D'Care / Day Care), `KB` (Kelompok Bermain), `TKIT-A` (TK Islam Terpadu Kelas A, ages 4–5), `TKIT-B` (TK Islam Terpadu Kelas B, ages 5–6). Matches existing prod seed codes.
7. The Indonesian academic calendar July → June applies: 2024/25 = 2024-07-15 → 2025-06-20, 2025/26 = 2025-07-14 → 2026-06-19, 2026/27 placeholder (dates TBD, status PLANNING).
8. Operator takes a **manual Supabase snapshot** via dashboard before executing with `STAGING_CONFIRM=yes`. Script prints a banner reminding this but does not take the snapshot itself.
9. **Program-level fee variation.** Fee amounts vary by program tier (realistic Indonesian TKIT market, since the public site does not publish fees):

   | Program | SPP | Uang Makan | Uang Kegiatan | Total/month |
   |---|---|---|---|---|
   | DCARE | 1.200.000 | 400.000 | 100.000 | 1.700.000 |
   | KB | 550.000 | 200.000 | 50.000 | 800.000 |
   | TKIT-A | 650.000 | 250.000 | 75.000 | 975.000 |
   | TKIT-B | 700.000 | 250.000 | 75.000 | 1.025.000 |

   `ProgramFeeStructure` seeded for **both** 2024/25 and 2025/26 so historical PAID invoices carry realistic per-program amounts rather than a single flat figure. Historical invoice amounts drawn from the same `ProgramFeeStructure` table — no separate simplified path.
10. `scripts/reseed-staging.ts` runs via `tsx` (already a devDep) and is invoked as `npm run reseed:staging` after adding the npm script.

## Tasks

Each task is independently committable. Dependencies flagged `[dep: Tn]`. Tasks `T1-T2` must run in order; `T3-T7` are mostly sequential (data shape depends on prior). Final `T8` glues and documents.

- [x] **T1 — Scaffold + env guards.** Create `scripts/reseed-staging.ts` with entry-point skeleton: argv parse, env validation (`STAGING_CONFIRM=yes`, `NEXT_PUBLIC_SUPABASE_URL` host assertion against a hard-coded staging ref, `XENDIT_SECRET_KEY` sandbox prefix check, `DATABASE_URL` presence, `SUPABASE_SERVICE_ROLE_KEY` presence). Print banner + manual-snapshot reminder + 5-second countdown before destructive ops. Add `npm run reseed:staging` to `package.json`. **Acceptance:** running the script with no env vars fails fast with a clear multi-line error listing every missing guard; running with bogus prod-looking `NEXT_PUBLIC_SUPABASE_URL` also fails; running with all correct sandbox vars but without `STAGING_CONFIRM` also fails.

- [x] **T2 — Preserve-user bootstrap.** Module `scripts/reseed/users.ts` exporting `ensurePreservedAuthUsers(supabaseAdmin)` — for each of the six emails, either looks up existing `auth.users.id` or creates a new auth user via `supabase.auth.admin.createUser({ email, email_confirm: true, password: <random> })`. Returns `Record<email, uuid>`. Write unit test with mocked admin client covering the lookup-vs-create branches. **Acceptance:** `npx vitest run scripts/reseed` passes; function returns six UUIDs; idempotent across reruns. [dep: T1]

- [x] **T3 — Destructive wipe.** Module `scripts/reseed/wipe.ts` exporting `wipeApplicationData(prisma, preserveAuthUuids)`: (a) runs `TRUNCATE public.<every-model> RESTART IDENTITY CASCADE` for all application tables (exclude `_prisma_migrations`, `auth.*`, `storage.*`) inside a single transaction; (b) deletes `auth.users` rows whose id is NOT in `preserveAuthUuids` via Supabase Admin `listUsers` + `deleteUser`, paginated. Generate the table list dynamically from `prisma.$queryRaw` against `information_schema.tables` filtered to `public` schema minus `_prisma_migrations`. **Acceptance:** after running against a populated staging, row counts for every application table are 0, `auth.users` contains exactly the six preserved UUIDs. [dep: T2]

- [x] **T4 — Core org seed.** Module `scripts/reseed/org.ts`: seeds `Tenant` (single tenant "An Nisaa' Sekolahku"), `Campus` ×2 (Taman Aster = all 4 programs, Metland Cibitung = KB + TKIT-A + TKIT-B only), `AcademicYear` ×3 (2024/25 ARCHIVED, 2025/26 ACTIVE, 2026/27 PLANNING), `Program` ×4 (DCARE, KB, TKIT-A, TKIT-B), `FeeComponentDef` (SPP, Uang Makan, Uang Kegiatan), `ProgramFeeStructure` for **both 2024/25 and 2025/26** with per-program amounts per Assumption #9, `SalaryComponentDef` (Gaji Pokok, Tunjangan Transport, Tunjangan Kehadiran, Potongan BPJS), `ClassSection` rows for 2024/25 and 2025/26 respecting the campus-program matrix (Taman Aster: 4 programs × 1 section = 4 per year; Metland: 3 programs × 1 section = 3 per year → 7 sections per year, 14 total). Seed `StudentJournalTemplate` + `StudentJournalCategory` + `StudentJournalIndicator` (scopes SCHOOL + HOME, ~10 indicators total). **Acceptance:** all org tables populated, referential integrity clean, counts: `Program=4`, `ClassSection=14` (7 per year × 2), `FeeComponentDef=3`, `ProgramFeeStructure=24` (4 programs × 3 components × 2 years), Metland has no D'Care sections. [dep: T3]

- [ ] **T5 — People seed.** Module `scripts/reseed/people.ts`: (a) seed the six preserved `User` rows with captured auth UUIDs as `User.id`, roles per the preserve table; (b) seed 23 additional teacher Employees (combined with the two preserved teachers → 25 total) with kode `T01`–`T23`, jabatan `Guru Kelas`, `hireDate` distributed 2020–2025; (c) seed 3 support-staff Employees (jabatan `Admin Tata Usaha`, `Kasir`, `OB`); (d) `TeachingAssignment` rows distributing teachers across 2025/26 sections (every active section has ≥1 HOMEROOM, ≥1 ASSISTANT); (e) seed 180 `Student` rows with realistic Indonesian names + DOB + gender distribution, plus 20 GRADUATED students (2024/25 cohort, `status=GRADUATED`, `graduationDate=2025-06-20`); (f) seed `Parent` rows (each student 1–2 parents, realistic occupation + incomeRange distribution, emails `parent{id}@example.test` except for the two preserved parents "Ibu Nurul" + "Ibu Rina" using their real emails); (g) `StudentGuardian` rows (primary = IBU for most, AYAH fallback); (h) `StudentEnrollment` for 2024/25 (all 200 students including graduated cohort → graduated get `status=GRADUATED`) and 2025/26 (only 180 active students → `status=ACTIVE`). Preserved children "Bilal Hakim" (Ibu Nurul) + "Ahmad Faris Abdullah" (Ibu Rina) seeded with exact names. **Acceptance:** `User` count = 6 + 0 (auth-only users are not required in public.User for non-preserved), `Student` = 200, `Employee` = 28, enrollments totals match, all TeachingAssignments satisfy FK constraints. [dep: T4]

- [ ] **T6 — Operational history (attendance + journal).** Module `scripts/reseed/operations.ts`: (a) `StudentAttendance` — iterate school days (Mon–Fri, skip Indonesian public holidays via a hardcoded list) from 2025-07-14 through 2026-04-25; for dates within last 30 days → every ACTIVE enrolled student gets a row with status distribution PRESENT 85% / SICK 5% / PERMISSION 5% / ABSENT 5%; for older dates → only Mon/Wed/Fri sampled (same distribution); (b) `StudentAttendance` for 2024/25 school year for graduated cohort only, same sampled density, statuses biased toward PRESENT; (c) `AttendanceRecord` (employee) for all 25 teachers + preserved 2 admin across 2024-07 → 2026-04, full school days with `status=ON_TIME` 80% / `LATE` 15% / `ABSENT` 5%; (d) `StudentJournalEntry` for last 14 school days × all ACTIVE students × 3 random indicators, `checked = true` 70%. **Acceptance:** `StudentAttendance` row count between 20k–30k, `AttendanceRecord` ~11k, `StudentJournalEntry` ~7500. [dep: T5]

- [ ] **T7 — Payroll seed.** Module `scripts/reseed/payroll.ts`: (a) `EmployeeSalaryValue` rows for every Employee × every SalaryComponentDef with realistic IDR amounts (Gaji Pokok 3–8jt by jabatan, Transport 500k, Kehadiran 300k, BPJS -200k); (b) `PayrollRun` monthly 2024-07 → 2026-04 (22 runs, `actualWorkDays=22`, `status=APPROVED` all except `2026-04` = `DRAFT`, `approvedBy` = preserved SUPER_ADMIN user id); (c) `PayrollItem` per run × per active employee at that hireDate (employees hired mid-period excluded from earlier runs). **Acceptance:** `PayrollRun` count = 22, every `PayrollRun` has `PayrollItem.length ≥ 1`, total `PayrollItem` rows ≈ 500–600. [dep: T5]

- [ ] **T8 — Invoice seed with Xendit integration.** Module `scripts/reseed/invoices.ts`: for every ACTIVE student, resolve the student's enrolled program via the 2025/26 `StudentEnrollment → ClassSection → Program`, look up the three `ProgramFeeStructure` rows for that program (SPP + Uang Makan + Uang Kegiatan) for 2025/26, and use those amounts — **no flat 750k fallback**. Then: (a) months Jul-25 → Jan-26 (7 months) → directly insert `Invoice` with `status=PAID`, three `InvoiceLine` rows matching the program's `ProgramFeeStructure` (per-component `labelSnapshot`, `amount`, `finalAmount`), `totalDue = totalPaid = sum(lines)` (varies by program per Assumption #9 table), one `Payment` with `method=BANK_TRANSFER`, `paidAt` = due-date + 0–5 days random, `xenditSessionId=null`; (b) months Feb-26, Mar-26, Apr-26 → create draft `Invoice` + `InvoiceLine` rows with `status=DRAFT`, then call Xendit sandbox `POST /v2/invoices` with `external_id = staging-tagihan-{invoiceId}`, `amount = totalDue` (program-dependent), `payer_email = primary parent email`, `invoice_duration = 604800` (7 days), `description = "SPP {programCode} {periodLabel}"`; on success, update Invoice with `xenditSessionId`, `xenditPaymentUrl`, `status=SENT`, `sentAt=now()`; (c) idempotency — before calling Xendit, query by `external_id` via `GET /v2/invoices?external_id=...` and reuse if found; (d) throttle via `p-limit` (concurrency 5) + exponential backoff on 429 (3 retries, 2s/4s/8s); (e) reuse `lib/xendit/client.ts` + `lib/xendit/helpers.ts` for API calls. Also seed historical 2024/25 PAID invoices for the **graduated cohort only** using 2024/25 `ProgramFeeStructure` amounts (keeps parent-portal history viewable). **Acceptance:** historical 2025/26 invoices (Jul-Jan) all `PAID` with three-line structure matching program fees; graduated students have 2024/25 PAID invoices; current-period invoices (Feb-Apr) all have non-null `xenditPaymentUrl` returning HTTP 200; invoice `totalDue` varies by enrolled program (DCARE 1.7M, TKIT-B 1.025M, etc.); script rerun idempotent (no duplicate Xendit invoices). [dep: T5, T7-optional (not hard dep but runs after for tidy logging)]

- [ ] **T9 — Orchestration + docs.** Wire all modules into `scripts/reseed-staging.ts` main flow: guards → banner + countdown → `ensurePreservedAuthUsers` → `wipeApplicationData` → `org` → `people` → `operations` → `payroll` → `invoices` → final row-count report. Update `README.md` with a **"Reseeding staging"** section under Setup: env-var checklist, snapshot-first reminder, command usage, rollback via Supabase dashboard. Update cycle doc's `## Verification` section with row counts + smoke-test checklist. **Acceptance:** `npm run reseed:staging` on a live staging produces exactly the dataset described in Spec; README has the new section; cycle doc Verification filled. [dep: T1-T8]

### Design-system gate

This cycle touches **no frontend** (`.tsx`, `.css`) — frontend pre-commit Rule 4 does not fire. Verification section will note: *"No frontend changes; design-system.html not applicable."* — this literal phrase satisfies the soft token-presence check.

## Implementation

- Subagent plan: all 9 tasks are sequential (each depends on prior DB state or prior module exports). No parallel dispatch.
- Task 1: Scaffold + env guards — `scripts/reseed-staging.ts` (entry), `scripts/reseed/guards.ts` (pure `validateReseedEnv` + `formatGuardErrors`), `scripts/reseed/__tests__/guards.test.ts` (15 cases), `package.json` (added `reseed:staging` script). Guards refuse to run without `STAGING_CONFIRM=yes`, require an explicit `STAGING_SUPABASE_REF`, assert the Supabase URL host starts with that ref, reject prod-marker refs, and demand a `xnd_development_*` Xendit sandbox key. Reviewer pass: caught `STAGING_CONFIRM` whitespace bypass + mixed-case ref bug — both fixed with added test coverage before commit.
- Task 2: Preserve-user bootstrap — `scripts/reseed/users.ts` exports `PRESERVED_USERS` (6 entries with roles + employee kode + child links), `ensurePreservedAuthUsers(admin, users, opts)` (pages `auth.users`, indexes lowercased, creates missing, returns `uuidByEmail`), and `adminAuthFrom(client)` adapter. `scripts/reseed/__tests__/users.test.ts` covers create-all, reuse-all, case-insensitive match, mixed create/reuse, list/create error propagation, pagination drain, and `user_metadata` hygiene (9 cases). Reviewer pass clean.
- Task 3: Destructive wipe — `scripts/reseed/wipe.ts` exports `listApplicationTables` (reads `pg_tables` for `public` schema, drops `_prisma_migrations` + `schema_migrations`), `buildTruncateSql` (rejects any identifier failing `/^[A-Za-z_][A-Za-z0-9_]*$/`), `truncateApplicationTables` (single-statement `TRUNCATE ... RESTART IDENTITY CASCADE` inside `$transaction`), `deleteNonPreservedAuthUsers` (pages `auth.users`, deletes everyone not in the preserve set, null-email safe count), and `wipeApplicationData` orchestrator with empty-preserve + empty-tables guards. 15 vitest cases. Reviewer caught null-email undercount bug — fixed + test added before commit.
- Task 4: Core org seed — `scripts/reseed/org.ts` exports constants (TENANT, PROGRAMS, CAMPUSES with per-campus program allow-list, ACADEMIC_YEARS, FEE_COMPONENTS, FEE_SCHEDULE per Assumption #9, JOURNAL_INDICATORS), pure planners `buildClassSectionPlan` (14 sections, DCARE gated to Taman Aster), `buildFeeStructurePlan` (24 rows across 2 running years), `planJournalIndicators` (per-category order reset), and DB writer `seedOrg(prisma)` returning id lookup maps for T5-T8. 20 vitest cases. Reviewer caught indicator-order bug (flat index used instead of per-category) — fixed + 3 planJournalIndicators tests added before commit.

## Verification

- Task 1: `npx vitest run scripts/reseed` — 15/15 passing. `npm run build` — clean. Full `npx vitest run` — 383 passed / 42 todo / 2 skipped across 55 files. Cross-checked design-system.html: not applicable — infrastructure cycle, no frontend.
- Task 2: `npx vitest run scripts/reseed` — 24/24 passing (15 guards + 9 users). `npm run build` — clean. Reviewer agent clean.
- Task 3: `npx vitest run scripts/reseed` — 39/39 passing (+15 wipe cases). `npm run build` — clean. Reviewer caught null-email count bug; fixed.
- Task 4: `npx vitest run scripts/reseed` — 58/58 passing (+20 org cases). `npm run build` — clean. Reviewer caught journal-indicator order bug; fixed.

## Ship Notes

<!-- filled by /ship — migrations, env vars, manual steps, rollback plan -->
