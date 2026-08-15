# Staging End-to-End Verification + Panduan Refresh (promotion gate)

## Context

`Panduan-Penggunaan-Talib.docx` — the Indonesian end-user manual handed to An Nisaa' admin staff,
teachers and parents — was last revised **2026-07-29**. Since that date `origin/staging` took ~20
feature merges, four of which (#492 parent Buku Penghubung, #493 Keringanan, #494/#495 Billing Run
wizard) are **not yet in `main`**, i.e. not in production. The manual is now materially wrong in
places a reader cannot recover from: it tells teachers to tap tabs that no longer exist, tells admins
to click sidebar items that were renamed, describes a "Buat Tagihan" dialog that was replaced by a
three-step wizard, and shows login screenshots of a dark magic-link screen that was deleted.

This cycle walks all three portals end-to-end on the staging deployment, topic by topic against the
manual's own table of contents, and uses the walk for two outputs at once: (a) an evidence-backed
**verdict on whether staging is fit to promote to production**, and (b) a corrected manual with fresh
screenshots for the sections whose UI actually moved. The verdict is the gate — a blocker found in the
sweep stops the promotion, not just the doc update.

Three read-only explorer subagents produced a per-portal change-map from `origin/staging` code +
cycle docs before this spec was written; their findings are the walk-list and are recorded per task
below. Every item they flagged is a *claim to verify in the browser*, not an established fact.

**Prior UAT reports are stale.** Newest is `docs/uat/reports/2026-06-04-admin-teacher-full.md`, 72 days
old — past the 60-day cutoff and older than every cycle that touched these files. Not consumed as
input; findings there must be re-verified if they resurface.

## Spec

### Acceptance criteria

- [ ] Every topic in the manual's table of contents (20 admin / 8 guru / 7 wali murid = 35) is walked
      on the staging deployment while signed in as the role-scoped Google account from
      `.claude/verify-accounts.json`, and each is recorded PASS / FAIL / BLOCKED-BY-DATA in Verification.
- [ ] Every discrepancy is classified **blocker** (cannot promote / manual cannot be followed at all),
      **major** (user reaches a wrong outcome or gets stuck without a workaround), or **minor**
      (cosmetic, copy, or has an obvious workaround).
- [ ] Zero **blocker** findings remain open at the end of the cycle — each is either fix-committed on
      this branch and re-verified on the preview, or explicitly accepted by the user with a reason
      written into Ship Notes.
- [ ] `Panduan-Penggunaan-Talib.docx` is corrected for every wrong instruction, renamed nav label and
      removed/moved screen found in the sweep, and gains new subsections for the features that did not
      exist on 2026-07-29: **Bank Narasi**, **Keringanan**, the **Billing Run wizard**, and the
      **"Lainnya" overflow sheet** in both the guru and wali-murid portals.
- [ ] Screenshots are recaptured from staging for — at minimum — every section whose UI changed:
      login (all 3 portals), teacher bottom nav, parent bottom nav + Lainnya sheet, Penilaian /
      Bank Narasi, Keuangan → Biaya (Keringanan tab), Buat Tagihan wizard steps 1–3, parent Tagihan
      detail with a Penyesuaian line. Unchanged screenshots are left alone.
- [ ] A timestamped backup of the manual is taken before the first edit, and the edited file opens
      cleanly in Word (relationship/media integrity intact, image count accounted for).
- [ ] Ship Notes carries an explicit **PROMOTE / DO NOT PROMOTE** verdict for `staging → main`, with
      the evidence behind it and the list of anything accepted as known-broken.
- [ ] `npm run build && npx vitest run` green; Playwright green locally or deferred to the required CI
      `Playwright E2E` check and recorded.

### Non-goals

- Promoting to production. This cycle *produces the verdict*; `/ship --to-main` is a separate,
  explicitly-requested run.
- Committing the `.docx` to git. It stays an untracked local artifact alongside its `.bak-*` files.
- Recapturing all 69 existing screenshots. Only stale ones.
- Fixing every **minor** found. Minors are listed in Verification as a backlog; only blockers (and
  majors where the fix is small and low-risk) get code changes this cycle.
- Rewriting the manual's structure, voice or layout. Corrections and additions only — it stays the
  same document.
- Touching production data or the production deployment in any way.

### Assumptions

1. **The sweep drives the user's real Chrome via Chrome MCP**, not the in-app browser — staging is
   behind Google SSO and only the user's signed-in profile holds the three accounts
   (`admin: ismailir10@`, `teacher: ismail10rabbanii@`, `parent: rightjet.hq@`). The in-app Browser pane
   has no session and cannot complete Google sign-in.
2. **Staging is the verification target**, not a per-branch Vercel preview — the manual documents the
   staging URL by design (`annisaa-erp-v3-git-staging-…vercel.app`, returns 200), and the promotion
   question is about staging's current state. Any fix commits made in this cycle get preview-verified
   separately before merge.
3. **Staging data may be thin in places.** Where a topic cannot be walked because the fixture is
   missing (e.g. no payroll run, no committed raport), the task seeds it through normal UI CRUD; if
   that is not possible, the topic is recorded **BLOCKED-BY-DATA** rather than silently passed.
4. **DOKU payment cannot be proven end-to-end.** The sandbox notification webhook has never fired for
   this merchant across three cycles; the only proven credit path is the 00:30 UTC reconcile cron. The
   parent payment walk therefore ends at the DOKU checkout page + channel list, and the manual's claim
   that invoices flip to Lunas "dalam waktu singkat" is treated as a **copy correction**, not a bug to
   fix here.
5. **Writes land in the staging Supabase.** The sweep creates real rows (invoices, journal ticks,
   keringanan). Fixtures are created with an obvious test marker and, where the module supports it,
   cleaned up or soft-deleted afterwards. Billing-run drafts are discarded rather than committed unless
   committing is the thing under test.
6. Screenshots are captured at a consistent viewport and inserted in place of the existing images so
   the document's flow and captions do not have to be re-laid out.

## Tasks

- [x] **T1 — Sign-in preflight + fixture readiness.**
      Drive Chrome MCP to the staging URL, sign in as each of the three accounts in turn, confirm each
      lands in the right portal, and inventory whether staging holds the data every later task needs:
      active academic year + semester, classes with students, a journal template with ACTIVE
      categories, IKTP/tema content for Penilaian, at least one fee structure + invoice, a payroll run,
      leave requests, holidays. *Acceptance:* Verification lists all three logins with the landing
      route, plus a data-readiness table marking each downstream task READY or NEEDS-SEED. Depends on
      nothing; blocks T2–T7.

- [x] **T2 — Admin sweep A: Cara Masuk, Dasbor, Kesiswaan, Akademik.**
      Walk manual topics 1.1–1.9. Verify against the change-map claims: login is Google-only with the
      new light two-column screen; nav reads "Dasbor"; the Formulir Pendaftaran nav item is now
      **"Berkas Pendaftaran Online"**; the enrollment list has real search + pagination + status
      filter; convert-to-student uses a real dialog not a browser `confirm()`; the "Daftarkan ke Kelas"
      and "Naik Kelas" pickers are year-scoped, searchable, grouped by kampus, and class names carry
      no campus token; class detail shows kampus as a badge; the roll-forward action reads
      **"Salin Kelas"**. *Acceptance:* every 1.1–1.9 topic marked PASS/FAIL with the exact on-screen
      label quoted, and each manual line the walk contradicts captured verbatim for T9.

- [x] **T3 — Admin sweep B: Kelas Harian + Penilaian.**
      Walk 1.10–1.12 plus the new Bank Narasi page. Verify: student-attendance filters, "N catatan"
      subtitle and the **"Alpa"** relabel; the journal nav item reads **"Buku Penghubung — Templat"**;
      note-delete confirms as **"Nonaktifkan catatan?" / "Ya, Nonaktifkan"**. Then chase the
      change-map's sharpest claim: that the monitoring view at `/admin/student-journal/monitoring` has
      **no sidebar or in-page link** and is only reachable by drilling two levels down — the manual
      currently instructs a reader to open a "Pemantauan" tab that does not exist. Confirm or refute by
      navigation only (no URL typing) before classifying. Also verify `/admin/penilaian` now titles
      itself "Pemantauan", the "Rapor" spelling is uniform, the raport editor's unsaved-changes guard
      fires, and walk **Bank Narasi** end-to-end (`N/18 terisi` progress, "Susun Rapor" prefill).
      *Acceptance:* topics marked; the monitoring-reachability claim resolved to a severity with the
      navigation path (or absence of one) recorded.

- [ ] **T4 — Admin sweep C: Keuangan (Biaya + Keringanan + Billing Run wizard + Penerimaan).**
      Walk 1.13–1.15. Verify the third **"Keringanan"** tab on `/admin/fees` and create one durable
      per-student discount through the dialog (Siswa / Komponen Biaya / Jenis / Cara Hitung / Nilai /
      Alasan / Berlaku). Then run **"Buat Tagihan"** through all three wizard steps —
      Cakupan → Tinjau → Komit — on the smallest available class: confirm the draft persists across a
      page refresh and offers "Lanjutkan draf" / "Buang draf"; confirm the keringanan from this task is
      pre-applied and badged on the right student; exercise step 2 editing (amount edit, "Tambah
      Potongan", "Tambah Komponen", exclude a student, "Hitung Ulang"); confirm the last-line removal
      guard refuses. Commit the run only if the fixture is disposable, else discard. Finish on
      Penerimaan and the renamed status badges ("Lewat Tempo", "Link Dibuat", "Dibayar Sebagian",
      "Dibatalkan" filter). *Acceptance:* each wizard step and each step-2 edit affordance marked
      PASS/FAIL with the resulting totals; the keringanan row left in place for T7 to observe from the
      parent side.

- [ ] **T5 — Admin sweep D: Kepegawaian, Pengaturan Sekolah, Keluar.**
      Walk 1.16–1.20. Verify employee list/detail, leave approve+reject, daily and monthly employee
      attendance (including the **"Timpa"** row action and whether its dialog still says
      "Tidak Hadir" where the manual says "Alpa"), holidays, users, roles (delete confirm now names the
      affected user count), work hours, and sign-out. Confirm the **"Kirim Slip" button is gone** from
      the payroll run detail and that nothing in the manual instructs a reader to use it.
      *Acceptance:* topics marked; the employee-attendance label mismatch classified.

- [ ] **T6 — Teacher portal sweep.**
      Signed in as the teacher account, walk all of Bagian 2. Verify the bottom nav is exactly
      **Beranda · Absensi · Jurnal · Penilaian · Lainnya** and that Kehadiran Saya, Slip Gaji and
      Profil Saya are reachable *only* through the "Lainnya" sheet (plus the header avatar for Profil).
      Walk: clock-in/out state machine, leave request submit + cancel, class attendance cycle-tap
      (Hadir → Alpa → Sakit → Izin) with save feedback, `Jurnal — Buku Penghubung` picker → "Isi
      Penghubung" → autosave, the read-only weekly history, and **Penilaian Pekanan** — specifically
      that the previously-broken IKTP picker now renders real options (the #451 fix) rather than an
      empty dropdown that silently writes to indicator #1. Also walk Sentra Harian and a session detail
      from "Sesi Hari Ini" (undocumented in the manual). Confirm the sign-out confirm reads
      **"Keluar dari akun"**, not "Ya, Keluar". *Acceptance:* all 8 topics marked; the IKTP picker
      verified with a named indicator visible on screen; new manual subsections identified for
      "Lainnya" and Sesi Hari Ini.

- [ ] **T7 — Parent portal sweep.**
      Signed in as the parent account, walk all of Bagian 3. Verify the 5-slot nav
      (**Beranda · Tagihan · Kehadiran · Jurnal · Lainnya**) and the Lainnya sheet
      (Perkembangan / Rapor / Profil). Confirm the #492 fix: the **Di Rumah grid renders even in a week
      with zero entries** so a parent can make the first tick, and the edit window really spans Monday
      of last week → today with out-of-range dates disabled. Open the invoice created in T4 and confirm
      the **"Penyesuaian"** sub-line shows with the admin's reason text verbatim — and judge whether
      exposing that free-text reason to families is acceptable as shipped. Take the "Bayar sekarang"
      flow as far as the DOKU checkout page and record the channel list actually offered versus the
      in-app card's hardcoded "BCA · Mandiri · BRI · BNI · Permata · CIMB". Check the "Dibayar
      Sebagian" state, Perkembangan (renamed from "Capaian"), Rapor, Profil, and both sign-out paths.
      *Acceptance:* all 7 topics marked; the DOKU channel list captured as evidence; the Penyesuaian
      reason-exposure classified.

- [ ] **T8 — Triage + blocker fixes.**
      Consolidate T2–T7 findings into one severity-ranked table. Fix every **blocker** on this branch
      (plus majors whose fix is small and low-risk), each with its own commit and a re-walk of the
      affected screen. Anything not fixed is written up with a reason. If a frontend file is touched,
      the cycle doc's Verification must carry a `design-system` cross-check line to satisfy the
      pre-commit frontend gate. *Acceptance:* zero open blockers, or each remaining one carries an
      explicit user-accepted rationale. Depends on T2–T7.

- [ ] **T9 — Recapture screenshots + rewrite the manual.**
      Back up to `Panduan-Penggunaan-Talib.docx.bak-20260815` first. Recapture the stale screenshots
      listed in the Spec from staging at a consistent viewport, swap them into the document in place,
      then apply every text correction from T2–T7 and add the new subsections (Bank Narasi, Keringanan,
      Billing Run wizard, guru "Lainnya", wali-murid "Lainnya", the second sign-out path, the
      DOKU payment-timing correction). Update the cover date from "Juli 2026" to August 2026.
      *Acceptance:* the file opens cleanly in Word with intact media relationships; every "GUIDE NOW
      WRONG" line from the sweep is resolved or explicitly deferred; media count reconciles.
      Depends on T8.

- [ ] **T10 — Promotion verdict + end-of-cycle gates.**
      Run `npm run build && npx vitest run` and Playwright (locally or deferred to the required CI
      check, recorded). Write the **PROMOTE / DO NOT PROMOTE** verdict into Ship Notes with the
      evidence, the accepted-known-issues list, and — if PROMOTE — the exact `/ship --to-main` command
      and the reminder that a promotion merges, never squashes. *Acceptance:* gates recorded verbatim;
      verdict stated unambiguously. Depends on T9.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5. Spec-phase exploration already fanned
  out 3 parallel read-only explorers (admin / guru / wali murid change-maps). For the build phase the
  browser sweeps **T2–T7 must run sequentially**, not in parallel: they all drive the one shared Chrome
  profile and each portal needs a different Google account signed in, so concurrent subagents would
  fight over the session. Each sweep is still delegated to a dirty-work-tier subagent that returns a
  distilled findings table; the driver only sequences, triages and decides. T8–T10 are driver work
  (triage, severity calls, document rewrite, verdict).
- Task 1: Sign-in preflight + fixture readiness — no files touched (read-only browser + SQL against the
  staging Supabase `udbivhchbizpxoryejgz`) — confirmed all three role accounts resolve to the right
  portal and inventoried the data every later task depends on.

## Verification

### Task 1 — Sign-in preflight + fixture readiness

**Logins (Chrome MCP, user's real Chrome profile, staging URL):**

| Role | Account | Result |
|---|---|---|
| admin | `ismailir10@gmail.com` | PASS — Google account chooser → lands on `/admin`, sidebar + Dasbor render |
| teacher | `ismail10rabbanii@gmail.com` | resolves to `role=TEACHER`, 1 Employee row, 1 TeachingAssignment — portal walk in T6 |
| parent | `rightjet.hq@gmail.com` | resolves to `role=GUARDIAN`, 1 Parent row, 2 linked students — portal walk in T7 |

Login screen itself already confirms #479 live on staging: light two-column layout, brand panel
("Sahabat belajar anak"), single **"Masuk dengan Google"** button, helper line "Gunakan akun Google yang
terdaftar di sekolah. Belum punya akses? Hubungi admin sekolah." **No email field, no magic-link, no
"atau" divider.** The manual's login screenshots (dark card) are confirmed stale.

Admin sidebar rendered live, confirming the renamed nav items the change-map predicted:
`Dasbor` · Kesiswaan (`Pendaftaran`, **`Berkas Pendaftaran Online`**, `Siswa`, `Wali Murid`) · Akademik
(`Tahun Ajaran`, `Kelas`, `Semester`) · Penilaian (**`Pemantauan`**, **`Rapor`**, **`Bank Narasi`**) ·
Kelas Harian (`Kehadiran Siswa`, **`Buku Penghubung — Templat`**) · Keuangan (`Biaya`, …) · `Keluar`.

**Data readiness (staging Supabase counts):**

| Area | Fixture | Verdict |
|---|---|---|
| Akademik | 3 academic years (1 ACTIVE / 1 PLANNING / 1 ARCHIVED), 15 class sections | READY |
| Kesiswaan | 29 students, 37 ACTIVE enrolments, 33 parents, 36 guardian links, 18 admissions, 2 online applications | READY |
| Kelas Harian — kehadiran | 3 809 attendance records | READY |
| Kelas Harian — jurnal | 1 template, 7 ACTIVE categories, 11 ACTIVE indicators, 863 entries | READY |
| Penilaian (curriculum) | Semester 2 has 2 themes / 4 subthemes / 8 weeks / 10 objectives; age group A has 13 indicators + 18 theme links | READY — enough for the IKTP-picker test in T6 |
| Penilaian (scores) | only 4 AssessmentEntry rows total | THIN — walk the entry flow, do not expect populated history |
| Rapor | 30 narrative templates, but only 2 ReportCardEntry rows and **0 for either of the parent account's children** | NEEDS-SEED for T7 parent Rapor, else BLOCKED-BY-DATA |
| Keuangan | 4 fee components, 27 program fee structures, 297 invoices (184 PAID / 94 SENT / 7 OVERDUE / 4 PARTIALLY_PAID / 8 CANCELLED), 188 payments | READY — incl. a live `PARTIALLY_PAID` to verify the new "Dibayar Sebagian" state |
| Keringanan | 3 `StudentFeeAdjustment` rows already exist, 1 of them on the parent account's child *Bilal Hakim* | READY — T7 can observe a real "Penyesuaian" line without seeding |
| Billing Run | 3 COMMITTED, 5 CANCELLED, **0 DRAFT** | READY — clean slate for the T4 wizard walk incl. the resume banner |
| Kepegawaian | 29 employees, 14 teaching assignments, 4 payroll runs, 3 PENDING leave requests, 23 holidays | READY |
| Teacher account | HOMEROOM (walas) of class `DCARE`, ageGroup A, 6 active students, ACTIVE year | READY — walas-only "Penilaian Pekanan" is reachable |
| Parent account | 2 children: *Bilal Hakim* (12 invoices / 4 open, 44 journal entries, 1 keringanan) and *Hafizh Umar Ramadhan* (3 invoices / 3 open, 0 journal entries) | READY — the second child doubles as an empty-state case |

**Two anomalies found during the inventory — carried into triage, not yet classified:**

1. **Student with two concurrent ACTIVE enrolments.** *Bilal Hakim* (`cms41akw20038i5x76tn9hvxx`) has
   ACTIVE `StudentEnrollment` rows against **both** `KB` and `TKIT-A` simultaneously. Every join that
   assumes one active class per student will double-count him — which is exactly why he appeared twice
   in the readiness query. Must be checked in T2 (Data Siswa) and T7 (does the parent portal show him
   in two classes?) before deciding whether it is seed noise or a real invariant gap.
2. **Two semesters ACTIVE at once.** Both Semester 1 and Semester 2 of 2025/2026 carry
   `status=ACTIVE`, and Semester 1 holds **zero** curriculum content while Semester 2 holds all of it.
   Any "current period" resolution that picks the first ACTIVE semester would land on the empty one.
   Must be checked in T3 (`/admin/penilaian` period label) and T6 (teacher Penilaian subtitle
   "Periode: …") before classifying.

### Task 2 — Admin sweep A (manual topics 1.1–1.9)

Walked by a dirty-work-tier subagent on the live staging admin session; **every severity call below is
the driver's, after independent re-verification** — the subagent's own severities were not taken at
face value and two of them were wrong.

| Topic | Verdict | Evidence |
|---|---|---|
| 1.1 Dasbor | PASS | Title "Dasbor", date "Sabtu, 15 Agustus 2026". Cards TOTAL KARYAWAN 29 / HADIR HARI INI 0 / TERLAMBAT 0 / TIDAK HADIR 29. "Perlu Tindakan" lists Pengajuan Cuti (3), Pendaftaran Baru (3), Penggajian Terakhir (Draft) |
| 1.2 Pendaftaran | PASS (with a pre-existing UX gap, below) | Status filter reads "Semua Status"; row menu = Ubah / Konversi ke Siswa / Kirim Formulir / Batalkan |
| 1.3 Berkas Pendaftaran Online | PASS | Sidebar label **"Berkas Pendaftaran Online"**, page still titles itself "Formulir Pendaftaran". Search filters live (typed "Alia" → 1 result). Pagination present but only 2 records exist → multi-page UNVERIFIED |
| 1.4 Siswa | FAIL — see finding F1 | List, search, "Tambah Siswa", "Unduh Data" all present; list vs detail disagree on a student's class |
| 1.5 Wali Murid | PASS (minor) | List "34 wali terdaftar" + detail render. Guardian "Nurul": header "2 siswa terdaftar" and 2 children listed, but the DATA WALI field "Jumlah Anak" reads 1 |
| 1.6 Tahun Ajaran | PASS (minor) | 2026/2027 "Perencanaan", 2025/2026 "Aktif", 2024/2025 shows the raw enum **"ARCHIVED"** instead of an Indonesian label |
| 1.7 Kelas | PASS | Class names carry no campus token ("KB", "TKIT-A"); kampus renders as its own badge ("An Nisaa' Sekolahku Metland Cibitung"). Roll-forward is **not** on the Kelas page — it lives in the **Tahun Ajaran** row menu, labelled **"Salin Kelas ke Tahun Ini"** |
| 1.8 Enrol / Naik Kelas pickers | PASS (minor) | Both open the same picker: searchable, grouped by kampus, options formatted `KB · TA 2025/2026 · 4/20`. Year-scoping confirmed — 8 options, all 2025/2026; nothing from archived 2024/2025 or planning 2026/2027. Search is fuzzy: "TKIT-A" also returns TKIT-B |
| 1.9 Semester | FAIL — see finding F2 | Both 2025/2026 Semester 1 and Semester 2 carry green "Aktif" badges; KPI card reads "SEMESTER AKTIF: 2" |

No JavaScript console errors during the walk.

**F1 — Students list and student detail disagree about a student's current class. Severity: MAJOR.**
Root cause found in code, not guessed. `app/api/students/route.ts:51` selects
`enrollments: { where: { status: "ACTIVE" }, take: 1 }` **with no `orderBy`** — so when a student has
more than one ACTIVE enrolment Postgres returns an arbitrary one. `app/api/students/[id]/route.ts:33`
orders `createdAt desc`. For *Bilal Hakim* the list therefore shows "Kelompok Bermain · KB" (his
2024/2025 row) while his detail header shows "TK Islam Terpadu Kelas A · TKIT-A" (2025/2026), and the
Riwayat Kelas tab shows both marked "Aktif". Not a promotion blocker — no code in the four unpromoted
commits touches this — but staff would be misled about which class a child is in. Fix is one line
(give the list the same `orderBy` as the detail); scheduled for T8.

**F1b — the data behind F1 is systemic, not one bad row. Severity: MAJOR (data/product question).**
**16 of 29 students hold ACTIVE `StudentEnrollment` rows against the ARCHIVED 2024/2025 year**
(21 more are ACTIVE in the current 2025/2026 year). Archiving an academic year evidently does not
close out its enrolments. On staging this is seed residue from 2026-07-28, but the same code path runs
in production, so the question "what should happen to enrolments when a year is archived?" is a real
product gap, not just fixture noise. Flagged; no code change proposed this cycle.

**F2 — two semesters ACTIVE at once, with no UI disambiguation. Severity: MAJOR.**
Confirmed independently in SQL *and* in the UI: 2025/2026 Semester 1 (0 themes) and Semester 2
(2 themes, 4 subthemes, 8 weeks, 10 objectives) are both `status=ACTIVE`. The Semester page presents
both with identical "Aktif" badges and its own KPI card reads "SEMESTER AKTIF: 2" as though that were
normal. Nothing marks which one is current. Carried into T3 and T6 to determine whether any
period-resolution actually lands on the **empty** Semester 1 — if it does, this escalates to blocker.

**F3 — "Konversi ke Siswa" runs irreversibly with no confirmation. Severity: MAJOR, pre-existing, NOT
a regression.** The subagent reported this as a blocker and as a contradiction of PR #438. Both claims
are wrong and were corrected by reading the code: `convertToStudent()` in
`app/admin/admissions/page.tsx:634` opens a dialog **only when `detectedParentId` is set** (the sibling
-detection path #438 actually changed); with no detected parent it calls `runConvert(a.id, true)`
directly, under an explicit comment *"No detection → preserve the pre-T10 one-click behaviour"*. That
line dates to **#294, 2026-05-19** — three months before this window. So: a genuine UX gap on an
irreversible action, worth fixing, but it neither regressed recently nor blocks the promotion.

**Side effect to be aware of:** exercising that action created a real student record on staging —
*Khadijah Naila*, `cmsugt1ux000004judls97a98`, created 2026-08-15 14:22. Left in place rather than
hard-deleted. Staging is documented in the manual as free-to-experiment, but flagging it explicitly.

**Minors (backlog, not fixed this cycle):** raw `ARCHIVED` enum badge on Tahun Ajaran; guardian
"Jumlah Anak" field disagreeing with the computed child count; fuzzy class-picker search matching
TKIT-B when you type TKIT-A.

**Manual corrections captured for T9:** sidebar item is "Berkas Pendaftaran Online" (manual says
"Formulir Pendaftaran"); roll-forward is "Salin Kelas ke Tahun Ini" on the **Tahun Ajaran** row menu,
not "Gulir Kelas ke Tahun Ini" on Kelas.

**Screenshots to recapture (T9):** Pendaftaran row menu; Berkas Pendaftaran Online sidebar + landing;
class detail with kampus badge; Tahun Ajaran row menu showing "Salin Kelas ke Tahun Ini"; the
"Daftarkan ke Kelas"/"Naik Kelas" picker.

### Task 3 — Admin sweep B (manual topics 1.10–1.12 + Bank Narasi)

| Topic | Verdict | Evidence |
|---|---|---|
| 1.10 Kehadiran Siswa | PASS | Filters "Dari" / "Sampai" / "Kelas" / "Filter Status" all labelled; subtitle "1741 catatan"; stat tile and filter both say **"Alpa"**. Correction dialog: title "Timpa Kehadiran", field "Status Kehadiran" (Hadir/Alpa/Sakit/Izin), "Catatan (opsional)", Batal/Simpan |
| 1.11 Buku Penghubung — Templat | PASS | Sidebar "Buku Penghubung — Templat"; page has **only "Sekolah" / "Rumah"** tabs. Deactivate confirm interpolates the entity: `Nonaktifkan kategori "Motorik"?` → "Item akan disembunyikan dari isian harian, data lama tetap tersimpan." → Batal / **"Ya, Nonaktifkan"** |
| 1.11 Pemantauan (jurnal) | FAIL — see F4 | Not reachable by clicking, from anywhere |
| 1.12 Pemantauan (Penilaian) | PASS (with F5) | H1 is **"Pemantauan"**. No semester dropdown — two date pickers ("Pekan (tanggal acuan)", "Hari sentra") |
| 1.12 Rapor | PASS spelling / FAIL guard — see F6 | Sidebar, H1 and "Rapor — {Nama}" all spell **"Rapor"**; no "Raport" seen anywhere on screen. Class picker disambiguates by campus: "KB · An Nisaa' Sekolahku Metland Cibitung" vs "KB · An Nisaa' Sekolahku Taman Aster" |
| Bank Narasi (new) | PASS | Documented below for the new manual subsection |

**F4 — the manual's journal-monitoring instruction is un-followable. Severity: MAJOR.**
The manual says *"Tab 'Pemantauan' pada menu yang sama menunjukkan kelas mana yang sudah dan belum
mengisi buku penghubung minggu ini."* There is no such tab. Click-only exploration of the sidebar, the
Templat page (tabs are Sekolah/Rumah; `read_page` found zero links to the monitoring route), the
separate Penilaian → Pemantauan page, and the Dasbor quick actions found **no path at all**. Navigating
directly to `/admin/student-journal/monitoring` (URL entry, disclosed) shows a working page titled
**"Buku Penghubung — Pemantauan"** with stat tiles (Total Entri Minggu Ini, Kelas Sudah Isi 0/8, Siswa
Terdaftar Aktif 21, Kelas Belum Isi 8) and a per-class table. Its drill-downs into class and student
both carry "Kembali ke Pemantauan" links — so the pages form a closed loop whose **only entrance is the
URL bar**. A working feature is effectively unreachable. Two possible resolutions — correct the manual,
or add the missing nav entry — put to the user in the summary below.

**F5 — Penilaian → Pemantauan cannot distinguish "no week configured" from "wrong semester".
Severity: MINOR now, latent trap.** The page resolves by date, not by semester, and shows no semester
label anywhere (only "Tahun Ajaran 2025/2026"). Today's date happens to fall inside Semester 2's range
(20 Jul – 11 Sep 2026), so the default view is not broken — but no configured week covers 15 Agustus,
so it renders *"Belum ada Pekan aktif untuk tanggal acuan ini."* Setting the date into the always-empty
Semester 1 (`2025-08-01`) produces the **identical** message. Setting it to `2026-07-21` surfaces real
content ("Pekan 1 · Tubuhku (Demo) (Diriku (Demo))"), proving the page reads Semester 2 correctly. So
the F2 double-ACTIVE-semester problem does **not** currently break this page — it just cannot be
diagnosed from the UI. F2 stays MAJOR, does not escalate to blocker on this evidence.

**F6 — unsaved rapor edits are lost silently when leaving via the sidebar. Severity: MAJOR.**
Verified in code, not just observed. `app/admin/raport/raport-editor.tsx` guards dirty state two ways:
a `beforeunload` listener (line 132–142) and `handleBack` (line 144–150) which is wired **only** to the
in-app "Kembali ke daftar" button. Sidebar items are Next.js client-side `<Link>` navigations — they
trigger neither. Reproduced: typed into a narrative field, clicked a sidebar item, navigated away with
no dialog and the edit gone. Exiting by the in-app back button correctly raises *"Keluar tanpa
menyimpan?" / "Narasi, capaian, kehadiran, hafalan, atau data lain yang belum disimpan akan hilang." /
Batal · "Ya, Keluar"*. Note the guard itself shipped **inside this window** (#457, 2026-08-06), so this
is a new-but-incomplete safeguard rather than old debt. **Not fixed this cycle**: intercepting App
Router client navigation has no first-class API and the workarounds are invasive — that is a design
decision, not the one-line fix T8 is scoped for. Recommended as its own follow-up cycle.

**Bank Narasi — content for the new manual subsection.**
Sidebar "Bank Narasi" (under Penilaian, after Rapor) → H1 **"Bank Narasi Rapor"**, subtitle *"Susun
narasi sekali per triwulan dan kelompok usia. Saat menyusun rapor siswa, narasi ini terpakai otomatis
sesuai capaian yang dipilih."* Two selectors drive everything: **Triwulan** and **Kelompok usia**
("A (4–5 tahun)" / "B (5–6 tahun)") — narratives are authored separately per age group. Body is six
cards: five capaian sections (Pembukaan, Nilai Agama & Budi Pekerti, Jati Diri, STEAM / Literasi, Unjuk
Kerja), each with three level fields (**Mampu dan Konsisten / Mampu Belum Konsisten / Perlu
Penguatan**) = 15, plus **Penutup** with three single fields (Penutup, Rencana Tindak Lanjut, Kegiatan
Disarankan di Rumah) = 3. That is the **"18/18 terisi"** badge. "Simpan semua" persists. A "Salin dari
triwulan lain" card clones a previous triwulan's text without overwriting anything already filled.
"Susun Rapor" (top right) is a shortcut to `/admin/raport`. BLOCKED-BY-DATA: the clone source dropdown
is empty because staging holds only one triwulan — UI confirmed present, flow not exercised end to end.

**Manual corrections captured for T9:** the "Pemantauan" tab instruction (F4) must be rewritten;
deactivate confirm wording is entity-specific (`Nonaktifkan kategori "…"?`); Bank Narasi needs a whole
new subsection from the walkthrough above.

**Console errors:** none observed, but the subagent only started the console listener late in the walk,
so earlier pages are not covered by that signal. Treated as "no evidence of errors", not "no errors".

## Ship Notes
