# Cross-Role Test Report — Jurnal (Buku Penghubung) & Penilaian

**Date:** 2026-08-04
**Environment:** STAGING — `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`
**Deployed ref:** `origin/staging` @ `5dba30ac` ("Teacher Mobile Navigation and Page Quick Wins", #448)
**DB:** Supabase staging `udbivhchbizpxoryejgz` (read + UI-driven writes only)
**Method:** Chrome MCP against the live preview, corroborated by direct SQL reads and by re-reading every implicated source file at `origin/staging`
**Production:** not touched at any point.

> **Correction on method.** The local checkout used for the first pass was **51 commits behind** `origin/staging`. Every code-level claim below was re-verified against `origin/staging` (the deployed ref) before being recorded; line numbers cite that ref.

---

## 1. Authentication

Staging runs real Supabase auth (`DEMO_MODE` is off — `/admin` redirects to the login page). No password was entered and no Google OAuth flow was driven.

Sessions were minted server-side with the **staging service-role key already present in the repo's `.env.staging`**, via `POST /auth/v1/admin/generate_link` (type `magiclink`) → the returned `verify` URL → the resulting session materialised into the `@supabase/ssr` cookie. This is the "seeded session" path and is staging-only.

| Role | Account | Result |
|---|---|---|
| Admin (SUPER_ADMIN) | `ismailir10@gmail.com` | ✅ signed in |
| Teacher (walas DCARE) | `ismail10rabbanii@gmail.com` | ✅ signed in |
| Parent A | `commandprompt.adhan@gmail.com` (Ibu Rina — Ahmad Faris, Zahra Aisyah; TKIT-A) | ✅ signed in |
| Parent B | `rightjet.hq@gmail.com` (Ibu Nurul — Bilal Hakim, Hafizh Umar Ramadhan) | ✅ signed in |

**No role was blocked.** All three portals were exercised.

---

## 2. Test data created on staging

All rows are tagged `[QA 2026-08-04]` where a free-text field exists.

| # | Table | Row |
|---|---|---|
| 1 | `StudentJournalEntry` ×4 | Abdullah Faris Siregar, 2026-08-04, DCARE, SCHOOL scope, `checked=true` |
| 2 | `StudentJournalNote` ×1 | Abdullah Faris Siregar, 2026-08-04, body starts `[QA 2026-08-04] Uji lintas peran…` |
| 3 | `AssessmentEntry` ×1 | Abdullah Ibrahim Wijaya, HOMEROOM, `NEEDS_REINFORCEMENT`, 2026-08-04 |
| 4 | `AssessmentEntry` ×1 | Zahra Aisyah Nabila, CENTER/ART, `CONSISTENT`, activity `[QA] Menggambar bebas dengan krayon` |
| 5 | `ReportCardEntry` ×1 | Zahra Aisyah Nabila, Triwulan 1, **status PUBLISHED** |

Row 5 is parent-visible. Unpublish via `/admin/raport` → Zahra → "Tarik penerbitan" if you want staging back to a pre-test state.

---

## 3. Cross-role flow results

### 3.1 PENILAIAN — teacher → admin → parent

| Step | Expected | Observed | Verdict |
|---|---|---|---|
| Teacher records **sentra** (Sentra Seni, ART IKTP, "Mampu") for Zahra | saved | `POST /api/teacher/assessment-entries/center` → 200, toast "Tersimpan: 1 penilaian."; DB row confirmed | ✅ PASS |
| Teacher records **walas pekanan** level for a DCARE student | saved against the *chosen* IKTP | `POST /api/teacher/assessment-entries` → 200 and persisted — **but the IKTP was never selectable** (see BLOCKER B1) | ⚠️ PARTIAL |
| `/admin/penilaian` reflects it | counters move | DCARE walas **1/5 → 2/5 dinilai**; Sentra Seni **0 → "1 entri · 1 siswa dinilai"** | ✅ PASS |
| Parent Beranda shows it | recent-activity card | "PERKEMBANGAN MINGGU INI — Zahra Aisyah · 1 catatan pekan ini · Seni · Sentra Seni · Menggambar bebas… · **Mampu**" | ✅ PASS |
| Parent Capaian aggregates it | per-element roll-up | Seni: "1 catatan · **1 Mampu · 0 Belum · 0 Perlu**"; detail card dated 2026-08-04 | ✅ PASS |
| Raport auto-fills from penilaian | level suggested | `/admin/raport` → Unjuk Kerja: "**Saran: Mampu dan Konsisten (1K · 0BK · 0PP)**", select pre-populated; attendance auto-pulled (Hari sekolah 8) | ✅ PASS |
| Published raport reaches parent | visible | Parent → Lainnya → Rapor → Zahra: "Rapor … sudah terbit" → **Unjuk Kerja: Mampu dan Konsisten** + narratives + attendance + Unduh PDF | ✅ PASS |

**Aggregation is correct end to end.** The single ART/CONSISTENT entry propagated accurately through four independent surfaces.

### 3.2 JURNAL — teacher → admin → parent

| Step | Expected | Observed | Verdict |
|---|---|---|---|
| Teacher opens Buku Penghubung | walas-scoped class list | Class picker offers **only DCARE** (correct: walas of DCARE, active AY only); roster = correct 5 students | ✅ PASS |
| Teacher ticks 4/6 indicators | persisted | 4 × `POST /api/student-journal/entries/batch` → 200; counter 0/6 → 4/6; DB rows correct incl. `classSectionId` | ✅ PASS |
| Teacher adds a note | persisted | `POST /api/student-journal/notes` → 201, toast "Catatan tersimpan", badge → 1 | ✅ PASS |
| Admin monitoring reflects it | class + student roll-up | DCARE: 0% → **3%**, "Terakhir diisi 4 Agu 2026"; per-student drill-down **4/30**; weekly grid shows exactly the 4 ticks on Sel 08/04 | ✅ PASS |
| Admin sees the note | Catatan tab | "Ismail Rabbani (Teacher) · Guru · 4 Agu 2026 · 19.58" + full body | ✅ PASS |
| Admin audit trail | note + entries | Note CREATE audited. **The 4 entry writes produced zero audit rows** (see M4) | ⚠️ PARTIAL |
| Parent sees own child's jurnal | week grid | Ibu Rina → Jurnal → Faris, week 27–31 Jul: ticks render **exactly** as stored (doa pembuka 07/27; Berbagi dengan teman 07/27 + 07/28; all else "—") | ✅ PASS |
| Parent empty state | contract honoured | Current week: "Belum ada catatan minggu ini / Catatan akan muncul saat guru atau orang tua mengisi." | ✅ PASS |

### 3.3 Per-child / tenant scoping

| Probe (as a signed-in parent) | Result |
|---|---|
| `GET /api/student-journal/children/<other family's child>/week` | **403** |
| `GET /api/student-journal/children/<own child>/week` | 200 |
| `GET /api/student-journal/students/<other child>/week` (teacher route) | **403** |
| `GET /api/student-journal/admin/students/<other child>/week` | **403** |
| `GET /api/student-journal/admin/classes` | **403** |
| `POST /api/student-journal/notes` for another family's child | **403** |
| `POST /api/teacher/assessment-entries` | **403** `{"missing":"assessments.write"}` |
| `POST /api/student-journal/entries/batch` | **403** |
| UI: `/parent/perkembangan/<other family's child>` | **404**, no data leaked |
| Both parent accounts | each sees exactly its own 2 children, never the other's |

**Scoping: ✅ PASS.** No leak found on any probe, from two independent parent accounts.

### 3.4 Parent bottom-nav change

Confirmed **Beranda · Tagihan · Kehadiran · Jurnal · Lainnya**, with Capaian / Rapor / Profil in the "Lainnya" sheet.

All 8 destinations reachable: `/parent`, `/parent/invoices`, `/parent/attendance`, `/parent/student-journal`, and via the sheet `/parent/perkembangan`, `/parent/reports`, `/parent/profile`. ✅ PASS.

---

## 4. Findings

### 🔴 BLOCKER

**B1 — Walas Pekanan IKTP picker is non-functional; every weekly entry is silently pinned to the first IKTP.**
`app/teacher/assessments/weekly/client.tsx:294-308` renders a raw `<select id="indicator-picker">` **as a child of `<NativeSelect>`**, which itself renders a `<select>`. The resulting `<select><select>…</select></select>` is invalid HTML:

- the visible outer `<select>` has **0 options** (renders blank);
- the real picker (9 options) is laid out at **0 × 0 px** and cannot be clicked or focused;
- React throws **error #418** (hydration mismatch) on this page.

Because `activeIndicatorId` defaults to `indicators[0].id` (line 104), the level buttons still POST successfully — always against IKTP #1 ("RELIGIOUS_MORAL · Mengucap basmalah sebelum memulai kegiatan"), with nothing on screen naming the indicator being graded.

*Evidence:* live DOM shows `outerOpts: 0`, `innerOpts: 9`, `innerParentTag: "SELECT"`, `innerRect: {width: 0, height: 0}`. Both AssessmentEntry rows written during this pass landed on the same IKTP.

*Impact:* walas can record against only 1 of 9 available IKTP, and the data is mis-attributed without any signal. This is the core weekly-assessment workflow.

*Cause:* introduced by the UI Consistency Sweep (#369). All four other `NativeSelect` call sites (`admin/raport`, `admin/raport/raport-editor`, `daftar`, `pendaftaran/[token]`) use the component correctly — this is the only nested instance.

*Fix:* pass the props to `NativeSelect` directly rather than wrapping a second `<select>`.

### 🟠 MAJOR

**M1 — Admin Buku Penghubung monitoring is not scoped to the active academic year.**
`app/api/student-journal/admin/classes/route.ts:62-66` filters only on `tenantId` + `status: "ACTIVE"` (the *class section's* own status), with no `academicYearId`. It returns all **15** class sections, including **7 belonging to the ARCHIVED 2024/2025 year**. `/admin/penilaian` gets this right — `lib/curriculum/penilaian-monitor.ts:118` filters `{ tenantId, academicYearId, status }` and correctly shows 8. Same gap in the `/admin/raport` class picker, where the 15 options carry **identical labels** ("DCARE" ×2, "KB" ×4, "TKIT-A" ×4, "TKIT-B" ×4) with nothing to distinguish them — an admin can silently draft raport against the archived cohort.

**M2 — "Total entri minggu ini" KPI is wrong.**
`app/admin/student-journal/monitoring/page.tsx:121-123` back-computes the entry count from an already-**rounded** percentage: `round(completionPct/100 × studentCount × 5)`. With 4 real entries → pct rounds to 3 → card displays **1**. The per-class drill-down on the same data correctly reports 4/30. The API never returns a raw count.

**M3 — "Siswa terdaftar aktif" counts enrollment rows, not students.**
Same file, line 126: `data.reduce((sum, c) => sum + c.studentCount, 0)`. Displays **37**; there are **21** distinct active students (29 total). Students enrolled in both academic years are double-counted — compounded by M1. The inline comment already flags it as "approximate".

**M4 — Teacher journal entry writes are unaudited.**
`app/api/student-journal/entries/batch/route.ts` upserts inside a transaction with **no `StudentJournalAudit` write** — confirmed by grep on the deployed ref and by the DB (the 4 entries created during this pass generated 0 audit rows). Admin edits (`admin/entries/[id]`, `admin/notes/[id]`) and note creation (`notes/route.ts:136`) *do* audit. The Audit tab therefore silently omits the most common write path on a parent-facing record.

### 🟡 MINOR

**m1 — Parent greeting uses the server's UTC hour.** `lib/hijri.ts:32` `timeOfDayGreeting` calls `date.getHours()`; `app/parent/page.tsx:200` invokes it in a **server** component, so it reads UTC. Observed live: "**Selamat siang**" at 18:05 WIB. In practice a parent opening the app between roughly 07:00 and 18:00 WIB is greeted "pagi". The same file uses `getYmdInTimezone(now, JAKARTA_TZ)` correctly for the date on line 41. (Teacher home is a *client* component, so it reads the browser's local hour — also not Jakarta-pinned, but correct for users physically in WIB.)

**m2 — Parent honorific is doubled, and fathers are greeted "Bu".** `app/parent/page.tsx:194-198`. Two defects: (a) `parent.name.split(" ")[0]` takes the first token, but `Parent.name` already carries the honorific ("Ibu Rina", "Bapak Hendra Hakim") → observed live: "**Assalamu'alaikum, Bu Ibu**"; (b) the gender check compares `firstRel === "FATHER"`, but `StudentGuardian.relationship` stores **IBU / AYAH / WALI** (28 / 6 / 2 rows) — so the branch never fires and all 6 AYAH guardians are addressed "Bu". A father named "Bapak Hendra Hakim" would be greeted "Bu Bapak".

**m3 — Teacher "Periode" contradicts admin and parent.** `app/teacher/assessments/page.tsx:50-52` derives the semester from a calendar-month heuristic (`month >= 7 ? "Semester 1" : "Semester 2"`) rather than the `Semester` row. Teacher portal shows "Periode: **Semester 1** 2025/2026" while `/admin/raport` and `/parent/perkembangan` both show "**Semester 2** · 2025/2026" for the same date — and Semester 2 is the row that actually owns the Weeks the page renders.

**m4 — Journal `weekStart` default is UTC, not Jakarta.** `app/api/student-journal/admin/classes/route.ts:34` uses `new Date().toISOString().slice(0,10)`. The sibling `admin/class-roll-up/route.ts` correctly uses `getTodayInTimezone("Asia/Jakarta")`. Between 00:00–06:59 WIB the two disagree; on a Monday that shifts the admin monitor a full week.

**m5 — No `not-found.tsx` anywhere in the app.** `notFound()` renders Next.js's raw black-on-white English default ("404 · This page could not be found."), with no branding, no Indonesian, and no way back. Reachable from the parent portal via any stale or mistyped child link. `error.tsx` boundaries exist for all three portals; `not-found` does not.

**m6 — Checked journal indicator labels fail WCAG AA.** Checked rows render label text at `rgb(93, 180, 184)` on a near-white tinted background (~2.2:1). Unchecked rows use `rgb(28, 25, 23)`. The *meaningful* state is the harder one to read.

**m7 — Raport "Tinggi (cm)" and "Berat (kg)" show a required asterisk but are optional.** Publish succeeded with both empty (`StudentMeasurement` fields are nullable). The asterisk is misleading.

**m8 — Sentra "Kegiatan" free-text is captured but never surfaced.** `AssessmentEntry.activity` stored `[QA] Menggambar bebas dengan krayon`; neither the parent Capaian detail card nor the admin monitor displays it.

**m9 — `/admin/student-journal/monitoring` takes ~13–15 s to first data.** Its own API answers in ~560 ms when called directly from the loaded page, so the delay is client-side/waterfall rather than query cost. Reproduced on repeat loads, not just cold start. `/admin/penilaian` (~10 s) and several teacher pages (~8 s) are also slow to first paint; the teacher home renders a fully blank body (no skeleton) while loading.

**m10 — Dead code.** `hariKosong` (`monitoring/page.tsx:127`) is computed but never rendered; the "Kelas belum isi" card uses a different expression.

**m11 — Rapor banner copy reads awkwardly.** "Rapor Triwulan 1 · Semester 2 · 2025/2026 Zahra sudah terbit" — the child's name is interpolated after the period string.

**m12 — One HTTP POST per indicator tap** on `/api/student-journal/entries/batch` (4 taps → 4 requests) despite the endpoint being batch-shaped. Worth debouncing for the intermittent-4G target.

### ⚪ DATA (staging seed, not application code)

**d1 — Semester 2 sits outside its parent academic year.** `Semester` #2 runs 2026-07-19 → 2026-09-10, but `AcademicYear` 2025/2026 ends 2026-06-19; both semesters are marked ACTIVE simultaneously. This is what makes m3 visible. Worth fixing in the staging seed before reading much into date-derived behaviour.

---

## 5. Not tested / limitations

- **"Di Rumah" (HOME scope) journal entries** — the parent-authored side of the penghubung. Not exercised; only SCHOOL scope was written.
- **Truly childless guardian.** No such account exists — all three GUARDIAN users have exactly 2 children. An initial DB query suggested `rightjet.hq` had none; that query was truncated by `head` and the reading was wrong. The empty state was still verified, but for a guardian whose children simply have no entries in the selected week.
- **Cross-tenant isolation.** Staging is single-tenant (`t_annisaa`); only cross-*family* scoping could be tested.
- **Raport PDF.** "Unduh PDF" renders as available in both admin and parent but the download itself was not executed.
- **Admin Category-C override / soft-void** of an `AssessmentEntry` (`voidedAt`) — not exercised.
- **Sentra roster semantics.** The "Kelompok usia TK A/TK B" toggle filters the *IKTP* set by `objective.ageGroup`, not the student roster — the roster is all 20 active students, matching the documented "rotasi fleksibel" design. Flagged only because the control's label implies otherwise.
- **Sentra write scope is broad by design.** A DCARE walas successfully recorded a CENTER entry for a TKIT-A student. This matches the documented rule in `assessment-entries/center/route.ts` ("any TEACHER may write CENTER entries"); noted so it isn't mistaken for a defect later.
- **Playwright / vitest** were not run — this was a live-environment pass only.
- **Timezone caveat.** The driving browser was not in WIB, so client-rendered clocks and date-input defaults reflected the harness's local time. Server-derived values (m1, m4) were verified in code, not inferred from the browser.

---

## 6. Recommended order

1. **B1** — one-line fix, restores the weekly assessment workflow.
2. **M1** — add `academicYearId` to the journal admin class query; disambiguate class labels in the raport picker.
3. **M4** — audit the batch entry write.
4. **M2 / M3** — return a real entry count from the API; count distinct students.
5. **m1 / m2** — greeting timezone and honorific; both are on the first screen every parent sees.
6. **m3 / m4 / d1** — align semester and week resolution on the DB rows and Asia/Jakarta.
