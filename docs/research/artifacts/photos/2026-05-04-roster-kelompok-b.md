# Roster Kelompok B TA 2025/2026 — Pengaturan Jam Pembelajaran

**Captured:** 2026-05-04 (photo shared during interview)
**Source:** Internal printed schedule, dated "Bekasi, 11 Juli 2025"
**Header:** "Rooster — Pengaturan Jam Pembelajaran Kelompok B TA 2025/2026"
**Brand:** An Nisaa logo "annisaa sekolahku"

## Physical format

Single-page printed schedule. Two stacked tables. Time slots on left, days (Senin–Jumat) across top.

## Decoded schedule

### Table 1 — Morning (07.00 – 08.30)

| Alokasi Waktu | Senin | Selasa | Rabu | Kamis | Jumat |
|---|---|---|---|---|---|
| 07.00 – 07.10 | Kehadiran guru | (same) | (same) | (same) | (same) |
| 07.10 – 07.30 | Nutrisi pagi guru / kecuali guru piket (07.10-07.20). Kedatangan anak (stel video Jus 30 Sen, Rab, Jum'at; Asmaul Husna Sel, Kam di TV kelas). Memilih cara masuk Kelas | | | | |
| 07.30 – 07.50 | Upacara | Senam | Pembukaan (praktek sholat Duha) | Senam Anak Indonesia Hebat | Pembukaan |
| 07.50 – 08.00 | Membalik absen, Memilih papan perasaan, jurnal menggambar bebas | Membalik absen, Memilih papan perasaan, jurnal menggambar bebas | Membalik absen, Memilih papan perasaan, jurnal kegiatan pilihan (4-5 mainan disiapkan guru) | Membalik absen, Memilih papan perasaan, Do'a dan hadist baru | Kisah teladan, Membalik absen, Memilih papan perasaan |
| 08.00 – 08.15 | Klasikal dan Individu AISM | Klasikal dan individu Aism | Klasikal dan individu Do'a, Hadist | Gerak & Lagu: Yel-yel, tepuk & Mars An nisaa', Asmaul Husna | Silent reading (membaca senyap) |
| 08.15 – 08.30 | Pertemuan pagi (rutinitas harian): pengenalan tema, pengenalan jadwal, hari tanggal bulan tahun, kegiatan hari ini, peraturan kelas | | | | |

### Table 2 — Mid-morning to closing (08.30 – 11.30)

| Alokasi Waktu | Senin–Rabu | Kamis | Jumat |
|---|---|---|---|
| 08.30 – 08.45 | Pilar Karakter | Kisah Teladan (buku, video) | (Kamis) Wuduk 08.45-08.55, Sholat infak 08.55-09.15 |
| 08.45 – 09.15 | Metode Ilman wa Ruhan | (Kamis: Wuduk + Sholat + infak) | |
| 09.15 – 09.30 | Makan B1, B3 / Main B2, B4 | | |
| 09.30 – 09.45 | Makan B2, B4 / Main B1, B3 | | |
| 09.45 – 11.00 | Sentra | Siroh Nabawiyah, Menebalkan huruf arab, Penutup | |
| 11.00 – 11.15 | Pijakan setelah bermain: merapihkan mainan, closing | | |
| 11.15 – 11.30 | Refleksi, Penutup | | |
| (Kamis special) | | 11.00-11.30: Pekan 1 Kokurikuler Tahfiz, Pekan 2,4 Ekskul Mewarnai/Menari, Pekan 3 Kokurikuler Angklung | |

## Key observations

- **Duty roster:** "guru piket" exception at 07.10-07.20 (early reception of arriving children)
- **Media usage:** Jus 30 video (Senin, Rabu, Jumat); Asmaul Husna video (Selasa, Kamis)
- **AISM** abbreviation referenced in 08.00-08.15 — meaning unclear from artifact (singkatan needs clarification)
- **Sentra block** (09.45-11.00) = main Sentra rotation per kelas per day
- **B1, B3 vs B2, B4 pattern** at 09.15-09.45 → split rotation for makan/main
- **Pekan-rotating kokurikuler** on Kamis (Pekan 1 / Pekan 2,4 / Pekan 3) — 4-week cycle

## Schema mapping

This artifact informs:

| Roster element | MVP entity / approach |
|---|---|
| Daily time blocks | `ClassSession` w/ status enum (no per-block model MVP) |
| Sentra rotation per day | `SentraRotation(classSectionId, dayOfWeek, sentraId)` |
| Pekan kokurikuler cycle | Out of MVP scope — admin tracks externally |
| AISM, Pilar Karakter, Metode Ilman wa Ruhan | Reference in walas's modul ajar (Drive, not in MVP system) |
| Pertemuan Pagi 08.15-08.30 | No system feature; teacher-led routine |
| Wuduk + Sholat (Kamis) | Religious activity log via `TimelineEvent` (post-launch) |

## Implications

- **Sentra rotation must be per-kelas per-day-of-week** (locked Section 6 — `SentraRotation` model)
- **B1/B3 vs B2/B4 makan-main split** indicates per-kelas pairing logic — not modeled in MVP, walas coordinates manually
- **AISM** singkatan still unknown — open question for next interview
- **Pekan-rotating kokurikuler** = post-launch event/activity catalog feature
- **Guru piket** = role that arrives 06.15 (Day Care) or shifts 07.10-07.20 — handled via TeachingDefault role enum (`HOMEROOM | ASSISTANT | SENTRA_TEACHER | DUTY`)

## Open questions

- AISM full name?
- Pekan kokurikuler — admin manages externally or in-system catalog needed?
- Per-kelas roster differs (Kelompok A vs Kelompok B same template?)
- Daycare schedule separate? Probably very different (full-day, different pacing).
