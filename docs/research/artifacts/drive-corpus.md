# Google Drive Corpus — Decoded

**Source:** Google Drive folder owned by `adm.pembelajaran0521@gmail.com`
**Folder:** [https://drive.google.com/drive/folders/1-fAUpreoeJzQAtkNDYepfeCcUTKqqZAX](https://drive.google.com/drive/folders/1-fAUpreoeJzQAtkNDYepfeCcUTKqqZAX)
**Audited:** 2026-05-04 via 4 parallel research agents
**Coverage:** Semester 2 only (Sem 1, prior years, KB folder, payroll not shared yet)

## Top-level structure

Root contains exactly **one** subfolder: **Semester 2** (`10D8lWAwbhJSpJpJ80r7AGf2Wo2d8o_0t`).

## Semester 2 children

```
Semester 2/
├── An nisaa Fest 2026/                    # event prep (May 18-20 lomba series)
├── YULIA/                                  # PIC working folder for Kids Jambore + Fest
├── RAPORT/                                 # narrative raport per student
│   └── TRIWULAN SEMESTER 2/
│       ├── TK A/
│       │   ├── RAPORT TRIWULAN 1 (A2)/    # per-student .docx
│       │   ├── FEMI/                       # walas Lutfi Femiliana folder
│       │   └── kisi-kisi master docs       # 3-level rubric narrative templates
│       └── TK B/
│           ├── B1 Cerdas & Semangat/       # 14 numbered student .docx files
│           ├── B2 BERANI MANDIRI/
│           ├── B4 Mandiri dan Hebat raport triwulan 1 semester 2/
│           └── kisi-kisi master docs
├── LKA/                                    # Lembar Kerja Anak — per-day worksheets
├── Penilaian Pekanan/                      # weekly assessment xlsx (printable templates)
│   └── ~27 files spanning Jan-Apr 2026
├── Penilaian Harian/                       # daily assessment per Sentra
│   ├── Sentra Main Peran/
│   ├── AREA/                               # nested: Ramadhan, PUNCAK TEMA, AKSERA, AREA I LOVE ISLAM
│   ├── Sentra Persiapan/
│   ├── Sentra Ibadah/
│   ├── Sentra Bahan Alam/
│   ├── Sentra Seni/
│   ├── Sentra Memasak/
│   └── Sentra Balok/
├── Modul Ajar Pekanan/                     # weekly modul (Word docs)
└── Modul Ajar Harian/                      # daily 2-day modul per Sentra (Word docs)
    ├── AREA/, Sentra Bahan Alam/, Sentra Seni/, Sentra Balok/,
    ├── Sentra Main Peran/, Sentra Ibadah/, Sentra Memasak/, Sentra Persiapan/
└── PROMES TK A SMT 2 TA. 25/26.xlsx        # semester plan
└── PROMES TK B SMT 2 25-26.xlsx
└── Kegiatan Sentra.docx                    # master sentra activity bank
└── RAB MABIT.xlsx                          # event budget (template stub, byte-identical to RAB Sentra)
└── A. Penilaian Lomba AKSERA Metland.xlsx  # competition scoring
└── RAB, SENTRA.xlsx                        # per-tema sentra media budget
```

## Key file IDs (for re-fetch)

### Top-level files
- `1xTG7LLVQxAeaXiC3XYXOKMWTwZFPmkRV` — PROMES TK A SMT 2
- `1ykQPLHovOM7q1NWHLTF101bYgW0ajAcv` — PROMES TK B SMT 2
- `1cjplb69irYeNU8ZRYasCyFjtLimfuaEW` — Kegiatan Sentra.docx
- `1jE1v4Izq-O9Jor4udTZXYYSJHru8cjp8` — RAB MABIT.xlsx
- `1vPi2H-zsaS9bBTI-32fXe1kv3GMP_1V_` — AKSERA Metland scoring
- `1P3UR1HoyW0sZUsCfkGWrpCSAv1AspKOi` — RAB Sentra

### Folder IDs
- `1WqtQ9XpClipjicTkURtgyVfqJCFs6C_-` — Penilaian Pekanan
- `1BLFPjFBAM6Tt0iQ-ZFBDE6mzN0x2bYDP` — Penilaian Harian
- `1z9yTHUFjOMvD0I-cL47Un311IBwbLAde` — Modul Ajar Pekanan
- `10CIO3_4VoG6zre-ZnleVZT14RdYb9lPs` — Modul Ajar Harian
- `1Kl3k5ORbtnkYLWndP7zHPgVY61GtuIB4` — RAPORT
- `1bjOd8bM7VQQQlSF_k6_7PMQ09rGNgp02` — LKA
- `1Y1wRAUqllzYAEUYhBSfBnkd9mbXcJYMV` — YULIA
- `1yNtwba-hpA3genQuM0RJpHZPdcsEdCrl` — An nisaa Fest 2026

## Decoded structure findings

Full analysis in [insights doc §4 Curriculum & Assessment System](../2026-05-04-nisaa-teacher-insights.md). Key points:

### 3-tier academic hierarchy

| Tier | Doc | Format | Scope | Signed by |
|---|---|---|---|---|
| 1 | PROMES (Program Semester) | xlsx | per kelompok per semester | Kadiv Pendidikan + 4 walas |
| 2 | Modul Ajar Pekanan | docx | per kelompok per pekan | Kepala RA/TKIT + Walas |
| 2b | Modul Ajar Harian | docx | per sentra per 2-day pair | Guru sentra |
| 3 | Penilaian Pekanan | xlsx | per kelompok per pekan, daily cols | (TEMPLATE only — empty cells) |
| 3b | Penilaian Harian | docx | per sentra per 2-day per kelas | Guru sentra |
| 4 | Raport Triwulan | docx | per murid per ~3 bulan | Walas + Kepala RA |

🔴 **Critical:** Penilaian Pekanan = printable rollup template. Real data lives in Penilaian Harian per Sentra (SM/BM checklist). Pekanan can be auto-generated from Harian.

### Frameworks discovered

- **Kurikulum Merdeka** (Kemenag RA + Kemendikbudristek TKIT)
- **ADLX TERPADU × INTROFLEX** — pedagogy methodology
- **3 elements**: NAB / Jati Diri / STEAM
- **8 Sentra**: Main Peran, AREA, Persiapan, Ibadah, Bahan Alam, Seni, Memasak, Balok + I LOVE ISLAM (non-sentra slot)
- **Hafalan 4 tracks** (cumulative): Tahfidz Q.S., Hadits, Doa, Asmaul Husna
- **3 scoring scales coexist**: SM/BM (Penilaian Harian), BB/MB/BSH/BSB (Lomba/AKSERA), 3-level rubric (Raport narrative)

### Staff identified

**Leadership:**
- Dra. Era Zamona Chattar (NUPTK 0260 7446 4630 0053) — Kadiv Pendidikan / founder
- Elvriani Haziza, S.Pd — Kepala TKIT + walas TK B paralel
- Eneng Rina, S.Pd.I (NPK 8810 7301 5207 4) — Kepala RA + walas TK A paralel

**TK B walas (4 paralel):** Diana Lestari (B1), Eneng Rina (B2), Elvriani Haziza (B3), Yulia Purbaningsih (B4)
**TK A walas:** Hana Hanifah, Meilani Mulya Puteri, Ayu Rahma Yuniska, Lutfi Femiliana ("Bu Femi")

## Refresh cadence

Drive content evolves weekly. Re-decode if:
- Significant time passed since 2026-05-04
- New academic year starts (folder structure may change)
- New artifacts shared by school

Re-fetch via `mcp__bd8c4b21-b643-48ec-8234-f29ded26ef8d__search_files` w/ folder IDs above.
