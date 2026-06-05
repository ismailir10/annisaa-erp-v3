# UAT Report — Admin + Teacher Full Walkthrough (staging, Chrome MCP)

- **Date:** 2026-06-04
- **Driver:** Chrome MCP against staging preview (`annisaa-erp-v3-git-staging-…vercel.app`), real Google sessions.
- **Method:** Manual UAT (not `/uat` Playwright persona). Each flow: navigate → assert page text → exercise CRUD → screenshot → check console + network (4xx/5xx) → cross-check with Vercel runtime logs.
- **Deployment under test:** `dpl_57DgVrX5pQXma7oQyq8kDWrX3Eyn` (branch `staging`).
- **Test-data convention:** `UAT-` prefix; records left in place (safe data).

## Severity legend
- **Blocker** — broken flow, data loss, 5xx (app), security/scoping leak, page>4s / API>2s / click>3s.
- **Major** — wrong data, validation gap, confusing dead-end, missing CRUD parity.
- **Minor** — copy/spacing/empty-state/affordance polish.
- **Env** — environment/infra noise, not an app defect (recorded for completeness).

---

## Persona A — Teacher (`Guru Dua`, E002, WakasekKur, Taman Aster — `ismail10rabbanii@gmail.com`)

Signed-in account resolves to **teacher only** (navigating `/admin` redirects to `/teacher` — correct role gating). Walked the full teacher surface.

### Coverage + result

| # | Flow | Route | Result |
|---|------|-------|--------|
| 1 | Dashboard | `/teacher` | ✅ SSR greeting, clock, quick-access, today's session (POPUP Weekend, 20 siswa), status card. No console errors. |
| 2 | My attendance | `/teacher/attendance` | ✅ "Kehadiran Saya" calendar Juni 2026, legend, counters (all 0). Cuti & Izin card. |
| 3 | Leave balances + history | Cuti & Izin sheet | ✅ Tahunan 12/12, Sakit 12/14, history shows approved "Sakit" 8–9 Mei. |
| 4 | **Submit leave** | Ajukan Cuti | ✅ Submitted UAT leave (Cuti Tahunan 22–23 Jun 2026). Toast "Pengajuan cuti terkirim", new **Menunggu** entry, balance correctly NOT yet deducted. **Left pending for admin-approval cross-test.** |
| 5 | Class attendance | `/teacher/class-attendance` | ✅ Class+date selector, 20 students. **Cycle-tap verified** (Hadir→Alpa→Sakit→Izin→Hadir); `POST /api/student-attendance/mark → 200`, optimistic UI + counters update. Restored to Hadir 20. |
| 6 | Connect-book entry | `/teacher/student-journal` + `/entry` | ✅ Class/date selectors → per-student list (0/16 indicators). |
| 7 | Per-student weekly journal | `/teacher/student-journal/students/[id]` | ⚠️ See T3 — read-only weekly grid (Ibadah/Perilaku/Akademis, 16 indicators), Catatan section. |
| 8 | Weekly assessment | `/teacher/assessments/weekly` | ⚠️ Empty state "Belum ada Pekan aktif" (no active week for Jun 2026 — outside Semester 2 2025/2026). See T1. |
| 9 | Daily-center assessment | `/teacher/assessments/center/worship` | ⚠️ Date picker + TK A/B + Kegiatan, gated on active Pekan. See T2. |
| 10 | Payslips | `/teacher/slips` | ✅ Pending-month notice + 1 available payslip (PDF). (PDF download not triggered.) |
| 11 | Profile | `/teacher/profile` | ✅ Read-only profile, "Hubungi admin untuk mengubah". |
| 12 | Session detail | `/teacher/sessions/[id]` | ✅ Per-student status cycle-tap + Tap Masuk/Tap Pulang clock in/out + Simpan. |
| — | Clock-in (MASUK) | `/teacher` | ⏭️ **Not tested** — requires browser geolocation grant; would create a real attendance punch. |

### Findings — Teacher

- **T1 — Minor (UX dead-end).** `/teacher/assessments/weekly` empty state reads *"Belum ada Pekan aktif untuk tanggal yang dipilih. Pilih tanggal lain atau minta admin menambah pekan."* but the screen exposes **no date picker** (only nav links — verified via interactive a11y read). User is told to pick another date with no control to do so. The sibling daily-center page *does* render a date picker → inconsistent. Fix: render the date picker in the empty state too, or drop the "pilih tanggal lain" clause.
- **T2 — Minor (layout overlap).** `/teacher/assessments/center/[center]` — the disabled sticky **Simpan** button visually overlaps the "Belum ada Pekan aktif" empty-state text/icon (z-order). Empty state should sit above/replace the footer when no Pekan is active.
- **T3 — Minor (misleading affordance).** Per-student weekly journal grid renders checkbox-style squares that are **not interactive** (read-only summary; a11y read shows no checkbox inputs, only nav + week-prev/next). Clicking does nothing. Editing happens in the entry list, not here. Consider a non-checkbox read-only glyph (✓/—) to avoid implying tap-to-toggle.
- **T4 — Env (verified non-defect).** Browser saw `503` on RSC-prefetch (`…?_rsc=`) and `HEAD` requests for `/teacher/student-journal*`. **Traced to Vercel preview Deployment-Protection edge**, not the app: Vercel runtime logs show the *same paths/timestamps* served `200` (GET) and `204` (HEAD) at the function layer. No 503 in serverless logs. User impact limited to occasional prefetch miss → silent hard-nav fallback. No production-domain impact expected.
- **T5 — Minor/Env.** `POST /api/csp-report → 204` fires ~2×/page load (report-only CSP; nothing blocked, pages render). Log bodies truncated via available tooling. Recommend a dev inspect one report body to identify the violating source (likely inline style/script or a third-party asset).

### Positives
- Role gating correct (`/admin` → `/teacher` redirect).
- No app-level 4xx/5xx; no console errors/hydration warnings observed.
- Attendance cycle-tap + leave submit persist correctly with good optimistic UI and Indonesian voice/courtesy copy.

---

## Persona B — Admin (`Ismail Rabbanii` — `ismailir10@gmail.com`)

Switched Google account via Talib logout → Google account chooser (account already authenticated; no password entry). Landed on `/admin` Dasbor (27 karyawan; Perlu Tindakan surfaced the pending UAT leave + 59 inquiries). Full admin sidebar present.

### Coverage + result

| # | Flow | Route | Result |
|---|------|-------|--------|
| A1 | **Kampus** (campus config) | `/admin/settings/campuses` | ✅ Full CRUD: created "UAT- Kampus Uji", deactivate (clear guard copy "Kampus dengan karyawan aktif tidak bisa dinonaktifkan"), reactivate. Clean empty state. |
| A2 | **Tahun Ajaran** (academic year) | `/admin/academic-years` | ✅ Created "UAT 2026/2027" (defaults to Perencanaan), activated via row menu. ⚠️ See A-hygiene + A4. |
| A3 | **Semester** (Kurikulum) | `/admin/semesters` | ✅ Created Semester 1 for UAT year (auto-Aktif). Tema/IKTP/PROMES-import sub-flows present (not deep-tested). ⚠️ See A4. |
| B | **Admissions funnel + convert** | `/admin/admissions` | ✅ Created "UAT- Calon Aisyah" inquiry; walked Pertanyaan→Kunjungan→Sudah Kunjungan→Diterima; **converted to student**. ⚠️ See B1, B2. |
| C | **Students** (manage data) | `/admin/students` + `/[id]` | ✅ Converted student present (guardian "UAT Ibu Fatimah · Ibu · Utama · WA" carried over). Edited bio (nickname, gender, NIS/NISN/Tempat Lahir — persisted). Enrolled to class. Withdrew with required reason → status WITHDRAWN + RIWAYAT STATUS recorded. Full lifecycle ✅. |

### Findings — Admin

- **A-hygiene — Major (data hygiene, staging).** Staging is heavily polluted with un-torn-down E2E fixtures: 18/21 academic years are `E2E Roll …` / `E2E PROMES Import …`; 9 of 10 active semesters are `E2E PROMES Import`; admissions list is ~75 rows dominated by `Rate Limit Test` (many dupes), `E2E Sibling Match/NoMatch`, `E2E Trust Boundary`; class picker full of `E2E F-3 … TK Islam Terpadu`. E2E specs lack teardown. Recommend a staging-reseed and adding cleanup to the offending specs. (Impacts demo credibility + picker usability.)
- **A-active — Major (data integrity).** "Aktif" is **not exclusive** for academic years or semesters — activating UAT 2026/2027 left 2025/2026 also Aktif (multiple simultaneously-active years/semesters, amplified by E2E leftovers). If "current year/semester" is meant to be singular, this is an integrity gap; "current" can't be derived from Aktif alone. Confirm intended cardinality.
- **A4 — Major (workflow coupling).** The Semester "Tahun ajaran" picker lists **only Aktif years**; a freshly-created year (default **Perencanaan**) is absent until activated. Verified: activating UAT 2026/2027 made it appear. This contradicts the page's guided framing ("Tahap awal… petakan semester ke tahun ajaran"). Admin must discover the create-year → activate → map-semester order with no inline hint. Fix: include Perencanaan years (or hint to activate first).
- **B1 — Major (offer-then-reject).** Admission actions menu shows **"Konversi ke Siswa" at non-ADMITTED statuses**; clicking errors with toast "Hanya pendaftaran dengan status ADMITTED yang bisa dikonversi". The item should be hidden/disabled until status is ADMITTED instead of offering then rejecting.
- **B2 — Major (possible data mutation, verify).** Advancing the UAT inquiry from Pertanyaan→Kunjungan changed its **Sumber from "WhatsApp" to "Datang Langsung"**. Reproduced in the list before/after. Recommend a dev confirm whether status transitions overwrite the `source` field (would corrupt funnel-source analytics).
- **A2-copy — Minor.** Year-activate confirm reads "Aktifkan kembali …" ("reactivate") for a year that was never previously active. Drop "kembali" for never-activated years.

### Coverage + result (continued)

| # | Flow | Route | Result |
|---|------|-------|--------|
| G-leave | **Leave approval** (cross-persona) | `/admin/leave-requests` | ✅ Guru Dua's UAT leave appeared in queue (Menunggu) → approved (Setujui; dialog notes auto-creates LEAVE attendance). MENUNGGU 2→1, DISETUJUI 1→2. **Full teacher→admin loop closed.** |
| C-guardian | **Wali Murid** | `/admin/guardians` + `/[id]` | ✅ 244 guardians; UAT Ibu Fatimah detail shows WhatsApp, KTP/KK upload surface, **Anak Terdaftar = UAT- Calon Aisyah · Ibu · Utama · Keluar** (bidirectional linkage). |
| D | **Biaya** (fees) | `/admin/fees` | ✅ 3 clean seed components + created "UAT- Biaya Uji". Struktur-per-Program tab present. |
| D | **Tagihan** (invoices) | `/admin/invoices` + `/[id]` | ✅ Detail renders (line items, Total/Dibayar/Sisa, wali contact, payment link, Catat Pembayaran/Batalkan). ⚠️ See D1. |
| H | **Peran & Izin** (RBAC) | `/admin/settings/roles` | ✅ 4 default roles (Super Admin / Admin Sekolah 20-izin / Guru 7 / Wali Murid 3) + custom roles. Matches `admin-nav.ts` permission gating. |
| H | **Pengguna** (users) | `/admin/settings/users` | ✅ 36 users (6 admin / 28 guru / 2 wali). Both UAT accounts confirmed (Guru Dua + Ismail Rabbani/Super Admin). Role-assign via menu. |
| H | **Hari Libur** (holidays) | `/admin/settings/holidays` | ✅ Full 2026 ID calendar (national+Islam); created "UAT- Libur Uji" (10 Jun). |
| G | **Karyawan** (employees) | `/admin/employees` | ✅ 28 employees (27 aktif/1 inactive), realistic seed across 2 campuses, masked bank accts. |
| G | **Penggajian** (payroll) | `/admin/payroll` + `/[id]` | ✅ Run 21 Apr–20 Mei, 27 org, 22 hari. **Math reconciles**: gross 69.814.999 − potongan 3.700.000 = bersih 66.114.999; every spot-checked row nets correctly; inactive employee excluded. Ekspor BSI + Kirim Slip present (not triggered). |
| A4-impact | **Kelas** (classes) | `/admin/classes` | ✅ 6 real classes under 2025/2026 (Wali Kelas, X/Y capacity, Kondisi health flag). ⚠️ See A4-impact. |

### Findings — Admin (continued)

- **D1 — Major (payment-link failures).** `/admin/invoices`: **56 of 117 invoices have status "Link Gagal"** (failed payment-link generation) — a "Coba Lagi Link (56)" retry exists. Staging uses a **mock Xendit** (`demo.xendit.local`), so part of this is environment, but the ~48% failure rate isn't all E2E rows (real-looking "Mei 2026" SPP Rp 300k/1.5M invoices also failed). Recommend a dev confirm the link-generation failure path won't carry to prod Xendit. On a live pilot, failed links block parent payment.
- **A4-impact — Major (confirms A-active).** `/admin/classes` **defaults its year filter to an arbitrary Aktif year** — it landed on `E2E PROMES Import 1779172991605 · Aktif` → "Tidak ada data". Switching to `2025/2026` reveals the 6 real classes. Because multiple years are Aktif (A-active), the page can't resolve the true current year and an admin lands on an **empty Kelas list by default** — high-confusion, demo-breaking. Strengthens the case to enforce single-active-year + reseed staging.

### Positives — Admin
- Every CRUD create persisted with clear success toasts + good Indonesian/Islamic-courtesy copy and confirm-dialog consequence text (campus deactivate, student withdraw, leave approve).
- Strong data-integrity touches: withdraw records RIWAYAT STATUS + reason; admission convert carries the full guardian (name/relationship/primary/WA); payroll excludes inactive staff and reconciles to the rupiah; leave approval auto-creates LEAVE attendance.
- No app-level 4xx/5xx or console errors observed on any admin page.

### Not deep-tested this run (honest scope note)
Reached/created across the headline + most modules, but the following were **not exercised** (time/scope) and should be covered in a follow-up: Semester **tema / IKTP / PROMES-import** sub-flows; **Penilaian admin** (`/admin/assessments`, assessment-templates, scores); **Student-attendance admin** (`/admin/student-attendance`) + holiday-void interaction; **Buku Penghubung admin** (`/admin/student-journal` monitoring); **Pemantauan**; **Jam Kerja** (`/admin/settings/work-hours`); teacher **MASUK clock-in** (needs geolocation). 
- **Teacher-assessment unblock (carry-over):** current-period `2025/2026 Semester 2` has **0 tema** → root cause of teacher weekly/center "Belum ada Pekan aktif" (T1/T2). To exercise assessment end-to-end, admin must add tema + pekan to Semester 2.

---

## Prioritized findings summary

**Major (fix before pilot / verify):**
1. **A-hygiene** — staging swamped with un-torn-down E2E fixtures (years, semesters, admissions, classes, invoices). Reseed staging + add teardown to specs.
2. **A-active** — multiple academic years/semesters simultaneously "Aktif"; "current" is not uniquely resolvable. → **A4-impact**: Kelas defaults to an empty E2E year.
3. **A4** — Semester year-picker excludes Perencanaan years; new year unusable until activated (contradicts guided "first step").
4. **B1** — admission "Konversi ke Siswa" offered at non-ADMITTED statuses, then rejected on click (offer-then-reject).
5. **B2** — advancing admission status changed Sumber WhatsApp→Datang Langsung (verify source-mutation).
6. **D1** — 48% of invoices "Link Gagal" (mock-Xendit on staging; confirm prod path).

**Minor:**
- T1 weekly-assessment empty state tells user to "pick another date" with no date picker.
- T2 center-assessment Simpan button overlaps empty-state text.
- T3 read-only journal grid uses non-interactive checkbox affordance.
- T5 CSP report-only warnings firing ~2×/page.
- A2-copy "Aktifkan kembali" wording for a never-activated year.

**Verified non-defects:** T4 journal `503`s = Vercel preview Deployment-Protection edge (function logs 200/204).

---

## Appendix — UAT artifacts left on staging (for later cleanup)
- **Leave request:** Guru Dua, Cuti Tahunan 22–23 Jun 2026 — now **Disetujui** (auto-created LEAVE attendance for those dates).
- **Campus:** "UAT- Kampus Uji" (active again after deactivate/reactivate test).
- **Academic year:** "UAT 2026/2027" — now **Aktif** (was created Perencanaan, then activated; consider reverting to avoid adding to the multi-active set).
- **Semester:** Semester 1 under UAT 2026/2027 (14 Jul–19 Des 2026), Aktif.
- **Student:** "UAT- Calon Aisyah" (NIS UAT-001) — converted from admission, now status **Keluar/WITHDRAWN** (was enrolled to E2E class then withdrawn).
- **Guardian:** "UAT Ibu Fatimah" (linked to UAT- Calon Aisyah).
- **Admission:** "UAT- Calon Aisyah" inquiry — status Terdaftar (converted).
- **Fee component:** "UAT- Biaya Uji" (uat_biaya).
- **Holiday:** "UAT- Libur Uji" (10 Jun 2026).

All identifiable by the `UAT-`/`UAT ` prefix (except the leave request + activated year). A staging reseed (per `docs/runbooks/reseed-staging.md`) would clear these alongside the much larger E2E-fixture backlog.
