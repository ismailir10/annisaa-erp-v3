# Curriculum Schema + Admin CRUD (Pack 1 / Cycle 1 of 11)

## Context

First cycle of the July 2026 hard-cutover replacing 60+ weekly xlsx artifacts (PROMES, week plans, IKTP rosters, weekly assessment sheets) with a structured **Curriculum + Penilaian + Raport** stack. Design landed on staging via [PR #247](https://github.com/ismailir10/annisaa-erp-v3/pull/247) → [docs/superpowers/specs/2026-05-12-curriculum-penilaian-raport-design.md](../../docs/superpowers/specs/2026-05-12-curriculum-penilaian-raport-design.md). This cycle delivers the **foundational curriculum data model + admin authoring surface only** — Semester, Theme, SubTheme, Week. LearningObjective + AchievementIndicator + IndicatorThemeLink schemas are introduced **in-place** so later cycles (C2 PROMES import, C3 Objective/IKTP CRUD UI, C4 AssessmentEntry) can land without schema collisions. Outcome: SUPER_ADMIN can hand-author one full semester's Theme→SubTheme→Week skeleton end-to-end, unblocking C2's xlsx import target.

## Spec

**Acceptance criteria**

- [ ] Prisma adds 7 models (`Semester`, `Theme`, `SubTheme`, `Week`, `LearningObjective`, `AchievementIndicator`, `IndicatorThemeLink`) + 3 enums (`CurriculumElement`, `AgeGroup`, `AchievementLevel`)
- [ ] All new tables include `tenantId` (indexed), `createdAt`, `updatedAt`, and the soft-delete strategy chosen below
- [ ] Migration filename **does not** collide with `20260512000000_*` (admission-drop-registered already used today's `000000` slot — see 2026-04-24 ADR in README)
- [ ] `lib/permissions.ts` gains a `curriculum` group with `curriculum.read` + `curriculum.write`; system role defaults grant `curriculum.read` to TEACHER + SCHOOL_ADMIN, `curriculum.write` to SUPER_ADMIN only (SUPER_ADMIN escape hatch already covers everything; explicit listing keeps the audit trail honest)
- [ ] `config/admin-nav.ts` adds a "Kurikulum" entry (Indonesian label) gated by `curriculum.read`; the existing `config/__tests__/admin-nav.test.ts` is extended to cover it
- [ ] `GET /api/admin/curriculum/semesters` lists semesters paginated per `.claude/standards/api.md` (`take`/`select` mandatory)
- [ ] `POST /api/admin/curriculum/semesters` creates a Semester linked to an existing AcademicYear, Zod-validated, tenant-scoped, write-permission gated
- [ ] Theme / SubTheme / Week each get full CRUD under `/api/admin/curriculum/{themes,subthemes,weeks}` with PUT for update and `status` flip for soft-delete (Category A per `.claude/standards/crud.md`)
- [ ] Week date validation enforces `startDate < endDate`, no overlap with another active Week under the same parent SubTheme, and accepts dates expressed as Jakarta-tz Ymd via `getYmdInTimezone` (`lib/attendance/timezone.ts`)
- [ ] Admin UI `/admin/curriculum/semesters` — list (DataTable, status filter, action column) + create dialog selecting an existing AcademicYear and Semester number (1 or 2)
- [ ] Admin UI `/admin/curriculum/semesters/[id]/themes` — three nested CRUD surfaces (Theme list with create/edit dialogs, SubTheme list scoped to a selected Theme, Week list scoped to a selected SubTheme), each via Shadcn `<Dialog>` + Zod-backed form
- [ ] Seed (`prisma/seed.ts`) extension: idempotent example covering 1 AcademicYear → 1 Semester → 2 Themes → 4 SubThemes → 8 Weeks. Re-running the seed leaves row counts stable
- [ ] Unit tests (vitest) cover: validators (`startDate < endDate`, Jakarta-tz parsing, overlap detection), permission grants (`hasPermission` for each role × code), seed idempotency (snapshot row counts before/after a second run)
- [ ] Cycle doc Verification section cites the `design-system` reference (frontend-gate Rule 4 token present)
- [ ] Between-task gate `npm run build && npx vitest run` green on every task
- [ ] End-of-cycle gate `npm run build && npx vitest run && npx playwright test` green

**Non-goals (explicit)**

- LearningObjective / AchievementIndicator **CRUD UI** — schema only this cycle; CRUD UI is C3
- IndicatorThemeLink matrix UI — C3
- PROMES xlsx import pipeline (`lib/curriculum/promes-parser.ts`, `/admin/curriculum/semesters/[id]/import`) — C2
- AssessmentEntry model + write paths — C4 (AchievementLevel enum is declared here purely to reserve the name so C4 can't collide)
- Anything in `app/teacher/penilaian` or `app/teacher/raport` — Pack 1 cycles C5–C7 and Pack 2 (C8–C11)
- Term model + Raport models — Pack 2
- Retrofit of legacy `AssessmentTemplate` UI — out of scope (kept untouched as design doc §4.2 mandates)

**Assumptions** (correct these before `/build` proceeds)

1. **Soft-delete strategy = `status: ACTIVE | INACTIVE` not `deletedAt`.** The design doc §4 (line 163) says "Soft-delete via `deletedAt` per .claude/standards/crud.md" — but `crud.md` Category A actually mandates a `status` field with `ACTIVE` / `INACTIVE`, and **no** existing model in `prisma/schema.prisma` uses a `deletedAt` column. Following the established repo convention (status flip) over the design-doc footnote keeps list queries, DataTable filters, and `<DataTableRowActions onDeactivate>` working identically to every other Category A entity. **If you want true `deletedAt` semantics for curriculum specifically, say so now** — it would mean a one-off pattern divergence and a Prisma middleware to scope queries.
2. **Semester / Week dates stored as `DateTime` (UTC midnight of the Jakarta-tz day), not `String YYYY-MM-DD`.** Design doc §4.1 declares `DateTime`. Existing `AcademicYear.startDate` is `String` (YYYY-MM-DD) — but the newer journal/attendance code already favours real `DateTime` columns and `getYmdInTimezone()` for display. Going `DateTime` matches the design doc + makes overlap math trivial; it does mean Semester.start/end is not directly comparable to AcademicYear.start/end without a parse helper.
3. **Sidebar shape: a new top-level "Kurikulum" group, not a sub-item of "Akademik".** Design doc §5.1 lists Kurikulum as its own sidebar entry and the upcoming C3 / C4 / C5 work will add more children (Tujuan Pembelajaran, Indikator, Import PROMES, Raport). Putting it as its own group from C1 avoids re-shuffling the Akademik group two cycles from now.
4. **Permission-grant location.** Grants are added inside `lib/permissions.ts` `PERMISSION_GROUPS` and the legacy `SCHOOL_ADMIN` enumerator (so future HR additions don't silently re-grant). No DB seed change for permissions — they are computed at runtime from the constant.
5. **No `deletedAt`-style cascade.** Deactivating a Theme does **not** auto-deactivate its child SubThemes / Weeks — the admin sees a "X subtema, Y pekan terkait" warning in the deactivate confirm dialog and can either bulk-deactivate via the children's lists or keep them ACTIVE for re-attachment later. (Cascade is the wrong default — re-activating a Theme would have to remember which children were ACTIVE before, and that state isn't worth tracking for C1.)
6. **Migration prefix.** Today's `000000` slot is taken (`20260512000000_admission_drop_registered`). New migration filename: `20260512100000_add_curriculum_models` (per the 2026-04-24 ADR convention "avoid `YYYYMMDD000000` when one exists").
7. **Frontend gate.** `/admin/curriculum/semesters` and `/admin/curriculum/semesters/[id]/themes` cross-check `.claude/standards/design-system.html` §"DataTable", §"Dialog", §"Page header / Stat cards" before edit. Cycle doc Verification will record the literal `design-system` token to satisfy the pre-commit frontend gate.

## Tasks

Tasks are ordered. Dependency arrows (`→`) indicate hard ordering; **parallel** marks tasks safe to dispatch concurrently via subagents.

- [x] **T1 — Prisma models + enums + migration.** Add `Semester`, `Theme`, `SubTheme`, `Week`, `LearningObjective`, `AchievementIndicator`, `IndicatorThemeLink` models and `CurriculumElement`, `AgeGroup`, `AchievementLevel` enums to `prisma/schema.prisma`. All tenant-scoped (`tenantId` + `@@index([tenantId])`), all with `status String @default("ACTIVE")`, `createdAt`, `updatedAt`. Generate migration `prisma/migrations/20260512100000_add_curriculum_models/migration.sql` (prefix per Assumption 6). RLS-coverage script (`scripts/verify-rls-coverage.sh`) must still pass — add tenant SELECT policies for each new table. **Sub-check (C4 pre-flight):** confirm `TeachingAssignment.role = "HOMEROOM"` is the walas predicate C4's Pekanan UI will route on; record the finding in the Implementation bullet. If the existing string-role is insufficient, file a follow-up task — do NOT add `isHomeroom` here (out of scope, C4's decision). **Acceptance:** `npx prisma migrate dev` clean; `scripts/verify-rls-coverage.sh` exits 0. *(parallel with T2, T4)*

- [x] **T2 — Permission group + role defaults.** Extend `PERMISSION_GROUPS` in `lib/permissions.ts` with a `curriculum` group exposing `curriculum.read` ("Lihat kurikulum") and `curriculum.write` ("Kelola kurikulum"). Wire `curriculum.read` into the `SCHOOL_ADMIN` + `TEACHER` system-role defaults; `curriculum.write` stays SUPER_ADMIN-only (escape hatch already covers it — list explicitly for future role-clone audits). **Acceptance:** vitest unit asserts `hasPermission({role:"TEACHER",permissions:["curriculum.read"]}, "curriculum.read") === true` and `…"curriculum.write") === false`. *(parallel with T1, T4)*

- [x] **T4 — Zod validators with date + overlap rules.** Create `lib/validations/curriculum.ts` exporting `semesterCreate`, `semesterUpdate`, `themeCreate/Update`, `subThemeCreate/Update`, `weekCreate/Update` schemas. Week schema enforces `startDate < endDate`, both fields Jakarta-tz Ymd parsed via `getYmdInTimezone`. Add a pure helper `findWeekOverlap(existing, candidate)` that returns the conflicting row (if any) given a SubTheme's active Weeks — used by the API layer in T5. Vitest covers: same-day boundary, dates straddling a Saturday/Sunday, two-week overlap detection, single-day Week rejection. **Acceptance:** vitest green; no DB import in this file. *(parallel with T1, T2)*

- [x] **T3 — Seed extension.** Extend `prisma/seed.ts` with an idempotent Curriculum block: upsert 1 Semester under the existing demo AcademicYear, 2 Themes ("Saya Anak Sehat", "Lingkunganku"), 4 SubThemes, 8 Weeks (Mon–Fri pairs, Jakarta-tz). Use `upsert` keyed on the `@@unique` columns so a second run is a no-op. **Acceptance:** running `npm run db:seed` twice in a row leaves identical row counts (vitest snapshot or shell check); `lib/db.ts` import preserved (seed-drift hook). *Depends on T1.*

- [ ] **T5 — Admin API routes (CRUD).** Under `app/api/admin/curriculum/`:
  - `semesters/route.ts` — GET (paginated, `select` whitelist) + POST
  - `semesters/[id]/route.ts` — GET + PUT
  - `themes/route.ts` — POST; `themes/[id]/route.ts` — PUT + soft-delete via `PUT { status:"INACTIVE" }`
  - `subthemes/route.ts` — POST; `subthemes/[id]/route.ts` — PUT + soft-delete
  - `weeks/route.ts` — POST; `weeks/[id]/route.ts` — PUT + soft-delete
  **Verb policy (overrides design-doc §5.4):** single `PUT` endpoint per `[id]/route.ts` handles both field updates and `status` flip. NO `PATCH`, NO `DELETE` routes (design doc §5.4 used REST shorthand; repo convention is PUT-with-status). The Zod `*Update` schemas from T4 explicitly accept `{ status: "INACTIVE" | "ACTIVE" }` as a valid partial body. Each route: `getSession()` → `isAdminRole(role)` → `hasPermission(session, "curriculum.write")` for mutations / `…"curriculum.read"` for reads → `where: { tenantId: session.tenantId }` on every Prisma call → Zod validate → `rateLimit()` on writes → standard error envelope. Week POST/PUT invokes `findWeekOverlap` and returns 409 with `{ error, conflictingWeekId }` on conflict. **Audit logging:** every POST + PUT (including status flips) calls `recordAudit({ entity, action, before, after })` from `lib/audit.ts` — curriculum is admin master-data, matches the audit-log contract used by employee/salary/payroll mutations. **Acceptance:** vitest integration tests (one per route, demo-mode session) include an audit-row assertion on at least one POST and one deactivate; `scripts/verify-api-auth.sh` clean. *Depends on T1 + T2 + T4.*

- [ ] **T6 — Admin UI: Semester list + create.** `app/admin/curriculum/semesters/page.tsx` (server) + `client.tsx`. Page chrome: `PageHeader` (title "Kurikulum — Semester", count, "+ Tambah Semester"), three `StatCards` (Total semester aktif, Semester berjalan, Tema terdaftar), `DataTableToolbar` (search + status filter + AY filter), `DataTable` columns (AY, Nomor, Mulai, Selesai, Jumlah tema, Status, action). Create dialog: `<Dialog>` + Shadcn `<Field>` form, `Select` for AcademicYear (queried server-side), `RadioGroup` for Semester number (1/2), two `DatePicker` inputs. Reuse `<DataTableRowActions onView onEdit onDeactivate>`. View opens detail at `/admin/curriculum/semesters/[id]/themes`. Copy is Indonesian per `.claude/standards/voice.md`. Cross-check `.claude/standards/design-system.html` §DataTable + §Page header + §Dialog. **Acceptance:** manual smoke (Playwright not required for this task — covered in end-of-cycle gate); `npm run build` clean. *Depends on T5.*

- [ ] **T7 — Admin UI: Theme/SubTheme/Week CRUD.** `app/admin/curriculum/semesters/[id]/themes/page.tsx`. Layout: Back link to semester list, page header (Semester name + AY), three-pane `<Tabs>` ("Tema", "Subtema", "Pekan") OR a single page with three nested cards — pick whichever the design-system reference favours (likely nested cards with a selected-Theme breadcrumb). Each CRUD surface uses `<Dialog>` for create/edit and `<ConfirmDialog>` for deactivate. Week dialog: SubTheme `Select` + Mon date + Fri date; on submit, surfaces server-side overlap 409 with a `<Field.Description>`-style inline error. Cross-check `.claude/standards/design-system.html` §Dialog + §ConfirmDialog + §Tabs. **Acceptance:** Playwright spec `e2e/curriculum-admin.spec.ts` covers happy-path (create Theme → SubTheme → Week → assert visible) + overlap-conflict path. *Depends on T5 + T6.*

- [ ] **T8 — Sidebar entry "Kurikulum".** Add to `config/admin-nav.ts` a new top-level group `{ id:"kurikulum", label:"Kurikulum", icon: BookMarked, permission:"curriculum.read", items: [{ label:"Semester", href:"/admin/curriculum/semesters", icon:CalendarDays }] }`. Extend `config/__tests__/admin-nav.test.ts` to assert the group renders for `curriculum.read` holders and hides otherwise. **Acceptance:** vitest green; sidebar shows the entry for SUPER_ADMIN / SCHOOL_ADMIN / TEACHER in demo mode. *Depends on T2; safe to dispatch in parallel with T5 once T2 lands.*

**Dispatch waves** (for `/build` to use):
- Wave 1 (parallel subagents): T1, T2, T4
- Wave 2: T3 (after T1)
- Wave 3 (parallel): T5 (after T1 + T2 + T4), T8 (after T2)
- Wave 4: T6 (after T5)
- Wave 5: T7 (after T6) — includes end-of-cycle Playwright spec

## Implementation

- Subagent plan: T1/T2/T4 are file-disjoint and independent — driven inline in this session rather than dispatched as subagents (review/commit ownership simpler with one driver). T3 sequential after T1. T5/T8 parallel after their deps. T6→T7 sequential.
- Task 1: Prisma curriculum schema — `prisma/schema.prisma` (added 7 models: `Semester`, `Theme`, `SubTheme`, `Week`, `LearningObjective`, `AchievementIndicator`, `IndicatorThemeLink`; 3 enums: `CurriculumElement`, `AgeGroup`, `AchievementLevel`; Tenant back-relations; `AcademicYear.semesters` back-relation) + `prisma/migrations/20260512100000_add_curriculum_models/migration.sql` (CREATE TABLE + 5 unique constraints + 13 indexes + 13 FKs + 6 ENABLE RLS + 6 service-role policies). Migration prefix `100000` avoids 2026-04-24 `YYYYMMDD000000` collision ADR. Reviewer adds: `@@unique([tenantId, semesterId, name])` on Theme + `@@unique([tenantId, themeId, name])` on SubTheme to defeat duplicate-on-PROMES-reimport (covers C2 ingest path).
- Sub-check (C4 walas pre-flight): `TeachingAssignment.role = "HOMEROOM"` (schema L191) is the predicate C4's Pekanan UI will route on. String-role is sufficient — no `isHomeroom` boolean needed in C1. No follow-up filed.
- Two reviewer flags noted as design intent and not changed in this cycle: (a) `LearningObjective.semesterId onDelete: Cascade` — matches Theme/SubTheme/Week tree composition; objectives are per-semester per design doc §4.1 `@@unique([tenantId, semesterId, ageGroup, element, number])`. Admin UI uses soft-delete via `status`; hard DELETE is service-role only. (b) Design doc §4.1 line 163 footnote says "soft-delete via `deletedAt`" while crud.md mandates `status` — schema follows crud.md (repo convention; zero existing `deletedAt` columns). Design-doc footnote correction is a separate doc-fix cycle, not C1.
- Cross-task constraint for T5: API layer must enforce `indicator.tenantId === theme.tenantId` before inserting an `IndicatorThemeLink` row (junction has no tenantId column; parent-row check is the integrity guarantee). Recorded here so T5 cannot forget.
- Task 2: Permission group — `lib/permissions.ts` (added `curriculum` group with `curriculum.read` + `curriculum.write` codes; granted `curriculum.read` to SCHOOL_ADMIN + TEACHER defaults; `curriculum.write` stays on the SUPER_ADMIN escape-hatch path only) + `lib/__tests__/permissions.test.ts` (updated TEACHER exact-set assertion; added 4 new tests covering all role × code outcomes per §3.2 matrix).
- Task 4: Validators + overlap helper — `lib/validations/curriculum.ts` (semester/theme/subTheme/week create + update Zod schemas; `parseJakartaYmd` + `formatJakartaYmd` for UTC-midnight ↔ Jakarta-Ymd marshalling; `findWeekOverlap` with half-open semantics + fail-closed status check after reviewer flag) + `lib/validations/__tests__/curriculum.test.ts` (24 tests covering happy + edge + boundary). Reviewer caught: (a) `toYmd` was using Jakarta tz while the storage contract is UTC-midnight — switched to UTC for inverse symmetry; (b) status check was `!== "ACTIVE" && truthy` — flipped to strict `!== "ACTIVE"` so null/undefined fail closed.
- Task 3: Seed extension — `prisma/seed.ts` (added curriculum deleteMany block in children-first FK order; appended a curriculum content block creating 1 Semester `2025/2026 sem-1` → 2 Themes ("Saya Anak Sehat", "Lingkunganku") → 4 SubThemes → 8 Mon–Fri Weeks, all UTC-midnight). Idempotency via the wipe-and-rebuild pattern that the rest of the file uses; `lib/db.ts` staged unchanged per the pre-commit seed-drift rule.

## Verification

- Task 1: gates passed (`npm run build` clean, `npx vitest run` → 138 files, 1163 tests, 0 failures). `scripts/verify-rls-coverage.sh` → "31 / 31 tenant-scoped models have ENABLE + policy". `npx prisma format` + `npx prisma validate` clean. `npx prisma migrate diff --from-schema (HEAD) --to-schema (working)` produced the migration SQL deterministically (no hand-edited DDL).
- Task 2: gates passed (`npm run build` clean, `npx vitest run` → 138 files, 1168 tests, +5 from T1). `feature-dev:code-reviewer` confirmed design-doc §3.2 matrix exactly satisfied (read: TEACHER+SCHOOL_ADMIN+SUPER_ADMIN, write: SUPER_ADMIN escape hatch only, GUARDIAN excluded from both). No wildcard leak for `curriculum.write`.
- Task 4: gates passed (`npm run build` clean, `npx vitest run` → 139 files, 1192 tests, +24 from T2). Reviewer round 1 surfaced two latent issues (`toYmd` tz asymmetry, status check truthy gap); both fixed and re-tested green before commit.
- Task 3: gates passed (`npm run build` clean, `npx vitest run` → 1192 tests unchanged; seed isn't part of either gate but `npx tsc --noEmit -p tsconfig.json` clean). Reviewer confirmed FK delete order, half-open week math (Mon → Fri × 8 non-overlapping), tenantId on every row, idempotency via wipe-and-rebuild.

## Ship Notes
<!-- /ship fills this — Prisma migration name, RLS policy file, env var changes (none expected), seed re-run instructions, rollback plan -->
