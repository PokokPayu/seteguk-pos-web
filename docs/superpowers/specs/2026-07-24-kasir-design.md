# Desain: Rencana 3 — Kasir (Seteguk POS)

Tanggal: 2026-07-24
Status: Disetujui untuk perencanaan implementasi
Induk: `2026-07-24-seteguk-pos-design.md` (definisi istilah, formula, batasan tetap berlaku)

## Ringkasan

Mengisi modul **Kasir** (`/kasir`, izin `kasir`): jual (grid menu → keranjang →
bayar tunai/QRIS), potong stok otomatis + bekukan HPP per transaksi, riwayat hari
ini, void (izin `void`), dan tutup kasir harian. Setelah ini aplikasi benar-benar
dipakai berjualan. Pengeluaran, Laporan, dan Kelola Pengguna dipisah ke Rencana 4.

## Keputusan yang Disepakati

- **Cakupan dipecah:** Rencana 3 = Kasir saja (jual, bayar, riwayat, void, tutup
  kasir). Rencana 4 = Pengeluaran + Laporan + Kelola pengguna. (Total jadi 4 rencana.)
- **Urutan tile "terlaris"** = penjualan 30 hari terakhir (stabil, tetap relevan
  di pagi hari saat penjualan hari ini masih 0). Angka "N× hari ini" pada tile
  dihitung dari penjualan hari ini (WIB). Urutan dihitung sekali saat halaman
  dimuat, tidak berpindah selama kasir bekerja.
- **Varian terakhir dipakai** disimpan per-sesi di memori klien (reset ke varian
  terlaris saat reload). Cocok untuk satu perangkat kasir seharian.
- **Tutup kasir "tunai sistem"** = total penjualan tunai hari itu (WIB). QRIS
  tidak masuk laci; pengeluaran tidak dikurangi (skema tidak membedakan bayar
  tunai/non-tunai).
- **Void mengembalikan stok dengan membalik `stock_movements` asli** transaksi,
  bukan menghitung ulang dari resep saat ini — benar walau resep sudah berubah.

## Arsitektur

- Melanjutkan pola Rencana 1-2: server components + server actions, `wajibIzin`,
  RLS lapis kedua. Semua tabel sudah ada (`sales`, `sale_items`,
  `stock_movements`, `cash_closings`).
- **Satu migrasi baru** berisi dua fungsi SQL atomik (`security definer`,
  `search_path` dipatok, cek izin di dalam, GRANT execute ke `authenticated`):

  **`catat_penjualan(p_metode text, p_uang_diterima integer, p_items jsonb)`**
  → `uuid` (id sale). `p_items` = array `[{"variant_id": uuid, "qty": int}]`.
  - Cek `has_permission(auth.uid(),'kasir')`; tolak jika tidak.
  - Validasi: `p_metode in ('tunai','qris')`; item tidak kosong; tiap qty > 0;
    tiap varian ada & aktif.
  - Untuk tiap item: ambil `harga` varian dan hitung **HPP beku** =
    Σ(`recipe_items.qty` × `ingredients.harga_rata`) untuk varian itu SAAT INI.
    `nama_snapshot` = nama produk + nama varian saat transaksi.
  - `total` = Σ(qty × harga). Jika tunai: wajib `p_uang_diterima >= total`,
    `kembalian = p_uang_diterima − total`; jika qris: `uang_diterima`/`kembalian`
    NULL.
  - Insert `sales` (waktu now, metode, status `selesai`, uang_diterima, kembalian,
    created_by) → insert `sale_items` (variant_id, nama_snapshot, qty, harga, hpp).
  - **Potong stok**: agregasi pemakaian per bahan lintas semua item
    (Σ resep.qty × item.qty), untuk tiap bahan `update ingredients set stok =
    stok − pakai` dan insert satu `stock_movements` (tipe `penjualan`, qty negatif,
    `ref_id` = id sale). Stok boleh jadi minus — tidak diblokir.
  - Semua dalam satu transaksi (atomik terhadap penjualan bersamaan).

  **`void_penjualan(p_sale_id uuid)`** → void.
  - Cek `has_permission(auth.uid(),'void')`; tolak jika tidak.
  - Kunci baris `sales`; jika status ≠ `selesai`, tolak (tak bisa void dua kali).
  - Set `sales.status = 'void'`.
  - **Kembalikan stok**: untuk tiap `stock_movements` tipe `penjualan` dengan
    `ref_id = p_sale_id`, insert movement pembalik (tipe `void`, qty = −qty asli
    → positif) dan `update ingredients set stok = stok − qty_asli` (menambah balik).
    Membalik jumlah persis yang dipotong, tak bergantung resep saat ini.

- Tutup kasir: server action insert ke `cash_closings` (RLS `kasir` sudah ada);
  `tunai_sistem` dihitung server dari Σ penjualan tunai `selesai` hari itu (WIB),
  `selisih = tunai_fisik − tunai_sistem`. Satu baris per tanggal (unique).

## Layar Kasir (`/kasir`)

Dua tab: **Jual** dan **Riwayat**.

### Tab Jual
- **Grid menu**: hanya varian aktif; produk diurut terlaris (30 hari), chip
  kategori (Semua + kategori yang ada). Tile menampilkan nama produk, "N× hari
  ini" jika ada, harga varian default, dan tombol ▾ (jika varian > 1) untuk
  membuka pemilih varian.
- **One-tap** tile → tambah varian default ke keranjang (toast konfirmasi).
  Pemilih varian → pilih → jadi default berikutnya untuk produk itu + tambah.
- **Keranjang** (panel/sheet di mobile): daftar item dengan stepper +/− dan hapus,
  subtotal per item, total. Tombol **Bayar** (nonaktif jika kosong).
- **Bayar** (sheet): pilih Tunai/QRIS. Tunai → input uang diterima + tombol cepat
  ("Uang pas" = total, beberapa nominal umum), kembalian otomatis, tombol Selesai
  nonaktif jika diterima < total. QRIS → langsung bisa Selesai. Selesai →
  `catat_penjualan` → layar sukses (kembalian atau "QRIS tercatat") → keranjang
  kosong. Jika ada stok jadi minus, toast peringatan "cek opname".

### Tab Riwayat
- Transaksi hari ini (WIB), terbaru di atas; ringkasan jumlah transaksi selesai +
  omzet hari ini. Tiap baris: jam, ringkasan item (pakai `nama_snapshot`), metode,
  total; tombol **Void** (hanya jika izin `void` dan status `selesai`). Transaksi
  void tampil ditandai "DIBATALKAN", tidak dihapus.

### Tutup Kasir
Tombol "Tutup kasir" → sheet: tampilkan tunai sistem hari ini; kasir isi tunai
fisik → selisih otomatis (merah jika kurang) + catatan → simpan. Jika tanggal itu
sudah pernah ditutup, tampilkan hasil sebelumnya (tidak dobel). Tercakup izin
`kasir`.

## Fungsi Uang (TS murni, TDD)

Di `web/src/lib/kasir.ts` (nama final di rencana), di-unit-test Vitest:
- `hitungKembalian(total, diterima)` → `diterima − total`.
- `totalKeranjang(item[])` → Σ(qty × harga) keranjang.
- HPP-beku dihitung di dalam fungsi SQL `catat_penjualan` (bukan di klien —
  kasir tidak melihat HPP); paritas rumusnya sudah dijamin `hitungHPP` Rencana 2
  yang ter-unit-test (Σ qty × harga_rata). Tidak perlu fungsi TS baru untuk HPP.

## Pengujian

- **Unit (Vitest):** kembalian (pas, lebih, kurang), total keranjang, HPP beku.
- **Verifikasi fungsi SQL** setelah `db push` (SQL Editor, sebagai smoke test):
  penjualan tunai → cek sales/sale_items/HPP beku/stok terpotong/movements;
  penjualan qris (uang_diterima NULL); void → stok kembali persis, status void,
  tak bisa void dua kali; user tanpa izin `kasir`/`void` ditolak.
- **Build + walkthrough produksi**: jual beberapa transaksi → riwayat & stok
  turun → void → stok kembali → tutup kasir → selisih tampil.

## Di Luar Cakupan (Rencana 3)

- Pengeluaran, Laporan (dashboard/grafik/rekap bulanan), Kelola pengguna → Rencana 4.
- Integrasi QRIS otomatis (pencatatan manual saja).
- Cetak struk, open bill, nomor meja, multi-cabang.
- Edit transaksi (hanya void; tak ada edit item setelah bayar).
