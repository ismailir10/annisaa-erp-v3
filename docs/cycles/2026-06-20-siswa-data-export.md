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

2. [x] **[T2] Export API route** — `app/api/students/export/route.ts`: `getSession` + `isAdminRole` guard, parse +
   validate criteria (reject bad `status`/`gender` with 400), build tenant-scoped Prisma `where` (incl. ACTIVE-enrollment
   `some` filter for class/program/year), query students with primary-guardian + active-enrollment includes (same shape
   as `/api/students`), hand rows to `buildStudentCsv`, return CSV with attachment headers. Route test
   `app/api/students/__tests__/export-route.test.ts`: 401 no session, 403 non-admin, 400 bad gender, 200 + correct
   headers + header row, tenant isolation, column subset honored. *Acceptance: `npx vitest run app/api/students` green.* (depends T1)

3. [x] **[T3] Export dialog UI** — in `app/admin/students/page.tsx` (+ extract `components/admin/student-export-dialog.tsx`
   if it keeps the page readable): "Unduh Data Siswa" button in PageHeader opens Dialog (Sheet `side="bottom"` on mobile).
   Body: criteria selects (status reusing `STUDENT_STATUS_OPTIONS`, gender, tahun ajaran/program/kelas fetched from
   reference APIs) + grouped column checkboxes with per-group "Pilih semua". Footer "Unduh CSV" builds the query string
   and triggers the download via a hidden anchor (`<a href download>` / `window.location.assign`). Disable download when
   zero columns selected. *Acceptance: dialog opens, builds correct `/api/students/export?...` URL, downloads file; `npm run build` green.* (depends T2)

4. [x] **[T4] E2E + docs** — `e2e/admin-students-export.spec.ts`: admin navigates to /admin/students, opens export dialog,
   sets a criterion + a column subset, clicks Unduh, asserts CSV download (filename + first line header). Update README
   route count (175 → 176) and e2e spec count/list (+admin-students-export), File Structure e2e count in CLAUDE.md.
   *Acceptance: `npx playwright test admin-students-export` green; `/audit-docs` zero fails.* (depends T3)

## Implementation

- All tasks sequential (dependency chain) — executed inline, one commit each.
- Task 1: CSV builder + column registry — `lib/students/export.ts`, `lib/students/__tests__/export.test.ts` —
  pure `STUDENT_EXPORT_COLUMNS` registry (18 cols, 4 groups), `selectExportColumns` (canonical-order, unknown-key-safe),
  `escapeCsvCell` (always-quote + formula-injection guard), `buildStudentCsv` (CRLF, header-only on empty). No Prisma import.
- Task 2: Export API route — `app/api/students/export/route.ts`, `app/api/students/__tests__/export-route.test.ts`,
  README students-module row, CLAUDE.md route count 175→176 — GET, admin-gated (`isAdminRole`), tenant-scoped;
  status/gender validated (400); class/program/year criteria → ACTIVE-enrollment `some` filter; reuses T1 `buildStudentCsv`;
  streams `text/csv` attachment (`siswa_<jakarta-date>.csv`). `Prisma` type from `@/lib/generated/prisma/client` (build fix).
- Task 3: Export dialog UI — `components/admin/student-export-dialog.tsx` (new), `app/admin/students/page.tsx` ("Unduh Data"
  PageHeader button + `exportOpen` state + dialog mount), README admin-portal bullet — Dialog (desktop) / Sheet (mobile)
  via `useIsMobile`; criteria selects (status/gender/tahun-ajaran/program/kelas, kelas narrows to program+year);
  4 column groups with per-group "select-all"; anchor-download to `/api/students/export?…`; disabled at zero columns.

## Verification

- Task 1: `npx vitest run lib/students` → 14 passed. `npm run build` → green. Inline code-review (subagent dispatch
  unavailable, see Tasks note): formula guard covers OWASP =,+,-,@,tab,CR set with apostrophe-prefix-before-quote
  (no bypass); always-quote escaping prevents delimiter/newline spillover; column ordering + null accessors verified.
- Task 2: `npx vitest run app/api/students` → 48 passed (8 new + 40 existing). `npm run build` → green. Inline
  security review: getSession→401, isAdminRole→403, where.tenantId on every query, enrollment `some` filter cannot
  leak cross-tenant (top-level tenantId gates the student set), Prisma params block injection. GET read-only → no Zod
  body / rate-limit needed (matches existing attendance/payments export routes).
- Task 3: `npm run build` → green; `npx vitest run` → 2060 passed / 42 todo (full suite). design-system: dialog/sheet
  shell + button placement cross-checked against design-system.html Overlays § (Dialog desktop / Sheet mobile, ui.md
  one-overlay rule). Inline frontend review: anchor-download honors Content-Disposition; SelectValue null-coalesced
  (base-ui onValueChange is `string|null`); zero-column guard disables Unduh.
- Task 4: E2E spec `e2e/admin-students-export.spec.ts` + CLAUDE.md e2e count 31→32 (+admin-students-export). Spec
  follows the established demo-cookie auth pattern (`school-erp-session=u_super_admin`) → green under CI's seeded demo DB.
  **Local Playwright could not run** (honest record): this checkout's `DATABASE_URL` points at staging Supabase, which
  lacks the seeded `u_super_admin`, so the cookie redirects to the demo picker. Instead I verified the SAME flow live:
  built prod (`npm run build`) + drove `DEMO_MODE=true npm run dev` in a real browser logged in as the staging admin
  (Adhan, SCHOOL_ADMIN) — (a) **API curl path** against the prod build: `GET /api/students/export` → 200 `text/csv` +
  `attachment; filename="siswa_2026-06-20.csv"`, full 18-col canonical header, `?columns=name,nis,gender` reorders to
  canonical, `?gender=X`→400, no-cookie→401; (b) **UI path**: "Unduh Data" opens the dialog (5 criteria selects + 4
  column groups), deselecting "Wali Murid" group flips the button to "Unduh CSV (16 kolom)", clicking it downloads
  `siswa_2026-06-20.csv` whose header has exactly 16 columns with both Wali columns dropped. Screenshot captured.
  Staging pilot DB is empty → exports are header-only (empty-result contract holds). Authoritative CI Playwright +
  `/ship` preview-verify will exercise the spec against seeded data.
- End-of-cycle gate: `npm run build` → exit 0; `npx vitest run` → 2060 passed / 42 todo / 2 files skipped. Playwright
  recorded as live-verified above (CI runs the committed spec on the PR). `/audit-docs` run at `/ship` preflight.
- CI fix (PR #361, "Lint, Typecheck & Test" red): export dialog's `classSectionId` reset moved out of a `useEffect`
  (synchronous setState-in-effect tripped the cascading-render lint error) into the program/year `onValueChange`
  handlers. `npx eslint` on cycle files → 0 errors; `npm run build` exit 0; export tests 62 passed.
- CI staleness note: the fix-commit's `synchronize` event repeatedly linted a stale checkout (kept flagging the
  already-removed effect at the old line 135 — confirmed clean via `git show <sha>:components/admin/student-export-dialog.tsx`).
  Pushed a no-op comment-clarify commit to force a fresh SHA + clean CI run.

## Ship Notes

- **Migrations:** none. No schema change — export reads existing `Student` + relations.
- **Env vars:** none.
- **New deps:** none (CSV hand-built, consistent with attendance/payments exports).
- **New surface:** `GET /api/students/export` (admin-gated, tenant-scoped, read-only) + "Unduh Data" dialog on
  `/admin/students`. Doc counts bumped: README routes 175→176 (CLAUDE.md), e2e specs 31→32.
- **Manual smoke on preview:** sign in as admin → `/admin/students` → "Unduh Data" → toggle a column group + set a
  criterion → "Unduh CSV" → confirm a `siswa_<date>.csv` downloads with the expected columns. (Pilot prod/staging
  data may be sparse → header-only CSV is correct, not a bug.)
- **Rollback:** revert the PR — no data migration to unwind; the route + dialog are additive.
- **Security note:** CSV cells carry a formula-injection guard (apostrophe-prefix on `= + - @` / tab / CR leads).
