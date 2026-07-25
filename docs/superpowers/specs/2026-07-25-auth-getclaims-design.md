# Spec: Verifikasi Sesi Lokal via `getClaims()`

**Tanggal:** 2026-07-25
**Status:** Disetujui

## Latar Belakang

Setiap navigasi saat ini membayar dua panggilan jaringan ke Supabase Auth hanya
untuk memverifikasi sesi:

1. `supabase.auth.getUser()` di `web/src/proxy.ts` — 52–176 ms per request
   (terukur di log dev).
2. `supabase.auth.getUser()` di `getPengguna()` (`web/src/lib/auth.ts`) —
   round-trip pertama dalam rantai query tiap page load.

Region Supabase sudah Singapore (ap-southeast-1), jadi latensi tersisa adalah
round-trip verifikasi itu sendiri. `getClaims()` (tersedia sejak
supabase-js yang terpasang, v2.110.8) memverifikasi JWT secara lokal via
WebCrypto bila project memakai signing key asimetris — tanpa jaringan.

## Keputusan

Ganti `getUser()` → `getClaims()` di **kedua** titik (proxy dan `getPengguna`).

## Perubahan

### 1. `web/src/proxy.ts`

- `supabase.auth.getUser()` → `supabase.auth.getClaims()`.
- Penentu "sudah login": `data?.claims` (null/error = belum login),
  menggantikan `user`.
- Logika redirect dua arah (`/login` ↔ halaman terproteksi) tidak berubah.
- Refresh token tetap aman: `getClaims()` me-refresh sesi yang hampir
  kedaluwarsa, sehingga mekanisme `setAll` cookie tetap terpakai.

### 2. `web/src/lib/auth.ts` — `getPengguna()`

- `getUser()` → `getClaims()`; identitas dari `claims.sub` (user id) dan
  `claims.email` (fallback nama).
- Query paralel `profiles` + `user_permissions` dan cek `aktif === false`
  tetap sama persis — pengguna nonaktif tetap terusir walau token masih valid.
- Bentuk `Pengguna` tidak berubah; `wajibIzin()` dan pemanggil lain tak
  tersentuh.

## Penanganan Error

Sama seperti sekarang: claims tidak ada/error → proxy redirect ke `/login`;
`getPengguna` return `null` → layout redirect `/keluar`.

## Trade-off yang Diterima

Token yang di-revoke (logout di perangkat lain) tetap dianggap valid sampai
kedaluwarsa (jwt_expiry 3600 s). Dampak praktis kecil karena cek
`profiles.aktif` tetap berjalan per request dan RLS tetap melindungi data di
level database.

## Verifikasi

- `npm run build` (typecheck) dan `npm test` tetap hijau.
- Smoke test dev server: bandingkan angka `proxy.ts:` dan `application-code:`
  di log sebelum vs sesudah.
- Tidak ada unit test baru untuk `auth.ts`: belum ada pola mock Supabase di
  project dan perubahan ini tidak menambah cabang logika baru.

## Langkah Operasional (di luar kode, sekali saja)

Dashboard Supabase → Project Settings → JWT Keys: pastikan signing key
ECC/RSA aktif (bukan Legacy HS256). Sebelum migrasi itu, `getClaims()`
fallback verifikasi ke server — tetap benar, hanya belum hemat latensi.

## Di Luar Cakupan

- Tidak ada perubahan skema database maupun RLS.
- Tidak ada file baru (apple-touch-icon diputuskan tidak dibuat).
