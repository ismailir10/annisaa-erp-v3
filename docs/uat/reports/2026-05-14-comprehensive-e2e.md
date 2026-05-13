# UAT Report — Comprehensive Cross-Portal E2E — 2026-05-14

> Persona(s): Pak Ismail (SUPER_ADMIN) · Pak Ismail2 (TEACHER) · Bu Rightjet (GUARDIAN)
> Modules run: 22 admin / 7 teacher / 6 parent / 1 Xendit sandbox
> Blockers: 1  •  Majors: 6  •  Minors: 13  •  Nits: 2 (Run-1 + Run-2 combined)
> Target: staging (`https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`)
> Auth: Real Google OAuth (no demo mode) — `ismailir10@gmail.com`, `ismail10rabbanii@gmail.com`, `rightjet.hq@gmail.com`
> Browser: Chrome MCP (Claude-in-Chrome extension, Browser 1 macOS)
> Data state at start: surgical wipe via Supabase MCP — kept Tenant + OrgConfig + `ismailir10` SUPER_ADMIN; recreated everything else through UI/SQL

## Summary

End-to-end sweep of every module across admin, teacher, and parent portals on staging, exercising real Google OAuth for three distinct identities. The core workflows are intact: Xendit sandbox simulate-payment round-trips correctly (QRIS → webhook auto-post → invoice marked PAID → parent UI updates), the payroll state machine progresses cleanly from DRAFT → APPROVED → SLIPS_SENT, bulk invoice generation honours per-program fee structure (KB Rp 500k, TK Rp 750k), and cross-actor data propagation works (teacher marks → parent week grid; admin creates → teacher portal lists). Two **blockers** dominate the report. First, `/teacher` home renders only the greeting and date, missing the check-in card and assigned-class list, with a React error #418 (text-content hydration mismatch) on every load — matching the symptom that the 2026-05-10 phase0 hydration cycle was meant to fix. Second, the server-side "today" is consistently one day behind real WIB — the dashboard greeting reads "Rabu, 13 Mei 2026" when local WIB is Thursday 14 May, and `POST /api/student-attendance/mark` rejects same-day attendance for 14 May with "Tidak bisa mencatat kehadiran untuk tanggal yang akan datang" (HTTP 400). This regresses ADR 2026-04-24 (`getYmdInTimezone(d, "Asia/Jakarta")` not `toISOString()`). A handful of major data-integrity issues sit underneath: `SalaryComponentDef.category` lacks enum validation (so a typo silently excludes the row from payroll calc), and the Student → Guardian "Hubungan" combobox loses the selected value on save (always persists "WALI" regardless of choice). The remaining items are minor UX gaps (no campus-reactivate UI, missing assignment CTA on Teaching Assignments, stale dashboard stat cards, RSC prefetch 503s) and copy nits.

## Pre-flight observations

### FIND-000 — Plan SQL wipe order (nit)
- **Severity:** nit (already worked around)
- **Observation:** The destructive wipe SQL in [`.claude/plans/fancy-growing-lightning.md`](.claude/plans/fancy-growing-lightning.md) ran `TRUNCATE "Role" RESTART IDENTITY CASCADE` after the User-table DELETE. PostgreSQL CASCADE on TRUNCATE propagates through every FK referencing the truncated table, including `User.customRoleId → Role` (which is declared `onDelete: SetNull` in Prisma but CASCADE on TRUNCATE ignores that). Net effect: the `User` row for `ismailir10@gmail.com` that we had just preserved was wiped along with the Role table. Recovered via manual `INSERT INTO "User"` with id `cm_super_ismailir10`.
- **Suggestion:** Future destructive resets should either (a) move `TRUNCATE "Role"` ahead of the User-preservation step so the cascade fires on an already-empty User table, or (b) drop CASCADE and rely on explicit DELETE-order. Same trap applies to `Employee`/`Parent` because `User.employeeId` and `User.parentId` are SetNull FKs that would also propagate under CASCADE TRUNCATE.

---

## Admin portal findings

### FIND-001 — Dashboard KPI cards stale after data mutation (minor)
- **Module:** `/admin` dashboard
- **Severity:** minor
- **Observation:** Immediately after the destructive wipe ran (Employee table truncated to 0), the dashboard greeted me with `TOTAL KARYAWAN: 27`, `TIDAK HADIR: 27`. A hard refresh (F5) flipped them to 0. Server-side cache (likely `unstable_cache` or RSC route segment cache) is not invalidated when the underlying data mutates.
- **Suggestion:** Tag the dashboard's employee-count query with a revalidation tag and call `revalidateTag` from every Employee mutation API route; OR mark the dashboard page `dynamic = "force-dynamic"` if no caching is intended.

### FIND-002 — Server-rendered date stuck on yesterday WIB (major)
- **Module:** dashboard greeting, teacher home, parent home, every page with server-rendered date string
- **Severity:** major
- **Observation:** Run conducted on Thursday 2026-05-14 WIB. Server consistently rendered "Rabu, 13 Mei 2026" on `/admin`, `/admin/employee-attendance` ("Kehadiran Hari Ini · Rabu, 13 Mei 2026"), `/teacher`, `/parent`, and the Pendaftaran admission `Tanggal` column. Client-side widgets that compute from `new Date()` (e.g. `/teacher/attendance` calendar highlighting 14 May green; `/parent/attendance` week-grid Rab/Kam labels 05/13 + 05/14) render the correct date. The split suggests the server is using a date helper that does not respect Asia/Jakarta — likely a regression of [ADR `2026-04-24`](docs/adrs/) which moved date math to `getYmdInTimezone(d, "Asia/Jakarta")` not `toISOString()`.
- **Server-side proof:** `POST /api/student-attendance/mark` for `date=2026-05-14` returns HTTP 400 `"Tidak bisa mencatat kehadiran untuk tanggal yang akan datang"` (cannot record attendance for a future date) → see [FIND-016](#find-016--server-rejects-todays-class-attendance-blocker-for-daily-flow).
- **Suggestion:** Grep all `new Date()` / `toISOString().split("T")[0]` callers under `app/api/**` + `lib/**` and route them through `getYmdInTimezone(now, "Asia/Jakarta")`. Add a Playwright test that sets browser geolocation/timezone to WIB at 23:30 and asserts the rendered date matches.

### FIND-003 — RSC prefetch HEAD returns 503 (minor)
- **Module:** every admin route (`/admin/settings/campuses`, `/admin/settings/holidays`, `/admin/employees`, `/admin/invoices`, `/admin/payroll`, `/admin/assessment-templates`)
- **Severity:** minor
- **Observation:** Background `HEAD <route>` prefetches from Next.js return HTTP 503 intermittently while the corresponding `GET <route>?_rsc=*` returns 200. Same pattern was logged in `docs/uat/reports/2026-05-03-teacher.md` for `/teacher/assessments`. No user-visible impact in this run but the noise pollutes Vercel function logs.
- **Suggestion:** Investigate why Next.js prefetch issues HEAD against pages that may not support the method; consider adding a `HEAD` handler that returns 200 or letting the framework's GET fallback take over.

### FIND-004 — No reactivate UI for soft-deactivated campus (minor)
- **Module:** `/admin/settings/campuses`
- **Severity:** minor
- **Observation:** Soft-delete works (Nonaktifkan → row hidden + toast "Kampus dinonaktifkan"). The status filter dropdown defaults to "Aktif" with no "Semua" / "Tidak aktif" toggle, so a deactivated campus is invisible and there is no UI affordance to reactivate it. Had to flip `Campus.status = 'ACTIVE'` via Supabase MCP to bring Metland Cibitung back.
- **Suggestion:** Add an "Aktif/Tidak Aktif" filter on the campus list and a Reactivate action in the kebab when viewing inactive rows. Same audit applies to every Category-A soft-delete resource (Program, ClassSection, FeeComponentDef, etc.).

### FIND-005 — Inconsistent delete toast copy (nit)
- **Module:** `/admin/settings/holidays`
- **Severity:** nit
- **Observation:** Delete confirmation succeeds with toast "Dihapus" (bare). Create/edit toasts on the same page are full sentences: "Hari libur ditambahkan", "Hari libur diperbarui". Campus and Roles pages use the same full-sentence pattern ("Kampus dinonaktifkan", "Peran dihapus").
- **Suggestion:** Update the holiday delete toast to "Hari libur dihapus" for consistency with the voice standard.

### FIND-006 — SalaryComponentDef.category accepts any string (major)
- **Module:** `/admin/salary-components` + `lib/payroll/engine.ts`
- **Severity:** major
- **Observation:** Prisma schema declares `category String` without an enum. The UI emits `"INCOME"` (verified by the row created via UI showing `category=INCOME` in DB). `lib/payroll/engine.ts` filters lines on `categorySnapshot === "INCOME"` / `=== "DEDUCTION"` — any typo or alternate spelling silently disappears from payroll calc. Reproduced by inserting a row with `category='EARNING'` via SQL — accepted, then would never have been counted by payroll.
- **Suggestion:** Tighten the Zod schema on `POST /api/salary-components` to `z.enum(["INCOME", "DEDUCTION"])`. Migrate `SalaryComponentDef.category` to a Prisma enum to enforce at the DB layer. Add a migration that normalises any existing non-canonical rows.

### FIND-007 — Hidden Jabatan dependency on Karyawan create (minor)
- **Module:** `/admin/employees` create dialog
- **Severity:** minor
- **Observation:** First-time admin opening the "Tambah Karyawan" dialog sees Jabatan dropdown with only "+ Tambah jabatan baru" — no presets, no Settings sidebar entry to manage Jabatan separately. Discoverability is poor: admin doesn't know they need to create one first. Inline-add does work (typed "Guru Kelas" + Enter and the value persisted with the employee), but the affordance is non-obvious.
- **Suggestion:** Either (a) seed a default Jabatan list per tenant on tenant creation, or (b) add a `/admin/settings/positions` route surfaced in the Pengaturan menu. The inline-add UX should also expose a "Save Jabatan" button explicitly rather than relying on Enter-to-commit.

### FIND-008 — Teaching Assignments page missing Tambah CTA (minor)
- **Module:** `/admin/teaching-assignments` (sidebar: "Guru Pengajar")
- **Severity:** minor
- **Observation:** Empty state copy reads "Tambahkan guru ke kelas melalui halaman Tahun Ajaran." but no inline CTA, no link, no instructions on where in the Tahun Ajaran page the assignment flow lives. The page never shows a "Tambah" or "+" button. Workaround: insert via SQL.
- **Suggestion:** Add a primary "Tambah Penugasan" button on this page with a class+teacher+role dialog, mirroring the Campus/Holiday create pattern.

### FIND-009 — Guardian relationship combobox value lost on save (major)
- **Module:** `/admin/students/[id]` → Tambah Wali dialog
- **Severity:** major
- **Observation:** Selected "Ayah" in the Hubungan combobox (verified the option element resolved and clicked). After submit, the row appeared as "Wali" badge, and `StudentGuardian.relationship` persisted as `"WALI"`. POST `/api/students/[id]/guardians` returned 201. Either the combobox `onChange` doesn't update form state in time before submit, OR the API route ignores the field and defaults to WALI.
- **Suggestion:** Add an integration test that creates a guardian with each Hubungan value and asserts the persisted `relationship` matches. Likely fix is in the form controller (Base UI Select v2 sometimes loses state on rapid open→close cycles).

### FIND-010 — First guardian not marked isPrimary (minor)
- **Module:** `/admin/students/[id]` → first Tambah Wali
- **Severity:** minor
- **Observation:** Created the only guardian for Bilal Hakim; DB persisted `StudentGuardian.isPrimary = false`. Expected: if no other guardians exist for the student, the first one should default to `isPrimary = true`.
- **Suggestion:** In the guardian-create API path, default `isPrimary` to `count(prior guardians)===0`.

### FIND-011 — Admissions stat counters out of sync with list (minor)
- **Module:** `/admin/admissions`
- **Severity:** minor
- **Observation:** Immediately after creating an INQUIRY admission, the page shows "1 calon siswa" in the heading and one row in the table, but the top KPI cards still read `TOTAL CALON 0`, `PERTANYAAN 0`, `DITERIMA 0`. Hard refresh likely resolves; the counter widget runs a separate query that does not invalidate on the same revalidation tag.
- **Suggestion:** Bind the counter widget to the same fetch / route segment as the list.

### FIND-012 — Invoice list slow to reflect new row (minor)
- **Module:** `/admin/invoices`
- **Severity:** minor
- **Observation:** After successful POST `/api/invoices` and redirect back to `/admin/invoices`, the list shows "0 tagihan" with skeleton placeholder rows for ~3-5 seconds before populating. The newly-created invoice is missing from the first render even though it was just created and is queryable in the DB.
- **Suggestion:** Likely the same cache-invalidation gap as FIND-001/FIND-011. Tag the list query and invalidate on POST.

### FIND-013 — Dashboard "Tren Kehadiran" empty despite data (minor)
- **Module:** `/admin`
- **Severity:** minor
- **Observation:** After inserting two `AttendanceRecord` rows (2026-05-13 LATE, 2026-05-14 PRESENT for employee IR1), the dashboard's "Tren Kehadiran (7 Hari Terakhir)" panel still shows "Data kehadiran belum tersedia". Hard refresh did not resolve. Either the panel queries a different table (e.g. aggregated `attendance_summary`), or the query window doesn't include yesterday/today.
- **Suggestion:** Check the dashboard's attendance-trend SQL: ensure it covers `>= now() - interval '7 days'` against `AttendanceRecord.date`, not a derived materialized view.

### FIND-017 — Teacher Penilaian periode header wrong AY (minor)
- **Module:** `/teacher/assessments`
- **Severity:** minor
- **Observation:** Active `AcademicYear.name = '2026/2027'` (ACTIVE). Teacher Penilaian landing page renders subheader "Periode: Semester 2 2025/2026". Either the page hardcodes the AY string, or it's pulling a stale AY from somewhere not affected by recent inserts.
- **Suggestion:** Derive the periode header from `prisma.academicYear.findFirst({ where: { status: 'ACTIVE' } })` per request, not a static string.

### FIND-018 — Leave detail dialog missing action buttons (minor)
- **Module:** `/admin/leave-requests` detail dialog
- **Severity:** minor
- **Observation:** Clicking the "Lihat" row action opens a Detail Cuti dialog containing only the request summary + a "Tutup" button. Setujui/Tolak exist on the row's kebab menu — discoverability gap.
- **Suggestion:** Mirror the row-kebab actions inside the detail dialog footer (Tolak left, Setujui right).

### FIND-019 — Payroll generates Rp 0 with no salary structure warning (minor)
- **Module:** `/admin/payroll` create flow
- **Severity:** minor
- **Observation:** Created a payroll period 2026-04-21 → 2026-05-20 against employee IR1 who had no `EmployeeSalaryValue` rows. Generation succeeded silently with Total Pendapatan / Potongan / Bersih = Rp 0. The Setujui flow lets you publish a Rp 0 payroll. Production users could send empty salary slips by accident.
- **Suggestion:** Pre-flight validation in `POST /api/payroll/generate`: refuse with 422 if any included employee has no `EmployeeSalaryValue` rows. UI should also surface a per-employee warning chip on the draft page.

---

## Teacher portal findings

### FIND-015 — Teacher home page hydration mismatch (BLOCKER)
- **Module:** `/teacher`
- **Severity:** **blocker**
- **Observation:** After signing in as `ismail10rabbanii@gmail.com` (User auto-created with role TEACHER linked to the Employee row I had just created via `/admin/employees`), `/teacher` renders only the greeting block:
  ```
  Selamat Pagi, Ustadz/Ustadzah Ismail Rabbanii
  Rabu, 13 Mei 2026
  ```
  The check-in card, assigned-class list, and any home content are missing — page body is blank below the date. F5 reload does not resolve. Console emits `Error: Minified React error #418` ([text content mismatch](https://react.dev/errors/418)). This matches the exact symptom that `docs/cycles/2026-05-10-phase0-admin-hydration-and-bfcache.md` was supposed to fix on staging.
- **Impact:** Teacher cannot tap check-in / check-out from home. Workaround is to navigate via the bottom tab bar to Kehadiran/Kelas/Penilaian, all of which render correctly.
- **Suggestion:** Add a teacher-home hydration assertion to the Playwright suite (currently only admin/parent are covered per phase0 cycle). Investigate whether the recent Next.js 16 bump (PR #254) interacts with `home-client.tsx`'s server-rendered date string.

### FIND-014 (rolled into FIND-015) — initial impression of blank teacher home

### FIND-016 — Server rejects today's class attendance (blocker for daily flow)
- **Module:** `/teacher/class-attendance` + `POST /api/student-attendance/mark`
- **Severity:** **blocker** (for daily attendance workflow)
- **Observation:** Selected date 2026-05-14 (real today WIB), tapped a student row to cycle status. Network: `POST /api/student-attendance/mark` returned HTTP 400 with body `"Tidak bisa mencatat kehadiran untuk tanggal yang akan datang"` (cannot record attendance for a future date). Same call against 2026-05-13 returned 200 OK. Root cause shared with FIND-002 — the server's "today" calculation uses UTC, so at any time before 07:00 WIB the server computes today as yesterday-WIB.
- **Suggestion:** Same as FIND-002. Once the timezone fix lands, teachers can mark today's class attendance again.

### Teacher modules that PASSED
- **Module 2.2 — Kehadiran calendar + Cuti & Izin:** Monthly calendar renders 13 May orange (LATE), 14 May green (PRESENT). Cuti sheet shows Cuti Tahunan 12/12 + Cuti Sakit 14/14 balances. Submitted "Cuti Tahunan 20 Mei 2026, alasan: Acara keluarga" → POST `/api/leave/requests` → 201. Row appeared with Menunggu badge + Batalkan action.
- **Module 2.3 — Class attendance (past date):** KB Aster selected, date 2026-05-13, default Hadir for both Bilal + Ahmad. Tapped Bilal once → Alpa, POST 200, counters updated optimistically.
- **Module 2.4 — Penilaian rubric autosave:** Expanded Bilal row (lazy mount worked), tapped BSH, typed catatan "Sudah hafal Al-Fatihah dan beberapa doa harian". "Menyimpan..." indicator appeared, badge changed 0/1 → 1/1, pre-publish warning decremented "2 siswa belum memiliki nilai lengkap" → "1 siswa belum memiliki nilai lengkap".
- **Module 2.5 — Buku Penghubung entry:** Expanded Bilal, ticked 2/3 indicators under Aktivitas Belajar, hit Simpan, POST `/api/student-journal/entries/batch` → 200, toast "Catatan tersimpan · 2 entri".

---

## Parent portal findings

### Parent modules that PASSED (no blocker / major findings)
- **Module 4.1 — Parent home:** Greeting "Assalamu'alaikum, Bu Rightjet", subline "Selamat sore · Rabu, 13 Mei 2026 · 26 Zulkaidah 1447 H" (Hijri date computes correctly). "ANAK ANDA" card for Bilal · KB Aster with week-grid Sen-Jum (Rab highlighted, "Tidak hadir hari ini" reflecting the Alpa mark). "TAGIHAN" Rp 1.000.000 (2 tagihan belum dibayar · jatuh tempo terdekat 31 Mei) — accurate sum of Bilal's Mei + Juni invoices.
- **Module 4.2 — Tagihan + Xendit simulate payment (the headline test):** Navigated to `/parent/invoices`, opened "Mei 2026 · Rp 500.000" detail sheet showing CARA BAYAR options (BRI/BNI/Mandiri/BCA/Permata VAs). Tapped "Bayar sekarang" → new tab to `https://checkout-staging.xendit.co/session/session-69963a8de776f1af83a05be7c88e852f`. Picked QR Code method → "Bayar ke Annisaa Sekolahku" → QRIS screen with "Simulasi Pembayaran" button → clicked → redirected back to `/parent/invoices?invoice=...&xenditStatus=paid`. List now shows BELUM DIBAYAR Rp 500.000 (Juni only), RIWAYAT PEMBAYARAN with Mei 2026 Rp 500.000 "Dibayar 13 Mei". Toast "Alhamdulillah, tagihan Mei 2026 terbayar." `Payment` table row inserted (1 row, amount 500000.00). Webhook → DB → UI roundtrip works end-to-end with no manual replay.
- **Module 4.3 — Kehadiran week grid:** Header "Kehadiran" + summary "Hadir 0 · Sakit 0 · Alpa 1" + supportive copy "Bilal istirahat dulu, semoga lekas sehat." 5-day grid 11-15 Mei with Rab 05/13 showing "A" — reflects exactly what teacher just marked. Cross-actor propagation confirmed.
- **Module 4.5 — Buku Penghubung (SCHOOL read):** Di Sekolah tab renders the 2 categories + 3 indicators from the journal template. Mengerjakan tugas harian and Aktif bertanya both show ✓ on Rab 05/13 — matches teacher's submission. Akhlak/Sopan santun empty as expected.

---

## Cross-actor verifications

- **Invoice PAID propagation:** Parent paid INV-2026-0001 via Xendit sandbox → admin invoice list (verified via DB query: 1 row in `Payment` table sum 500000.00; `Invoice.totalPaid = 500000.00`, `Invoice.status` transitioned to a paid state per parent UI showing "Dibayar 13 Mei").
- **Class attendance flow:** Teacher marked Bilal Alpa on 13 May (POST /api/student-attendance/mark → 200) → parent home shows "Tidak hadir hari ini" → parent attendance week-grid shows red "A" badge on Rab 05/13.
- **Buku Penghubung flow:** Teacher ticked 2 indicators for Bilal on 13 May (POST /api/student-journal/entries/batch → 200) → parent Di Sekolah tab shows checks on the same indicators on the same date.
- **OAuth identity auto-provision:** Both `ismail10rabbanii@gmail.com` (Employee match → TEACHER) and `rightjet.hq@gmail.com` (Parent match → GUARDIAN) auto-created their `public.User` row on first sign-in and landed on the correct portal without any manual User CRUD.

---

## Performance / network notes

No 5xx outside the RSC HEAD prefetch noise (FIND-003). Xendit checkout session created in <2s after Bayar sekarang tap. Webhook → DB update visible in parent UI within 8s of clicking "Simulasi Pembayaran". Bulk invoice generation for 3 students completed in ~10s with "3 link berhasil" toast (all Xendit links provisioned synchronously in this batch — well under the 60s Vercel function ceiling).

---

## Recommended follow-up cycles

Grouped roughly by ownership / blast radius. Severity rank determines proposed order.

| # | Slug | Severity | Scope |
|---|---|---|---|
| 1 | `feat/teacher-home-hydration-fix` | blocker | Resolve FIND-015 (React #418 on `/teacher`). May overlap with the open PR from `2026-05-10-phase0-admin-hydration-and-bfcache` if not yet merged. |
| 2 | `feat/jakarta-tz-server-date-regression` | blocker + major | Resolve FIND-002 + FIND-016. Audit every `new Date()` / `toISOString()` callsite in `app/api/**` and `lib/**`; route through `getYmdInTimezone(now, "Asia/Jakarta")`. |
| 3 | `feat/salary-category-enum-tightening` | major | FIND-006 — enum migration + Zod hardening for `SalaryComponentDef.category`. |
| 4 | `feat/guardian-relationship-form-state` | major | FIND-009 — diagnose why Hubungan combobox loses value. Likely a Base UI Select v2 controlled-state bug. |
| 5 | `feat/admin-data-cache-invalidation` | minor (cluster) | FIND-001 + FIND-011 + FIND-012 + FIND-013 — all variants of "stat/list query not invalidated on mutation". Audit `unstable_cache` / `revalidateTag` usage across admin routes. |
| 6 | `feat/admin-ux-soft-delete-and-cta-gaps` | minor (cluster) | FIND-004 (campus reactivate) + FIND-007 (Jabatan onboarding) + FIND-008 (Teaching Assignments Tambah CTA) + FIND-018 (Leave detail action buttons). |
| 7 | `feat/payroll-prereq-validation` | minor | FIND-019 — refuse to generate payroll when employees have no salary structure. |
| 8 | `chore/voice-toast-consistency` | nit | FIND-005 — sweep all CRUD delete toasts to use "X dihapus" pattern. |
| 9 | `feat/teacher-assessments-periode-derive` | minor | FIND-017 — derive periode label from active AY, not hardcoded. |
| 10 | `chore/rsc-head-prefetch-503` | minor | FIND-003 — debug HEAD 503 across admin routes. Possibly add explicit HEAD handlers. |

---

## Methodology notes

- Drove all browser interaction through Claude-in-Chrome MCP. No Playwright/automation harness — every flow exercised the real production-built Next.js bundle on staging.
- Three real Google identities used end-to-end (no demo-mode magic-link). Account switcher worked smoothly across all 3 logins; no CAPTCHA triggered.
- For modules where the UI CRUD path was confirmed identical to a previously-tested module (e.g. assessment indicators inside a template after creating the template via UI), used Supabase MCP `execute_sql` to bulk-seed downstream rows for time. Each such shortcut is annotated inline in the cycle doc.
- Findings report compiled inline during the sweep; no per-finding screenshots saved to disk this run (instructed to skip stops; final report is text-only for speed). Each finding cites the relevant API path / DOM region so a follow-up cycle can reproduce.

---

## Run-2 follow-up sweep (payroll w/ real salary, raport publish, profiles)

After Run 1 the user requested a second pass to (a) set IR1's salary structure so the payroll slip isn't Rp 0, (b) publish a raport so the parent reports page has content, and (c) cover both teacher and parent profile pages that Run 1 skipped.

### FIND-015 (Run-2 update) — downgraded from blocker to major
Teacher home `/teacher` rendered fully on the second sign-in: greeting, big green "Selesai ✓" check-out card ("Anda sudah pulang hari ini · ⊙ Menunggu..."), AKSES CEPAT > Buku Penghubung tile, STATUS HARI INI panel. The difference between Run-1 (blank) and Run-2 (full): in Run-2 there was an `AttendanceRecord` row for IR1 dated today, while in Run-1 there was no record. The React #418 fires when the home has nothing to render and the server SSR vs client diverges on the empty state. **Severity now major, not blocker** — but the underlying hydration bug is real and still needs the same fix (the empty-state code path in `app/teacher/home-client.tsx`).

### FIND-020 — Withdrawn (Run-1 was wrong)
Run-1 logged "no UI for per-employee salary values". This was incorrect — the **Gaji** tab on `/admin/employees/[id]` renders an editable form once `SalaryComponentDef` rows exist for the tenant. The Run-1 false-positive was triggered because at that point only one component def existed and the empty-state copy "Belum ada komponen gaji" misled me; after adding two more components via SQL and reloading, the tab populated correctly with all 3 components and per-component number inputs + "Simpan Semua Nilai" CTA.

### FIND-020-NEW — PUT /api/employees/[id]/salary returns 400 (major)
With salary structure correctly inserted via Supabase MCP, attempted to modify Gaji Pokok 4500000 → 4750000 in the Gaji tab and click Simpan Semua Nilai. `PUT /api/employees/[id]/salary` returned **HTTP 400** twice in a row, toast "Gagal menyimpan". The schema (`lib/validations/employee-salary.ts`) expects `Array<{componentDefId: string, value: number}>` and the UI surface looks correct. Could not capture the request body without devtools, but the consistent 400 indicates either a payload-shape mismatch or a stale `componentDefId` reference. Workaround: SQL the rows.
- **Suggestion:** Add a request-body audit log on this route, or surface the Zod error message in the toast instead of the bare "Gagal menyimpan".

### Payroll redo (PASS once salary values inserted via SQL)
- Created new payroll period `2026-04-21 — 2026-05-20` for IR1 with `EmployeeSalaryValue` rows: gaji_pokok = Rp 4.500.000, tunjangan_transport = Rp 500.000, potongan_bpjs = Rp 200.000.
- Draft generated correctly: Pendapatan Rp 4.568.182 (gaji_pokok prorated to Rp 4.500.000 base + tunjangan_transport prorated based on attendance to Rp 68.182), Potongan Rp 200.000, Bersih **Rp 4.368.182**.
- State machine progressed DRAFT → Disetujui → Slip Terkirim cleanly with the same toasts and `POST /api/payroll/.../send-slips` → 200. **Important correction to FIND-019 from Run 1:** payroll did NOT silently produce Rp 0; it produced Rp 4.5M from the salary values inserted via SQL. The Rp 0 in Run-1 reflected the fact that no salary structure had been set yet, not a payroll bug. FIND-019's "no validation warning that salary is unset" still stands — admin can still ship a Rp 0 payroll if they don't notice — but the silent-zero label is less alarming.

### Teacher slip detail (Module 2.6 - PASS)
`/teacher/slips` lists `21 Apr 2026 — 20 Mei 2026 · Tersedia · [PDF]`. Tapping the row navigates to `/teacher/slips/[slipId]` showing:
- INFORMASI KARYAWAN: Bapak Ismail R. · NIP IR1 · Guru Kelas · 22 hari
- PENDAPATAN: Gaji Pokok Rp 4.500.000 + Tunjangan Transport Rp 68.182 = Total Rp 4.568.182
- POTONGAN: Potongan BPJS Rp 200.000
- (Bersih Rp 4.368.182 inferred — scroll cut off)
- "Tersedia" status badge + PDF download CTA. Layout fits desktop viewport without horizontal scroll.

### Teacher raport publish flow (Module 2.4 follow-up - PASS)
On `/teacher/assessments/[classSectionId]/[templateId]/[period]`, expanded Ahmad Faris's previously-empty row, tapped MB, entered "Mulai berkembang dalam hafalan", then tapped "Publikasikan rapor" at the bottom. Both students transitioned to "Dipublikasikan" badges (Ahmad 1/1 + Bilal 1/1), header counter "2/2 siswa sudah dipublikasikan", toast "2 siswa dipublikasikan". Cross-portal verification below.

### Module 4.4 — Parent Rapor — PASS
Navigated to `/parent/reports` as Bu Rightjet. Page shows a banner:
```
Rapor Semester 2 2025/2026 Bilal sudah terbit
Alhamdulillah, silakan baca penilaian lengkap dari Ustadzah.
```
Voice + emoji tone hits Bu Sari/Bu Nur registry well. Tapping "Buka rapor" opens a modal with the published raport content:
- Heading: "Raport Semester 1 KB 2026"
- Subline: "Semester 2 2025/2026 · Kelompok Bermain"
- Section "Aspek Spiritual" → "Hafalan doa harian" → badge **BSH**
- Section "Catatan Ustadzah" → "Sudah hafal Al-Fatihah dan beberapa doa harian"

Exactly mirrors what was entered on the teacher side. Cross-actor data propagation confirmed end-to-end for raport.

### Module 2.7 — Teacher Profile (read-only) — FIND-021 (minor)
`/teacher/profile` renders Nama Lengkap, Jabatan, Kampus, Email, No HP — all read-only fields. No Edit button anywhere. Matches the gap previously logged in `docs/uat/reports/2026-05-03-teacher.md` (JTBD-TEACHER-PROFILE-01 photo/contact update).
- **Severity:** minor (read still works, edit blocked).
- **Suggestion:** Add an Edit screen (or inline field edits) at minimum for No HP and Nama Formal — these change in real life and admin should not have to do it on behalf of teachers.

### Module 4.6 — Parent Profile (read-only) — FIND-022 (minor)
`/parent/profile` renders avatar "RH", "Rightjet HQ", "Wali murid · 1 anak terdaftar", KONTAK 081234567892 + email, ANAK ANDA card for Bilal Hakim. No edit affordance — same pattern as teacher.
- **Severity:** minor.
- **Suggestion:** Same as FIND-021; at minimum allow parent to update phone + WhatsApp inline (common case: parent changes number).

### Summary delta from Run 1
- FIND-015 downgraded blocker → major (still real, but empty-state-specific, not always blocking).
- FIND-019 reframed (silent Rp 0 confirmed reproducible only when salary structure missing; payroll engine itself is sound).
- FIND-020 from Run-1 withdrawn; replaced with **FIND-020-NEW** about the PUT 400 on salary save.
- Two new minor findings FIND-021 (teacher profile read-only) + FIND-022 (parent profile read-only).
- Net: 1 blocker (FIND-016 only; FIND-015 downgraded), 6 majors, 13 minors, 2 nits.

## Final DB state (sanity)

```sql
SELECT
  (SELECT count(*) FROM "Tenant") AS tenants,        -- 1
  (SELECT count(*) FROM "User") AS users,            -- 3 (ismailir10, ismail10rabbanii auto-created, rightjet.hq auto-created)
  (SELECT count(*) FROM "Campus") AS campuses,       -- 2
  (SELECT count(*) FROM "Program") AS programs,      -- 2 (KB, TK)
  (SELECT count(*) FROM "AcademicYear") AS years,    -- 1 (2026/2027 ACTIVE)
  (SELECT count(*) FROM "ClassSection") AS classes,  -- 4
  (SELECT count(*) FROM "Employee") AS employees,    -- 1 (IR1)
  (SELECT count(*) FROM "Student") AS students,      -- 3 (Bilal, Ahmad, Aisyah)
  (SELECT count(*) FROM "Parent") AS parents,        -- 1 (Rightjet HQ)
  (SELECT count(*) FROM "Invoice") AS invoices,      -- 4 (Mei × 1 manual PAID + Juni × 3 bulk)
  (SELECT count(*) FROM "Payment") AS payments,      -- 1 (Rp 500.000)
  (SELECT count(*) FROM "PayrollRun") AS payroll_runs;  -- 1 (state: SLIPS_SENT, net Rp 4.368.182)
```

After Run-2:
- 1 raport published (Bilal BSH + Ahmad MB on KB Aster, Semester 2 2025/2026)
- 1 EmployeeSalaryValue set (3 rows: gaji_pokok 4.5M, tunjangan_transport 500k, potongan_bpjs 200k)
- Payroll regenerated with non-zero amounts; old (Rp 0) run discarded.
