# Desain: Rencana 2 — Inventori & Menu (Seteguk POS)

Tanggal: 2026-07-24
Status: Disetujui untuk perencanaan implementasi
Induk: `2026-07-24-seteguk-pos-design.md` (spec utama — definisi istilah, formula, dan batasan di sana tetap berlaku)

## Ringkasan

Mengisi dua modul yang masih placeholder dari Rencana 1: **Stok Bahan** (`/stok`,
izin `stok`) dan **Menu & Resep** (`/menu`, izin `menu`). Owner bisa mengelola
bahan, mencatat belanja dengan harga rata-rata bergerak otomatis, melakukan stok
opname, dan mengelola menu/varian/resep dengan HPP tampil live. Menjadi fondasi
kasir & laporan di Rencana 3.

## Keputusan yang Disepakati

- **Cakupan digabung:** Stok + Menu dalam satu rencana (HPP butuh harga
  rata-rata dari belanja; keduanya erat). Struktur tetap 3 rencana.
- **Belanja permanen (ledger):** tidak ada edit/hapus belanja. Salah input
  dikoreksi lewat stok opname. Menghindari hitung-ulang moving average dan
  menjaga `purchases` sebagai ledger audit.
- **Penanda resep otomatis:** varian tanpa baris resep sama sekali ditandai
  "belum ada resep" (HPP tampil "—"). Varian dengan resep sebagian tetap
  dihitung dari bahan terdaftar, tanpa penanda ekstra (sesuai spec induk).

## Arsitektur

- Melanjutkan pola Rencana 1: server components + server actions, guard
  `wajibIzin("stok")` / `wajibIzin("menu")`, RLS sebagai lapisan kedua.
- **Tidak ada tabel baru.** Seluruh tabel sudah ada dari migrasi Rencana 1
  (`ingredients`, `purchases`, `stock_movements`, `products`,
  `product_variants`, `recipe_items`).
- **Satu migrasi baru** berisi dua fungsi SQL atomik (`security definer`,
  `search_path` dipatok, GRANT execute ke `authenticated`):
  - `catat_belanja(ingredient_id, qty, total_harga)` — kunci baris bahan
    (`for update`), hitung
    `rata_baru = (greatest(stok,0)×rata + total) / (greatest(stok,0) + qty)`
    (stok minus diperlakukan bernilai 0 agar rata tak terdistorsi; formula
    identik dengan fungsi TS), update `stok = stok + qty` & `harga_rata`,
    insert `purchases` + `stock_movements` (tipe `belanja`, qty +, ref ke
    purchase). `created_by = auth.uid()`.
  - `catat_opname(ingredient_id, stok_fisik)` — kunci baris bahan, hitung
    selisih = fisik − sistem, set `stok = stok_fisik`, insert
    `stock_movements` (tipe `opname`, qty ±, `ref_id` null). Harga rata-rata
    **tidak berubah** (opname hanya koreksi kuantitas).
  - Keduanya **mengecek `has_permission(auth.uid(),'stok')` di dalam fungsi**
    dan menolak (`raise exception`) jika tak berizin — karena `security
    definer` melewati RLS. Validasi input di fungsi: qty > 0, total > 0,
    stok_fisik ≥ 0, bahan ada & aktif.
- Alasan fungsi SQL: mutasi stok/harga menulis 2–3 tabel sekaligus dan harus
  atomik terhadap input bersamaan (spec induk: "pemotongan stok atomik di
  database" — pola yang sama dipakai `catat_penjualan` di Rencana 3).
- CRUD biasa (bahan, menu, varian, resep) = server actions menulis tabel
  langsung, dijaga RLS `stok`/`menu` yang sudah ada. Setelah mutasi,
  `revalidatePath` halaman terkait.

## Modul Stok (`/stok`)

- **Daftar bahan:** nama, satuan, stok, harga rata-rata, batas min. Bahan
  dengan stok ≤ min ditandai dan ditampilkan paling atas; sisanya urut nama.
  Bahan nonaktif tersembunyi (toggle "tampilkan nonaktif").
- **Kelola bahan:** tambah/edit nama, satuan, batas min. Satuan teks bebas
  dengan saran (gram, ml, pcs, butir). Bahan tidak dihapus permanen — hanya
  dinonaktifkan (`aktif = false`); bisa diaktifkan lagi.
- **Catat belanja:** pilih bahan → qty → total harga → preview **"harga
  rata-rata baru"** real-time (dihitung fungsi TS yang sama dengan test) →
  simpan via RPC `catat_belanja`. Setelah simpan: stok & rata terupdate di
  daftar.
- **Stok opname (per bahan):** pilih bahan → isi hasil hitung fisik → tampil
  **selisih** (fisik − sistem, bisa ±) → simpan via RPC `catat_opname`.
- Stok boleh minus (spec induk) — tidak ada validasi yang memblokir; tampilan
  menandai stok minus sebagai anomali untuk diopname.

## Modul Menu & Resep (`/menu`)

- **Daftar menu:** per menu (products): nama, kategori, status; di dalamnya
  varian-varian dengan harga jual, **HPP live**, dan margin (harga − HPP).
  Subjudul halaman: "HPP dihitung dari resep × harga rata-rata bahan saat ini".
- **Kelola menu:** tambah/edit nama & kategori (teks bebas + saran dari
  kategori yang sudah dipakai), aktif/nonaktif. Menu tidak dihapus permanen.
- **Kelola varian:** per menu: tambah/edit nama varian (Panas/Es/…), harga
  jual (integer rupiah), aktif/nonaktif. Setiap menu minimal satu varian —
  form tambah menu sekaligus membuat varian pertama.
- **Kelola resep:** per varian: baris bahan + takaran (`qty > 0`, satuan ikut
  bahan). Tambah/ubah/hapus baris. Satu bahan maksimal satu baris per varian
  (constraint DB sudah ada). Hanya bahan aktif yang bisa ditambahkan; bahan
  yang telanjur nonaktif di resep tetap tampil (ditandai nonaktif).
- **HPP per varian** = Σ(takaran × harga rata-rata bahan), dihitung di TS dari
  data live. Varian tanpa baris resep: HPP "—" + penanda "belum ada resep".

## Fungsi Uang (TS murni, TDD)

Di `web/src/lib/inventori.ts`, di-unit-test Vitest:

- `hitungRataRata(stokLama, rataLama, qtyBeli, totalBeli)` → harga rata-rata
  baru. Wajib lulus contoh spec induk: stok 500 gr @Rp100, beli 1000 gr
  total Rp130.000 → Rp120/gr. Edge: stok lama 0 (rata = total/qty); stok
  lama minus (diperlakukan 0, sama dengan fungsi SQL — tidak menghasilkan
  rata negatif); pembulatan ke 4 desimal (selaras `numeric(14,4)`).
- `hitungHPP(baris: {qty, hargaRata}[])` → HPP varian (2 desimal, selaras
  `numeric(12,2)`). Baris kosong → null (penanda "belum ada resep").
- Formula yang sama ditulis di fungsi SQL; angka di-test di TS agar formula
  tidak melenceng saat dipindah.

## Perbaikan Kecil Ikutan (follow-up review Rencana 1)

- Bungkus `getPengguna` dengan React `cache()` (kini terpanggil ~2×/request).
- Samakan istilah navigasi vs judul halaman (nav "Biaya"→halaman
  "Pengeluaran", nav "Akun"→halaman "Pengguna" — pilih satu istilah; ikuti
  tabel modul spec induk).
- Label login "Password" → "Kata sandi"; tambah `autoComplete` di input login.
- `getPengguna`: log `error` query (jangan telan diam-diam).
- Hapus SVG scaffold tak terpakai di `web/public/`.

## Pengujian

- **Unit (Vitest):** `hitungRataRata` (contoh spec, stok 0, stok minus,
  presisi), `hitungHPP` (normal, sebagian, kosong→null).
- **Verifikasi fungsi SQL** setelah `db push`: skenario belanja di SQL Editor
  (insert bahan uji → `catat_belanja` → cek stok/rata/purchases/movements →
  `catat_opname` → cek selisih) — dijalankan sebagai smoke test; user tanpa
  izin `stok` ditolak.
- **Build + manual:** alur lengkap di produksi — tambah bahan → belanja →
  rata berubah → buat menu+varian+resep → HPP tampil.

## Di Luar Cakupan (Rencana 2)

- Penjualan, potong stok saat jual, pembekuan HPP di transaksi, void → Rencana 3.
- Laporan & grafik → Rencana 3.
- Edit/hapus belanja historis → tidak dibuat (by design, koreksi via opname).
- Import/export data bahan atau menu.
