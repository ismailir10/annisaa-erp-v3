# Website Extracted — annisaasekolahku.com

**Source:** [https://annisaasekolahku.com](https://annisaasekolahku.com)
**Extracted:** 2026-05-04 via WebFetch
**Pages reviewed:** Home, Tentang, Program, Galeri

## Brand identity

- **Name variants:** An Nisaa' Sekolahku · TKIT Islam Bekasi · TKIT Annisaa
- **Tagline:** *"26 Tahun Merawat Masa Kecil Anak-Anak dengan Cinta & Dedikasi"*
- **Mission:** *"Membentuk generasi Rabbani yang cerdas, berprestasi, dan berakhlak mulia"*
- **Email:** ceceannisaa@gmail.com
- **Operating hours:** Senin–Jumat **07:30 – 17:00**

## Yayasan & history

- **Yayasan:** Khoirunisaa' Bekasi
- **Founder:** Dra. Era Zamona Chattar
- **Established:** 21 May 1999 (26 years operating as of 2026)
- **Alumni:** 1500+
- **Staff:** 40+ certified teachers
- **Accreditation:** Baik

## Campuses (resolved)

### Taman Aster (Cikarang Barat)
- Perumahan Taman Aster Blok A1/16 & A1/46, RT 009 RW 07, Telaga Asih
- Tel: +62 21 2213 7709
- WA: 0877-4264-6815

### Metland Cibitung (Cikarang Barat)
- Perumahan Metland Cibitung Blok P2/2-3, Telaga Murni
- Tel: +62 21 8953 3593
- WA: 0877-4264-6815

## Programs offered

- **KB** (Kelompok Bermain — Playgroup)
- **TKIT** (Taman Kanak Islam Terpadu — TK A 4-5y + TK B 5-6y)
- **D'Care** (Daycare)

Plus implied tiers from master roster: Daycare → Toddler 1 → Toddler 2 → KB → TK A → TK B (6 jenjang).

## Curriculum approach

> *"Kurikulum Islam Terpadu — Menggabungkan pembelajaran akademik dengan nilai-nilai Islami"*

Three pillars:
- **Integrated Islamic Curriculum**
- **Professional Staff** (certified, innovative methods)
- **Safe Environment**

Drive corpus reveals: Kurikulum Merdeka (Kemenag RA + Kemendikbudristek TKIT) framework adapted, w/ **ADLX TERPADU × INTROFLEX** pedagogy.

## Affiliations

- Kemendikbudristek
- JSIT Indonesia (Jaringan Sekolah Islam Terpadu)
- HIMPAUDI (Himpunan PAUD Indonesia)
- IGRA (Ikatan Guru Raudhatul Athfal)
- Astra School Partnership Program
- Indonesia Heritage Foundation

## Activity types (from Galeri)

- Field Trip ke Pemadam Kebakaran, Kidzania
- Fun Cooking
- Lomba Menari di Ancol (external lomba)
- Jambore & Outdoor activities
- Peringatan Hari Besar Islam (PHBI)
- Manasik Haji
- Pertemuan Bulanan KB (monthly parent meeting per kelompok)
- Hari Profesi (dress-up profession day)
- Daycare daily activities

## Implication for product

- **Two campuses confirmed structurally** — schema needs Campus entity (locked Section 2)
- **Yayasan = single legal umbrella** — multi-tenant single-instance pattern OK, RA + TKIT collapsed under one Tenant
- **D'Care = full-day program** — separate ProgramCode in catalog
- **Manasik Haji = Event type** to register in catalog post-launch
- **Hari Profesi, Lomba external, Field Trip** = adhoc Event types
- **40+ teachers, 1500+ alumni** — system designed for current scale, alumni tracking deferred to v1.1

## Public form integration

For MVP admission funnel: parent reaches public form via:
1. **QR code at reception** (Bitly-generated, points to `/daftar`)
2. **Direct URL on website** — add CTA on annisaasekolahku.com home: "Daftar Sekarang" → links to `https://erp.annisaasekolahku.com/daftar`
3. **WA broadcast** (admin sends via wa.me link from system)

URL params: `/daftar?campus=metland&program=tk-b` for pre-fill.

## Refresh cadence

Re-fetch via WebFetch if:
- Content changes (rebrand, new programs, new contact)
- New campus opens
- Yayasan structure changes
