# Voice & Tone

> Loaded on demand by `/build` when staged paths match `app/**/*.tsx`, `components/**/*.tsx`, `lib/email/**`, `lib/**/messages.ts`, or any file whose diff introduces user-facing copy (toasts, labels, descriptions, empty-state text, email subjects, SMS strings).

**Canonical reference:** `.claude/standards/design-system.html` §18 — persona cards, Islamic courtesy layer, copy-rule tables. This file is the text-only condensation.

## The three audiences

Every piece of user-facing copy lives in one of three portals. Voice shifts with audience — the same action ("Save") reads differently to an ops admin versus a parent.

### Admin — Pak Budi (staff-speak)

**Persona:** desktop, 22 admin routes, comfortable with bulk actions, CSV exports, status taxonomies.

**Voice:** neutral, efficient, technical vocabulary OK. Imperative verbs. Short labels. No pleasantries.

| Do | Don't |
|---|---|
| "Tambah Siswa" | "Yuk tambahkan siswa baru" |
| "Ekspor CSV" | "Unduh file spreadsheet" |
| "Status: DRAFT" | "Statusnya masih draft loh" |
| "Nonaktifkan" | "Matikan akun" |
| Error: "Gagal menyimpan. Periksa kolom yang ditandai." | "Aduh ada masalah nih" |

### Teacher — Ustadzah Sari (collegial, warm-professional)

**Persona:** mobile PWA, arm's-length use during class, respectful honorifics (*Ustadz/Ustadzah*), action-forward copy.

**Voice:** collegial, uses honorifics, action-oriented imperative, Islamic school context acknowledged but not over-performed.

| Do | Don't |
|---|---|
| "Selamat pagi, Ustadzah Sari" | "Hai Sari" |
| "Ketuk untuk mulai absensi" | "Klik tombol di bawah ini untuk memulai" |
| "Clock-in berhasil · MASUK 07:12" | "Anda telah berhasil melakukan clock-in pada pukul 07:12" |
| "Hadir 25 · Alpa 1 · Sakit 2" | "Status kehadiran hari ini menunjukkan..." |
| "Simpan catatan" | "Submit entry" |

### Parent — Ibu Nur (warmest, most personal)

**Persona:** mobile PWA, occasional check-ins, emotionally invested in the child, intermittent 4G.

**Voice:** warmest of the three. Greets with *Assalamu'alaikum*. Addresses as *Bu/Pak + first name*. Child-framed ("Aisyah hari ini..." not "Your child today..."). Gentle on unpaid invoices, generous on child achievements.

| Do | Don't |
|---|---|
| "Assalamu'alaikum, Ibu Nur" | "Hi there!" |
| "Aisyah hadir di sekolah hari ini" | "Student ID 2024-087 recorded as present" |
| "Tagihan SPP April belum dibayar · jatuh tempo 28 April" | "UNPAID INVOICE — DUE IMMEDIATELY" |
| "Rapor Tengah Semester Aisyah sudah terbit" | "New report card available for download" |
| Error: "Koneksi terputus. Coba lagi sebentar ya." | "Network error 503" |

## Islamic courtesy layer

The school is Islamic PAUD/TKIT. Arabic greetings and honorifics are first-class but **not decorative**.

**Use:**
- *Assalamu'alaikum* — parent greeting on home landing, parent email subject lines, home-note opening.
- *Ustadz/Ustadzah* — addressing teachers (header greeting, notification copy, parent→teacher messages).
- *InsyaAllah* — schedule-dependent promises ("InsyaAllah rapor terbit 30 April").
- *Barakallah* — celebration copy (birthday, achievement, graduation).

**Avoid:**
- Arabic greetings in admin UI (Pak Budi doesn't need *Assalamu'alaikum* on every admin page — it's ops context, not pastoral).
- Honorifics stacked on error toasts ("Ustadzah Sari, maaf sekali, terjadi kesalahan..."). Errors are errors — keep them terse.
- Performative religiosity — don't sprinkle Arabic across every label. Use it where it lands culturally (greetings, gratitude, schedule promises), not as decoration.

**Cross-portal glossary** — the canonical term wins over the English/transliterated alternative:

| Canonical | Avoid |
|---|---|
| Hadir (attendance present) | Present, Attended |
| Alpa (attendance absent) | Absent, Tidak Hadir |
| Sakit | Sick, Ill |
| Izin | Permission, Excused |
| Tagihan | Invoice, Bill (use Tagihan for parent; Invoice ok in admin) |
| Kehadiran | Attendance |
| Rapor | Report card |
| Wali | Guardian, Parent (Wali = registered guardian; Parent = audience) |
| Kelas | Class, Classroom |
| Ustadz / Ustadzah | Pak Guru / Bu Guru (Islamic-school context uses Ustadz/ah) |
| Catatan (data row, log entry, journal note) | Record |
| Pertanyaan (admission lifecycle: first contact) | Inquiry (StatusBadge already maps `INQUIRY → "Pertanyaan"` — keep button labels consistent) |
| Perencanaan (academic-year status pre-launch) | Planning |
| Templat (assessment / journal template) | Template (the `t` at the end softens Indonesian — both are acceptable but Templat is the canonical loanword form) |
| Timpa (override an attendance / data entry) | Override, Timpa (Override) (the bilingual gloss is redundant once Timpa is established) |

## Cross-cutting copy rules

### Errors

- **Always actionable.** Tell the user what to do next, or tell them it's safe to retry.
- **Tone scales with audience.** Admin gets terse; parent gets gentle.
- **Never expose status codes.** `Network error 503` is not a user message.

| Audience | Good | Bad |
|---|---|---|
| Admin | "Gagal menyimpan. Periksa kolom yang ditandai." | "Validation error: name is required" |
| Teacher | "Absensi tidak tersimpan. Coba ketuk ulang ya." | "PATCH /api/attendance failed" |
| Parent | "Koneksi terputus. Coba lagi sebentar ya." | "Network error 503" |

### Empty states

- **Never "No data."** Always say WHY it's empty and WHAT happens when data arrives.
- **Action CTA when the user can fix it.** "Tambah Siswa Pertama" beats "Belum ada siswa".

| Audience | Good | Bad |
|---|---|---|
| Admin | "Belum ada siswa terdaftar. Klik Tambah Siswa untuk mulai." | "No data" |
| Teacher | "Belum ada kelas terjadwal hari ini." | "Empty schedule" |
| Parent | "Belum ada tagihan bulan ini. Alhamdulillah, semua lunas." | "No invoices found" |

### Success toasts

- **Past-tense state, not imperative.** "Tersimpan" beats "Save successful".
- **Short. One line.** Details belong in the entity, not the toast.

| Audience | Good | Bad |
|---|---|---|
| Admin | "Siswa ditambahkan." | "Successfully created new student record" |
| Teacher | "Absensi tersimpan · 25 siswa" | "Attendance submission complete" |
| Parent | "Pembayaran diterima · Alhamdulillah" | "Transaction processed" |

### Destructive confirmations

- **Always `<AlertDialog>`.** Never `<Dialog>`, never `window.confirm()`.
- **State the consequence explicitly.** "Data tidak bisa dikembalikan" when irreversible; "Bisa diaktifkan kembali" when soft-delete.
- **Cancel-left, destructive-right.** Destructive button uses red (`variant="destructive"`).

| Scenario | AlertDialog copy |
|---|---|
| Hard delete (rare) | Title: "Hapus permanen?" · Body: "Aksi ini tidak bisa dibatalkan. Data akan hilang selamanya." |
| Soft delete / deactivate | Title: "Nonaktifkan siswa?" · Body: "Siswa tidak akan muncul di daftar aktif. Bisa diaktifkan kembali kapan saja." |
| Void invoice | Title: "Batalkan tagihan?" · Body: "Tagihan tidak bisa dibayar lagi. Riwayat tetap tersimpan." |

### Notification / Email / SMS channel voice

Channel constraints shape voice. Same event, three different strings:

| Channel | Rapor published event |
|---|---|
| In-app toast (parent) | "Rapor Aisyah sudah terbit · Lihat" |
| Email subject | "Rapor Tengah Semester — Aisyah Nuraini" |
| Email body opener | "Assalamu'alaikum Ibu Nur, rapor tengah semester Aisyah sudah terbit. InsyaAllah bisa diunduh dari aplikasi." |
| SMS | "Rapor Aisyah terbit. Cek apps.annisaa.sch.id" |

**SMS rules:** ≤160 chars · no Arabic greetings (transliteration often renders poorly on old handsets) · always include the short URL.

## Review gate

On every PR that touches user-facing copy (toasts, labels, descriptions, empty-state text, email subjects, SMS strings), the author confirms in the cycle doc Verification section:

- [ ] Audience identified (admin / teacher / parent) and voice matches the table above.
- [ ] Glossary terms canonical (Hadir not Present, Tagihan not Invoice for parent, etc.).
- [ ] Islamic courtesy layer applied where it lands (parent greetings, email openers, celebration events) — not sprinkled as decoration.
- [ ] Error/empty/success/destructive copy follows the cross-cutting tables above.
