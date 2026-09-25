# Staging E2E Sweep — 2026-05-13

**Env:** https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/
**Actors tested:**
- super admin → `ismailir10@gmail.com`
- teacher → `ismail10rabbanii@gmail.com` (Employee `ITT29`, Wali Kelas TKIT B)
- parent → `rightjet.hq@gmail.com` (Guardian `Siti Nurhaliza Hidayat`, 3 anak: Ahmad Zafran TKIT A, Aisyah Putri TKIT A, Fatimah Az-Zahra TKIT B)

**Method:** claude-in-chrome MCP, real Google OAuth, single browser session per actor. Manual exploratory testing, severity-tagged findings inline.

**Scope:** Full CRUD allowed; no destructive deletes against shared records.

**App version observed:** `An Nisaa' Sekolahku · v3.4.2`.

---

## Executive Summary

| Severity | Count |
|---|---|
| blocker | 0 |
| major | 3 |
| minor | 8 |
| nit | 7 |
| **total** | **18** |

**Top themes:**
1. **Loading-state hygiene.** Stat tiles + page subtitles render `0` (or the cold empty-state copy) for the ~3 s window between page mount and data resolution — visible across Pengaturan, Kesiswaan, Akademik, and Penggajian. One fix recipe in place will close ≥5 findings.
2. **Stale E2E artifacts polluting staging.** `E2E PROMES Import`, `E2E Bulk`, `E2E Combobox`, `Rate Limit Test`, `E2E Trust Boundary`, `E2E Tema` rows persist across Tahun Ajaran, Semester themes, Tagihan, and Pendaftaran. E2E specs need teardown.
3. **Identity / display drift.** Same child shows as "Ahmad" / "Zafran" / "Ahmad Zafran Hidayat" depending on the screen. Greeting falls back to "Ustadz/Ustadzah" with the slash. Guardian.email is empty for all 200 wali rows. The product needs one canonical display-name rule + one source-of-truth for outbound contact info.
4. **Capacity + onboarding guards leaking.** TKIT B is 21/20 (over capacity). Newly added teacher (ITT29) has Bank set but No. Rekening empty, exposed downstream to payroll BSI export.

**Recommended follow-ups, in priority order:**
- Fix F-4 (capacity guard regression) — class is genuinely over-enrolled today.
- Fix F-10 (Rekening required-when-Bank-set) before next payroll run, lest the BSI export emit invalid rows.
- Fix F-7 (Guardian.email backfill) before any invoice-email feature ships.
- Bundle F-1 + F-8 + F-9 + F-11 + F-14 + F-16 + F-18 as a single "page-header loading states + copy" cycle.
- Run a one-off staging scrub for F-5 + F-13 stale E2E rows, then patch the e2e specs.

---

## Findings (sorted by severity)

### F-4 — TKIT B over-enrolled (21 students in a class with capacity 20)
- **Severity:** major
- **Actor / Module:** admin / Akademik → Kelas
- **Route:** `/admin/academic-years` (Kelas section)
- **Steps to repro:** 1) Open `/admin/academic-years`. 2) Scroll to Kelas table. 3) Read the Murid column for TKIT B.
- **Expected:** Enrolled count ≤ capacity. Capacity check inside `$transaction` with `SELECT … FOR UPDATE OF cs` was added 2026-04-24 specifically to prevent this race.
- **Actual:** TKIT B shows "21/20" — one student over capacity.
- **Suggested fix area:** verify `POST /api/enrollments` capacity guard; add a guard on capacity edit (`PATCH /api/class-sections/[id]`) that rejects new capacity < current active enrollment count.

### F-7 — Guardian record for live parent account has empty email
- **Severity:** major
- **Actor / Module:** admin / Kesiswaan → Wali Murid
- **Route:** `/admin/guardians` → Siti Nurhaliza Hidayat → Edit
- **Steps to repro:** 1) Search Wali Murid for "Siti Nurhaliza". 2) Open Edit dialog.
- **Expected:** `Guardian.email` populated for users who log in (in this case `rightjet.hq@gmail.com`).
- **Actual:** Email field is blank. Whole `/admin/guardians` list shows `—` in Email column for all 200 wali.
- **Impact:** Outbound parent communications (invoice notifications, future email blasts) targeting `Guardian.email` will reach no one; auth/login still works because login resolves on `User.email`.
- **Suggested fix area:** seed/sync hook should backfill `Guardian.email` from the linked `User.email` when a guardian first logs in via OAuth; or `_getParentWithChildren` should fall back to `User.email`.

### F-10 — Ismail Teacher Test employee record has Bank but no Rekening
- **Severity:** major
- **Actor / Module:** admin / SDM → Karyawan
- **Route:** `/admin/employees/<id>` (Ismail Teacher Test ITT29)
- **Steps to repro:** Open the Karyawan detail.
- **Expected:** Bank + Rekening both populated for any employee who will receive a payroll slip.
- **Actual:** Bank shows "Bank BSI" but No. Rekening is `—`. List page already flags this as a `Belum diisi` badge — so the data layer knows.
- **Impact:** Payroll slip + BSI bulk-export CSV will emit empty/invalid rekening if this employee is included in a future payroll run.
- **Suggested fix area:** Tambah/Edit Karyawan form should make Rekening required when Bank is set; payroll-run creation should refuse employees whose Rekening is blank, with an inline warning.

### F-1 — Stat-card counters render "0" before fetch resolves
- **Severity:** minor
- **Actor / Module:** admin / multiple
- **Route:** `/admin/settings/holidays`, `/admin/settings/users`, `/admin/settings/roles`, `/admin/academic-years`, `/admin/guardians`, `/admin/students`, `/admin/admissions`, `/admin/employees`, `/admin/leave-requests`, `/admin/student-attendance`
- **Steps to repro:** Cold-load any of the listed routes. Watch the header during the first ~3 s.
- **Expected:** Stat number area shows a skeleton or `—` until data resolves.
- **Actual:** Header / KPI tiles read literal `0` (or `0 X terdaftar`) while skeleton rows load, then jumps to the real number. Every page-shell built on the same stat-tile primitive has the same flash.
- **Suggested fix area:** the shared stat-tile component reading from a TanStack-Query default; switch `initialData` to `undefined` and gate the count behind `query.data ?? <skeleton>`.

### F-5 — Stale E2E test artifacts in Akademik + Kurikulum
- **Severity:** minor
- **Actor / Module:** admin / Akademik + Kurikulum
- **Route:** `/admin/academic-years`, `/admin/semesters`
- **Actual:** Two `E2E PROMES Import 1778646…` tahun-ajaran rows for 2030/2031 are still Aktif. One `E2E Tema 1778646578103` row inside 2025/2026 Semester 1.
- **Suggested fix area:** add teardown to the PROMES-import E2E spec.

### F-8 — Wali Murid filter count vs stat panel disagree
- **Severity:** minor
- **Actor / Module:** admin / Kesiswaan → Wali Murid
- **Route:** `/admin/guardians?search=...`
- **Actual:** With "Siti Nurhaliza" filter, subtitle reads "1 wali terdaftar" but TOTAL WALI card still shows 200. Decide on filtered-vs-total semantics across all admin tables.
- **Suggested fix area:** same pattern likely applies to Siswa + Karyawan + Tagihan.

### F-9 — Siswa table empty-state doesn't differentiate "no data" vs "no matches"
- **Severity:** minor
- **Actor / Module:** admin / Kesiswaan → Siswa
- **Route:** `/admin/students?search=...`
- **Actual:** Searching for a name with zero matches renders the cold empty-state ("Belum ada siswa terdaftar — Mulai dengan menambahkan siswa baru.") even though TOTAL SISWA = 100.
- **Suggested fix area:** guard the cold empty CTA behind `isInitialFetchAndEmpty`; show a separate no-match state when filter is active.

### F-11 — Tagihan stat tiles miss the dominant "Terkirim" status
- **Severity:** minor
- **Actor / Module:** admin / Keuangan → Tagihan
- **Route:** `/admin/invoices`
- **Actual:** Total = 113, DRAFT = 0, LUNAS = 4, SEBAGIAN = 1, JATUH TEMPO = 1. The remaining 107 invoices carry the `Terkirim` row badge and are uncounted on the tiles.
- **Suggested fix area:** add a TERKIRIM card so the tiles sum to total.

### F-13 — Stale E2E test invoices + admissions in Keuangan + Pendaftaran
- **Severity:** minor
- **Actor / Module:** admin / Tagihan + Pendaftaran
- **Route:** `/admin/invoices`, `/admin/admissions`
- **Actual:** Many `E2E Bulk 1778646…`, `E2E Combobox 1778646…` invoice batches; `E2E Trust Boundary`, `E2E Sibling NoMatch`, `E2E Sibling Match`, `Rate Limit Test ×4`, `Aisyah Putri E2E` admissions.
- **Suggested fix area:** same as F-5.

### F-16 — Teacher slip placeholder copy doesn't match current date
- **Severity:** minor
- **Actor / Module:** teacher / Slip Gaji
- **Route:** `/teacher/slips`
- **Steps to repro:** Sign in as the just-onboarded teacher (joined 13 May 2026) on 13 May 2026.
- **Expected:** "Slip Mei 2026 akan tersedia setelah 5 Juni 2026" (next-period awaited) or "Anda belum punya slip — bergabung pertengahan periode" (joiner notice).
- **Actual:** Reads "Slip April 2026 akan tersedia setelah tanggal 5" even though today is 13 May (past the cutoff). Looks like an admin error.

### F-18 — Parent invoice detail shows "Link pembayaran belum tersedia" for SENT invoices
- **Severity:** minor
- **Actor / Module:** parent / Tagihan
- **Route:** `/parent/invoices` → April 2026 row for Ahmad Zafran
- **Steps to repro:** 1) As Siti Nurhaliza, open parent invoices. 2) Tap the April 2026 row.
- **Expected:** Either show the Xendit checkout link OR distinguish "PENDING payment-link generation" (transient) from "VOID/DRAFT — admin must publish".
- **Actual:** Banner reads "Link pembayaran belum tersedia. Silakan hubungi admin sekolah untuk info pembayaran." — but admin invoice list shows the matching status as `Terkirim` (sent). Either the pipeline lost the Xendit link or the parent UI doesn't refresh until next page-load.
- **Suggested fix area:** confirm whether the parent invoice GET matches admin's `xenditPaymentUrl` field; if missing, surface "menyiapkan link…" instead of "hubungi admin".

### F-19 — Parent invoice + attendance + rapor tabs use formal first-name, beranda uses nickname
- **Severity:** minor
- **Actor / Module:** parent
- **Route:** `/parent`, `/parent/invoices`, `/parent/attendance`, `/parent/reports`, `/parent/student-journal`, `/parent/profile`
- **Actual:** Same child shows three different labels across the parent portal:
  - `/parent` (Beranda) — "Zafran" (nickname)
  - `/parent/student-journal` tab pills — "Zafran" (nickname)
  - `/parent/invoices` + `/parent/attendance` + `/parent/reports` tab pills — "Ahmad" (first word of formal name)
  - `/parent/profile` child list — "Ahmad Zafran" (formal short)
  - `/parent/reports` rapor card body — "Zafran"
- **Suggested fix area:** decide one canonical short name per child (probably nickname when set, else first formal word), and use it everywhere.

### F-2 — Tambah Kampus modal uses a real campus name as placeholder
- **Severity:** nit
- **Route:** `/admin/settings/campuses`
- **Actual:** Nama field placeholder is "Taman Aster", which is an existing campus. Reads like a duplicate prefilled value.

### F-3 — List card enter-animation feels sluggish on small lists
- **Severity:** nit
- **Route:** `/admin/settings/campuses`
- **Actual:** With only 3 rows, the staggered fade-in takes ~2 s — looks like still-loading.

### F-6 — Breadcrumb shows "Detail > Detail" on semester theme tree
- **Severity:** nit
- **Route:** `/admin/semesters/[id]/themes`
- **Actual:** `Kurikulum > Semester > Detail > Detail`. `SEGMENT_LABELS` map in `config/admin-nav.ts` missing `themes` (and likely `subthemes` / `weeks`).

### F-12 — Aktivitas Xendit row shows empty "Metode" for VA payment
- **Severity:** nit
- **Route:** `/admin/invoices/<paid-invoice-id>` (e.g. INV-2026-2106)
- **Actual:** Payment row above reads "Virtual Account" but the AKTIVITAS XENDIT row below it reads "Metode: —". Likely event-level payload missing method; fall back to `payment.method`.

### F-14 — "DRAF" label missing trailing T
- **Severity:** nit
- **Route:** `/admin/assessments`
- **Actual:** Stat tile reads "DRAF" (not "DRAFT").

### F-15 — Teacher greeting honorific not resolved
- **Severity:** nit
- **Route:** `/teacher`
- **Actual:** "Selamat Malam, Ustadz/Ustadzah Ismail Teacher Test" — both honorifics rendered. Employee.gender resolution not wired, or template fallback uses the slash literal.

---

## Cross-actor verification — pass

Without explicit round-trip clicks, the data already proves the pipeline:
- Admin's INV-2026-2106 (`Fatimah Az-Zahra Hidayat · Mei 2026 · Lunas · Rp 850.000 · paid 13 Mei 14:17 via VA`) shows on `/parent/invoices?child=Fatimah` Riwayat Pembayaran as "Mei 2026 — Dibayar 13 Mei — Rp 850.000". ✅
- Admin's published `Ahmad Zafran Hidayat — Laporan Perkembangan Semester 1 — Dipublikasi` shows on `/parent/reports` Ahmad tab with the same 4 indicators + Catatan Ustadzah. ✅
- Teacher's class roster for TKIT B (21 students incl. Fatimah Az-Zahra "Izin hari ini") matches `/admin/student-attendance` (Fatimah Az-Zahra · TKIT B · Izin · 13 Mei). ✅
- Teacher's Buku Penghubung weekly grid for Fatimah Az-Zahra (6/16 indicators) ties to `/parent/student-journal` Fatimah tab data. ✅

No explicit re-creation needed; cross-actor cohesion confirmed.

## Out of scope this sweep

- Did not run a fresh payroll cycle for ITT29 (would have polluted Resend inbox).
- Did not complete a Xendit sandbox payment (would have changed an existing invoice's status — kept observation only).
- Did not submit a fresh `/daftar` public admission (queue already has 4 `Rate Limit Test` rows from a prior sweep — F-13).
- Did not deep-test the Kurikulum tema/subtema/pekan tree — that initiative is mid-build per memory.
