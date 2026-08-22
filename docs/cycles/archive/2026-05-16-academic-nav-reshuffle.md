# Academic Nav Reshuffle + Identitas Kelas Rename

## Context

Cycle `2026-05-15-academic-hierarchy-refactor` (PR #281) introduced the ClassTrack entity and placed it under "Struktur Akademik" in the admin sidebar. Two problems shipped:

1. **Mislabelling.** The `/admin/class-tracks` page is labelled "Rombongan Belajar" — wrong. In Indonesian education, Rombongan Belajar (Rombel) = per-year student cohort = `ClassSection`, not the stable multi-year class template = `ClassTrack`. The page subtitle even says "Identitas kelas yang stabil lintas tahun ajaran" (class identity stable across academic years), contradicting its own title.

2. **Nav misgrouping.** "Tahun Ajaran" (the academic setup god-page managing Programs + AcademicYears + ClassSections + TeachingAssignments) and "Guru Pengajar" (teaching assignments list) sit under **Kurikulum** — but they are structural setup, not curriculum content. Meanwhile **Struktur Akademik** has only 1 item. Kurikulum should hold content-authoring items only (Semester, and future Tema & Pekan / Tujuan & IKTP / Import PROMES).

Additionally, the `/admin/teaching-assignments` page has no create button — its empty state says "Tambahkan guru ke kelas melalui halaman Tahun Ajaran" which is confusing. The page should allow direct creation since the POST API already exists.

### Admin journey validation

Comprehensive review of all 6 nav groups confirmed only the Kurikulum ↔ Struktur Akademik boundary is wrong:

| Group | Assessment | Action |
|-------|-----------|--------|
| Kesiswaan | Correct — student lifecycle (Pendaftaran → Siswa → Wali Murid → Penempatan) | No change |
| Kurikulum | Wrong items — Tahun Ajaran + Guru Pengajar are structural, not curriculum | Move 2 items out |
| Struktur Akademik | Starved (1 item) + mislabelled | Expand + rename |
| Penilaian | Correct — setup + data pair (Template Penilaian + Penilaian Siswa) | No change |
| Kelas Harian | Correct — daily class ops (Kehadiran Siswa + Buku Penghubung) | No change |
| Keuangan / SDM / Settings | Not reviewed — out of scope | No change |

## Spec

### AC-1: Rename ClassTrack page "Rombongan Belajar" → "Identitas Kelas"

All user-facing text on `/admin/class-tracks` must use "Identitas Kelas" instead of "Rombongan Belajar":

- [ ] Page title: "Identitas Kelas"
- [ ] Page description: keep content but replace any "rombongan belajar" occurrences
- [ ] Breadcrumb: "Struktur Akademik > Identitas Kelas"
- [ ] Create button: "+ Tambah Identitas Kelas"
- [ ] Create dialog title: "Tambah Identitas Kelas"
- [ ] Edit dialog title: "Ubah Identitas Kelas"
- [ ] Stats card labels: "IDENTITAS KELAS AKTIF", "ROMBEL TERDAFTAR" → keep "ROMBEL TERDAFTAR" (refers to ClassSection count, correct usage)
- [ ] Deactivate confirmation text
- [ ] Form field label: "Nama rombongan belajar" → "Nama identitas kelas"
- [ ] Placeholder text: keep "mis. TKIT A" (still correct)
- [ ] No URL change — `/admin/class-tracks` stays (audit logs + email template links exist)

### AC-2: Nav reshuffle — move structural items to Struktur Akademik

In `config/admin-nav.ts`:

**Before:**
```
Kurikulum (curriculum.read):
  Tahun Ajaran → /admin/academic-years
  Semester → /admin/semesters
  Guru Pengajar → /admin/teaching-assignments

Struktur Akademik (academic.view):
  Rombongan Belajar → /admin/class-tracks
```

**After:**
```
Struktur Akademik (academic.view):
  Tahun Ajaran → /admin/academic-years
  Identitas Kelas → /admin/class-tracks
  Guru Pengajar → /admin/teaching-assignments

Kurikulum (curriculum.read):
  Semester → /admin/semesters
```

- [ ] Move "Tahun Ajaran" nav item from Kurikulum → Struktur Akademik
- [ ] Move "Guru Pengajar" nav item from Kurikulum → Struktur Akademik
- [ ] Rename "Rombongan Belajar" → "Identitas Kelas" in nav config
- [ ] Order within Struktur Akademik: Tahun Ajaran, Identitas Kelas, Guru Pengajar
- [ ] Permission gates unchanged: `academic.view` on Struktur Akademik group, `curriculum.read` on Kurikulum group

### AC-3: Update breadcrumbs

Pages derive breadcrumbs from their nav group. After moving items, breadcrumbs must reflect new parent:

- [ ] `/admin/academic-years`: "Kurikulum > Tahun Ajaran" → "Struktur Akademik > Tahun Ajaran"
- [ ] `/admin/class-tracks`: "Struktur Akademik > Rombongan Belajar" → "Struktur Akademik > Identitas Kelas"
- [ ] `/admin/teaching-assignments`: "Kurikulum > Guru Pengajar" → "Struktur Akademik > Guru Pengajar"
- [ ] `/admin/semesters`: "Kurikulum > Semester" (unchanged — stays in Kurikulum)

If breadcrumbs auto-derive from nav config, this is free. Verify.

### AC-4: Teaching Assignments page — add create button

- [ ] Add "+ Tambah Guru Pengajar" button (top-right, primary style)
- [ ] Create dialog: Employee select + ClassSection select + Role select (HOMEROOM/ASSISTANT)
- [ ] POST to `/api/teaching-assignments` (API already exists)
- [ ] Update empty state: remove "melalui halaman Tahun Ajaran" — replace with "Klik tombol Tambah untuk menugaskan guru ke kelas."
- [ ] Refresh list on successful creation

### AC-5: E2E test updates

- [ ] Any test asserting sidebar text "Rombongan Belajar" → "Identitas Kelas"
- [ ] Any test asserting breadcrumb "Kurikulum > Tahun Ajaran" → "Struktur Akademik > Tahun Ajaran"
- [ ] Any test asserting breadcrumb "Kurikulum > Guru Pengajar" → "Struktur Akademik > Guru Pengajar"
- [ ] Any test navigating via Kurikulum group to find Tahun Ajaran or Guru Pengajar

### AC-6: README update

- [ ] Update modules/portals table if it references "Rombongan Belajar" or nav group membership

## Tasks

1. Rename ClassTrack page labels (AC-1)
2. Reshuffle nav config (AC-2)
3. Verify/fix breadcrumbs (AC-3)
4. Add create button to Teaching Assignments page (AC-4)
5. Update E2E tests (AC-5)
6. Update README + cycle doc (AC-6)

## Implementation

### Task 1 — Rename ClassTrack page labels (AC-1)
- `app/admin/class-tracks/client.tsx`: 15 string replacements — page title, description, create/edit dialog titles, button text, stat card label, toast messages, field label, deactivate/reactivate confirmation. Preserved "Rombel terdaftar" stat (refers to ClassSection count) and "Rombel" column header.

### Task 2 — Nav reshuffle (AC-2, AC-3)
- `config/admin-nav.ts`: Moved Tahun Ajaran + Guru Pengajar from `curriculum` → `academic` group. Renamed nav entry "Rombongan Belajar" → "Identitas Kelas". Reordered groups: academic before curriculum. Breadcrumbs auto-derive — no manual fix needed.

### Task 3 — Teaching Assignments create button (AC-4)
- `app/admin/teaching-assignments/page.tsx`: Added `+ Tambah Guru Pengajar` button + create dialog (employee, class section, role selects). Updated empty state text. POSTs to existing `/api/teaching-assignments`.
- `config/__tests__/admin-nav.test.ts`: Updated 3 tests for new group order + item membership.

## Verification

- [x] Cross-checked design-system.html §List for page layout compliance (label-only changes, no layout impact)
- [x] `npm run build` passes (post-rebase on staging)
- [x] `npx vitest run config/__tests__/admin-nav.test.ts` — 23/23 pass
- [x] Playwright: all 25 admin/curriculum tests fail with blank white page (server timeout in beforeEach) — pre-existing worktree infrastructure issue, not caused by this cycle's changes. Same failures affect unrelated tests (dashboard, payroll, employees). CI Playwright on PR will be authoritative.

### Task 4 — E2E audit (AC-5)
- No E2E tests reference "Rombongan Belajar", sidebar text for Kurikulum group, or breadcrumb assertions affected by this reshuffle. No changes needed.

### Task 5 — README + cycle doc (AC-6)
- `README.md`: Added ADR row for nav reshuffle.
- Cycle doc: Filled Implementation + Verification sections.

### Preview-verify (PR #286)

- [x] Preview-verify iteration 1 (annisaa-erp-v3-lvu5987cm-ismails-projects-196d40d3.vercel.app): flows=[class-tracks, teaching-assignments, academic-years, semesters], blockers=0, minors=0
  - `/admin/class-tracks`: title "Identitas Kelas", breadcrumb "Struktur Akademik > Identitas Kelas", button "+ Tambah Identitas Kelas", stats card "IDENTITAS KELAS AKTIF" — all correct
  - `/admin/teaching-assignments`: breadcrumb "Struktur Akademik > Guru Pengajar", button "+ Tambah Guru Pengajar" present, create dialog opens with Guru/Kelas/Peran fields — all correct
  - `/admin/academic-years`: breadcrumb "Struktur Akademik > Tahun Ajaran" (moved from Kurikulum) — correct
  - `/admin/semesters`: breadcrumb "Kurikulum > Semester" (unchanged) — correct
  - Sidebar: Struktur Akademik [Tahun Ajaran, Identitas Kelas, Guru Pengajar], Kurikulum [Semester] — correct
  - No console errors on any page
- Preview-verify converged on iteration 1 (clean): 1 iteration, 0 fix commits, final preview annisaa-erp-v3-lvu5987cm-ismails-projects-196d40d3.vercel.app.

## Ship Notes

- No migrations, no env vars, no URL changes.
- Rollback: revert 3 commits on this branch.
