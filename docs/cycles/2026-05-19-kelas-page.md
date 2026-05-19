# Kelas Page — Dedicated Class Surface + Class-Tracks UI Retirement

## Context

Cycle `2026-05-15-academic-hierarchy-refactor` (PR #281) introduced `ClassTrack` as a schema-level abstraction (stable multi-year class identity) and exposed it as a dedicated admin CRUD page at `/admin/class-tracks`. Cycle `2026-05-16-academic-nav-reshuffle` (PR #286) then renamed the page label "Rombongan Belajar" → "Identitas Kelas" because the original label was technically wrong (Rombel = per-year section ≠ multi-year track). Both shipped clean.

The result is **conceptually correct but ergonomically off**. Three admin surfaces now touch the "class" entity: `/admin/class-tracks` (ClassTrack CRUD), `/admin/academic-years` (per-year ClassSection CRUD as a sub-table), and `/admin/teaching-assignments` (global teacher↔class list). An admin who thinks "manage TKIT A for this year" must context-switch across all three. The "Identitas Kelas" label, while technically defensible, surfaces a schema abstraction (ClassTrack) into the UI vocabulary — admins never think in lineages, they think in classes.

This cycle consolidates the class surface into a single dedicated page `/admin/classes` (label: "Kelas"). ClassTrack stays in the schema as silent plumbing (find-or-create on POST, roll-forward still uses it, RLS untouched, backfilled rows untouched). `/admin/class-tracks` and `/admin/teaching-assignments` UI pages are hard-cut (404 on the old URLs, callers fixed in-cycle). `/admin/academic-years` slims to Programs + Years only — the Sections table moves to the new page. `/admin/classes/[id]` (relocated from `/admin/class-sections/[id]`) becomes the operational hub: meta-edit + roster + teaching assignments + sessions calendar + a health snapshot. Intended outcome: one mental model, one URL, one nav slot for "manage a class".

## Spec

### Acceptance criteria

- [ ] **AC-1: New list page `/admin/classes`.** Year switcher (defaults to ACTIVE `AcademicYear`), filters (campus, program, status, search). DataTable columns: Nama, Kampus, Program, Wali Kelas, Siswa (X/cap), Status badge, Health badge, row action menu. Header action `+ Tambah Kelas` (hidden if selected year is ARCHIVED). Empty state copy "Belum ada kelas untuk tahun ajaran [Year]. Klik Tambah Kelas untuk membuat." Permission gate `academic.view` (read) + `academic.edit` (write).

- [ ] **AC-2: New detail page `/admin/classes/[id]`.** Relocates content from `/admin/class-sections/[id]` and adds sections. Header: breadcrumb `Akademik > Kelas > [Nama]`, title + year badge, subtitle (Kampus · Program · Wali Kelas), actions `Ubah` + `Nonaktifkan`/`Aktifkan`. Body sections (flat scroll, not tabs):
  1. **Ringkasan** — health metric cards: Roster (X/cap), Kehadiran 7d (%), Sesi hari ini (Held/Missing/Holiday). Curriculum + penilaian cards are placeholders this cycle (data sources land with the Curriculum+Assessment initiative).
  2. **Siswa** — roster table (Nama, NIS, Status, Tgl masuk, row action Pindahkan/Keluarkan), `+ Tambah Siswa` button → dialog picks an unenrolled student in the same year. Remove via row action.
  3. **Guru Pengajar** — teacher table (Nama, Peran, Tgl ditugaskan, row action Hapus), `+ Tambah Guru Pengajar` button. HOMEROOM uniqueness enforced (409 → "Ganti wali kelas" confirm).
  4. **Kalender Sesi** — month-grid calendar + swap-teacher Sheet (UI unchanged from current `/admin/class-sections/[id]`).

- [ ] **AC-3: New API `GET/POST /api/admin/classes`.** GET supports `?yearId=&campusId=&programId=&status=&q=` with health metric enrichment (parallel batch fetch for attendance7d + today's session). POST runs `prisma.$transaction`: upsert `ClassTrack` on `(tenantId,campusId,programId,name)` (reactivating INACTIVE), insert `ClassSection`, audit log `class.create`, fire `reconcileSessions` outside the transaction (non-fatal, surfaces `reconcileWarning`). Gated `academic.edit`, rate-limited per repo convention.

- [ ] **AC-4: New API `GET/PATCH/DELETE /api/admin/classes/[id]`.** GET returns class + classTrack + program + academicYear + campus + active enrollments (with student name/NIS) + teaching assignments (with employee name) + this-month sessions. PATCH updates name/capacity/slotTemplate/status (audit `class.update`); reactivating INACTIVE also reactivates parent ClassTrack if needed. DELETE soft-deletes (status INACTIVE, audit `class.delete`, warning surfaced if `enrollments.length > 0`). ARCHIVED-year guard: all mutations return 403 if class belongs to an ARCHIVED `AcademicYear`.

- [ ] **AC-5: New APIs `POST/DELETE /api/admin/classes/[id]/enrollments` + `POST/DELETE /api/admin/classes/[id]/teaching-assignments`.** Enrollments POST validates capacity (422 `CAPACITY_EXCEEDED`), rejects duplicate enrollment same year. Teaching assignments POST enforces HOMEROOM uniqueness (409 `HOMEROOM_EXISTS` with existing id). DELETE removes the row. All mutations gated `academic.edit`, ARCHIVED-year guarded, audited (`class.enrollment.add`, `class.enrollment.remove`, `class.teacher.add`, `class.teacher.remove`).

- [ ] **AC-6: Health metric service `lib/classes/health.ts` + unit tests.** Pure function `computeHealthBadge(input)` returns `'Sehat' | 'Perhatian' | 'Kritis' | 'Tidak Aktif' | 'Libur'`. Inputs: `status`, `enrolledCount`, `capacity`, `attendance7dPct`, `todaySessionState`. Thresholds: Sehat ≥85% & ≥50% capacity & today not Missing; Perhatian 70-84% OR <50% capacity OR Missing-without-holiday; Kritis <70% OR roster=0; Tidak Aktif if `status==INACTIVE`; Libur if today is non-working/holiday. Constants hard-coded this cycle (no per-tenant config). Companion helpers `attendanceLast7Days(sectionIds[])` and `todaySessionState(sectionIds[])` batch-query for list page efficiency.

- [ ] **AC-7: Nav reshuffle.** Rename group `Struktur Akademik` → `Akademik` in `config/admin-nav.ts`. Group items after this cycle: `Tahun Ajaran` (`/admin/academic-years`), `Kelas` (`/admin/classes`). Remove `Identitas Kelas` + `Guru Pengajar` entries. Update `config/__tests__/admin-nav.test.ts` for new group name + items.

- [ ] **AC-8: `/admin/academic-years` slim-down.** Remove ClassSections sub-table + teacher-assignment dialog from `app/admin/academic-years/page.tsx`. Keep Programs + Years tables. Keep "Gulir Kelas ke Tahun Ini" row action (roll-forward). Add a link "Kelola kelas tahun ini →" on each Year row pointing to `/admin/classes?yearId=<id>`. Roll-forward UX unchanged — still operates on ClassTrack and produces ClassSections; nothing relocates.

- [ ] **AC-9: Hard-cut deletions.** Delete: `app/admin/class-tracks/**`, `app/api/admin/class-tracks/**`, `app/admin/teaching-assignments/**`, `app/api/teaching-assignments/**`, `app/admin/class-sections/**` (relocated to `app/admin/classes/[id]`). The new admin write surface for teaching assignments lives at `/api/admin/classes/[id]/teaching-assignments`. Any cross-portal consumer of the old `/api/teaching-assignments` is migrated to the new path or has its surface deleted in-cycle. Old URLs return 404 (no redirect — hard cut per user direction).

- [ ] **AC-10: Reference cleanup.** Grep + fix: any `app/**` reference to `/admin/class-tracks`, `/admin/teaching-assignments`, `/admin/class-sections`, "Identitas Kelas" copy; any `lib/email/**` href to deleted URLs; any `e2e/**` selector or URL referencing deleted surfaces. README module table updated to reflect the new page.

- [ ] **AC-11: E2E coverage.** New `e2e/admin-classes.spec.ts` covering: create class (verify ClassTrack auto-created), roster add/remove on detail page, HOMEROOM uniqueness 409 + replace, ARCHIVED-year read-only state, soft-delete-with-active-students warning, health badges render, old URLs 404.

- [ ] **AC-12: Gates green + design-system cross-check.** Between-task: `npm run build && npx vitest run`. End-of-cycle: `+ npx playwright test`. Frontend tasks (4, 5, 8) cross-checked against `.claude/standards/design-system.html` per frontend-gate Rule 4 (literal token `design-system` appears in Verification).

### Non-goals

- **Schema changes.** ClassTrack model, RLS policies, backfilled rows, roll-forward endpoint all stay as-is. No migration this cycle.
- **Curriculum/penilaian health metrics.** Placeholder cards only; live data wires up when the Curriculum+Assessment+Raport initiative ships (July 2026 cutover per project memory).
- **Per-tenant health-threshold config.** Constants hard-coded.
- **Optimistic locking on class edits.** Last-write-wins matches `crud.md` Category A baseline.
- **Bulk roster operations** beyond single add/remove (CSV import, bulk move). Existing `/admin/placement` covers bulk; not touched here.
- **Parent/teacher portal changes.** Teacher session page + parent attendance untouched. No copy or layout changes outside admin.
- **Audit-log rewrite.** Historical `class-track.*` audit rows stay (immutable). New actions use `class.*` namespace.
- **Reviving `/admin/teaching-assignments`** as a global read-only view. Single write surface (class detail) is the explicit decision.

### Assumptions

1. The active `AcademicYear` (single row with `status === 'ACTIVE'` per tenant) is the default selection. If a tenant has zero ACTIVE years, the year switcher defaults to the most recent `PLANNING` or `ARCHIVED` year and the page shows an empty state plus a link to `/admin/academic-years` to activate one.
2. `/api/class-sections` (unprefixed, pre-existing) is not consumed by admin pages other than the about-to-be-deleted academic-years sub-table. If grep finds consumers in teacher/parent portal, they stay untouched (cycle does not touch non-admin surfaces).
3. The current `app/admin/class-sections/[id]/{page,client}.tsx` move to `app/admin/classes/[id]/` is a logical move — file content carries over, only the route path changes. Any internal links use the new path post-move.
4. Hard-cut to 404 (not 301 redirect) is acceptable per user direction; the deleted URLs are 4 days old and audit-log clickthroughs hitting a 404 is preferable to long-lived back-compat shims.
5. ClassTrack `status` does not auto-flip to INACTIVE when its last ClassSection becomes INACTIVE. Track stays ACTIVE so future find-or-create reuses it. Manual deactivation of a Track is no longer surfaced in UI but remains a Prisma-level capability for future ops needs.
6. Roll-forward continues to surface at `/admin/academic-years` Year row action because the operation is year-anchored, not class-anchored. Moving it to the new page would require a year selector inside the dialog — extra friction for no payoff.
7. Existing `e2e/admin.spec.ts` `academic-year roll-forward` test (line 374) does not touch class-tracks URL/copy and survives untouched.
8. The frontend-gate (pre-commit Rule 4) is satisfied by adding a "Cross-checked design-system.html §List + §Detail" line in Verification — content matches that of past frontend cycles.

## Tasks

> Ordered, atomic, independently committable. `[dep: N]` marks a hard dependency. Tasks without a dep can be dispatched in parallel by `/build`.

- [ ] **1. Health metric service.** `lib/classes/health.ts` — pure `computeHealthBadge` + `attendanceLast7Days(sectionIds[])` + `todaySessionState(sectionIds[])` batch helpers. Unit tests cover threshold combos (Sehat/Perhatian/Kritis/Tidak Aktif/Libur), zero roster, zero capacity, no session today, holiday today, mixed-attendance edge cases. _Accept: `npx vitest run lib/classes/health.test.ts` green; pure functions, no Prisma side effects._

- [ ] **2. Class API: list + detail + meta CRUD.** `app/api/admin/classes/{route.ts,[id]/route.ts}` — GET list with health enrichment (calls Task 1 helpers in parallel), POST find-or-create ClassTrack via upsert + create ClassSection + audit + non-fatal reconcileSessions, GET detail with eager-include shape per AC-4, PATCH update with ClassTrack reactivation, DELETE soft-delete with audit + active-enrollment warning surfaced. `lib/validations/class.ts` (Zod schemas). ARCHIVED-year guard helper `lib/classes/year-guard.ts`. Unit tests per endpoint. _Accept: `npx vitest run app/api/admin/classes` + `lib/validations/class.test.ts` + `lib/classes/year-guard.test.ts` green; cross-tenant probes return 404._

- [ ] **3. Enrollment + teaching-assignment per-class APIs.** `app/api/admin/classes/[id]/enrollments/route.ts` (POST add, DELETE remove with `?studentId=`) + `app/api/admin/classes/[id]/teaching-assignments/route.ts` (POST add, DELETE remove with `?employeeId=&role=`). Capacity check (422 CAPACITY_EXCEEDED), duplicate enrollment same year (409 ALREADY_ENROLLED), HOMEROOM uniqueness (409 HOMEROOM_EXISTS). All audited with `class.enrollment.*` / `class.teacher.*` actions. ARCHIVED-year guard. _[dep: 2] Accept: `npx vitest run` covers add/remove paths + all error codes; cross-tenant probes return 404._

- [ ] **4. List page UI.** `app/admin/classes/{page.tsx,client.tsx}` — server component permission gate (`academic.view`) → client with year switcher + filters + DataTable + create dialog + row action menu (Detail link, Ubah, Nonaktifkan/Aktifkan). Empty state copy per AC-1. ARCHIVED-year mode hides create + disables row actions, shows banner. Health badges rendered via shadcn Badge with status colors from `colors.md`. Cross-check `design-system.html` §List. _[dep: 1, 2] Accept: `npm run build` clean; Playwright dry-load passes (route renders without console errors)._

- [ ] **5. Detail page UI.** `app/admin/classes/[id]/{page.tsx,client.tsx}` — relocate content from `app/admin/class-sections/[id]/` (sessions calendar + swap-teacher Sheet stay intact), add Ringkasan + Siswa + Guru Pengajar sections per AC-2, integrate Task 3 APIs for inline add/remove. Edit dialog (name, capacity, slotTemplate). Soft-delete confirm dialog with active-enrollment warning text. Reactivate path. ARCHIVED-year disables all actions + banner. Cross-check `design-system.html` §Detail + `crud.md` Category A. _[dep: 1, 2, 3] Accept: build clean; detail page loads with full eager-include shape; add/remove student + teacher round-trip works._

- [ ] **6. Nav config update + slim academic-years page.** `config/admin-nav.ts` — rename group `Struktur Akademik` → `Akademik`, remove `Identitas Kelas` + `Guru Pengajar` entries, add `Kelas`. `config/__tests__/admin-nav.test.ts` — update group name + item assertions. `app/admin/academic-years/page.tsx` — remove ClassSections sub-table + teacher-assignment dialog; keep Programs + Years tables + roll-forward row action; add "Kelola kelas tahun ini →" link on each year row to `/admin/classes?yearId=<id>`. Cross-check `design-system.html` §List for academic-years post-slim. _Accept: `npx vitest run config/__tests__/admin-nav.test.ts` green; academic-years page builds; roll-forward row action still functions._

- [ ] **7. Hard-cut deletions + reference cleanup.** Delete trees: `app/admin/class-tracks/`, `app/api/admin/class-tracks/`, `app/admin/teaching-assignments/`, `app/api/teaching-assignments/`, `app/admin/class-sections/` (its content already relocated in Task 5). Delete corresponding `__tests__/` files. Grep `app/**`, `components/**`, `lib/**` for `/admin/class-tracks`, `/admin/teaching-assignments`, `/admin/class-sections`, `Identitas Kelas` — fix every hit. Grep `lib/email/**` for deleted URLs — fix. Old URLs naturally 404 once route files are deleted. _[dep: 4, 5, 6] Accept: `npm run build && npx vitest run` green; grep confirms zero references in code (cycle docs + audit-log fixtures excepted)._

- [ ] **8. E2E coverage.** New `e2e/admin-classes.spec.ts` covering 7 scenarios per AC-11 (create + ClassTrack auto-create verify, roster add/remove, HOMEROOM uniqueness, ARCHIVED-year read-only, soft-delete-with-students, health badges, old URLs 404). Update any existing `e2e/*.spec.ts` referencing deleted URLs or "Identitas Kelas" copy. Seed extension: ensure at least one ARCHIVED year + one class with sub-Sehat attendance to exercise badge variants (use existing seed fixtures + reduce attendance via direct DB write in test setup if seed insufficient). _[dep: 7] Accept: `npx playwright test e2e/admin-classes.spec.ts` green; full suite `npx playwright test` green (modulo pre-existing flakes recorded in May 15 cycle Verification)._

- [ ] **9. README + cycle doc finalize.** README.md — update admin portal module table row for the consolidated class surface; add ADR row if the nav/surface decision deserves a one-liner. Cycle doc — fill Implementation + Verification + Ship Notes (per `/build`'s normal cadence). Confirm `design-system` token appears in Verification (frontend-gate). _[dep: 8] Accept: `git diff README.md` shows the update; cycle doc all six sections populated._

## Implementation

<!-- filled by /build -->

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
