# Verifikasi Sesi Lokal via getClaims() — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghapus dua round-trip jaringan ke Supabase Auth per navigasi dengan mengganti `getUser()` → `getClaims()` (verifikasi JWT lokal) di proxy dan `getPengguna()`.

**Architecture:** Dua titik panggilan `supabase.auth.getUser()` diganti `supabase.auth.getClaims()`. Identitas diambil dari `claims.sub`/`claims.email`; seluruh logika redirect, query profil/izin, dan cek `profiles.aktif` tidak berubah. Spec: `docs/superpowers/specs/2026-07-25-auth-getclaims-design.md`.

**Tech Stack:** Next.js 16 (berkas middleware bernama `proxy.ts`), @supabase/ssr 0.12, @supabase/supabase-js 2.110 (sudah menyediakan `getClaims()`).

## Global Constraints

- Kerjakan dari direktori `web/` untuk semua perintah npm/npx.
- Komentar kode dan pesan commit dalam Bahasa Indonesia, gaya mengikuti kode sekitar.
- Ini Next.js 16 — konvensi bisa beda dari pengetahuanmu; bila ragu baca `web/node_modules/next/dist/docs/`.
- **Tidak ada unit test baru** (keputusan spec): project belum punya pola mock Supabase dan perubahan ini tidak menambah cabang logika. Siklus verifikasi per task = typecheck (`npx tsc --noEmit`), bukan test baru. TDD sengaja tidak dipakai di sini.
- Bentuk type `Pengguna` (`{ id, nama, izin }`) tidak boleh berubah.
- Setiap commit diakhiri trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: proxy.ts pakai getClaims()

**Files:**
- Modify: `web/src/proxy.ts:30-44`

**Interfaces:**
- Consumes: `supabase.auth.getClaims(): Promise<{ data: { claims, header, signature } | null, error }>` dari @supabase/supabase-js terpasang.
- Produces: tidak ada — perilaku eksternal proxy (redirect `/login` ↔ halaman terproteksi) tetap sama.

- [ ] **Step 1: Ganti blok getUser dengan getClaims**

Di `web/src/proxy.ts`, ganti blok ini (baris 30–44):

```ts
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const diLogin = request.nextUrl.pathname.startsWith("/login");
  if (!user && !diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
```

menjadi:

```ts
  // getClaims(): verifikasi JWT lokal (WebCrypto) bila project memakai signing
  // key asimetris; bila masih HS256 otomatis fallback verifikasi ke server.
  // Token yang di-revoke tetap lolos di sini sampai kedaluwarsa — gerbang
  // per-request-nya cek profiles.aktif di getPengguna().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const diLogin = request.nextUrl.pathname.startsWith("/login");
  if (!claims && !diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (claims && diLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
```

Bagian lain berkas (pembuatan client, cookies `getAll`/`setAll`, `config.matcher`) tidak disentuh.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0, tanpa output error.

- [ ] **Step 3: Commit**

```bash
git add web/src/proxy.ts
git commit -m "perf: proxy verifikasi sesi lokal via getClaims

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: getPengguna() pakai getClaims()

**Files:**
- Modify: `web/src/lib/auth.ts:8-34` (komentar `cache()` + fungsi `getPengguna`)

**Interfaces:**
- Consumes: `supabase.auth.getClaims()` (sama seperti Task 1); `claims.sub: string`, `claims.email?: string` dari type `JwtPayload`.
- Produces: `getPengguna(): Promise<Pengguna | null>` dengan bentuk `Pengguna` TIDAK berubah — `wajibIzin()` dan semua pemanggil tetap bekerja tanpa modifikasi.

- [ ] **Step 1: Ganti isi getPengguna**

Di `web/src/lib/auth.ts`, ganti komentar `cache()` beserta seluruh fungsi `getPengguna` (baris 8–34) menjadi:

```ts
// cache(): satu request satu kali query, walau dipanggil layout + page.
export const getPengguna = cache(async (): Promise<Pengguna | null> => {
  const supabase = await buatClientServer();
  // getClaims(): verifikasi JWT lokal, tanpa round-trip ke server Auth —
  // lihat catatan di proxy.ts.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const [profilRes, izinRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("nama, aktif")
      .eq("id", claims.sub)
      .single(),
    supabase
      .from("user_permissions")
      .select("permission")
      .eq("user_id", claims.sub),
  ]);
  if (profilRes.error) {
    console.error("getPengguna: gagal baca profil", profilRes.error);
  }
  if (izinRes.error) {
    console.error("getPengguna: gagal baca izin", izinRes.error);
  }

  // profiles.aktif = false berarti akses dicabut
  if (profilRes.data && profilRes.data.aktif === false) return null;

  return {
    id: claims.sub,
    nama: profilRes.data?.nama ?? claims.email ?? "Pengguna",
    izin: (izinRes.data ?? []).map((b) => b.permission),
  };
});
```

Import (`cache`, `redirect`, `buatClientServer`, `bolehAkses`), type `Pengguna`, dan fungsi `wajibIzin` di bawahnya tidak disentuh.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0, tanpa output error.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/auth.ts
git commit -m "perf: getPengguna pakai getClaims, pangkas satu round-trip auth

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Verifikasi menyeluruh

**Files:** tidak ada perubahan berkas — verifikasi saja.

**Interfaces:**
- Consumes: hasil Task 1 dan Task 2.
- Produces: bukti hijau untuk klaim selesai.

- [ ] **Step 1: Test suite lama tetap hijau**

Run: `cd web && npm test`
Expected: semua test PASS (suite: format, inventori, kasir, laporan, permissions), exit 0.

- [ ] **Step 2: Build produksi**

Run: `cd web && npm run build`
Expected: build sukses tanpa error type/lint.

- [ ] **Step 3: Lint**

Run: `cd web && npm run lint`
Expected: exit 0.

- [ ] **Step 4: Laporkan langkah manual ke user (bukan kerjaan agent)**

Sampaikan dua hal ini di laporan akhir — jangan dikerjakan sendiri:
1. Dashboard Supabase → Project Settings → JWT Keys: pastikan signing key ECC/RSA aktif (bukan Legacy HS256). Tanpa ini `getClaims()` fallback ke server — benar tapi belum hemat.
2. Smoke test: jalankan `npm run dev`, login, navigasi antar halaman, bandingkan angka `proxy.ts:` dan `application-code:` di log dengan angka sebelum perubahan.
