# Desain: Rencana 4 — Pengeluaran, Laporan & Pengguna (Seteguk POS)

Tanggal: 2026-07-24
Status: Disetujui untuk perencanaan implementasi
Induk: `2026-07-24-seteguk-pos-design.md` (definisi istilah, formula, batasan tetap berlaku)

## Ringkasan

Rencana terakhir. Mengisi tiga modul yang masih placeholder: **Pengeluaran**
(`/pengeluaran`, izin `biaya`), **Laporan** (`/laporan`, izin `laporan`), dan
**Kelola Pengguna** (`/pengguna`, izin `user`). Setelah ini seluruh spec induk
terpenuhi.

## Keputusan yang Disepakati

- **Kelola pengguna termasuk membuat akun login baru** (bukan hanya mengatur
  izin) → butuh `SUPABASE_SERVICE_ROLE_KEY` server-only. Pengamanannya diuraikan
  di bagian Keamanan.
- **Laporan lengkap**: dashboard harian + pemilih rentang tanggal + rekap
  bulanan + grafik tren laba (bukan hanya dashboard harian).
- **`profiles.aktif` dibuat benar-benar berfungsi**: kolom ini sudah ada sejak
  Rencana 1 tapi belum dipakai apa pun. Mulai sekarang `getPengguna` menolak
  pengguna nonaktif, sehingga menonaktifkan pengguna = mencabut aksesnya.
- **Grafik dibuat tangan dengan HTML/CSS** (tanpa library grafik), mengikuti pola
  prototype: batang positif ke atas & negatif ke bawah dari garis nol, tooltip,
  `aria-label` per batang, plus tombol "Lihat tabel angka" sebagai alternatif
  teks. Tanpa dependency baru.

## Arsitektur

- Melanjutkan pola Rencana 1-3: server components + server actions, `wajibIzin`,
  RLS sebagai lapisan kedua. Tidak ada tabel baru.
- **Satu migrasi baru** berisi dua fungsi baca (**SECURITY INVOKER** — sengaja
  bukan `security definer`, supaya RLS pemanggil yang menjaga; policy "baca
  penjualan"/"baca pengeluaran" sudah mensyaratkan izin `laporan`):

  **`laporan_harian(p_dari date, p_sampai date)`** → satu baris per tanggal WIB:
  `tanggal, omzet, hpp, pengeluaran, laba, transaksi, tunai, qris, selisih_kasir`.
  - `omzet` = Σ(`sale_items.qty` × `harga`) untuk `sales.status='selesai'`.
  - `hpp` = Σ(`sale_items.qty` × `sale_items.hpp`) — HPP beku, bukan hitung ulang.
  - `pengeluaran` = Σ `expenses.nominal` pada tanggal itu.
  - `laba` = omzet − hpp − pengeluaran.
  - `tunai`/`qris` = omzet dipecah per `sales.metode`.
  - `selisih_kasir` = `cash_closings.selisih` hari itu (null bila belum ditutup).
  - Pengelompokan hari memakai `(sales.waktu at time zone 'Asia/Jakarta')::date`;
    `expenses.tanggal` dan `cash_closings.tanggal` sudah berupa tanggal WIB.
  - **Satu fungsi ini menyalakan seluruh laporan**: dashboard harian (ambil baris
    hari ini), ringkasan rentang (jumlahkan baris), grafik (7 baris terakhir),
    rekap bulanan (kelompokkan per bulan di klien). Maksimal ~365 baris/tahun.

  **`terlaris(p_dari date, p_sampai date, p_limit integer)`** → `nama, terjual`
  dari `sale_items.nama_snapshot` pada penjualan `selesai` dalam rentang,
  diurutkan menurun.

- Pengeluaran dan pengaturan izin memakai server action biasa + RLS yang ada.
- Pembuatan akun login memakai klien admin terpisah (lihat Keamanan).

## Modul Pengeluaran (`/pengeluaran`)

- **Form cepat**: tanggal (default hari ini WIB), kategori (pilih dari
  `expense_categories`, dengan opsi **tambah kategori baru**), nominal (integer
  rupiah > 0), catatan (opsional). Simpan → muncul di daftar.
- **Daftar per bulan** dengan total bulan berjalan; bisa pindah bulan.
- Pengeluaran hanya untuk biaya **non-bahan** (listrik, gas, gaji, sewa, dll).
  Belanja bahan tidak dicatat di sini — biayanya masuk lewat HPP saat terpakai
  (spec induk), agar tidak dobel hitung. Teks pengingat singkat ditampilkan di
  layar.
- Pengeluaran tidak bisa dihapus/diedit setelah tersimpan (konsisten dengan
  belanja bahan); koreksi dilakukan dengan mencatat penyesuaian.

## Modul Laporan (`/laporan`)

- **Pemilih rentang**: preset "Hari ini", "7 hari", "Bulan ini", plus tanggal
  dari–sampai manual. Default: hari ini.
- **Buku kas** untuk rentang terpilih: Omzet − HPP bahan terpakai − Pengeluaran
  = **Laba bersih** (ditonjolkan; ditandai bila rugi).
- **Mini-stat**: tunai di laci, masuk QRIS, jumlah transaksi, rata-rata per
  transaksi, dan selisih tutup kasir.
- **Grafik batang laba bersih 7 hari terakhir** (HTML/CSS, tanpa library):
  batang positif ke atas dan negatif ke bawah dari garis nol; setiap batang punya
  `aria-label` berisi tanggal + nilai; tooltip muncul saat hover maupun focus
  (bisa diakses keyboard); tombol "Lihat tabel angka" menampilkan tabel angka
  yang sama sebagai alternatif non-visual.
- **Rekap bulanan**: tabel per bulan (omzet, HPP, pengeluaran, laba bersih).
- **Terlaris** top 5 pada rentang terpilih.

## Modul Kelola Pengguna (`/pengguna`)

- **Daftar pengguna**: nama, email, chip izin (badge "Semua akses" bila ketujuh
  izin dimiliki), status aktif/nonaktif.
- **Buat akun baru**: nama, email, password, centang izin → dibuat lewat Supabase
  Admin API (auto-confirm), trigger `handle_new_user` membuat baris `profiles`,
  lalu izin yang dicentang di-insert. Minimal satu izin harus dicentang.
- **Ubah izin** pengguna yang sudah ada — cukup RLS `user`, tidak memakai kunci
  admin.
- **Nonaktifkan / aktifkan** pengguna (`profiles.aktif`). Pengguna tidak dihapus.
- **Pengaman**: pengguna tidak boleh menonaktifkan dirinya sendiri atau mencabut
  izin `user` miliknya sendiri (mencegah owner mengunci diri keluar).

## Keamanan: `SUPABASE_SERVICE_ROLE_KEY`

Kunci ini **menembus seluruh RLS**; bila bocor ke browser, seluruh database
terbuka. Pengamanan berlapis:

1. Nama env **tanpa** awalan `NEXT_PUBLIC_` → tidak pernah ikut ke bundle
   browser. Diisi di `web/.env.local` (gitignored) dan di Environment Variables
   Vercel. Tidak pernah di-commit.
2. Modul terpisah `web/src/lib/supabase/admin.ts` yang mengimpor paket
   **`server-only`** di baris pertama — bila suatu saat ada komponen klien
   mengimpornya, **build gagal**, bukan bocor diam-diam.
3. Klien admin **hanya** dipakai di satu server action (pembuatan akun), yang
   dibuka dengan `wajibIzin("user")` sebelum apa pun.
4. Semua operasi lain (daftar pengguna, ubah izin, aktif/nonaktif) memakai klien
   biasa di bawah RLS — kunci admin tidak dipakai.
5. Jika env tidak diset, action mengembalikan pesan yang jelas ("Fitur buat akun
   belum dikonfigurasi") alih-alih crash.

## Fungsi TS Murni (TDD)

Di `web/src/lib/laporan.ts`, di-unit-test Vitest:
- `ringkasRentang(baris[])` → menjumlahkan baris harian menjadi satu ringkasan
  (omzet, hpp, pengeluaran, laba, transaksi, tunai, qris).
- `kelompokBulanan(baris[])` → mengelompokkan baris harian per bulan (`YYYY-MM`)
  beserta totalnya, terurut.
- `rataPerTransaksi(omzet, transaksi)` → 0 bila transaksi 0 (hindari bagi nol).
- Batas hari WIB memakai `tanggalJakarta` dari `@/lib/kasir` (sudah ter-test).

## Pengujian

- **Unit (Vitest):** `ringkasRentang` (kosong, satu hari, banyak hari, nilai
  negatif), `kelompokBulanan` (lintas bulan, urutan), `rataPerTransaksi` (nol).
- **Verifikasi fungsi SQL** setelah `db push`: `laporan_harian` untuk rentang
  berisi transaksi + pengeluaran + tutup kasir, cek angka cocok dengan data
  mentah; `terlaris` mengurutkan benar; pengguna tanpa izin `laporan` mendapat
  nol baris (RLS).
- **Build + walkthrough produksi**: catat pengeluaran → muncul di laporan;
  dashboard harian cocok dengan transaksi kasir; buat pengguna baru dengan izin
  terbatas lalu login sebagai dia untuk memastikan izinnya berlaku; nonaktifkan
  pengguna itu dan pastikan aksesnya tertutup.

## Utang Teknis yang Diselesaikan di Sini

Dibawa dari review Rencana 2-3:
- RPC `buat_menu(nama, kategori, nama_varian, harga)` agar pembuatan menu +
  varian pertama benar-benar atomik (sekarang dua langkah + hapus kompensasi).
- Ekstrak komponen form bersama `<FormLembar>`: menghapus duplikasi
  `kelasInput`/`kelasLabel` di 5+ komponen, mereset state saat ditutup, dan
  menambah `role="dialog"` + tutup dengan Escape pada `Lembar`.
- Constraint unik (case-insensitive) untuk nama bahan dan nama menu.
- Peringatan stok minus setelah penjualan dibatasi pada bahan yang terdampak
  transaksi itu, bukan semua bahan yang sedang minus.

## Di Luar Cakupan

- Ekspor PDF/Excel.
- Grafik selain tren laba bersih.
- Menghapus/mengedit transaksi atau pengeluaran historis (hanya void penjualan).
- Reset password pengguna dari aplikasi (lewat dashboard Supabase).
- Multi-cabang, integrasi QRIS otomatis, cetak struk (tetap di luar cakupan spec induk).
