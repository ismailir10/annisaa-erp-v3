# Buat Tagihan Serentak — panduan untuk admin sekolah

> Terakhir ditinjau: 2026-08-13 (cycle `parent-journal-nav-fixes`)
> Untuk: admin sekolah yang mengelola Tagihan di portal Admin (An Nisaa').
> Pemicu: pertanyaan Bu Shanti via WhatsApp 13 Agustus 2026 — *"buat tagihan manual saya sudah coba juga. cm masi bingung untuk buat tagihan serentak, karena nominal tagihan anak saat ini beda-beda (riwayat tunggakan, tambahan pesan seragam, anak baru masuk yg bertahap), itu gimana kak?"*

## Yang perlu Ibu tahu dulu

Tombol **Buat Tagihan** (tagihan serentak/bulk) membuatkan tagihan untuk *semua* siswa aktif sekaligus, tapi nominalnya **sama untuk semua siswa dalam satu program** — diambil dari Struktur Biaya yang Ibu atur di menu Biaya & Tagihan. Sistem belum bisa memberi nominal berbeda per anak secara otomatis (potongan, cicilan, atau tunggakan tidak dihitung otomatis).

Jadi kalau nominal tagihan seorang anak berbeda dari teman sekelasnya — karena riwayat tunggakan, tambahan seragam, atau cicilan masuk bertahap — caranya adalah **dua langkah**: pakai tagihan serentak untuk SPP bulanan yang seragam, lalu tambahkan tagihan manual terpisah untuk selisihnya. Panduan ini menjelaskan urutan yang aman supaya tidak ada anak yang terlewat ditagih SPP-nya.

## 1. Prasyarat — pastikan data biaya sudah diatur

Sebelum menekan **Buat Tagihan**, dua hal ini wajib sudah ada di menu **Biaya & Tagihan**:

1. **Komponen Biaya** (tab "Komponen Biaya") — misalnya SPP Bulanan, Uang Pangkal, Seragam. Setiap komponen yang mau ditagih otomatis harus berstatus **Aktif** dan bertipe **Bulanan (berulang)**. Komponen sekali-bayar atau yang dinonaktifkan tidak akan ikut ditagih otomatis.
2. **Struktur Biaya per Program** (tab "Struktur per Program") — pilih program dan tahun ajaran, lalu isi nominal untuk setiap komponen aktif. Ini yang menentukan berapa Rupiah yang akan muncul di tagihan otomatis untuk anak-anak di program tersebut.

**Kalau salah satu dari dua hal ini kosong, tagihan serentak tidak akan membuat tagihan sama sekali** — semua siswa program itu akan muncul sebagai "dilewati (belum ada struktur biaya)" dan jumlah tagihan yang dibuat akan nol. Ini bukan error, sistem memang sengaja tidak menagih program yang belum ada struktur biayanya. Kalau ini terjadi, kembali ke menu Biaya & Tagihan dan lengkapi struktur biaya program tersebut dulu, baru coba lagi.

## 2. Alur yang dianjurkan: serentak dulu, baru manual

**Selalu jalankan tagihan serentak (SPP bulanan) untuk periode itu SEBELUM membuat tagihan manual apa pun untuk anak yang sama di periode yang sama.**

Alasannya: sistem tidak akan membuat dua tagihan untuk anak yang sama pada **periode dengan nama persis sama**. Kalau Ibu sudah membuat tagihan manual dulu dengan nama periode "September 2026" untuk seorang anak, lalu menjalankan tagihan serentak dengan nama periode "September 2026" juga, sistem akan menganggap anak itu **sudah ditagih** dan melewatinya — anak tersebut tidak akan pernah dapat tagihan SPP reguler untuk bulan itu. Tidak ada peringatan khusus untuk kasus ini di layar ringkasan, jadi urutannya harus dijaga:

1. Jalankan **Buat Tagihan** (serentak) dulu untuk SPP bulan berjalan, semua siswa aktif.
2. Setelah itu baru buat **Tagihan Manual** untuk anak-anak yang butuh tambahan (tunggakan, seragam, cicilan) — dengan nama periode yang **berbeda** dari nama periode SPP-nya. Detail penamaan ada di bagian 5 di bawah.

Lihat bagian 5 (Jebakan Label Periode) untuk contoh lengkap salah dan benarnya.

## 3. Langkah tagihan serentak

1. Buka **Tagihan** di menu admin, klik **Buat Tagihan**.
2. Isi form:
   - **Periode** — nama bulan tagihan, contoh: `April 2026`. Pakai format yang konsisten setiap bulan (nama bulan + tahun) supaya mudah dikenali.
   - **Tanggal Jatuh Tempo** — tanggal batas bayar.
   - **Tahun Ajaran** — pilih tahun ajaran yang sedang aktif.
3. Klik **Buat Tagihan** pada form. Sistem akan menghitung dulu (belum membuat apa pun) dan menampilkan **ringkasan konfirmasi**:
   - Jumlah siswa yang akan ditagih.
   - Jumlah yang **dilewati karena sudah punya tagihan** untuk periode itu (ini bisa jadi sinyal jebakan label periode di atas — kalau angkanya besar dan tidak terduga, cek dulu sebelum lanjut).
   - Jumlah yang **dilewati karena belum ada struktur biaya** (berarti program siswa itu belum diisi di menu Biaya & Tagihan — lihat bagian 1).
4. Kalau ringkasannya sudah sesuai harapan, klik **Lanjutkan**. Sistem akan membuat tagihan dan link pembayaran untuk setiap siswa, dengan progress bar yang berjalan sampai selesai.
5. **Kalau ada link pembayaran yang gagal dibuat** (misalnya gangguan koneksi ke penyedia pembayaran sesaat), sistem akan **otomatis mencoba ulang sekali** di akhir proses — Ibu akan lihat pesan "Memeriksa link gagal..." sebentar. Kalau setelah itu masih ada yang gagal, tombol **"Coba Lagi Link"** akan muncul di halaman Tagihan (di kartu ringkasan status "Link Gagal") — klik untuk mencoba ulang secara manual. Tagihannya sendiri tetap tersimpan meski link pembayarannya sempat gagal; hanya link-nya yang perlu dibuat ulang.

## 4. Langkah tagihan manual per kasus

Tombol **Tagihan Manual** membuat satu tagihan untuk satu siswa, dengan komponen dan nominal yang bisa Ibu tentukan sendiri baris per baris (tombol **Tambah Komponen** untuk menambah baris lagi). Ini alat yang tepat untuk tiga kasus yang Ibu sebutkan.

### a. Riwayat tunggakan

Kalau seorang anak punya tunggakan dari bulan-bulan sebelumnya yang belum tertagih:

1. Klik **Tagihan Manual**, pilih siswanya.
2. Beri nama periode yang jelas menyebut ini tagihan tunggakan, bukan SPP bulan berjalan — contoh: `Tunggakan Juli 2026` atau `Tunggakan SPP Mei-Juni 2026` kalau menggabungkan beberapa bulan.
3. Tambahkan baris komponen (bisa pakai komponen SPP yang sama, atau buat komponen baru "Tunggakan" di menu Biaya & Tagihan kalau ingin memisahkannya secara rapi di laporan) dan isi nominalnya sesuai jumlah tunggakan.
4. Isi tanggal jatuh tempo, lalu simpan.

### b. Tambahan pesan seragam

Kalau seorang anak memesan seragam tambahan di luar paket standar:

1. Klik **Tagihan Manual**, pilih siswanya.
2. Beri nama periode yang menyebut item dan bulannya, contoh: `Seragam September 2026`.
3. Tambahkan satu baris per jenis seragam kalau ada beberapa (misalnya baris "Seragam Batik" dan baris "Seragam Olahraga" terpisah), isi nominal masing-masing.
4. Isi tanggal jatuh tempo, lalu simpan.

### c. Anak baru masuk yang bayarnya bertahap/cicilan

Kalau siswa baru membayar uang pangkal atau biaya masuk secara bertahap (cicilan):

1. Klik **Tagihan Manual**, pilih siswanya.
2. Beri nama periode yang menyebut nomor cicilan, contoh: `Cicilan 1 — Ananda Fulan` dan bulan berikutnya `Cicilan 2 — Ananda Fulan`. Sertakan nama anak di label kalau memudahkan pencarian di daftar tagihan, atau cukup `Cicilan 1 Uang Pangkal` kalau nama siswa sudah tampil jelas di kolom lain.
3. Tambahkan baris komponen sesuai porsi cicilan tahap itu.
4. Isi tanggal jatuh tempo sesuai kesepakatan dengan orang tua, lalu simpan.
5. Ulangi untuk setiap tahap cicilan berikutnya, dengan nomor cicilan yang berbeda di nama periode setiap kalinya.

## 5. Jebakan label periode — WAJIB dibaca

Ini bagian paling penting di panduan ini. **Nama Periode adalah kunci yang dipakai sistem untuk mengenali "anak ini sudah ditagih untuk bulan ini atau belum."** Kalau nama periode sebuah tagihan manual sama persis dengan nama periode yang nanti Ibu pakai di tagihan serentak, sistem akan menganggap anak itu sudah ditagih dan **melewatinya diam-diam** — anak itu tidak akan dapat tagihan SPP reguler, dan tidak ada notifikasi yang memberi tahu Ibu bahwa ini terjadi.

**Contoh SALAH:**

1. Tanggal 1 September, Ibu buat tagihan manual untuk Ananda Fulan dengan Periode = `September 2026`, isinya biaya seragam tambahan.
2. Tanggal 5 September, Ibu jalankan tagihan serentak untuk SPP semua siswa dengan Periode = `September 2026`.
3. Hasilnya: Ananda Fulan **tidak dapat tagihan SPP September** sama sekali, karena sistem melihat dia "sudah punya tagihan untuk periode September 2026" (yaitu tagihan seragam yang dibuat manual tadi) dan melewatinya. Ringkasan konfirmasi di langkah 3 bagian 3 di atas akan menghitung Ananda Fulan sebagai "dilewati" tanpa menyebut namanya — mudah tidak disadari kalau jumlah "dilewati" nya kecil.

**Contoh BENAR:**

1. Tanggal 1 September, Ibu buat tagihan manual untuk Ananda Fulan dengan Periode = `Seragam September 2026` (bukan `September 2026`), isinya biaya seragam tambahan.
2. Tanggal 5 September, Ibu jalankan tagihan serentak untuk SPP semua siswa dengan Periode = `September 2026`.
3. Hasilnya: Ananda Fulan dapat **dua tagihan terpisah** — satu SPP reguler (`September 2026`) dari proses serentak, satu tagihan seragam (`Seragam September 2026`) dari proses manual. Keduanya muncul di daftar Tagihan dan bisa dibayar terpisah.

**Aturan praktis:** nama periode untuk SPP bulanan reguler selalu format polos `<Nama Bulan> <Tahun>` (contoh `September 2026`). Nama periode untuk tagihan manual apa pun — tunggakan, seragam, cicilan — **selalu tambahkan kata penjelas di depan atau belakang nama bulan** sehingga tidak pernah sama persis dengan label SPP reguler. Contoh: `Tunggakan Juli 2026`, `Seragam September 2026`, `Cicilan 1 — Ananda Fulan`.

Kalau ragu apakah sebuah anak sudah punya tagihan untuk periode tertentu, cek dulu di daftar Tagihan (bisa dicari per nama siswa) sebelum membuat tagihan baru untuknya.

## 6. Batasan yang diketahui

Sampai saat panduan ini ditulis, sistem **belum** memiliki:

- **Potongan atau beasiswa per anak** (diskon adik-kakak, beasiswa, dsb.) yang otomatis mengurangi nominal tagihan serentak untuk siswa tertentu.
- **Perhitungan tunggakan otomatis** yang membawa sisa tagihan bulan lalu ke tagihan bulan berikutnya.

Kedua hal ini sudah dicatat sebagai kebutuhan untuk dikembangkan nanti, tapi belum dikerjakan di siklus ini. Selama fitur itu belum ada, alur dua-langkah (serentak lalu manual) dan disiplin penamaan periode di panduan ini adalah cara kerja yang dianjurkan untuk menangani nominal tagihan yang berbeda-beda per anak.

## Terkait

- Menu **Biaya & Tagihan** (`/admin/fees`) — kelola Komponen Biaya dan Struktur Biaya per Program, prasyarat wajib sebelum tagihan serentak.
- Menu **Tagihan** (`/admin/invoices`) — tempat tombol Buat Tagihan (serentak) dan Tagihan Manual berada, juga tempat mengecek daftar tagihan per siswa dan status link pembayaran.
