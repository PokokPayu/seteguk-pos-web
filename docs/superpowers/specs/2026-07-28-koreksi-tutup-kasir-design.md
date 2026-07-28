# Spec: Koreksi & Buka Kembali Tutup Kasir

**Tanggal:** 2026-07-28
**Status:** Disetujui

## Latar Belakang

Tutup kasir saat ini sekali jalan dan tidak bisa dikoreksi. `cash_closings`
punya `tanggal` bertipe `date not null unique`, dan RLS-nya hanya memberi
policy `select` + `insert` (`supabase/migrations/20260724000001_skema_awal.sql`).
Tidak ada policy `update` maupun `delete`, sehingga angka yang telanjur salah
bersifat permanen dari sisi aplikasi.

Dampaknya dua lapis:

1. **Laporan ikut salah.** `selisih` dibaca `laporan_harian` lewat
   `left join public.cash_closings c on c.tanggal = h.tanggal`
   (`20260724000004_fungsi_laporan.sql:56`) dan tampil sebagai kartu
   "Selisih tutup kasir" di halaman Laporan.
2. **Transaksi hari itu terkunci.** `void_penjualan` menolak pembatalan bila
   tanggal transaksi sudah tertutup (`20260724000003_fungsi_kasir.sql:130-134`).
   Kasir yang salah menekan "Tutup kasir" jam 3 sore membuat seluruh transaksi
   sisa hari itu tidak bisa dibatalkan sama sekali.

Kebutuhan yang diminta: pemilik ("superadmin") bisa **mengubah nominal** tutup
kasir dan **membuka kembali** hari yang telanjur ditutup.

## Keputusan Desain

| Pertanyaan | Keputusan | Alasan |
|---|---|---|
| Siapa yang boleh | Pemegang izin **`user`** | Tidak ada konsep "superadmin" di kode — model izin flat (`SEMUA_IZIN` di `web/src/lib/permissions.ts`). Pemegang `user` sudah bisa memberi/mencabut akses siapa pun, jadi dialah pemilik de-facto. Tidak menambah izin baru, dan `laporan` tetap menjadi satu-satunya izin lihat-saja. |
| Cakupan tanggal | **Tanpa batas** | Keputusan pemilik produk. Risiko (angka periode lampau bisa berubah kapan saja) diterima, dan diredam oleh log audit wajib-alasan. |
| Jejak perubahan | **Tabel log terpisah** `cash_closing_log` | Menyimpan nilai lama & baru, pelaku, waktu, alasan. Kolom `diubah_at` saja tidak cukup: perubahan kedua akan menimpa jejak yang pertama. |
| Bentuk aksi | **Dua aksi terpisah**: ubah nominal & buka kembali | Menggabungkan keduanya berarti setiap salah ketik sepele memaksa membuka kunci void — risiko jauh lebih besar dari masalah yang dipecahkan. |
| Letak UI | **Section di halaman Laporan** | Halaman Laporan sudah punya pemilih rentang tanggal dan sudah menampilkan `selisih_kasir` per hari. Koreksi terjadi persis di tempat angka salah itu terlihat. |
| Mekanisme "buka kembali" | **Hapus baris** `cash_closings` (setelah snapshot masuk log) | `void_penjualan` mengunci lewat `exists(...)` dan `laporan_harian` memakai `left join`. Menghapus baris otomatis membuka kunci void dan mengosongkan selisih hari itu, tanpa menyentuh keduanya. Alternatif kolom status menuntut perubahan di dua fungsi plus `unique` diubah jadi partial index. |

## Perubahan Database

Migrasi baru: `supabase/migrations/20260728000001_koreksi_tutup_kasir.sql`.

### 1. Tabel `cash_closing_log`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `tanggal` | date not null | Tanggal kasir yang dikoreksi, bukan tanggal aksi. Diindeks. |
| `aksi` | text not null | `check (aksi in ('ubah','buka','tutup_ulang'))` |
| `tunai_sistem_lama` | integer | null untuk aksi `tutup_ulang` |
| `tunai_fisik_lama` | integer | null untuk aksi `tutup_ulang` |
| `selisih_lama` | integer | null untuk aksi `tutup_ulang` |
| `tunai_sistem_baru` | integer | null untuk aksi `buka` |
| `tunai_fisik_baru` | integer | null untuk aksi `buka` |
| `selisih_baru` | integer | null untuk aksi `buka` |
| `alasan` | text not null | `check (length(btrim(alasan)) >= 3)` |
| `created_by` | uuid not null | references `profiles(id)` |
| `created_at` | timestamptz not null | default `now()` |

Baris log tidak pernah diubah maupun dihapus: tidak ada policy `update`/`delete`
untuk tabel ini.

### 2. RLS

**`cash_closings` sengaja tidak diberi policy `update` maupun `delete`.** Ketiga
RPC berjalan `security definer`, jadi mereka mengubah tabel sebagai pemilik dan
tidak butuh policy. Menambahkan policy justru membuka lubang: pemegang izin
`user` bisa memanggil Data API secara langsung (`.update()` / `.delete()`) dan
mengubah angka **tanpa** melewati penulisan log. Satu-satunya jalan masuk harus
RPC.

Dengan alasan yang sama, policy `"catat tutup kasir"` (insert) yang ada sekarang
**dihapus** di migrasi ini. Setelah `tutupKasir` beralih ke RPC, tidak ada lagi
kode yang melakukan insert langsung, dan membiarkannya berarti pemegang izin
`kasir` masih bisa menyisipkan penutupan lewat REST tanpa jejak.

```sql
drop policy "catat tutup kasir" on public.cash_closings;

-- cash_closing_log: hanya bisa dibaca; ditulis eksklusif lewat RPC
create policy "baca log tutup kasir" on public.cash_closing_log
  for select using (
    public.has_permission(auth.uid(), 'laporan')
    or public.has_permission(auth.uid(), 'user')
  );
```

Policy `"baca tutup kasir"` yang sudah ada tidak berubah — halaman Laporan
membaca `cash_closings` lewat klien biasa.

`has_permission` sudah ikut memeriksa `profiles.aktif`
(`20260724000007_aktif_di_has_permission.sql`), jadi pengguna nonaktif otomatis
tertolak di dalam RPC.

`grant` untuk role `authenticated` mengikuti pola blok "Hak akses Data API" di
`20260724000001_skema_awal.sql` — tabel dan fungsi baru harus di-grant eksplisit,
karena tanpa itu penolakan terjadi di lapisan privilege sebelum RLS dievaluasi.

### 3. Tiga RPC baru

Semuanya `security definer set search_path = public`, memeriksa izin `user`
sendiri di awal (`raise exception 'butuh izin user'`), dan menulis
`cash_closing_log` dalam transaksi yang sama dengan perubahannya — sehingga
tidak mungkin angka berubah tanpa log tertulis. Pola ini mengikuti
`catat_penjualan` dan `void_penjualan` yang sudah ada.

#### `ubah_tutup_kasir(p_tanggal date, p_tunai_fisik integer, p_alasan text)`

1. `select ... from cash_closings where tanggal = p_tanggal for update`.
   Tidak ditemukan → `raise exception 'tutup kasir tanggal ini sudah dibuka'`.
2. Hitung ulang `tunai_sistem` dari penjualan tunai berstatus `selesai` pada
   tanggal itu (WIB) — **bukan** memakai nilai tersimpan. `tunai_sistem` adalah
   angka turunan; menghitung ulang selalu konsisten dengan data penjualan.
3. Tolak bila `p_tunai_fisik` sama persis dengan nilai lama
   (`raise exception 'nominal tidak berubah'`).
4. `update` baris: `tunai_sistem`, `tunai_fisik`, `selisih = fisik - sistem`.
5. `insert` log `aksi='ubah'` dengan snapshot lama dan nilai baru.

#### `buka_kasir(p_tanggal date, p_alasan text)`

1. `select ... for update`; tidak ditemukan → `raise exception`.
2. `insert` log `aksi='buka'` berisi snapshot lama (kolom `*_baru` null).
3. `delete from cash_closings where tanggal = p_tanggal`.

#### `tutup_kasir(p_tanggal date, p_tunai_fisik integer, p_catatan text)`

Versi bertanggal dari logika yang kini ada di TypeScript
(`web/src/app/(app)/kasir/actions.ts:83-133`). Menghitung `tunai_sistem` dari
rentang `[p_tanggal 00:00 WIB, p_tanggal+1 00:00 WIB)`, lalu `insert` ke
`cash_closings`.

- Butuh izin `kasir` **atau** `user`. Kasir hanya boleh menutup tanggal hari ini
  (WIB); menutup tanggal lampau butuh izin `user`.
- Tanggal di masa depan ditolak.
- `unique_violation` (23505) → pesan "kasir tanggal ini sudah ditutup".
- Menulis log `aksi='tutup_ulang'` **hanya** bila untuk tanggal itu sudah pernah
  ada baris log sebelumnya (artinya ini penutupan ulang setelah dibuka).
  Penutupan pertama yang normal tidak mengotori log.

## Perubahan Aplikasi

### 1. `web/src/lib/kasir.ts`

Tambah `akhirHariJakarta(tanggal: string): string` dan generalisasi
`awalHariJakarta` menjadi menerima tanggal (`YYYY-MM-DD`), bukan hanya
`new Date()`. Dipakai untuk memvalidasi rentang di sisi TypeScript dan diuji
di batas tengah malam.

### 2. `web/src/app/(app)/kasir/actions.ts`

`tutupKasir` tidak lagi menghitung `tunai_sistem` sendiri; ia memanggil RPC
`tutup_kasir` dengan tanggal hari ini. Dengan begitu kasir dan pemilik memakai
satu jalur perhitungan yang sama.

### 3. `web/src/app/(app)/laporan/actions.ts` (baru)

Server action `ubahTutupKasir`, `bukaKasir`, `tutupKasirTanggal`. Semuanya
`await wajibIzin("user")`, memvalidasi input (integer ≥ 0, alasan ter-trim ≥ 3
karakter, format tanggal `YYYY-MM-DD`), memanggil RPC, mengembalikan
`HasilAksi` (`web/src/lib/aksi.ts`), lalu `revalidatePath("/laporan")` dan
`revalidatePath("/kasir")`.

### 4. `web/src/app/(app)/laporan/page.tsx`

Query tambahan: baris `cash_closings` + `cash_closing_log` untuk rentang
tanggal yang aktif, dijalankan bersama query yang sudah ada di `Promise.all`.
Merender section baru `<SectionTutupKasir>` di bawah kartu ringkasan, dan
meneruskan `bolehKoreksi = bolehAkses(pengguna.izin, "user")`.

Halaman ini kini butuh objek pengguna, jadi `await wajibIzin("laporan")`
dipakai nilai kembaliannya (fungsi ini memang sudah mengembalikan `Pengguna`).

### 5. `web/src/app/(app)/laporan/section-tutup-kasir.tsx` (baru)

Satu baris per tanggal dalam rentang, terbaru di atas:

```
Tutup kasir
─────────────────────────────────────────────
28 Jul   sistem 1.240.000   fisik 1.235.000   −5.000   Rina   [Ubah] [Buka kembali]
27 Jul   sistem   980.000   fisik   980.000        0   Rina   [Ubah] [Buka kembali]
26 Jul   belum ditutup                                        [Tutup kasir]
```

- Tanggal yang belum ditutup tetap muncul sebagai baris — inilah yang membuat
  alur "buka kembali → void → tutup ulang" selesai di satu tempat, sekaligus
  menandai hari yang lupa ditutup.
- Tabel tampil untuk semua pemegang `laporan`. Kolom tombol hanya dirender bila
  `bolehKoreksi`. Ini kerapian tampilan, bukan pengaman — RPC tetap memeriksa
  izin di server.
- Selisih negatif diberi warna `var(--merah)`, konsisten dengan
  `sheet-tutup-kasir.tsx`.

Tiga lembar aksi memakai komponen `Lembar` (`web/src/components/lembar.tsx`):

- **Ubah nominal** — tunai sistem hasil hitung ulang, input tunai fisik terisi
  nilai sekarang, preview selisih yang berubah saat diketik, alasan **wajib**.
- **Buka kembali** — konfirmasi dengan peringatan eksplisit: "Setelah dibuka,
  transaksi tanggal ini bisa dibatalkan (void) lagi dan selisih hari itu hilang
  dari laporan sampai ditutup ulang." Alasan wajib, tombol merah.
- **Tutup kasir (tanggal X)** — form yang sama dengan yang dipakai kasir.

Di bagian bawah tiap lembar: **riwayat tanggal tersebut** dari
`cash_closing_log`, mis. "Nominal diubah 350.000 → 380.000 — Arvin, 3 Agu,
'salah ketik nol'". Riwayat muncul di tempat keputusan diambil, bukan di halaman
terpisah yang tidak akan dibuka.

Sukses ditandai `toast` (`web/src/components/toast.tsx`), gagal ditampilkan
sebagai pesan merah di dalam lembar — sama seperti `KartuPengguna`.

### 6. Perapian: form tutup kasir dipakai bersama

`FormTutupKasir` (`web/src/app/(app)/kasir/sheet-tutup-kasir.tsx:12-93`)
diangkat menjadi komponen bersama yang menerima nilai awal, label tombol, dan
callback simpan — dipakai layar Kasir maupun section Laporan. Tanpa ini, logika
preview selisih dan validasi input tersalin dua kali dan pasti melenceng seiring
waktu. Sifat state-nya yang hidup-mati bersama mount (lihat komentar di berkas
itu) harus dipertahankan.

## Penanganan Error

| Situasi | Perilaku |
|---|---|
| Dua pengguna mengubah/membuka tanggal yang sama bersamaan | `select ... for update` di RPC menyerialkan keduanya. Yang kalah mendapat "Tutup kasir tanggal ini sudah dibuka oleh pengguna lain." |
| Alasan kosong / < 3 karakter setelah trim | Ditolak di server action **dan** di RPC. |
| `tunai_fisik` bukan integer ≥ 0 | Ditolak. |
| Nominal baru identik dengan yang lama | Ditolak, "Nominal tidak berubah." Mencegah log berisi baris tanpa makna. |
| Menutup tanggal di masa depan | Ditolak. |
| Menutup tanggal yang sudah tertutup | 23505 → "Kasir tanggal ini sudah ditutup." |
| Pengguna nonaktif | Tertolak lewat `has_permission` yang sudah memeriksa `profiles.aktif`. |

Kasus yang benar tanpa kode tambahan: buka kembali → void satu transaksi →
tutup ulang. Karena `tunai_sistem` dihitung ulang saat menutup, angkanya
menyesuaikan sendiri dengan penjualan yang tersisa.

## Pengujian

Proyek ini punya Vitest untuk logika murni saja (`web/src/lib/*.test.ts`), tanpa
infrastruktur uji terhadap database. Batas itu diakui eksplisit di sini.

**Ditulis sebagai unit test lebih dulu, sebelum implementasi:**

- Validasi alasan (kosong, spasi saja, 2 karakter, 3 karakter) dan nominal
  (negatif, pecahan, nol, sama dengan nilai lama).
- Perhitungan selisih.
- `awalHariJakarta` / `akhirHariJakarta` untuk satu tanggal, khususnya di batas
  tengah malam WIB dan pergantian bulan.
- Perumusan kalimat riwayat dari baris `cash_closing_log` (ketiga jenis aksi).

**Tidak tercakup uji otomatis — diverifikasi manual lewat checklist di rencana
implementasi:**

- RLS, isi RPC, dan atomisitas transaksi.
- Uji penting: login sebagai pengguna yang punya `laporan` tetapi **tanpa**
  `user`, lalu memanggil RPC langsung — harus ditolak server, bukan sekadar
  tombolnya tidak tampil.
- Uji bypass log: sebagai pemegang `user`, coba `.update()`, `.delete()`, dan
  `.insert()` langsung ke `cash_closings` lewat Data API — ketiganya harus
  ditolak, karena tidak ada policy untuk itu.
- Alur penuh: tutup → buka kembali → void satu transaksi → tutup ulang →
  periksa `selisih` di laporan dan isi `cash_closing_log`.

## Di Luar Cakupan

- Tidak ada izin baru (`koreksi`) — sudah dipertimbangkan dan ditolak; lihat
  tabel Keputusan Desain.
- Tidak ada halaman riwayat koreksi tersendiri; riwayat hidup di dalam lembar
  aksi.
- Tidak ada batas tanggal, notifikasi, atau alur persetujuan berjenjang.
