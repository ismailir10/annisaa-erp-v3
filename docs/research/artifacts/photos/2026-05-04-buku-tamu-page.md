# Buku Tamu / P2DB Log Page

**Captured:** 2026-05-04 (photo shared during interview)
**Title page:** "Penerimaan Peserta Didik Baru — Tahun Ajaran 2026/2027"

## Physical format

Hardcover physical book at reception desk. Each page = horizontal-oriented table with rows for sequential visit logging.

## Column structure (decoded from photo)

| # | Column | Notes |
|---|---|---|
| 1 | No | Sequential row number |
| 2 | Tanggal | Date of visit |
| 3 | Nama Anak | Child's full name |
| 4 | Tempat, tgl lahir | Birth place + date combined cell |
| 5 | L/P | Gender (Laki / Perempuan) |
| 6 | Nama Orang Tua | Parent name |
| 7 | Alamat | Free-text address |
| 8 | No HP | Parent phone |
| 9 | Kelompok | Target program (KB / TK A / TK B) |
| 10 | No form | Pendaftaran form number issued |

## Sample entries observed (anonymized)

Page contains rows dated **November 2025 → April 2026** spanning ~30 entries.

Entries observed:
- 12 Nov 2025 onwards
- Mix of TK A, TK B, KB targets
- Addresses cluster around: Taman Aster, Telaga Asih, Telaga Murni, Cikarang Barat
- Phone numbers stored w/ leading zero or +62 prefix
- "No form" sometimes blank (no form taken — visit only)

## Workflow inferred

1. Parent walks in, admin asks for child + family + intent
2. Admin (or parent) writes row in book
3. If parent serious → admin issues form (records No form)
4. Form returned later → admin matches by No form to drive registration

## Schema mapping

This artifact maps directly to `Visit` / `Admission` records in MVP:

| Buku tamu field | MVP entity field |
|---|---|
| Tanggal | `Admission.createdAt` (visit date) |
| Nama Anak | Phase 1 form field `studentName` |
| Tempat, tgl lahir | Phase 1 fields `birthPlace` + `birthDate` |
| L/P | Phase 1 field `gender` |
| Nama Orang Tua | Phase 1 field `contactName` |
| Alamat | Phase 1 field (free-text or skip — full Phase 2) |
| No HP | Phase 1 field `phone` (also sibling matcher) |
| Kelompok | Phase 1 field `programPreference` |
| No form | Auto-generated `Admission.id` or sequential reference |

## Implications

- Public form replicates these fields + adds optional email
- Admin tablet at reception = digital "buku tamu" same fields
- QR code scan opens same form
- Phase 1 keeps fields minimal (matches paper book intent — quick capture)

## Decoded conversion stats

User reported during interview: **~80% conversion** kunjungan → daftar. So if ~30 entries since Nov 2025, ~24 became registered students.
