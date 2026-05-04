# An Nisaa School — Teacher Insights & Drive Audit

> Field notes from teacher interview + comprehensive Google Drive audit (Semester 2 TA 2025/2026).
> Captured: 2026-05-04. Source: live conversation + 4 parallel research agents.

**Legend:** ✅ confirmed · ❓ open · 🔴 critical / blocker · 📎 artifact pending

**Artifact source:** [Google Drive folder](https://drive.google.com/drive/folders/1-fAUpreoeJzQAtkNDYepfeCcUTKqqZAX) — root contains only **Semester 2** subfolder. Sem 1 / KB / payroll folders not shared yet.

**Website:** [annisaasekolahku.com](https://annisaasekolahku.com)

---

# 0. Strategic Context (2026-05-04 pivot signal)

## 0.1 Painpoint observation
Teacher interview reveal massive admin burden — paper buku tamu, Excel penilaian, WA broadcast, Drive docx for everything. **Current ERP build may not addressing root pain.**

## 0.2 Founding values for v2
1. **Simplicity** — guru kesulitan tools sekarang, jangan tambah kompleksitas.
2. **Flexibility** — admission form, fee component, indikator catalog, pilar list semua bisa berubah. Schema evolution mesti hands-off.
3. **Story** — data jadi memorable narratives untuk **teacher / parent / student** (eventually). Bukan dashboards saja — system harus surface meaningful moments per actor.

### Story value implications
- **Per-student timeline** — first day, hafalan milestones (first surah completed, Asmaul Husna 1-10 mastered), first sentra-finished, lomba podium, Jambore highlights, raport graduation.
- **Per-teacher memory** — kelas yearbook auto-compiled, anak-anak yang pernah di-walas-i, tahfidz progress story per angkatan.
- **Per-parent narrative** — child's growth journey (foto/video timeline from WA broadcasts, hafalan progression, sentra exploration), shareable to keluarga besar.
- **Data → narrative engine** — every penilaian entry, hafalan progress, attendance pattern, sentra observation, raport rubric is a candidate story atom. AI/template-driven story compilation.
- **Schema implication**: design tables to capture **timestamps + actor + context** liberally. Don't drop signal. Story-grade data: photos w/ caption, videos w/ tag, voice notes, anecdotal observations (Catatan Anekdot already in penilaian harian — keep!).
- **Artifact tie-in**: Catatan Anekdot + Foto Berseri (per modul ajar harian asesmen 7 teknik) = literal story-data primitives. Already part of curriculum framework.

## 0.3 Hypothesis: generic CRUD builder / scaffold
Form admission today: 10 fields. Besok: + file upload (akta, KK, foto). Lusa: + special-needs flag. Hard-coded form = constant code change.

**Direction (not yet committed):** form/entity scaffold engine — admin define fields, validation, file uploads, relationships via UI/config. CRUD pages auto-generated. Penilaian indikator catalog also config-driven (add/remove indikator without code change).

**Reference patterns to study (later, in brainstorm):**
- Notion / Airtable database
- Frappe / ERPNext DocType + Form Builder
- Supabase + auto-generated API
- Strapi headless CMS
- Retool internal-tool builder
- Tally / Typeform form builder

⚠️ **Brainstorm later** — current task = artifact + insight gathering only.

## 0.4 Implication for current notes
All schema hypotheses recorded so far (§7) assume hard-coded entities. **Re-evaluate with config-driven lens** during brainstorm. Examples:
- `kurikulum_indikator` — admin-editable catalog, not seeded constant
- `tema/sub_tema` — admin define per semester
- `RAB line items` — fully dynamic, no fixed schema
- `student fields` — base + custom_fields[]
- `event_type` — not enum, registry table
- `pilar_karakter` — catalog editable per year
- `scoring_scale` — pluggable (SM/BM, BB/MB/BSH/BSB, 3-level rubric all coexist)

## 0.5 Locked Decisions (post-clarification 2026-05-04)

| # | Decision |
|---|---|
| Scope | **Greenfield app/, port `lib/` + design system as-is** (NOT preserve admin/teacher/parent pages) |
| Audience priority | Admin → Guru → Ortu (build order) |
| Tenancy | Single school (An Nisaa), scalable pattern for later sale |
| Scaffold | **Custom CRUD engine** (NOT Frappe/ERPNext) |
| Config authority | Admin + Kepala Sekolah only (audit required) |
| Story compiler | **Both AI (GLM) + template-driven** |
| Media | Compressed photo storage on system, **≥2 photos / class session / day**, **2-year retention**. WA primary share channel |
| Phone policy | Will change — guru boleh HP. Tablet later phase |
| WA role | **Supplement** (notification + broadcast) |
| Timeline | **Launch June 2026 (TA 2026/2027)** — ~5-6 weeks |
| Team | Solo |
| Success metric | **Manual/paper work fully replaced** + NPS per actor (admin/guru/ortu) |
| Multi-entity | **Single deployment + `institution_type` discriminator** (RA / TKIT) |
| Multi-campus | Scalable to N (current 2: Metland + Aster) |
| Compliance | **Flexible export** (custom field + filter, no hardcoded Dinas template) |
| Migration | **Start fresh TA 2026/2027** — no port from old DB or Drive |
| Stack core | Next 16 + Prisma + Supabase + Tailwind + Shadcn (keep) |
| Stack add | react-hook-form, Supabase Storage, pg-boss, next-intl, Fonnte/Wati WA, GLM SDK, sharp image |
| Stack drop | Hono claim (never installed), free-string enums in schema |

## 0.6 Preserve / Throw

**Preserve as-is:**
- `lib/xendit/*` — typed errors, retry, demo short-circuit
- `lib/payroll/*` — UU 13/2003 compliance, BSI export
- `lib/finance/*` — P2002 race fixes, bulk concurrency, Vercel 60s workaround
- `lib/hijri.ts` — pure Intl, 30 lines
- `lib/api/*` — response, pagination, validate helpers
- `lib/webhook/*` — redact, error labels
- `.claude/standards/design-system.html` (4000-line canonical reference)
- Shadcn component library (68 components)
- Auth pattern (Supabase SSR + react.cache) — refactor into smaller files
- Finance schema subset: InvoiceNumberSequence, FeeComponentDef, ProgramFeeStructure, Invoice, InvoiceLine, Payment, PayrollRun/Item/Line, SalaryComponentDef, EmployeeSalaryValue

**Throw / rebuild:**
- All `app/admin/*`, `app/teacher/*`, `app/parent/*` pages
- `prisma/seed.ts` (1421 lines)
- All hand-rolled forms (700-1400 lines each)
- Single email template (no abstraction)
- Free-string enums in schema (Holiday.type, Admission.source, LeaveRequest.leaveType, Parent.education/occupation/incomeRange, StudentGuardian.relationship, AttendanceRecord.status)
- Generic `AssessmentTemplate→Category→Indicator` (replace with PROMES → Modul → Penilaian Harian + Sentra)
- Single `User.role` string (replace with `roles[]`)
- Single `Employee.campusId` (replace with multi-campus assignment)
- `proxy.ts` hardcoded portal idle thresholds (move to OrgConfig)
- 19 ad-hoc Zod validators (derive from model)

**Align carefully (NOT throw):**
- `README.md` — update product identity, tech stack, modules, ADR table to match new build. Keep version-history meaningful. Do **not** wipe and rewrite from scratch — preserve continuity.
- `CLAUDE.md` — update workflow, standards table, file structure as new build lands. Likely simpler under generic CRUD scaffold (less domain rules per file pattern).
- `.claude/standards/*.md` — domain rules likely change (CRUD pattern shifts when scaffold engine takes over). Keep design-system.html canonical, evolve others alongside rebuild.

⚠️ **When updating README/CLAUDE.md during rebuild**: incremental diff per cycle, not big-bang rewrite. Each cycle's `/spec` doc captures rationale; README/CLAUDE.md trail behind by one cycle.

## 0.7 MVP Scope (June 2026 launch)

**Must ship:**
- Admin: admission, students, guardians, billing (port lib/finance), Xendit
- Teacher: penilaian harian per sentra (SM/BM), hafalan tracker, buku penghubung
- Parent: invoice, raport read, buku penghubung response
- Curriculum scaffold: PROMES → Modul Pekanan → Penilaian Harian
- Sentra catalog (8) + rotation
- Hafalan multi-track (Tahfidz / Hadits / Doa / Asmaul Husna)
- Raport Triwulan generator (3-level rubric narrative)
- Media bin (≥2 photos/session/day, compressed, 2-yr retention)
- Multi-campus + multi-entity discriminator
- Generic CRUD scaffold engine (foundation)

**Defer post-launch:**
- AI story compiler (with anonymization)
- Lomba scoring (BB/MB/BSH/BSB) — AKSERA/Fest
- Referral / Be Our Ambassador
- Yayasan reporting dashboard
- WA full broadcast (start with notification only)
- Tablet mode optimization
- Sub teacher concept
- Yearbook auto-compile

## 0.8 AI Privacy Pattern (when story compiler ships)

GLM = Zhipu (China-based). PDP Law (UU 27/2022) + child < 18 sensitivity.

1. **Anonymize before send**: `[STUDENT_TOKEN_<uuid>]` replace name. Strip NIK, exact DOB, alamat.
2. **No photos to LLM** — text inputs only. Photo compile = client-side template.
3. **Server-side post-replace** — token → real name on receipt, before storage.
4. **Audit log mandatory** — every AI call: prompt_hash, redacted input, output, student_id, called_by.
5. **Parent consent flag** — `student.ai_narrative_consent`, opt-in default OFF.
6. **LLM provider abstracted** — swap GLM ↔ Anthropic ↔ local Llama if PDP pushback.
7. **Output review gate** — v1: walas/kepsek approves AI draft before publish. v2: audit-only.

Schema additions:
```
ai_consent(student_id, scope[narrative|story|raport], granted_by_guardian_id, granted_at, revoked_at)
ai_request_log(id, model, prompt_hash, redacted_input_json, raw_output, redacted_output, student_id, requested_by_user_id, requested_at, approved_by, approved_at)
```

---

# 1. Student Lifecycle

## 1.1 Visit / Inquiry
- ✅ **Buku tamu kunjungan** — fisik (paper). Title page: "Penerimaan Peserta Didik Baru TA 2026/2027".
- Fields: No, Tanggal, Nama Anak, Tempat & tgl lahir, L/P, Nama Ortu, Alamat, No HP, Kelompok (KB/TK A/TK B), No form.
- ✅ **Konversi ~80%** kunjungan → daftar.
- ❓ Siapa yang isi (admin / parent)? Berapa kunjungan / minggu?

## 1.2 Pickup Registration Form
- ✅ Berbayar **Rp 300.000** ambil form. Bisa diskon case-by-case.
- 📎 Photo of form attached.

## 1.3 Admin Follow-up
- ✅ Channel: **WhatsApp manual**, no system.
- ❓ Berapa kali sebelum drop? Pipeline tracker?

## 1.4 Pop-up Class
- Belum operasional, trial. Dimanage terpisah. ❓ Beda dari reguler?

## 1.5 Confirm Registration
- Parent returns form → admin creates **Xendit invoice** untuk biaya awal.
- 📎 Komponen biaya awal artifact pending. ❓ Cicilan / DP / refund?

## 1.6 Uniform & Supplies
- Pengukuran → pengambilan seragam + tas. ❓ Vendor + lead time?

## 1.7 Onboarding to Community
- ✅ **P2DB / SPMB** group (WA), **per tahun ajaran, cross-jenjang**.

## 1.8 Class Placement
- ✅ Berdasar umur. Boleh lebih, tidak kurang. Kapasitas **1:12 atau 1:15** (per unit, Metland ≠ Aster).
- ❓ Cut-off tanggal lahir + waiting list?

## 1.9 Initial Assessment
- ✅ Tujuan: **flag perhatian khusus only** — awareness guru, bukan input split kelas.
- 📎 Format/durasi/storage/program — artifact pending.

## 1.10 MPLS — Masa Pengenalan Lingkungan Sekolah
- ✅ **3 hari**, pengelompokan sementara, belum ada wali kelas.
- ✅ **Standar orientasi** — TIDAK feed placement decision.
- ❓ Siapa pimpin (guru piket / panitia)?

## 1.11 Penempatan Kelas Final
- ✅ Setelah MPLS → assign kelas final (TK A 1, TK A 2, dst).
- ✅ **Tidak ada kriteria khusus** untuk split paralel. Umur hanya determine jenjang.
- ✅ TK A & TK B masing-masing **4 paralel** (A1–A4, B1–B4).
- ❓ Siapa decide split (random / kepala sekolah)?

## 1.12 Parent Meeting
- ✅ **Sebulan sekali**, kecuali bulan Ramadhan (skip).
- ❓ Per kelas / jenjang / sekolah-wide? Wajib hadir? Agenda?

## 1.13 Ongoing — Reporting Cadence (decoded from Drive)
- ✅ **4 raport per tahun**: TW1 Sem1 (Sep), TW2/Final Sem1 (Dec), TW1 Sem2 (Apr), Final Sem2 (Jun).
- ✅ Triwulan = mid-semester progress (~3 bulan).
- Raport per murid, per kelas, sebagai **.docx narrative**, ~5 MB (embedded photos).

## 1.14 Exit (TBD)
- ❓ Naik kelas, pindah mid-year, kelulusan flow?

---

# 2. Teacher Daily Flow

## 2.0 Foundations
- ✅ **Absen guru: fingerprint per campus**.
- ✅ Tools: **paper + WhatsApp + Excel + Google Drive** (Drive heavily used by adm.pembelajaran).
- ✅ **Phone policy: tidak boleh selama jam akademik** (kecuali end-of-day share foto/video grup ortu).

## 2.1 Day Care Track (full-day)
- ✅ Guru piket datang **06.15**, terima anak yang datang pagi.
- ✅ Pendampingan **full pagi → 17.00**.
- ✅ Aktivitas mirip TK, beda detail (format penilaian beda).
- ❓ Format penilaian day care vs TK detail?
- ❓ Rasio guru:anak day care?

## 2.2 TK Track — Morning (06.30 – 07.30)
- ✅ Guru datang **06.30**.
- ✅ Khusus bu guru: nutrisi pagi, info-info, **berikrar**, **Al Fatihah**, yel-yel An Nisaa.
- ✅ Bu guru stand at position untuk terima anak (mobile sampai jam 7).
- ✅ Anak datang 06.30–06.45, masuk jam 7 (bel).
- Roster: 07.00–07.10 kehadiran guru, 07.10–07.30 nutrisi pagi (kecuali piket 07.10–07.20). Stel video Jus 30 (Sen/Rab/Jum) atau Asmaul Husna (Sel/Kam) di TV kelas.

## 2.3 TK Track — Class Activities (07.30 – 11.30)
- ✅ Anak baris depan gedung, doa sebelum masuk.
- Daily opening:
  - Senin: Upacara
  - Selasa: Senam Islam Ceria
  - Rabu: Pembukaan + praktek sholat Duha
  - Kamis: Senam 7 Anak Indonesia Hebat
  - Jumat: baris bareng, fokus jantung
- Roster fixed blocks (per artifact Roster Kelompok B TA 2025/2026):
  - 07.50–08.00: membalik absen, papan perasaan, jurnal, menggambar bebas
  - 08.00–08.15: Klasikal & Individu **AISM** (Sen–Rab); Gerak & Lagu (Kam); Silent Reading (Jum)
  - 08.15–08.30: **Pertemuan pagi** — pengenalan tema, jadwal, hari/tgl/bln/thn, kegiatan, peraturan kelas
  - 08.30–08.45: Pilar Karakter; Kisah Teladan (Kam)
  - 08.45–09.15: **Metode Ilman wa Ruhan**; Kamis: Wuduk + Sholat + Infak
  - 09.15–09.45: Makan + Main rotasi B1/B3 ↔ B2/B4
  - 09.45–11.00: **Sentra** (main block); Kamis: Siroh Nabawiyah + huruf arab
  - 11.00–11.15: pijakan setelah bermain (closing)
  - 11.15–11.30: Refleksi, Penutup
  - Kamis 11.00–11.30: kokurikuler — **Pekan 1: Tahfiz · Pekan 2,4: Mewarnai/Menari · Pekan 3: Angklung**

## 2.4 In-Class Recording
- ✅ **Buku penghubung** + **presensi** diisi sela-sela kegiatan ("curi waktu") sebelum anak pulang.
- ✅ **Penilaian Harian per Sentra** ditulis di docx template (BM/SM checklist) — see §4.
- ❓ Buku penghubung — fisik per anak yang dibawa pulang? Konten?

## 2.5 End-of-Day Comm
- ✅ End of schedule (~11.00): guru share **foto/video** ke **WA grup kelas (with parents)**.
- ❓ Aturan privacy / persetujuan ortu?

## 2.6 Afternoon (post-istirahat)
- ✅ **13.00**: isi penilaian per kelas, **20–25 menit**.
- ✅ Setelah penilaian: prepare bahan ngajar besok / bulan depan.
- ✅ **14.15: bu guru TK pulang**.

## 2.7 Yearly Planning — see §4 (full curriculum hierarchy decoded).

## 2.8 Edge Cases (raised, open)
- 🔴 **Guru pengganti** — wali kelas sakit. **Siapa isi buku penghubung?** Substitute access scope? Penilaian harian — substitute fill atau wali kelas asli amend belakangan?
- 🔴 **Admin = teacher overlap** — admin juga ngajar. Single user multi-role, atau akun terpisah? Fingerprint?

## 2.9 Open
- ❓ Lunch break — guru piket jaga makan?
- ❓ Sholat berjamaah — guru pimpin?
- ❓ Laporan harian — kepada siapa?
- ❓ Lembur / izin / sakit flow?
- 🔴 **Multi-campus rotation** (Metland ↔ Aster) — fingerprint per campus implication?

---

# 3. Finance Matters

## 3.1 Known Touchpoints
- ✅ Form pendaftaran **Rp 300.000** (case-by-case discount).
- ✅ Biaya awal via **Xendit invoice**.
- 📎 Komponen biaya awal artifact pending.

## 3.2 RAB Sentra (Tuition-funded media budget)
- ✅ Per-tema, **4 sentra areas** (Aku Anak Sehat, Aku Senang Berkarya, Saya Senang Berpetualang, Akhlakul Karimah).
- ✅ Sample: Tema "Aku Anak Sehat" sentra → **Rp 495.000** total (tepung, pewarna, poster isi piringku, hospitality, cat asturo, melon, nampan XXL, dll.).
- ✅ ~8 RAB workbooks/year (4 tema × 2 sem).
- ❌ **Tidak ada kolom funding source** — implicit yayasan/SPP-funded.
- Approver: Kadiv Pendidikan (Era Zamona Chattar) + Guru Kelas.

## 3.3 RAB Event (Jambore)
- ✅ Sample Kids Jambore TK B (28 April 2026, Camping Ground Kalam Kopen): 56 anak, 11 guru, 6 ortu.
- ✅ Plan: **Rp 11.060.000** | Realisasi: **Rp 11.410.000** | variance: parkir + uang makan sopir + perlengkapan.
- ✅ Workbook punya 2 sheet: **Rencana Anggaran** + **Laporan Anggaran**.
- ✅ Format kolom event: transport, makan pagi, tiket masuk, P3K, air mineral.

## 3.4 RAB MABIT (template stub)
- 🟡 File ada (RAB MABIT.xlsx), tapi **byte-identical dengan RAB Sentra** — placeholder, belum di-fill.
- MABIT = **Malam Bina Iman dan Taqwa** (overnight religious retreat).
- ❓ Apakah school punya event-RAB template terpisah, atau RAB Sentra di-reuse?

## 3.5 Be Our Ambassador (Referral Program) 🆕
- ✅ **PDF marketing**: "Be Our Ambassador An Nisaa Sekolahku".
- ✅ **Reward: 6% sharing uang pangkal** untuk completed referral.
- Created 2026-04-10 — kemungkinan **launching baru / planned**.
- ❓ Sudah running atau planning saja? Tracking referral pakai apa?
- 🔴 **Schema implication**: referral codes, referrer (ortu / staff?), prospective parent, conversion status, reward payout trigger.

## 3.6 Open
- ❓ SPP — bulanan / term? Tanggal tagih? Channel (Xendit / WA / paper)?
- ❓ Biaya non-rutin (kegiatan, ujian, study tour)?
- ❓ Tunggakan flow + konsekuensi?
- ❓ Gaji guru — pokok / tunjangan / lembur? Tanggal bayar? Bank / cash?
- ❓ Cash vs transfer ratio?
- ❓ Pegang kas — admin keuangan / kepsek / yayasan?
- ❓ Yayasan reporting — frekuensi, format?
- ❓ Audit eksternal?

---

# 4. Curriculum & Assessment System (decoded from Drive)

## 4.1 Three-tier Academic Hierarchy

| Tier | Doc | Format | Scope | Signed By |
|------|-----|--------|-------|-----------|
| 1 | **PROMES** (Program Semester) | xlsx | Per kelompok, per semester | Kadiv Pendidikan + 4 walas |
| 2 | **Modul Ajar Pekanan** | docx | Per kelompok, per pekan | Kepala RA/TKIT + Guru Kelas |
| 2b | **Modul Ajar Harian** | docx | Per sentra, per 2-day pair | Guru sentra |
| 3 | **Penilaian Pekanan** | xlsx | Per kelompok, per pekan, daily cols (TEMPLATE only — empty cells) | Kepala + walas |
| 3b | **Penilaian Harian** | docx | Per sentra, per 2-day, per kelas (B1/B2/B3/B4) — **DATA HERE** | Guru sentra |
| 4 | **Raport Triwulan** | docx | Per murid, per ~3 bulan | Walas + Kepala RA |

🔴 **Critical insight**: Penilaian Pekanan files = **printable template, all cells empty in samples**. Real data ada di **Penilaian Harian per Sentra** dengan **SM/BM checklist**. Pekanan adalah aggregation/printout untuk arsip atau parent comm — bisa di-auto-generate dari Harian data.

## 4.2 Curriculum Structure (Kurikulum Merdeka, RA / Madrasah)

**3 elements** (TK B):
1. **Nilai Agama dan Budi Pekerti (NAB)** — Asmaul Husna, Rukun Iman, Tahfidz, Hadits, Doa, Kalimat Thoyyibah, akhlak mulia, thaharah/istinja'.
2. **Jati Diri** — identitas, emosi, motorik kasar/halus/taktil, hubungan sosial.
3. **Dasar-dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, Seni** ("STEAM").

Each → Sub Elemen → **IKTP** (Indikator Ketercapaian Tujuan Pembelajaran).

## 4.3 PROMES TK A vs TK B

| | TK A (4-5 yrs, RA) | TK B (5-6 yrs, TKIT) |
|---|---|---|
| Walas | Hana Hanifah, Meilani Mulya Puteri, Ayu Rahma Yuniska, Lutfi Femiliana | Diana Lestari, Eneng Rina, Elvriani Haziza, Yulia Purbaningsih |
| Kelas | A1–A4 | B1–B4 |
| IKTP cognitive verb | "mengenal", "menyebutkan", "menirukan" (recognition) | "menerapkan", "merefleksikan", "menghubungkan", "menyimpulkan" (apply/reflect) |
| Tema Sem 2 | 4 mega-themes (same as B) + **AN NISAA FEST** + Pengayaan + PAC + Raport | 4 mega-themes + **PPA** + Pengayaan + PAC + Raport |
| Sub-tema "Berkarya" | Aku Anak Kreatif, I Love Art, Anak Hebat Cinta Literasi, Aku Seniman Cilik | Cita-citaku, Pahlawan kesehatan, Senangnya menjadi detektif, Pelayan masyarakat |

🔴 **Two parallel hierarchies**: TKIT (B) vs RA (A) — different signers (Kepala TKIT vs Kepala RA). Implies **two legal/admin entities under one school**.

## 4.4 Modul Ajar Pekanan Structure

Per pekan per kelompok, contains:
- Tema/Sub-tema
- Materi (3 elements + IKTP list pulled from PROMES)
- **Hafalan tracks** (4 tracks):
  - Tahfidz Q.S. (specific surah, **cumulative across pekan**)
  - Hadits (specific topics, cumulative)
  - Doa (cumulative)
  - Asmaul Husna 1–N (range)
- **Pilar Karakter** — referenced by number ("Pilar 3", "Pilar 6") → **finite list outside files** (printed poster?)
- Daily breakdown Sen–Jum (3-4 activity bullets per hari)
- Signers: Kepala RA/TKIT + Walas

✅ TK A & TK B follow **different surah tracks** — not synced.
- Wk Jan 12: Q.S. Al-Fatihah
- Wk Feb 2 (B): Q.S. Al Adiyat
- Wk Mar 2 (A): An Nasr, Al Kafirun, Al Kautsar
- Wk Mar 2 (B): Al Zalzalah
- Wk Apr 27 (A): An Nasr, Al Kafirun, Al Kautsar, **Al Ma'un** (added)

## 4.5 Modul Ajar Harian (per Sentra)

Far more detailed than Pekanan. Common skeleton across all sentra docs:

```
Modul Ajar Sentra <X>
Tema/SubTema/SubSubTema, Tanggal
Table: Fase=Pondasi | Kelas | Jumlah Siswa (9-15) | Model | Alokasi (120-240 min)
Tujuan Pembelajaran (NAB / Jati Diri / STEAM)
8 Dimensi Profil Lulusan (8 fixed values)
SKL IT (6 fixed values)
Kompetensi Prasyarat | Pertanyaan Pemantik
Deskripsi Singkat Konten Belajar (paragraph + ayat Qur'an + hadits + youtube link)
Sarana / Prasarana
Rencana Diferensiasi (4×3 matrix: Konten/Proses/Produk/Lingkungan × Kesiapan/Minat/Profil V/A/K)
Rencana Asesmen (AaL/AfL/AoL × Formatif/Sumatif × 7 teknik:
  Observasi, Unjuk Kerja, Wawancara, Hasil Karya, Catatan Anekdot, Foto Berseri, Ceklis)
Pengaturan Murid + Metode

Kegiatan Pembelajaran Utama — ADLX TERPADU × INTROFLEX framework:
  Kedatangan → Opener Pertemuan Pagi Ceria → Ukhrowi → Eksplorasi → Ukhrowi
  → Terangkan → Afirmasi → Respon → Pembiasaan → Kaitkan & Simpulkan
  → Duniawi → Ukhrowi → Closure
Each row: time slot | activity bullets | Introflex tag (Individualisasi/Interaksi/Observasi/Refleksi)
```

- Per-day variation hanya di **Eksplorasi** dan **Duniawi** rows. Lainnya boilerplate.
- Each Sentra Harian doc covers **2 consecutive days** (Sen-Sel atau Rab-Kam).

**Frameworks confirmed:**
- **ADLX** (Active Deep Learner eXperience) — institutional pedagogy
- **INTROFLEX** = Individualisasi / Interaksi / Observasi / Refleksi
- **IWR** — Pembelajaran Al Qur'an Metode IWR
- **AISM** — referenced in roster (08.00 Klasikal & Individu AISM) — ❓ singkatan?

## 4.6 8 Sentra (fixed)

1. Sentra Main Peran (MP) — Mikro / Makro variants
2. AREA — has sub-folders: Ramadhan, PUNCAK TEMA, AKSERA, AREA I LOVE ISLAM
3. Sentra Persiapan
4. Sentra Ibadah
5. Sentra Bahan Alam
6. Sentra Seni
7. Sentra Memasak
8. Sentra Balok

Plus non-sentra slot: **I LOVE ISLAM** (in classroom).

✅ Each kelas rotates through **8 sentra across week**. Guru sentra ≠ walas — same teacher signs across multiple sentra (e.g. Diana Lestari signs Persiapan + Ibadah). **Either teachers rotate sentra by week, or sentra-teacher binding isn't 1:1.**

## 4.7 Penilaian Harian (per Sentra) — actual data layer

Per sentra, per 2-day, per kelas docx:
- Header: Kelompok / Hari-Tanggal / Tema-SubTema-SubSubTema
- **Penilaian table**: 3-4 Kegiatan, each with NAB / Jati Diri / STEAM indikator + Skala Nilai descriptors (SM/BM rubric per activity)
- **Hasil Penilaian Murid table**: rows = murid (pre-printed roster, 9-15/kelas), columns = indikator dengan **SM** dan **BM** sub-columns (checklist)
- Filled cells use **`✓`** (checkmark). Absent murid marked **`-`** (dash).
- Signature: Bekasi tgl + Guru Sentra + Catatan Guru

✅ **Skala = SM/BM** (Sudah Muncul / Belum Muncul). Sentra Seni explicit legend: **BM = 75-89, SM = 90-100** (numeric band mapping).

## 4.8 Raport Triwulan structure

Per murid, per period docx (~5 MB embedded photos):

```
LAPORAN PERKEMBANGAN PESERTA DIDIK
RAUDHATUL ATHFAL AN NISAA — KABUPATEN BEKASI

Header: Nama / Kelas / NIS / NISN / Usia / Fase: Fondasi / TA / Semester (Triwulan N) /
        Tinggi Badan / Berat Badan

1. Pendahuluan — kehadiran ringkas ("masuk 42 hari, sakit 1 hari")
2. Nilai Agama dan Budi Pekerti — narrative w/ specific hadis, doa, tahfidz surah,
   Asmaul Husna range, PHBI events (Isra Mi'raj, Tarhib Ramadhan)
3. Jati Diri — fine-motor via specific sentra activities (playdough, balok, origami)
4. Dasar-dasar Literasi/Matematika/Sains/Rekayasa/Tech/Seni — STEAM narrative
5. Unjuk Kerja — performance task narrative
6. Rencana Tindak Lanjut (RTL) — split: Kegiatan di Sekolah + Kegiatan disarankan di Rumah
7. Penutup — closes with rhyming Indonesian pantun
8. Ketidakhadiran table — Sakit / Izin / Tanpa keterangan + parent attendance Parenting/Pengajian
9. Sign-off: walas (NPK) + Kepala RA (NUPTK)
10. Komentar Orang Tua — empty section for parent reply
```

- ❌ **No numeric scores** in raport. All narrative.
- ✅ **Rubric-driven authoring** — kisi-kisi master doc has 3 levels:
  - **MAMPU & KONSISTEN**
  - **MAMPU BELUM KONSISTEN**
  - **PERLU PENGUATAN**
- Walas tag student → level → narrative copy from kisi-kisi → customize.

## 4.9 LKA (Lembar Kerja Anak)

- Per-day docx, A vs B prefix.
- Format: instruction-to-children (gamified narrative atau cut-and-paste activity).
- Sample: "Tempelkan gambar kuman di salah satu tangan!" / "SELAMAT KALIAN SUDAH SAMPAI di TITIK PERTAMA / Kalian jalan lagi dan petik 10 ceri".
- ❓ Disimpan per murid? Atau template per kelas?

---

# 5. Events & Competitions (decoded from Drive)

## 5.1 Recurring Event Types

| Event | Cadence | Scope | Sample artifact |
|-------|---------|-------|-----------------|
| **Puncak Tema** | Per tema (4×/sem) | Per kelompok | Modul + RAB |
| **Kids Jambore** | Tahunan | Per kelompok (TK B) | RAB ~Rp 11M, modul, matriks kelompok |
| **MABIT** (Malam Bina Iman & Taqwa) | TBD | Per kelompok | 📎 RAB stub |
| **An Nisaa Fest** | Tahunan (Mei) | Sekolah-wide | Lomba Tahfidz, Iqomah, Sholawat |
| **AKSERA** | TBD | Inter-RA at Metland & Aster | 7 lomba kategori |
| **PHBI** (Peringatan Hari Besar Islam) | Sesuai kalender Hijri | Sekolah-wide | Isra Mi'raj, Tarhib Ramadhan |
| **Parenting / Pengajian Ortu** | Bulanan? | Per kelompok | Tracked in raport |
| **Manasik Haji** | Tahunan | Sekolah-wide | Hajj practice ritual (per website galeri) |
| **Field Trip** | Adhoc | Per kelompok | Pemadam Kebakaran, Kidzania |
| **Fun Cooking** | Recurring | Per kelompok | Per website galeri |
| **Hari Profesi** | Tahunan | Sekolah-wide | Dress-up profession day |
| **Lomba external** | Adhoc | Selected murid | e.g. Lomba Menari di Ancol |

## 5.2 An Nisaa Fest 2026 (Mei 18-20)

- ✅ Folder: 3 hari Senin–Rabu 18–20 Mei 2026.
- ✅ Lomba per hari: Lomba Tahfidz, Lomba Iqomah Ikhwan, Lomba Sholawat Akhwat.
- ✅ Per kelas (A1/A2/A3/A4) ceklis BM/SM.
- ❌ **Tidak ada budget / schedule / RSVP** di folder ini — logistics elsewhere atau belum dibuat.

## 5.3 AKSERA Metland & Aster

- ✅ **AKSERA = Anak Shaleh Cerdas Ceria RA** — competition between RA schools.
- ✅ **Multi-campus REAL**: Metland + Aster, **separate regu, separate PJ**.
- 7 lomba kategori:
  1. Menyanyi (Mars RA + Halo-halo Bandung) — 9 students/regu — PJ: Meilani
  2. Tahfidz A — 8 students
  3. Tahfidz B (Surat Al Fil) — 11 students
  4. Tahfidz Aster (Surat Al Fil) — 12 students — PJ: Hana
  5. Sholat Metland (Praktek Sholat) — 9 students
  6. Sholat Aster — 9 students
  7. Menari — 8 students — PJ: Diana
- ✅ **Scoring scale: BB / MB / BSH / BSB** (Permendikbud 4-level: Belum Berkembang → Berkembang Sangat Baik).
- ✅ 11 latihan dates (Jan 12–29) + Latihan Terakhir consolidated rubric → narrative KESIMPULAN per murid.
- Criteria: Ketepatan Vokal, Intonasi, Kekompakan, Penampilan (menyanyi); Kelancaran Hafalan, Tajwid & Adab (tahfidz); + Percaya Diri (sholat).
- ❓ Inter-RA (sekolah lain) atau internal house event?

## 5.4 Jambore Operations

- ✅ Per artifact:
  - **PIC**: walas (Yulia Purbaningsih).
  - **Pendampingan**: 56 anak split jadi **8 kelompok × ~7 anak**, **pendamping per kelompok**.
  - **Absensi**: berangkat + pulang (terpisah).
  - **Surat izin Musholla** — formal letter to local mosque (Musholla Al-Ikhlas), signed Kadiv Pendidikan.
  - **Laporan Kegiatan** docx: Latar Belakang / Pembahasan / Penutup / Dokumentasi / Anggaran.

## 5.5 Pilar Karakter

- Referenced by **number** in modul harian ("Pilar 3", "Pilar 6").
- Single explicit value collected: `(PILAR) : Hormat, Santun dan Pendengar Yang Baik`.
- ❓ **Master list lives outside Drive** — kemungkinan poster fisik. Ada berapa? Rotasi siklus mingguan?

---

# 6. Multi-campus & Org Structure

## 6.1 Confirmed Campuses (resolved via website)
- ✅ **Taman Aster** (Cikarang Barat): Perumahan Taman Aster Blok A1/16 & A1/46, RT 009 RW 07, Telaga Asih.
  - Tel: +62 21 2213 7709 | WA: 0877-4264-6815
- ✅ **Metland Cibitung** (Cikarang Barat): Perumahan Metland Cibitung Blok P2/2-3, Telaga Murni.
  - Tel: +62 21 8953 3593 | WA: 0877-4264-6815
- ✅ **Different capacity per unit** (1:12 atau 1:15) — physical room size dependent.
- ✅ AKSERA confirms: **separate regu Metland vs Aster**, separate PJ, separate scoring sheets.

## 6.2 Two Legal/Admin Entities
- ✅ **TK A → Kepala RA (Raudhatul Athfal)** — Kemenag-registered Islamic kindergarten track.
- ✅ **TK B → Kepala TKIT** (Taman Kanak-Kanak Islam Terpadu).
- ❓ Literal separate institutions atau dual labels?
- 🔴 Schema: ERP needs `entity` / `institution_type` discriminator on user/student records.

## 6.2a Programs Offered (per website)
- ✅ **KB** (Kelompok Bermain) — playgroup, age TBD (likely 2-4 yrs).
- ✅ **TKIT** (TK Islam Terpadu) — TK A (4-5) + TK B (5-6).
- ✅ **D'Care** (Daycare) — full-day care, infants/toddlers.
- ✅ **Operating hours**: Monday-Friday **07:30 – 17:00**.

## 6.2b Yayasan & History
- ✅ **Yayasan: Khoirunisaa' Bekasi**.
- ✅ **Founder: Dra. Era Zamona Chattar** (also Kadiv Pendidikan signing PROMES — same person).
- ✅ Established **21 May 1999** — 26 tahun beroperasi.
- ✅ **1500+ alumni**, **40+ certified guru**, 2 kampus aktif.
- ✅ Akreditasi: **Baik**.

## 6.2c Affiliations (per website)
- Kemendikbudristek
- JSIT Indonesia (Jaringan Sekolah Islam Terpadu)
- HIMPAUDI (Himpunan PAUD Indonesia)
- IGRA (Ikatan Guru Raudhatul Athfal)
- Astra School Partnership Program
- Indonesia Heritage Foundation

## 6.2d Brand identity
- Tagline: *"26 Tahun Merawat Masa Kecil Anak-Anak dengan Cinta & Dedikasi"*
- Mission: *"Membentuk generasi Rabbani yang cerdas, berprestasi, dan berakhlak mulia"*
- Email kontak utama: ceceannisaa@gmail.com

## 6.3 Staff Roster (decoded)

**Leadership:**
- Dra. **Era Zamona Chattar** (NUPTK 0260 7446 4630 0053) — **Kepala Divisi Pendidikan An Nisaa Sekolahku**.
- **Elvriani / Elviarini Haziza, S.Pd** — Kepala TKIT (also walas TK B paralel).
- **Eneng Rina, S.Pd.I** (NPK 8810 7301 5207 4) — Kepala RA (also walas TK A paralel).

**TK B walas (4 paralel):**
- Diana Lestari, S.Pd (NPK 6002 2901 21104) — B1
- Eneng Rina, S.Pd.I — B2
- Elvriani Haziza, S.Pd — B3
- Yulia Purbaningsih, S.Pd (Peg.Id. 20270358198004) — B4

**TK A walas (4 paralel):**
- Hana Hanifah
- Meilani Mulya Puteri
- Ayu Rahma Yuniska
- Lutfi Femiliana ("Bu Femi")

**Owner of Drive:** `adm.pembelajaran0521@gmail.com` — admin role, distributes templates.

---

# 6.3 Master Student Roster (decoded from "Data siswa TA 2526-1.xlsx")

🔴 **Major artifact** — single workbook with **26 sheets** holding 130-140 students across all programs.

## 6.3.1 Sheet Inventory

Two-sheets-per-kelas pattern: `<code>` (DAFTAR HADIR) + `Data <code>` (DATA LENGKAP).

| Program / Kelas | Sheet codes | Headcount |
|---|---|---|
| Daycare | DC M (25/26), DC (24/25), Data DC | ~11 |
| Toddler | TD2, Data TD2, TD1 (template only) | ~4 |
| KB | KB1, KB3, KB4 + Data KB1/3/4 | ~27 (KB2 absent!) |
| TK A | A1–A4, Data A1–A4 | ~41 |
| TK B | B1–B4, Data B1–B4 | ~52 |

**Programs offered (decoded):** Daycare → Toddler 1 → Toddler 2 → KB → TK A → TK B. **6 jenjang berbeda** dari ~6 bulan – 6 tahun.

## 6.3.2 Field Dictionary (Data Lengkap)

**Identity:** No, NIS, NISN, Nama Lengkap, Nama Panggilan, L/P, Tempat Lahir, Tanggal Lahir.

**IDs:** NIK Anak, NIK Ayah, NIK Ibu, No KK (semua 16 digit).

**Family:** Anak ke-, Dari (jumlah saudara), **Tinggal** (lives-with — only TK A3+ & TK B; values seen: "Orang Tua").

**Contact:** Alamat (free-text), Desa, Kecamatan, Telp Ayah, Telp Ibu.

**Per Parent (Ayah, Ibu):** Nama, Pendidikan, Pekerjaan, Nama Kantor, Alamat Kantor, Kota/Kab, Penghasilan.

❌ **No payer / penanggung jawab biaya field** today.

## 6.3.3 Income Brackets (6 buckets + free-text drift)

- `< Rp. 1.000.000`
- `Rp. 1.000.000 s/d Rp. 2.000.000`
- `Rp. 2.000.000 s/d Rp. 3.000.000`
- `Rp. 3.000.000 s/d Rp. 5.000.000`
- `Rp. 5.000.000 s/d Rp. 10.000.000`
- `> Rp. 10.000.000`

Free-text outliers contaminate data: `RP. 4.793.000 - RP. 7.000.000`, `Rp. <1.850.000` (entry by guru An Nisaa sendiri — possibly staff discount signal).

## 6.3.4 NIS vs NISN (clarified)

| Field | Source | Stability | Format |
|---|---|---|---|
| **NIS** | School-generated **manual** | ❌ NOT stable — reissues per cohort | TA-prefix + sequence (`2425…`, `2526…`, `2223…`) |
| **NISN** | National (Kemendikbudristek) | ✅ Stable lifetime | 10-digit national, only assigned at TK B+ |

🔴 Manual NIS = source of duplicate-NIS bugs, unstable lookups, year-bound IDs.

🔴 **System fix**: auto-generate stable internal `student_id` (UUID). NIS becomes user-visible attribute (regenerable per TA jika perlu, atau replace with system code). NISN stored when assigned.

- Current `-` / blank = pending NIS state.
- No campus marker encoded.

## 6.3.5 Daftar Hadir Format
`No, NIS, Nama, L/P, [1..31], S, I, A, Jml, %`. One sheet per kelas, **bulan-template** intent (sub-header `Bulan : ___`). Cells empty in dump = template only.

## 6.3.6 Anomalies & Data Quality Issues 🔴

- **Duplicate NIS** — same NIS assigned to 2 students (Ryuga + Delio).
- **Excel scientific notation truncation** on 16-digit NIK / KK → `3.20703E+14` lost data.
- **Inconsistent date formats** mixed.
- **Phone leading-zero stripped** by Excel.
- **Trailing-space contamination** on names.
- **Empty rows pre-allocated** for future students.
- **Free-text overrides** on categorical Penghasilan field.
- **NIS reissue per cohort** = no stable lifetime ID for student.

## 6.3.7 Cross-Sheet Duplication = aging up

Same student appears in multiple TA sheets:
- Anindita Kirana — DC M (25/26) + Data B4 (25/26) → **multi-program co-enrollment**: kid in daycare **AND** TK B.
- Citrik, Dirandra, Hariz — Data DC 24/25 → Data KB1 25/26 (aged from daycare to playgroup, **different NIS each year**).

🔴 Implication: schema MUST support concurrent-active enrollments + stable internal student_id (UUID) separate from year-bound NIS/NISN.

## 6.3.8 Address Geographic Cluster

- **Telaga Asih** desa = Taman Aster campus zone
- **Telaga Murni** desa = Metland Cibitung campus zone
- **Wanajaya** desa = mixed
- Kecamatan: **Cikarang Barat** (dominant), **Cibitung**

✅ Resolves "Aster" question — = **Taman Aster perumahan**, sister campus to Metland Cibitung.

## 6.3.9 Schema Implications

🔴 **Stable internal student_id (UUID)** — NIS/NISN as year-bound attributes, not primary key.

🔴 **Enrollment table** `(student_id, academic_year_id, kelas_id, program_type, status)` — 4-5 year lifecycle Daycare → Toddler → KB → TK A → TK B.

🔴 **Multi-program concurrent enrollment** (kid in Daycare + TK at same time).

🔴 **NIK / KK / NISN as VARCHAR(16)** — never numeric. (Excel bug already happened.)

🔴 **Address normalization**: free-text + cluster_name + block_no + desa_id + kecamatan_id + kota_id.

🔴 **Guardian model**: 0–2 parents per student (Ayah/Ibu) + custodial flag (`tinggal` field). Add explicit `payer_guardian_id` (missing today).

🔴 **Penghasilan = enum 6 buckets** + parser for free-text legacy → nearest bucket. Used for subsidy/scholarship/staff-discount logic.

🔴 **Constrain categorical fields**: Pendidikan (SMA/D3/S1/S2), Pekerjaan (controlled list), currently free-text drift.

🔴 **Attendance**: `attendance_record(student_id, date, status[hadir|sakit|izin|alpha])`. Monthly summary derivable.

🔴 **NIS lifecycle**: support pending state (`-` / blank).

🔴 **Tahun Ajaran versioning**: 2024/2025 + 2025/2026 coexist; data scoped per TA.

## 6.3.10 Open Questions

- `Tinggal` — selalu "Orang Tua" atau ada wali / kakek-nenek kasus?
- KB2 + TD1 — kelas mati, atau template kosong?
- Payer / penanggung jawab biaya — tracked di mana sekarang?
- Phone canonical format input?
- Multi-program co-enrollment (Anindita di DC + B4) — kid attend keduanya, atau stale data?
- NISN populated only TK B level — gov assign at age 5+?
- Staff discount auto (Elvriani income `<1.850.000`)?

---

# 7. Hypotheses / Schema Implications

## 7.1 Org & RBAC
- 🔴 **Single user, multi-role assignment**. RBAC: `user.roles[]` (admin, walas, guru_sentra, kadiv, kepsek_ra, kepsek_tkit). Single fingerprint, role-switcher UI. **No duplicate accounts** (breaks audit + attendance).
- 🔴 **Two legal entities** under one school: RA (TK A) + TKIT (TK B). Schema: `institution_type` enum on student/staff. Different sign-off chain per entity.
- 🔴 **Multi-campus** = first-class. Schema: `campus` entity (Metland, Aster). Class capacity per campus, not global. AKSERA proves separate roster per campus.
- **Substitute teacher = first-class**. `class_session(date, class_id, primary_teacher_id, substitute_teacher_id?)`. Buku penghubung + penilaian writes attribute to substitute. Walas amend post-return.

## 7.2 Curriculum Schema (3-tier)
- `kurikulum_indikator(elemen, sub_elemen, iktp_text, age_group)` — **seedable from Kurikulum Merdeka standard**, ~20-30 distinct phrases reused across files.
- `tema(name, age_group, semester)` → `sub_tema(tema_id, name, week_index)` → optional `sub_sub_tema`.
- `program_semester(year, semester, kelompok_id, themes[]:[tema_id, sub_tema_id, week_indikator_ids[]])`.
- `modul_pekanan(year, semester, week, kelompok_id, sub_tema_id, hafalan, pilar_id, daily_activities[])`.
- `modul_harian(date_pair, kelas_id, sentra_id, walas_id, framework=ADLX_INTROFLEX, plan_text, diferensiasi, asesmen_plan)`.
- `penilaian_entry(student_id, indikator_id, date, sentra_id, scale_value=SM|BM|absent, walas_id)` — sparse fact table.

## 7.3 Hafalan & Pilar
- **Hafalan = cumulative track**, not weekly-rotating. Schema: `hafalan_progress(student_id, track[Tahfidz|Hadits|Doa|AsmaulHusna], item_code, status, added_at_week)`.
- TK A & B follow different surah tracks.
- **Pilar Karakter** = numbered finite list, master outside files. Schema: `pilar_karakter_catalog(number, name)` + `modul_pekanan.pilar_id`.

## 7.4 Sentra
- 8 fixed sentra + I LOVE ISLAM. Schema: `sentra` enum + `daily_activity(sentra_id, date, kelompok_id, plan_text, lka_attachments)`.
- Each kelas rotates through 8 sentra/week. Need rotation schedule model.
- Guru sentra rotates — same teacher signs multiple sentra. Schema: `sentra_assignment(week, sentra_id, teacher_id)`.

## 7.5 Penilaian
- 🔴 **Penilaian Pekanan = printout, not data layer**. Auto-generate from Penilaian Harian rollup.
- **Penilaian Harian** = source of truth. Scale: **SM/BM** (BM=75-89, SM=90-100 numeric band).
- ADLX/INTROFLEX, 8 Dimensi Profil Lulusan (8 fixed), SKL IT (6 fixed), Diferensiasi 4×3 matrix, Asesmen 7 teknik — all **fixed enums**, seedable.

## 7.6 Raport
- `RaportPeriod` enum: `TW1_SEM1, TW2_SEM1, TW1_SEM2, TW2_SEM2`. ~4 raport/year.
- `Raport(student_id, period, walas_id, status[draft|finalized|distributed], narrative_sections[], height, weight, attendance{sakit, izin, alpa, present, total}, hafalan_summary, parent_event_attendance)`.
- **Rubric-driven authoring**: per-period `RubricBank` with **3 levels**: `MAMPU_KONSISTEN | MAMPU_BELUM_KONSISTEN | PERLU_PENGUATAN`. Walas tags student → narrative templated → customized.
- AKSERA / Lomba uses **different scale**: `BB | MB | BSH | BSB` (Permendikbud 4-level) — separate scoring system.
- Output: PDF/DOCX export with photo, signers (walas NPK + Kepala NUPTK), parent-comment block.

## 7.7 Events & Budget
- `Event(type[puncak_tema|jambore|mabit|fest|aksera|phbi|parenting], pic_id, date(s), location, latar_belakang, kelompok_id?)`.
- `EventBudget` — dual sheet **Rencana + Realisasi** (variance reporting built-in). Line items: uraian/satuan/harga_satuan/jumlah.
- 🔴 **Add `funding_source` enum**: yayasan / SPP / orangtua / sponsor (currently absent in RAB).
- `EventGroup(event_id, kelompok_id, pendamping_id, students[])`, `event_attendance(event_id, student_id, berangkat:bool, pulang:bool)`.
- `EventAttachment` — surat izin, dokumentasi photos.
- `EventDailyAssessment` — for multi-day events (Fest, AKSERA): per-group/per-day rubric.

## 7.8 Lomba (AKSERA)
- Different scoring system from regular penilaian: **BB/MB/BSH/BSB**.
- `lomba(event_id, name, kategori, campus, pj_id)`.
- `lomba_regu(lomba_id, students[])`.
- `lomba_score(student_id, criterion, date, scale_value)`.
- `lomba_kesimpulan(student_id, narrative_text)`.

## 7.9 Referral / Ambassador 🆕
- `referral_program(start_date, reward_pct=6, base=uang_pangkal)`.
- `referral(referrer_id, prospective_parent_data, status[invited|visited|registered|paid], reward_amount, payout_status, payout_date)`.

## 7.10 Migration Strategy
- 🔴 **Drive-as-source-of-truth today** — guru punya 1 semester+ data.
- **Don't force "start fresh"**: parse existing PROMES (xlsx) → seed `kurikulum_indikator` + `tema/sub_tema`. Parse Penilaian Harian (docx tables) → seed `penilaian_entry`. Parse Raport (docx) → seed `raport` history.
- Boilerplate sections (ADLX/INTROFLEX rows, SKL IT, 8 Dimensi) parse-once → reusable templates.

## 7.11 UX / Workflow Constraints
- **Phone-locked workflow**. Tablet/PC in classroom, atau batch sync post-13.00. Mobile app on phone limited.
- **"Curi waktu" pattern** — form harus save-resume, no nags, fast offline-first entry.
- **WhatsApp grup kelas** = primary parent comm. Foto/video share at end-of-schedule. Need export-to-WA flow.
- **Buku tamu paper book** — UI mirror columns exactly so admin transition smooth.

## 7.12 Missing in Drive Today (gaps to product-build)
- ❌ Hafalan tracker per murid (currently free-text in raport narrative)
- ❌ Funding source on RABs
- ❌ Referral / ambassador tracker (program just launched)
- ❌ MABIT real budget (template stub only)
- ❌ Skala numeric on Penilaian Pekanan (template only, data lives in Harian)
- ❌ Pilar Karakter master list (poster outside Drive)
- ❌ AISM expansion / definition
- ❌ Sentra rotation schedule (which kelas hits which sentra which day)
- ❌ Master indikator catalog (numbered codes, no canonical doc)
- ❌ Yayasan reporting / financial dashboard
- ❌ Payroll / staff attendance aggregation

---

# 7.13 Story-Value Schema Additions

- `student_milestone(student_id, type[first_day|hafalan_complete|sentra_finished|lomba_podium|graduation], date, narrative, photo_ids[])`
- `media_asset(uploader, captured_at, tags[student_ids[], event_id, sentra_id], caption, type[photo|video|voice])` — central media bin, tagged.
- `anekdot(student_id, observer_id, date, situation, behavior, interpretation)` — formal Catatan Anekdot from asesmen 7 teknik.
- `foto_berseri(student_id, sequence_id, photos[], context_text)` — photo-series narrative (already curriculum primitive).
- **Auto-story compiler** — input: student_id + period → output: narrative timeline (raport-style + journey doc).
- **Per-teacher year compilation** — kelas yearbook auto-generated, signed by walas + Kepala.
- **Per-parent share view** — public-toggleable per-student timeline, exportable to PDF / IG-story.

---

# 8. Pre-Brainstorm Completeness Audit

## 8.1 What we have ✅
- 3 founding values (simplicity, flexibility, story)
- Student lifecycle 11 steps decoded
- Teacher daily flow w/ official roster
- Curriculum 3-tier hierarchy + frameworks (ADLX/INTROFLEX)
- 8 sentra catalog + 4 mega-themes
- 3 scoring scales (SM/BM, BB/MB/BSH/BSB, 3-level rubric)
- Hafalan multi-track (Tahfidz/Hadits/Doa/Asmaul Husna)
- Raport structure (TW + Sem)
- Org tree (Kadiv → Kepala RA/TKIT → 8 walas)
- 2 campuses + addresses
- Yayasan + history (1999, 26 yrs, 1500+ alumni)
- Programs: Daycare/Toddler/KB/TK A/TK B (6 jenjang)
- Master roster fields (130-140 students)
- Income brackets (6 + free-text drift)
- Multi-program co-enrollment pattern
- Event types catalog (8 distinct)
- Be Our Ambassador referral program
- RAB structure (Sentra + Event variants)
- Be Our Ambassador 6% reward

## 8.2 What still missing 📎

### Forms / Templates
- 🔴 **Formulir pendaftaran** photo (admission form fields)
- 🔴 **Komponen biaya awal** breakdown (uang pangkal, SPP bulan 1, seragam, tas, buku, dll.)
- **Buku penghubung** sample (per anak, daily comm)
- **Form penilaian day care** (beda dari TK)
- **Pilar Karakter master list** (numbered finite list, lokasi outside Drive)
- **Sentra rotation schedule** (which kelas → which sentra → which day)
- **Roster guru piket** + multi-campus rotation rules

### Drive folders not yet shared
- **Semester 1** TA 2025/2026 (only Sem 2 di Drive sekarang)
- **Tahun ajaran sebelumnya** (24/25, 23/24)
- **KB Pembelajaran folder** (PROMES KB tidak ada di Sem 2 ini)
- **Toddler / Daycare planning** folder (TPA materi)

### Finance / Operations
- 🔴 **SPP tagihan flow** (cycle, channel, tunggakan)
- 🔴 **Gaji guru komponen** + payroll cycle
- **Yayasan reporting** (frekuensi, format)
- **Cash book / kas operasional** sample
- **Audit eksternal** (jika ada)
- **Subsidy / scholarship** rules (staff discount, sibling discount)

### Tech / Existing System
- 🔴 **Current ERP screenshots** — what's already built? What's broken/painful?
- **Xendit integration** existing — invoice templates, webhook flow
- **Fingerprint export sample** — vendor, format CSV/Excel, sync frequency
- **WA grup kelas** sample broadcast (foto/video share format)
- **Google Drive permission structure** — siapa akses apa

### Admin / Office
- **Admin daily flow** (admission, billing, parent comm) — currently we only have teacher daily
- **Kepala Sekolah daily flow** — observation, escalation, sign-off cadence
- **Kadiv Pendidikan responsibilities** (Era Zamona)
- **Admission funnel data** — historical conversion rate, drop reasons

### Story-related
- 📎 **Foto/video sample** dari WA broadcast (story atoms)
- **Yearbook precedent** (jika ada) — apakah sudah pernah generate kenangan kelas?
- **Alumni tracking** (1500+ alumni — di-track gimana?)

### External / Stakeholder
- **Parent persona interview** — voice of parent (current: only teacher voice captured)
- **Student observation** — bagaimana anak interact dengan school comm
- **Yayasan board** preferences / requirements
- **Dinas / Kemenag reporting** templates (RA must report to Kemenag, TKIT to Kemendikbudristek)

## 8.3 Decisions still needed before brainstorm 🔴

| Decision | Why critical |
|---|---|
| Build vs buy vs fork (ERPNext, Frappe, Strapi) | Foundation choice = different roadmap |
| Single-tenant vs multi-tenant from day 1 | Yayasan might want to license to other schools |
| Mobile app vs PWA vs tablet-only | Phone-locked policy + WA culture |
| Migration: import Drive xlsx vs start fresh per-module | 1 semester data exists |
| Identity: replace NIS atau augment? | Stable ID critical |
| Scoring scale plugin or hardcode | 3 scales coexist |
| Hijri calendar source | Ramadhan skip + PHBI events |
| Multi-entity (RA/TKIT) — single deployment atau separate? | Different sign-off chains |
| Story compilation: AI-generated atau template-driven? | Privacy + cost implications |
| Funding source taxonomy on RABs | Currently absent |

---

# 9. Open Questions — Consolidated

## Student Lifecycle
- Buku tamu — siapa isi (admin / parent)?
- Berapa kunjungan/minggu?
- Follow-up — berapa kali sebelum drop?
- Pop-up class — beda dengan reguler?
- Komponen biaya awal lengkap (📎 artifact pending)
- Cicilan / DP / refund?
- Seragam vendor + lead time?
- Cut-off tanggal lahir + waiting list?
- Assessment format/durasi/storage/program (📎 artifact pending)
- MPLS — siapa pimpin?
- Split paralel — siapa decide?
- Parent meeting — per kelas/jenjang/sekolah-wide? Wajib hadir? Agenda?
- Naik kelas, pindah mid-year, kelulusan flow?

## Teacher Daily
- Day care format penilaian beda di mana vs TK?
- Rasio guru:anak day care?
- Buku penghubung — fisik per anak? Konten?
- Foto/video WA — privacy / persetujuan ortu?
- Form penilaian harian — ✅ decoded SM/BM
- Skala penilaian — ✅ decoded BM=75-89, SM=90-100, AKSERA = BB/MB/BSH/BSB
- Promes — ✅ decoded, signed by Kadiv + 4 walas
- Lunch break — guru piket?
- Sholat berjamaah — guru pimpin?
- Laporan harian — kepada siapa?
- Lembur / izin / sakit?
- 🔴 Multi-campus rotation — fingerprint?
- 🔴 Substitute teacher — buku penghubung scope?
- 🔴 Admin-teacher dual role?

## Curriculum & Assessment (new from Drive review)
- **AISM** singkatan apa?
- **ADLX** = Active Deep Learner eXperience? Confirm.
- Sentra rotation schedule — siapa decide kelas mana ke sentra apa per hari?
- Hafalan progress per murid — paper book / Excel / belum?
- LKA — disimpan per murid? Reusable?
- Modul shared antar paralel atau per walas bikin sendiri? (Drive: per-kelompok, not per-paralel)
- Special-week subfolders (Ramadhan, AKSERA, PUNCAK TEMA) — variant template?
- Indikator master catalog — eksis di luar Drive?
- Pilar Karakter master list — total pilar berapa?
- "RA An nisaa'" vs "TKIT" vs "Madrasah" — naming inconsistency, mana resmi?
- Year mismatch in some files (one Maret file labelled "Semester I") — clerical drift?
- Kegiatan Sentra.docx partially blank — live planning master atau unfinished template?

## Finance (new)
- Funding source on RABs — yayasan/SPP/ortu/sponsor? Currently no column.
- MABIT real budget structure — vs RAB Sentra template reuse?
- **Be Our Ambassador** — sudah running atau planning?
- Referral tracking pakai apa?
- SPP — cycle, channel, tagih kapan?
- Tunggakan flow + konsekuensi?
- Gaji guru — komponen, bayar kapan, bank/cash?
- Pegang kas — admin / kepsek / yayasan?
- Yayasan reporting — frekuensi, format?

## Multi-campus & Org
- Aster = lokasi mana? Asrama / kota mana?
- AKSERA — inter-RA atau internal house event?
- TK A (RA) vs TK B (TKIT) — separate legal entities atau dual labels?
- Semester 1 docs ada di mana? (Drive ini Sem 2 only)
- KB (Kelompok Bermain / playgroup) — An Nisaa run KB? PROMES KB tidak ada di Drive ini.
- SD / SMP — An Nisaa punya jenjang lebih tinggi?

## Events
- An Nisaa Fest logistics (budget, RSVP, schedule) — di folder mana?
- Pilar Karakter master list?
- Triwulan Sem 1 raport — di folder mana?
