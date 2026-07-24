# Desain: Aplikasi POS Warung Kopi Seteguk

Tanggal: 2026-07-24
Status: Disetujui untuk perencanaan implementasi

## Ringkasan

Aplikasi web POS (Point of Sale) untuk Warung Kopi Seteguk yang mencakup kasir,
manajemen stok bahan baku, pencatatan pengeluaran, dan laporan laba harian
berbasis HPP per resep. Diakses dari mana saja lewat browser; owner bisa
memantau dari rumah.

## Kebutuhan yang Disepakati

- Akses online dari perangkat mana pun (HP kasir, HP/laptop owner). Tidak perlu
  mode offline — internet warung stabil.
- Sistem permission fleksibel: saat membuat user, hak aksesnya dicentang
  satu per satu (bukan peran kaku).
- HPP berbasis resep: setiap varian menu punya resep bahan; setiap penjualan
  memotong stok bahan otomatis.
- Metode pembayaran: Tunai (dengan hitung kembalian) dan QRIS, dicatat per
  transaksi untuk rekonsiliasi harian.
- Alur pesanan: langsung bayar di kasir. Tidak ada open bill / nomor meja.
- Tidak perlu cetak struk.
- Laba harian = omzet − HPP − pengeluaran operasional hari itu.
- Menu punya varian (misal panas/es) dengan harga dan resep berbeda.
- Hosting gratis: Vercel (aplikasi) + Supabase (database & login).

## Arsitektur

- **Next.js** (App Router, TypeScript) di-hosting di **Vercel**. Satu aplikasi
  responsif: layar kasir mobile-first dengan tombol besar; dashboard laporan
  nyaman di layar besar.
- **Supabase**: PostgreSQL, Auth (email + password), dan Row Level Security
  sebagai lapisan keamanan kedua.
- Pengecekan permission dilakukan di sisi server (server actions / route
  handlers) berdasarkan tabel permission per user; UI hanya menyembunyikan
  menu, bukan satu-satunya penjaga.
- PWA ringan: bisa di-install ke home screen, tetap butuh koneksi.
- Zona waktu **Asia/Jakarta (WIB)** untuk batas hari pada semua laporan.

## Modul

1. **Kasir (POS)** — layar jualan, pembayaran tunai/QRIS, riwayat & void,
   tutup kasir (rekonsiliasi tunai harian).
2. **Menu & Resep** — menu, varian, harga jual, resep bahan per varian.
3. **Stok Bahan** — daftar bahan, catat belanja, stok opname, peringatan
   stok menipis.
4. **Pengeluaran** — pencatatan pengeluaran operasional per kategori.
5. **Laporan** — laba harian, rekap bulanan, menu terlaris, rincian
   tunai vs QRIS.
6. **Pengguna** — buat user dan atur hak akses per user.

## Model Data

- **ingredients (bahan)** — nama, satuan (gram/ml/pcs), stok saat ini, harga
  rata-rata per satuan, batas minimum stok.
- **products (menu)** — nama, kategori, status aktif.
- **product_variants (varian)** — milik satu menu; nama varian (Panas/Es),
  harga jual, status aktif. Setiap menu minimal punya satu varian.
- **recipe_items (resep)** — per varian: bahan + takaran.
- **purchases (belanja bahan)** — bahan, jumlah, total harga, tanggal;
  menambah stok dan memperbarui harga rata-rata.
- **sales (transaksi)** — waktu, metode bayar (tunai/QRIS), uang diterima &
  kembalian (tunai), status (selesai/void), kasir yang melayani.
- **sale_items (item transaksi)** — varian, jumlah, harga jual saat itu, dan
  **HPP yang dibekukan** saat transaksi.
- **stock_movements (pergerakan stok)** — ledger semua keluar-masuk stok:
  pembelian (masuk), penjualan (keluar), opname (koreksi ±), void (masuk
  kembali). Setiap baris menunjuk sumbernya.
- **expenses (pengeluaran)** — tanggal, kategori, nominal, catatan.
- **expense_categories** — kategori pengeluaran, bisa ditambah user.
- **cash_closings (tutup kasir)** — tanggal, tunai menurut sistem, tunai hasil
  hitung fisik, selisih, catatan, user yang menutup.
- **profiles + user_permissions** — data user dan daftar hak aksesnya.

## Perhitungan HPP

- **Moving average (rata-rata bergerak):** setiap belanja bahan memperbarui
  harga rata-rata = (nilai stok lama + nilai belanja baru) / total stok baru.
  Contoh: 500gr kopi @Rp100/gr + beli 1000gr @Rp130/gr → rata-rata Rp120/gr.
- **HPP dibekukan per transaksi:** saat tombol Bayar ditekan, HPP tiap item
  dihitung dari resep × harga rata-rata bahan saat itu, lalu disimpan permanen
  di sale_items. Perubahan harga bahan atau resep di kemudian hari tidak
  mengubah laporan historis.
- **Laba harian** = total penjualan − total HPP tersimpan − total pengeluaran,
  semua dalam batas hari WIB.
- **Belanja bahan baku bukan pengeluaran operasional.** Biaya bahan masuk ke
  laba lewat HPP saat bahan terpakai, bukan saat dibeli — mencegah dobel
  hitung. Modul Pengeluaran hanya untuk biaya non-bahan (listrik, gas, gaji,
  sewa, dll).
- **Bahan tak tertakar bukan resep.** Bahan yang tidak praktis ditakar per
  porsi (gas untuk memasak, air galon, sabun) tidak dimasukkan ke resep —
  dicatat sebagai pengeluaran operasional. HPP adalah estimasi manajemen,
  bukan akuntansi sempurna; akurasinya dijaga lewat stok opname rutin, bukan
  dengan menakar segalanya.

## Alur Layar

### Kasir
Grid menu dengan tombol besar; urutan tile mengikuti menu paling laku, bukan
abjad atau urutan input. Satu tap langsung menambahkan varian yang terakhir
dipakai untuk menu itu; tombol kecil di tile membuka pemilih varian. Ubah
jumlah / hapus item. Bayar → Tunai (input uang diterima, kembalian otomatis)
atau QRIS → simpan, potong stok, layar kosong lagi. Riwayat transaksi hari
ini; void oleh user berizin.

**Tutup kasir:** di akhir hari, kasir menghitung uang fisik di laci. Sistem
menampilkan tunai menurut catatan, kasir mengisi hasil hitungan, selisih
tersimpan beserta catatan dan siapa yang menutup. Selisih tampil di laporan
harian. Tutup kasir tercakup dalam izin "Kasir".

### Stok
Daftar bahan; yang di bawah batas minimum ditandai dan ditampilkan paling
atas. **Catat Belanja**: pilih bahan, jumlah, total harga → stok + harga
rata-rata terupdate. **Stok Opname**: isi hasil hitung fisik, sistem mencatat
selisih sebagai koreksi.

### Pengeluaran
Input cepat: tanggal (default hari ini), kategori (bisa tambah), nominal,
catatan. Daftar per bulan.

### Laporan
Dashboard hari ini: omzet, HPP, pengeluaran, laba bersih, jumlah transaksi,
rincian tunai vs QRIS, selisih tutup kasir, menu terlaris. Pilihan rentang
tanggal, rekap bulanan, grafik tren laba.

### Pengguna
Buat user (email + password), centang hak akses.

## Hak Akses

| Hak akses | Mengizinkan |
|---|---|
| Kasir | Buka layar jualan, terima pembayaran |
| Void transaksi | Membatalkan transaksi |
| Kelola menu & resep | Tambah/ubah menu, harga, resep |
| Kelola stok | Catat belanja bahan, opname |
| Catat pengeluaran | Input pengeluaran operasional |
| Lihat laporan | Dashboard laba, laporan lengkap |
| Kelola pengguna | Buat user & atur hak akses |

User pertama (owner) dibuat saat setup awal dengan semua hak akses.

## Kasus Khusus

- **Stok minus tidak memblokir penjualan** — hanya peringatan; koreksi lewat
  opname. Warung tidak berhenti jualan karena catatan.
- **Void** mengembalikan stok bahan dan mengoreksi omzet & HPP. Transaksi
  void tetap tersimpan dengan penanda (audit), tidak dihapus.
- **Bahan dihapus / resep berubah** tidak merusak transaksi lama (HPP sudah
  dibekukan). Bahan yang pernah dipakai tidak dihapus permanen, hanya
  dinonaktifkan.
- **Transaksi bersamaan** aman: pemotongan stok atomik di database.
- **Menu tanpa resep lengkap** tetap bisa dijual (HPP dari bahan terdaftar
  saja) tapi ditandai di halaman menu.

## Pengujian

- **Unit test** untuk semua kalkulasi uang: moving average, HPP per varian,
  laba harian, kembalian, koreksi void.
- **Integration test** alur inti: jual → stok terpotong → masuk laporan;
  belanja → harga rata-rata berubah; void → semua kembali.
- **Permission dites di server**: akses langsung via URL tanpa izin ditolak.

## Di Luar Cakupan (Versi Pertama)

- Mode offline / sinkronisasi.
- Cetak struk (fisik maupun digital).
- Open bill / nomor meja.
- Integrasi otomatis dengan penyedia QRIS (pencatatan manual saja).
- Multi-cabang.
