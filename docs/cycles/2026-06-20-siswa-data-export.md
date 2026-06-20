# Siswa Data Export

## Context

Admin staff need to pull student (siswa) records out of Talib into a spreadsheet for
government reporting (Dapodik-style data), pilot onboarding reconciliation, and ad-hoc
analysis. Today the only way out is manual copy from the paginated list — no bulk export,
no column control, no row filtering beyond the list's status/search. This cycle adds a
proper **filtered data export**: admin opens a dedicated dialog, narrows *which students*
(row criteria) and *which fields* (column selection), then downloads a CSV. The export
reuses the established admin-export response contract already used by attendance, payments,
and student-attendance exports (`text/csv`, `Content-Disposition: attachment`, Bahasa
filename), and is tenant-scoped + admin-gated like the rest of the student surface.

## Spec

**Acceptance criteria**

- [ ] New route `GET /api/students/export` — admin-only (`isAdminRole`), tenant-scoped (`tenantId`),
      returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="siswa_<yyyy-mm-dd>.csv"`.
- [ ] **Row criteria** (query params, all optional, AND-combined): `search` (name/nickname),
      `status`, `gender` (L|P), `academicYearId`, `programId`, `classSectionId`. Class/program/year
      criteria match students with an **ACTIVE** enrollment in the matching section.
- [ ] **Column selection** via `columns=` (comma-separated keys). Unknown keys ignored; empty/missing
      `columns` ⇒ export all columns. Column order in CSV follows the canonical registry order, not request order.
- [ ] Column registry covers 4 groups: **Core identity** (nama, panggilan, gender, tempat lahir,
      tanggal lahir, status, NIS, NISN), **Compliance** (NIK, No. KK, alamat, tinggal bersama),
      **Class/enrollment** (kelas, program, tahun ajaran, tanggal daftar — from ACTIVE enrollment),
      **Primary guardian** (nama wali, no. telepon wali).
- [ ] CSV cells are escaped (quote-wrap + double-quote internal quotes) AND carry a formula-injection
      guard: any cell beginning `= + - @` (or tab/CR) is prefixed with `'` so spreadsheets don't execute it.
- [ ] Students list page (`/admin/students`) gains an **"Unduh Data"** button in the PageHeader that opens
      a dialog (Sheet on mobile) with: criteria selects (status, gender, tahun ajaran, program, kelas) +
      grouped column checkboxes with per-group select-all. Footer action downloads the CSV.
- [ ] Criteria dropdowns for tahun ajaran / program / kelas are populated from existing reference list
      APIs (`/api/academic-years`, `/api/programs`, `/api/class-sections`).
- [ ] Empty result set still returns a valid CSV (header row only), HTTP 200 — never a misleading empty 200
      with no header (mirrors the F-11 attendance-export fix).
- [ ] Invalid `gender`/`status` values ⇒ 400 with a Bahasa error (no silent empty export).
- [ ] CSV builder logic lives in a pure, unit-tested helper (`lib/students/export.ts`); route is thin.
- [ ] Voice: button = "Unduh Data Siswa", dialog action = "Unduh CSV" (voice.md prefers "Unduh" over "Ekspor").
- [ ] design-system: dialog/button cross-checked against design-system.html (overlays §, button §).

**Non-goals**

- XLSX output (CSV only this cycle — matches existing export contract; XLSX would add an `exceljs` write dep).
- Flattening the `metadata` JSON custom-fields column into export columns.
- Scheduled / emailed / background exports; streaming for >100k rows (current pilot data is small).
- Saved export presets / templates.
- Export from any portal other than admin (teacher/parent out of scope).
- Soft-delete column or audit-log of who exported (no `deletedAt` on Student today; status is the lifecycle field).

**Assumptions** (correct now or `/build` proceeds with these)

1. **CSV, no UTF-8 BOM** — matching the 3 existing exports exactly. If Excel id-ID mangles accented names,
   we revisit with a BOM in a follow-up. (Student names are typically ASCII; low risk.)
2. **Full filtered set, no pagination** — export returns every student matching criteria for the tenant,
   not just the current list page. Pilot tenants are small (≤ a few hundred students).
3. **Active-enrollment semantics** — class/program/year criteria + the class/program/year columns reflect the
   student's single ACTIVE enrollment (same `take:1, status:"ACTIVE"` shape the list API uses). A student with
   no active enrollment still exports (those columns blank) unless a class/program/year criterion is set.
4. **Primary-guardian columns** expose guardian nama + phone — already admin-visible in the list, same route guard.
5. CSV line ending `\r\n`, comma delimiter — consistent with existing builders.

## Tasks

<!-- Subagent plan: tasks T1→T2→T3→T4 form a dependency chain (T2⊃T1, T3⊃T2, T4⊃T3) — all
     SEQUENTIAL, executed inline. NOTE: subagent dispatch (feature-dev:code-reviewer / Explore)
     is non-functional in this session — the resolver returns inaccessible glm-* models regardless
     of `model` override. Mandatory code-review passes were performed INLINE and recorded per task. -->

1. [x] **[T1] CSV builder + column registry helper** — `lib/students/export.ts`: canonical `STUDENT_EXPORT_COLUMNS`
   registry (key → { group, header, accessor(student) }), `selectExportColumns(keys)`, `buildStudentCsv(rows, keys)`
   with cell-escape + formula-injection guard. Pure functions, no Prisma import. Unit test `lib/students/__tests__/export.test.ts`
   covering: column selection/ordering, escaping (commas, quotes, newlines), injection guard (`=`,`+`,`-`,`@`),
   empty-rows header-only output, blank enrollment/guardian. *Acceptance: `npx vitest run lib/students` green.* (independent)

2. **[T2] Export API route** — `app/api/students/export/route.ts`: `getSession` + `isAdminRole` guard, parse +
   validate criteria (reject bad `status`/`gender` with 400), build tenant-scoped Prisma `where` (incl. ACTIVE-enrollment
   `some` filter for class/program/year), query students with primary-guardian + active-enrollment includes (same shape
   as `/api/students`), hand rows to `buildStudentCsv`, return CSV with attachment headers. Route test
   `app/api/students/__tests__/export-route.test.ts`: 401 no session, 403 non-admin, 400 bad gender, 200 + correct
   headers + header row, tenant isolation, column subset honored. *Acceptance: `npx vitest run app/api/students` green.* (depends T1)

3. **[T3] Export dialog UI** — in `app/admin/students/page.tsx` (+ extract `components/admin/student-export-dialog.tsx`
   if it keeps the page readable): "Unduh Data Siswa" button in PageHeader opens Dialog (Sheet `side="bottom"` on mobile).
   Body: criteria selects (status reusing `STUDENT_STATUS_OPTIONS`, gender, tahun ajaran/program/kelas fetched from
   reference APIs) + grouped column checkboxes with per-group "Pilih semua". Footer "Unduh CSV" builds the query string
   and triggers the download via a hidden anchor (`<a href download>` / `window.location.assign`). Disable download when
   zero columns selected. *Acceptance: dialog opens, builds correct `/api/students/export?...` URL, downloads file; `npm run build` green.* (depends T2)

4. **[T4] E2E + docs** — `e2e/admin-students-export.spec.ts`: admin navigates to /admin/students, opens export dialog,
   sets a criterion + a column subset, clicks Unduh, asserts CSV download (filename + first line header). Update README
   route count (175 → 176) and e2e spec count/list (+admin-students-export), File Structure e2e count in CLAUDE.md.
   *Acceptance: `npx playwright test admin-students-export` green; `/audit-docs` zero fails.* (depends T3)

## Implementation

- All tasks sequential (dependency chain) — executed inline, one commit each.
- Task 1: CSV builder + column registry — `lib/students/export.ts`, `lib/students/__tests__/export.test.ts` —
  pure `STUDENT_EXPORT_COLUMNS` registry (18 cols, 4 groups), `selectExportColumns` (canonical-order, unknown-key-safe),
  `escapeCsvCell` (always-quote + formula-injection guard), `buildStudentCsv` (CRLF, header-only on empty). No Prisma import.

## Verification

- Task 1: `npx vitest run lib/students` → 14 passed. `npm run build` → green. Inline code-review (subagent dispatch
  unavailable, see Tasks note): formula guard covers OWASP =,+,-,@,tab,CR set with apostrophe-prefix-before-quote
  (no bypass); always-quote escaping prevents delimiter/newline spillover; column ordering + null accessors verified.

## Ship Notes

<!-- filled by /ship -->
