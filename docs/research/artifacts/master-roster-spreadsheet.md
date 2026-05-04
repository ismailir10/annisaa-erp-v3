# Master Roster Spreadsheet — Decoded

**Source:** Google Drive personal file (user `ismailir10@gmail.com`)
**File:** [Data siswa TA 2526-1.xlsx](https://docs.google.com/spreadsheets/d/17bM95UU__pQbVuf3wUGpscm7wsHXMrvY/edit)
**File ID:** `17bM95UU__pQbVuf3wUGpscm7wsHXMrvY`
**Audited:** 2026-05-04
**Coverage:** 26 sheets, ~130-140 students across all programs (TA 2024/2025 + 2025/2026)

## Sheet inventory

Two-sheets-per-kelas pattern: `<code>` (DAFTAR HADIR) + `Data <code>` (DATA LENGKAP).

| Program / Kelas | Sheet codes | Approximate headcount |
|---|---|---|
| Daycare | `DC M`, `DC`, `Data DC` | ~11 |
| Toddler | `TD2`, `Data TD2`, `TD1` (template only, empty) | ~4 |
| KB (Playgroup) | `KB1`, `KB3`, `KB4` + `Data KB1/3/4` (KB2 absent) | ~27 |
| TK A | `A1` – `A4`, `Data A1` – `Data A4` | ~41 |
| TK B | `B1` – `B4`, `Data B1` – `Data B4` | ~52 |

**Programs decoded:** Daycare → Toddler 1 → Toddler 2 → KB (Playgroup) → TK A → TK B = 6 jenjang spanning ~6 months to 6 years.

## Field dictionary

Two header layouts observed:

### Layout A (DC, TD2, KB1, KB3, KB4, A2, A1)

| Section | Fields |
|---|---|
| Identity | No, NIS, NISN, Nama Peserta Didik (Lengkap + Panggilan), L/P |
| Birth | Tempat Kelahiran, Tanggal Kelahiran |
| IDs | No NIK Anak, No NIK Ayah, No NIK Ibu, No KK |
| Family | Nama (head?), Anak ke-, Dari (jumlah saudara) |
| Contact | Alamat, Desa/Kelurahan, Kecamatan, Telp Ayah, Telp Ibu |
| Per parent (Ayah, Ibu) | Nama, Pendidikan, Pekerjaan, Nama Kantor, Alamat Kantor, Kota/Kab, Penghasilan |

### Layout B (A3, A4, B1-B4)

Adds **`Tinggal`** column (lives-with) between Jumlah Saudara and Alamat. Values seen: `Orang Tua`.

## Daftar Hadir (attendance) format

Single canonical layout across all attendance sheets:
```
No, NIS, Nama, L/P, [1..31] (per-day), S, I, A, Jml, %
```

- One sheet per kelas, monthly template intent (sub-header `Bulan : ___`)
- Cells empty in dump = template only (data live elsewhere or erased per month)

## Income brackets observed

Verbatim, w/ free-text drift:
- `< Rp. 1.000.000`
- `Rp. 1.000.000 s/d Rp. 2.000.000`
- `Rp. 2.000.000 s/d Rp. 3.000.000`
- `Rp. 3.000.000 s/d Rp. 5.000.000`
- `Rp. 5.000.000 s/d Rp. 10.000.000`
- `> Rp. 10.000.000` (variants: `>10.000.000`, `>Rp. 10.000.000`, `\> Rp. 10.000.000`)

**Free-text outliers (data quality problems):**
- `RP. 4.793.000 - RP. 7.000.000`
- `4.793.000-7.0000` (truncation)
- `RP. 7.001.000 - RP. 10.000.000`
- `Rp. <1.850.000` (Elvriani Haziza, **guru An Nisaa** — staff discount signal)

→ Migration parser must regex-map free-text to nearest bucket + preserve raw.

## NIS pattern decoded

3 coexisting formats — **NIS reissues per cohort, NOT lifetime stable**:

| Pattern | Year |
|---|---|
| `2425…` | TA 2024/2025 |
| `2526…` | TA 2025/2026 |
| `2223…` | TA 2022/2023 |

- No campus marker encoded
- `-` or blank = pending assignment

**NISN (national, lifetime stable)** populated only at TK B level. Government assigns at age 5+.

## Anomalies & data quality issues 🔴

- **Duplicate NIS**: same NIS assigned to 2 students (Ryuga + Delio in DC M sheet)
- **Excel scientific notation truncation**: 16-digit NIK / KK rendered as `3.20703E+14` — **lost data**
- **Inconsistent date formats** mixed (Indonesian / short English / uppercase month)
- **Phone leading-zero stripped** by Excel
- **Trailing-space contamination** on names
- **Empty rows pre-allocated** for future students
- **Free-text overrides** on categorical Penghasilan field

## Cross-sheet duplication = aging up

Same student appears in multiple TA sheets — **NIS changes each year**:

- Anindita Kirana — DC M (25/26) + Data B4 (25/26) → **multi-program co-enrollment** (Daycare + TK B same TA)
- Citrik, Dirandra, Hariz — Data DC 24/25 → Data KB1 25/26 (aged from daycare to playgroup, **different NIS each year**)

🔴 Schema implication: stable internal `Student.id` (UUID) required, separate from year-bound NIS/NISN.

## Address geographic clusters

| Desa | Campus zone |
|---|---|
| Telaga Asih | Aster |
| Telaga Murni | Metland |
| Wanajaya | mixed |

Kecamatan: Cikarang Barat (dominant), Cibitung.

✅ Resolves "Aster" question — = Taman Aster perumahan (sister campus).

## Schema implications

Captured in [insights §6.3.9](../2026-05-04-nisaa-teacher-insights.md). Key:

- 🔴 Stable internal `student_id` UUID (not NIS)
- 🔴 Enrollment table for year-by-year history
- 🔴 Multi-program concurrent enrollment
- 🔴 NIK / KK / NISN as `VARCHAR(16)` (not numeric)
- 🔴 Address normalization w/ idn-area-data FK chain
- 🔴 Guardian model w/ explicit `payerGuardianId` (missing today)
- 🔴 Penghasilan = enum 6 buckets + free-text parser
- 🔴 Constrain Pendidikan / Pekerjaan / relationship as catalog (currently free-text drift)

## Migration plan

Per [insights §0.5 locked decision](../2026-05-04-nisaa-teacher-insights.md): **start fresh TA 2026/2027**, no port from this xlsx.

But ~130 students still need to be in system before TA 2026/2027 starts (June). Build XLSX import wizard week 1 of sprint:

1. Admin uploads XLSX
2. Column mapping UI (source → target)
3. Row-by-row Zod validation w/ error preview
4. Bulk transaction commit
5. Audit batch row + `student.created` TimelineEvent per student
6. Phone normalization + NIK 16-digit check + Income parser

See [insights §6.3.10](../2026-05-04-nisaa-teacher-insights.md) for full open questions list.
