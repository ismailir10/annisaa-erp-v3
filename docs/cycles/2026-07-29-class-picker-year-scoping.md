# Class Picker Year-Scoping + Campus-Free Class Naming

## Context

Pilot feedback from Bu Shanti (2026-07-29, admin/TU): the "Daftarkan ke Kelas" dropdown on the student detail page is "banyak sekali (A4)" and she cannot tell which options belong to TA 2026/2027, because sibling years carry the same class names with similar student counts. She tied this directly to an operational risk — when a new student arrives mid-year or from the next SPMB intake and must be enrolled, picking from that wall is error-prone. Her suggested remedy: shorten class names by dropping the campus token (kampus is already a separate field and is displayed) and disambiguate by Tahun Ajaran instead.

Investigation confirms the complaint and finds the cause is not the naming — it is missing year scoping, plus a real correctness hole underneath:

1. **No year filter.** All four admin class pickers call `GET /api/class-sections` with no query params. The route only filters when `programId`/`academicYearId` are supplied, so it returns every section across every year. Prod today: **53 sections across 5 academic years** (2022/2023 → 2026/2027); only **16** belong to the ACTIVE year TA 2026/2027. `ClassSection.status` is `ACTIVE` on all 53 rows, so status cannot be used to hide historical classes — academic-year status is the only correct signal.
2. **The label spends its width on noise.** `app/admin/students/[id]/page.tsx` renders `` `${s.name} — ${s.program.name} (${n}/${cap})` ``. Program name is redundant (the class name already carries the KB / TK A / TK B / TD level) and the academic year — the one field that disambiguates — is dropped even though the API already returns `academicYear.name`.
3. **No academic-year guard on write.** `POST /api/students/[id]/enroll` and `POST /api/students/[id]/promote` validate tenant, age, capacity and duplicate-enrollment, but neither checks that the target section's academic year is writable. A single misclick in that 53-row list silently enrols a 2027 intake into an ARCHIVED 2022/2023 class. `lib/classes/year-guard.ts` already exports `ensureYearWritableById` and is used by the admin classes route — the student routes never adopted it.

One of Bu Shanti's observations is a false alarm worth reporting back: **"TK B Metland 1, Metland 2 yang sebetulnya tidak ada kelasnya"** — both rows exist only in TA **2025/2026** with 6 enrolled students each. They are correct historical records, not phantom rows, and they disappear the moment year scoping is applied. No roster cleanup is required.

Intended outcome: the write-path pickers offer only writable years (53 → 16 options), are searchable, and label every option with its Tahun Ajaran; the server refuses archived-year enrolments regardless of what the UI sends; and class names drop the campus token permanently, with kampus surfaced as its own visual element on admin surfaces.

## Spec

### Acceptance criteria

**Server correctness (highest value — ship even if the rest slips)**
- [ ] `POST /api/students/[id]/enroll` rejects a `classSectionId` whose academic year is `ARCHIVED`, reusing `ensureYearWritableById` from `lib/classes/year-guard.ts` — no new guard logic. Keeps that helper's existing contract (**403** + `code: "YEAR_ARCHIVED"`), with the message adapted to the enrolment context via an optional action label.
- [ ] `POST /api/students/[id]/promote` applies the same guard to `targetClassSectionId`.
- [ ] `POST /api/promotions` (bulk promote) applies the same guard to `targetClassSectionId`. **Added mid-build** — the code-review pass found the identical hole at roster scale. The original non-goal excluded the bulk-promote *dialog's year selector*; that selector is client-side convenience, not an enforcement boundary, so a direct API call graduates and re-enrols an entire roster into an archived year.
- [ ] Vitest covers both: archived-year target → 403 `YEAR_ARCHIVED`; active-year target → success path reached.

**Picker scoping + labels**
- [ ] `GET /api/class-sections` accepts a `yearStatus` query param (comma-separated subset of `PLANNING|ACTIVE|ARCHIVED`). Omitted → current behaviour (all years), so existing callers are unaffected.
- [ ] Response includes `academicYear.{id,name,status}` for every section.
- [ ] Enroll and Promote dialogs on `app/admin/students/[id]/page.tsx` request `yearStatus=ACTIVE,PLANNING`.
- [ ] A single shared helper formats every class option label as `` `<nama> · TA <tahun> · <terisi>/<kapasitas>` `` — program name removed. All class pickers use the helper; no dialog builds the string inline.
- [ ] Enroll and Promote pickers are searchable (typing `B 3` narrows to matching classes) rather than a plain scrolling `Select`.
- [ ] Read/filter surfaces that legitimately need history — `app/admin/student-attendance/page.tsx` and `components/admin/student-export-dialog.tsx` — keep all years but group options by Tahun Ajaran, ACTIVE year group first.

**Class naming (Tier 2, option B)**
- [ ] `ClassSection` unique key changes from `[tenantId, academicYearId, name]` to `[tenantId, academicYearId, campusId, name]`, so two campuses may independently use the same class number within one year.
- [ ] A data migration strips the campus token from `ClassSection.name` and `ClassTrack.name` (`TK B Metland 3` → `TK B 3`, `Daycare Metland (2-6 th)` → `Daycare (2-6 th)`). The migration is idempotent and aborts without writing if its pre-flight collision check finds any duplicate under the new unique key.
- [ ] The 409 duplicate-name copy in `app/api/admin/classes/route.ts` is updated to say the conflict is per-year **and per-kampus**.
- [ ] Kampus is rendered as its own element (badge) beside the class name on admin class surfaces where it was previously only implied by the name.
- [ ] `prisma/seed.ts` and `scripts/import-roster/build-import-sql.ts` produce campus-free class names, so a reseed or a re-import does not reintroduce the token.

### Non-goals

- Dropping the level prefix entirely (Bu Shanti's literal example was `B1 TA 2026/2027`; this cycle produces `TK B 1 · TA 2026/2027`). Keeping `TK B` is deliberate: the program-name half of the label is being removed, so the level must survive somewhere.
- Reconciling the TA 2026/2027 daycare naming drift (`Daycare Aster` / `Daycare Metland (2-6 th)` vs. the earlier `TD Aster 1` convention). The campus strip touches these names but the TD-vs-Daycare convention question is deferred.
- Teacher and parent portal class labels beyond what the shared helper changes. Teacher pickers are already scoped by teaching assignment and are not part of the complaint.
- Any change to `ClassSection.status`, the historical-roster visibility rules, or the bulk-promote dialog's client-side year selector UI. (The bulk-promote *server* guard was pulled into scope during build — see Spec.)
- Deleting or deactivating historical class rows. They are correct data.

### Assumptions

1. **Campus numbering is not globally reserved.** Today Aster uses 1–2 and Metland 3–5 by convention, which is why nothing collides. Adding `campusId` to the unique key makes the convention optional rather than load-bearing; the school may reuse numbers per campus afterwards. Verified against prod: the strip produces **zero** collisions across all 53 rows under the new key.
2. **`PLANNING` years belong in the enroll picker.** A next-year intake should be enrollable before that year flips to ACTIVE. If TU should only ever enrol into the ACTIVE year, the filter narrows to `ACTIVE` only.
3. **Kampus stays visible on admin surfaces, not teacher ones.** Per Bu Shanti, Bu Guru already know their location without the token.
4. The rename applies to **all** years including archived ones, so historical and current names stay consistent. Report headers and class detail pages will show the new names for past years too.

## Tasks

1. [x] **Year guard on enroll + promote.** Add `ensureYearWritableById` to `app/api/students/[id]/enroll/route.ts` and `app/api/students/[id]/promote/route.ts`, after the tenant-scoped section lookup and before the capacity transaction. *Accept:* vitest asserts 403 `YEAR_ARCHIVED` for an ARCHIVED target and no rejection for an ACTIVE target, in both routes.
2. [x] **`yearStatus` filter on `/api/class-sections`.** Add the query param, include `academicYear.{id,name,status}` in the response, leave the no-param behaviour unchanged. *Accept:* vitest asserts `yearStatus=ACTIVE,PLANNING` excludes ARCHIVED sections and that omitting it returns all. Depends on nothing.
3. [x] **Shared class-label helper.** Add `formatClassOptionLabel` to `lib/format.ts` producing `` `<nama> · TA <tahun> · <n>/<cap>` ``. *Accept:* unit test covers a full class and a zero-enrolment class. Depends on nothing.
4. [ ] **Enroll + Promote pickers: scope, label, search.** Wire `yearStatus=ACTIVE,PLANNING` into both `openEnrollDialog` and `openPromoteDialog` fetches, swap the inline label strings for the helper, and replace the `Select` with the searchable combobox pattern from `.claude/standards/ui.md`. Cross-check `design-system` for the combobox + option-row treatment. *Accept:* dialog lists only writable-year classes, each labelled with TA, and typing filters the list. Depends on 2 + 3.
5. [ ] **Group history-bearing pickers by year.** `app/admin/student-attendance/page.tsx` and `components/admin/student-export-dialog.tsx` keep all years but render `SelectGroup` per Tahun Ajaran, ACTIVE first, using the helper for option text. *Accept:* both surfaces show grouped headings and still return archived classes. Depends on 3.
6. [ ] **Unique-key migration.** Prisma migration moving `ClassSection` `@@unique` to `[tenantId, academicYearId, campusId, name]`; update the 409 copy in `app/api/admin/classes/route.ts` to mention kampus. *Accept:* `npx prisma migrate dev` applies cleanly against a seeded DB; creating same-name classes at two campuses in one year succeeds; same campus + same name + same year still 409s. Depends on nothing (must land before task 7).
7. [ ] **Campus-token strip migration.** Idempotent data migration over `ClassSection.name` and `ClassTrack.name`, driven by each row's own campus (`Taman Aster` → `Aster`, `Metland Cibitung` → `Metland`). Pre-flight query asserts zero post-rename duplicates under both unique keys and aborts the transaction if any are found. *Accept:* dry-run output lists the 53 prod renames and reports zero collisions; applying twice is a no-op the second time. Depends on 6.
8. [ ] **Kampus badge + generator naming.** Add the kampus badge beside the class name on the admin classes list and class detail header; update `prisma/seed.ts` and `scripts/import-roster/build-import-sql.ts` to emit campus-free names. Cross-check `design-system` for badge variant + placement. *Accept:* `npx prisma db seed` produces names with no campus token and no unique-key violation; class detail header shows nama + kampus badge. Depends on 6.
9. [ ] **Docs.** Update README (class naming convention + the per-campus uniqueness rule) and fill this cycle's Implementation / Verification. *Accept:* `/audit-docs` reports zero `fail`. Depends on all.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5. Execution order respects the dependency graph, not the doc order: batch A = tasks 1, 2, 3 (parallel, no shared files); then task 6 (schema, blocks 7 + 8); then tasks 7, 8 (parallel); then tasks 4, 5 (parallel, need 2 + 3); then task 9. Driver runs `npm run build && npx vitest run` itself once per batch — subagents run only their own targeted vitest file, because concurrent Next builds contend on `.next/`.
- Spec correction applied before build: task 1 reuses the existing `ensureYearWritableById` contract (403 + `YEAR_ARCHIVED`) rather than the 400 the spec first proposed. `lib/classes/year-guard.ts` already owns this semantics for class CRUD; a second status code for the same condition would be gratuitous drift.
- Task 1: Academic-year guard on enroll + promote + bulk promote — `lib/classes/year-guard.ts`, `app/api/students/[id]/enroll/route.ts`, `app/api/students/[id]/promote/route.ts`, `app/api/promotions/route.ts`, `app/api/__tests__/students-enroll-promote-year-guard.test.ts` (new), `lib/classes/__tests__/year-guard.test.ts`, `app/api/__tests__/{enroll,promote-capacity-race,bulk-promote-race}.test.ts` — both year-guard helpers gained an optional `actionLabel` (defaults reproduce the original class-CRUD copy byte-for-byte, locked by regression tests), and all three write paths now reject an ARCHIVED-year target with 403 `YEAR_ARCHIVED` before their capacity transaction. Scope grew mid-task: the `superpowers:code-reviewer` pass found `POST /api/promotions` carried the same hole at roster scale, so it was closed here rather than deferred.
- Task 2: `yearStatus` filter on `GET /api/class-sections` — `app/api/class-sections/route.ts`, `app/api/__tests__/class-sections-year-status.test.ts` (new) — opt-in comma-separated allowlist over `AcademicYear.status`; invalid tokens are dropped and an all-invalid param degrades to "no filter", keeping the four existing no-param callers byte-identical. `academicYear` select widened to `{id, name, status}` for the downstream label/grouping tasks.
- Task 3: `formatClassOptionLabel` — `lib/format.ts`, `lib/__tests__/format-class-option-label.test.ts` (new) — renders `<nama> · TA <tahun> · <terisi>/<kapasitas>`, dropping the redundant program name. Takes a narrow structural input so both the `_count.enrollments` (class-sections) and `enrolledCount` (admin/classes) wire shapes map into it. Not yet wired to any caller — tasks 4 and 5 own that.

## Verification

- Task 3: `npx vitest run lib/__tests__/format-class-option-label.test.ts` → 4 passed (full class, zero enrolment renders `0/25`, null and undefined academic-year name both omit the ` · TA …` segment). Covered by the batch gate below.
- Task 2: `npx vitest run app/api/__tests__/class-sections-year-status.test.ts` → 4 passed (ACTIVE,PLANNING excludes ARCHIVED; omitted param returns all; `yearStatus=BOGUS` behaves as absent; response carries `academicYear.status`). Covered by the batch gate below.
- Batch A (tasks 1–3): `npm run build` green; `npx vitest run` → **248 test files passed | 2 skipped (250), 2395 tests passed | 42 todo (2437)**, zero failures. Gate run by the driver after the parallel subagents finished, then re-run after the mid-task bulk-promote addition.
- Subagent test reports claimed pre-existing failures in `admin-classes-historical-roster.test.ts` and `student-lifecycle-validation.test.ts` (`Failed to resolve import "@/lib/generated/prisma/client"`). Verified independently rather than taken at face value: the cause was simply that this fresh worktree had never run `npx prisma generate`. After generating, the full suite is green — there are **no** pre-existing failures on this branch.
- Prod data check (read-only, project `annisaa-erp-v3-prod-sgp`): 53 `ClassSection` rows across 5 academic years, 16 in the ACTIVE year TA 2026/2027, and every row carries `status = 'ACTIVE'` — confirming class status cannot distinguish current from historical classes and `AcademicYear.status` is the only correct signal.
- Campus-strip collision pre-check run against prod before committing to the Tier 2 rename: zero duplicates under both the proposed `ClassSection` key `[tenantId, academicYearId, campusId, name]` and the existing `ClassTrack` key `[tenantId, campusId, programId, name]`. The rename in tasks 6–7 is safe on real data.
- Bu Shanti's report that `TK B Metland 1` / `TK B Metland 2` "tidak ada kelasnya" is a false alarm: both rows exist only in TA 2025/2026 with 6 enrolled students each. Correct historical data — no roster cleanup needed.

## Ship Notes

<!-- filled by /ship -->
