# Rencana 2/3: Inventori & Menu — Stok, Belanja, Opname, Resep, HPP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul Stok Bahan (`/stok`) dan Menu & Resep (`/menu`) berfungsi penuh: kelola bahan, catat belanja dengan harga rata-rata bergerak atomik, stok opname, kelola menu/varian/resep dengan HPP live.

**Architecture:** Dua fungsi SQL `security definer` (`catat_belanja`, `catat_opname`) untuk mutasi stok atomik dengan cek izin internal; CRUD lain lewat server actions yang dijaga `wajibIzin` + RLS Rencana 1. Formula uang ditulis sebagai fungsi TS murni ber-unit-test yang juga dipakai preview UI. UI mengisi halaman placeholder memakai token desain Rencana 1.

**Tech Stack:** Next.js 16 (App Router, server actions, TS strict), Supabase (Postgres + RLS + RPC via @supabase/ssr), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-24-inventori-menu-design.md` (induk: `2026-07-24-seteguk-pos-design.md`)

## Global Constraints

- Semua copy UI Bahasa Indonesia, sentence case; istilah ikut spec induk (Stok Bahan, Menu & Resep, Pengeluaran, Pengguna).
- Izin: `/stok` = `wajibIzin("stok")`, `/menu` = `wajibIzin("menu")`. Fungsi SQL WAJIB mengecek `public.has_permission(auth.uid(), 'stok')` di dalamnya (security definer melewati RLS).
- Uang: total belanja & harga jual `integer` rupiah; harga rata-rata 4 desimal (selaras `numeric(14,4)`); HPP 2 desimal (selaras `numeric(12,2)`); stok/takaran 3 desimal (selaras `numeric(14,3)`).
- Formula rata-rata (identik TS & SQL): `rata_baru = (greatest(stok,0) × rata + total) / (greatest(stok,0) + qty)`.
- Belanja permanen: tidak ada edit/hapus belanja; koreksi lewat opname. Opname TIDAK mengubah harga rata-rata.
- Stok boleh minus — jangan pernah memblokir; tandai sebagai anomali untuk diopname.
- Bahan & menu tidak dihapus permanen — hanya dinonaktifkan (`aktif = false`).
- TypeScript strict, tanpa `any` — hasil query Supabase (untyped) di-cast ke tipe lokal di `jenis.ts`.
- Next.js 16: middleware bernama `web/src/proxy.ts` (JANGAN diubah); `cookies()`/`searchParams` async. Bila ragu API, baca `web/node_modules/next/dist/docs/`.
- `web/.env.local` berisi kredensial Supabase PRODUKSI asli. Dilarang menulis data uji lewat skrip; mutasi data hanya lewat UI produksi pada Task 8 (oleh user). Dilarang keras: `supabase db reset`.
- Setiap commit diakhiri baris: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Migrasi fungsi SQL `catat_belanja` & `catat_opname` + push

**Files:**
- Create: `supabase/migrations/20260724000002_fungsi_inventori.sql`

**Interfaces:**
- Consumes: tabel & fungsi migrasi `20260724000001_skema_awal.sql` (`ingredients`, `purchases`, `stock_movements`, `has_permission`).
- Produces: `public.catat_belanja(p_ingredient_id uuid, p_qty numeric, p_total_harga integer)` dan `public.catat_opname(p_ingredient_id uuid, p_stok_fisik numeric)` — dipanggil Task 5 lewat `supabase.rpc("catat_belanja", { p_ingredient_id, p_qty, p_total_harga })` dan `supabase.rpc("catat_opname", { p_ingredient_id, p_stok_fisik })`.

- [ ] **Step 1: Tulis migrasi**

Create `supabase/migrations/20260724000002_fungsi_inventori.sql`:

```sql
-- Fungsi mutasi stok atomik. security definer melewati RLS, maka izin
-- dicek eksplisit di dalam fungsi; baris bahan dikunci (for update) agar
-- dua input bersamaan tidak saling menimpa.

create or replace function public.catat_belanja(
  p_ingredient_id uuid,
  p_qty numeric,
  p_total_harga integer
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bahan public.ingredients%rowtype;
  v_purchase_id uuid;
  v_stok_dasar numeric;
  v_rata_baru numeric;
begin
  if not public.has_permission(auth.uid(), 'stok') then
    raise exception 'butuh izin stok';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'jumlah harus lebih dari 0';
  end if;
  if p_total_harga is null or p_total_harga <= 0 then
    raise exception 'total harga harus lebih dari 0';
  end if;

  select * into v_bahan
  from public.ingredients
  where id = p_ingredient_id and aktif
  for update;
  if not found then
    raise exception 'bahan tidak ditemukan atau nonaktif';
  end if;

  -- stok minus diperlakukan 0 agar rata-rata tidak terdistorsi (identik fungsi TS)
  v_stok_dasar := greatest(v_bahan.stok, 0);
  v_rata_baru := round(
    (v_stok_dasar * v_bahan.harga_rata + p_total_harga) / (v_stok_dasar + p_qty),
    4
  );

  update public.ingredients
  set stok = stok + p_qty, harga_rata = v_rata_baru
  where id = p_ingredient_id;

  insert into public.purchases (ingredient_id, qty, total_harga, created_by)
  values (p_ingredient_id, p_qty, p_total_harga, auth.uid())
  returning id into v_purchase_id;

  insert into public.stock_movements (ingredient_id, tipe, qty, ref_id, created_by)
  values (p_ingredient_id, 'belanja', p_qty, v_purchase_id, auth.uid());
end;
$$;

create or replace function public.catat_opname(
  p_ingredient_id uuid,
  p_stok_fisik numeric
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bahan public.ingredients%rowtype;
  v_selisih numeric;
begin
  if not public.has_permission(auth.uid(), 'stok') then
    raise exception 'butuh izin stok';
  end if;
  if p_stok_fisik is null or p_stok_fisik < 0 then
    raise exception 'stok fisik tidak boleh negatif';
  end if;

  select * into v_bahan
  from public.ingredients
  where id = p_ingredient_id and aktif
  for update;
  if not found then
    raise exception 'bahan tidak ditemukan atau nonaktif';
  end if;

  v_selisih := p_stok_fisik - v_bahan.stok;
  if v_selisih = 0 then
    return; -- tidak ada koreksi, tidak perlu baris ledger
  end if;

  update public.ingredients
  set stok = p_stok_fisik
  where id = p_ingredient_id;

  -- harga rata-rata TIDAK berubah: opname hanya koreksi kuantitas
  insert into public.stock_movements (ingredient_id, tipe, qty, ref_id, created_by)
  values (p_ingredient_id, 'opname', v_selisih, null, auth.uid());
end;
$$;

-- Grant eksplisit: migrasi awal hanya meng-grant fungsi yang ada saat itu.
revoke execute on function public.catat_belanja(uuid, numeric, integer) from public, anon;
revoke execute on function public.catat_opname(uuid, numeric) from public, anon;
grant execute on function public.catat_belanja(uuid, numeric, integer) to authenticated;
grant execute on function public.catat_opname(uuid, numeric) to authenticated;
```

- [ ] **Step 2: Sanity check nama file & isi**

```bash
ls supabase/migrations/
```
Expected: `20260724000001_skema_awal.sql` dan `20260724000002_fungsi_inventori.sql` (urutan benar: 000002 setelah 000001).

- [ ] **Step 3: Push ke Supabase hosted**

Project sudah ter-link (`supabase/.temp/project-ref` ada). Dari root repo:

```bash
npx supabase db push
```
Expected: `Applying migration 20260724000002_fungsi_inventori.sql... Finished supabase db push.`

Jika gagal karena kredensial/link (mis. "Access token not provided" / "Cannot find project ref"): JANGAN mencoba login/link dengan menebak — laporkan BLOCKED; user yang menjalankan `npx supabase login` lalu ulangi push. Push boleh tertunda: Task 2–7 tidak bergantung pada fungsi ini di runtime build/test.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260724000002_fungsi_inventori.sql
git commit -m "feat: fungsi SQL atomik catat_belanja & catat_opname

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Fungsi uang & format (TDD)

**Files:**
- Create: `web/src/lib/inventori.ts`
- Create: `web/src/lib/inventori.test.ts`
- Modify: `web/src/lib/format.ts`
- Modify: `web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: —
- Produces (dipakai Task 4, 5, 7):
  - `hitungRataRata(stokLama: number, rataLama: number, qtyBeli: number, totalBeli: number): number` — harga rata-rata baru, 4 desimal.
  - `hitungHPP(baris: { qty: number; hargaRata: number }[]): number | null` — HPP varian 2 desimal; `null` jika baris kosong (penanda "belum ada resep").
  - `formatJumlah(n: number): string` — angka kuantitas gaya id-ID, maks 3 desimal, minus tipografis (mis. `1.500`, `0,5`, `−100`).
  - `formatRupiahDesimal(n: number): string` — rupiah dengan maks 2 desimal untuk harga rata-rata/HPP (mis. `Rp120`, `Rp66,67`).

- [ ] **Step 1: Tulis test yang gagal**

Create `web/src/lib/inventori.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hitungHPP, hitungRataRata } from "./inventori";

describe("hitungRataRata", () => {
  it("contoh spec: stok 500 @Rp100, beli 1000 total Rp130.000 -> Rp120", () => {
    expect(hitungRataRata(500, 100, 1000, 130000)).toBe(120);
  });
  it("stok lama 0: rata = total / qty", () => {
    expect(hitungRataRata(0, 0, 200, 50000)).toBe(250);
  });
  it("stok lama minus diperlakukan 0", () => {
    expect(hitungRataRata(-50, 100, 200, 50000)).toBe(250);
  });
  it("membulatkan ke 4 desimal", () => {
    expect(hitungRataRata(3, 100, 7, 1000)).toBe(130);
    expect(hitungRataRata(1, 100, 2, 100)).toBe(66.6667);
  });
});

describe("hitungHPP", () => {
  it("menjumlahkan qty × harga rata-rata", () => {
    expect(
      hitungHPP([
        { qty: 18, hargaRata: 120 },
        { qty: 30, hargaRata: 50 },
      ])
    ).toBe(3660);
  });
  it("resep sebagian tetap dihitung dari bahan terdaftar", () => {
    expect(hitungHPP([{ qty: 15, hargaRata: 120 }])).toBe(1800);
  });
  it("tanpa baris -> null (belum ada resep)", () => {
    expect(hitungHPP([])).toBeNull();
  });
  it("membulatkan ke 2 desimal", () => {
    expect(hitungHPP([{ qty: 1, hargaRata: 0.333 }])).toBe(0.33);
  });
});
```

Tambahkan di AKHIR `web/src/lib/format.test.ts` (import di baris atas diganti):

```ts
import { describe, expect, it } from "vitest";
import { formatJumlah, formatRupiah, formatRupiahDesimal } from "./format";
```

```ts
describe("formatJumlah", () => {
  it("ribuan gaya id-ID", () => {
    expect(formatJumlah(1500)).toBe("1.500");
  });
  it("desimal koma", () => {
    expect(formatJumlah(0.5)).toBe("0,5");
  });
  it("maksimal 3 desimal", () => {
    expect(formatJumlah(12.345)).toBe("12,345");
  });
  it("minus tipografis", () => {
    expect(formatJumlah(-100)).toBe("−100");
  });
});

describe("formatRupiahDesimal", () => {
  it("bilangan bulat tanpa desimal", () => {
    expect(formatRupiahDesimal(120)).toBe("Rp120");
  });
  it("maksimal 2 desimal, koma id-ID", () => {
    expect(formatRupiahDesimal(66.6667)).toBe("Rp66,67");
  });
  it("ribuan dengan titik", () => {
    expect(formatRupiahDesimal(1234.5)).toBe("Rp1.234,5");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd web && npm test
```
Expected: FAIL — `Cannot find module './inventori'` dan `formatJumlah is not a function` (atau serupa).

- [ ] **Step 3: Implementasi**

Create `web/src/lib/inventori.ts`:

```ts
export function hitungRataRata(
  stokLama: number,
  rataLama: number,
  qtyBeli: number,
  totalBeli: number
): number {
  // stok minus diperlakukan 0 agar rata-rata tidak terdistorsi (identik fungsi SQL)
  const stok = Math.max(stokLama, 0);
  const rata = (stok * rataLama + totalBeli) / (stok + qtyBeli);
  return Math.round(rata * 10000) / 10000;
}

export function hitungHPP(
  baris: { qty: number; hargaRata: number }[]
): number | null {
  if (baris.length === 0) return null;
  const total = baris.reduce((s, b) => s + b.qty * b.hargaRata, 0);
  return Math.round(total * 100) / 100;
}
```

Tambahkan di AKHIR `web/src/lib/format.ts`:

```ts
export function formatJumlah(n: number): string {
  return n
    .toLocaleString("id-ID", { maximumFractionDigits: 3 })
    .replace("-", "−");
}

export function formatRupiahDesimal(n: number): string {
  return `Rp${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
cd web && npm test
```
Expected: 25 passed (10 lama + 8 inventori + 7 format baru).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inventori.ts web/src/lib/inventori.test.ts web/src/lib/format.ts web/src/lib/format.test.ts
git commit -m "feat: hitungRataRata, hitungHPP, formatJumlah, formatRupiahDesimal (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Perbaikan ikutan review Rencana 1

**Files:**
- Modify: `web/src/lib/auth.ts` (cache + log error)
- Modify: `web/src/lib/nav.ts` (label Biaya→Pengeluaran, Akun→Pengguna)
- Modify: `web/src/app/login/page.tsx` (label "Kata sandi", autoComplete)
- Delete: `web/public/next.svg`, `web/public/vercel.svg`, `web/public/file.svg`, `web/public/globe.svg`, `web/public/window.svg`

**Interfaces:**
- Consumes: `getPengguna`/`wajibIzin` yang sudah ada (perilaku & signature TIDAK berubah — hanya dibungkus `cache()` dan menambah logging).
- Produces: sama seperti sebelumnya; konsumen (layout, halaman) tidak perlu diubah.

- [ ] **Step 1: auth.ts — cache() + log error**

Ganti seluruh isi `web/src/lib/auth.ts` dengan:

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";
import { bolehAkses, type Izin } from "@/lib/permissions";

export type Pengguna = { id: string; nama: string; izin: string[] };

// cache(): satu request satu kali query, walau dipanggil layout + page.
export const getPengguna = cache(async (): Promise<Pengguna | null> => {
  const supabase = await buatClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profilRes, izinRes] = await Promise.all([
    supabase.from("profiles").select("nama").eq("id", user.id).single(),
    supabase.from("user_permissions").select("permission").eq("user_id", user.id),
  ]);
  if (profilRes.error) {
    console.error("getPengguna: gagal baca profil", profilRes.error);
  }
  if (izinRes.error) {
    console.error("getPengguna: gagal baca izin", izinRes.error);
  }

  return {
    id: user.id,
    nama: profilRes.data?.nama ?? user.email ?? "Pengguna",
    izin: (izinRes.data ?? []).map((b) => b.permission),
  };
});

export async function wajibIzin(butuh: Izin): Promise<Pengguna> {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  if (!bolehAkses(pengguna.izin, butuh)) redirect("/");
  return pengguna;
}
```

- [ ] **Step 2: nav.ts — samakan istilah**

Ganti seluruh isi `web/src/lib/nav.ts` dengan:

```ts
import { bolehAkses, type Izin } from "./permissions";

export const ITEM_NAV: { href: string; label: string; izin: Izin }[] = [
  { href: "/kasir", label: "Kasir", izin: "kasir" },
  { href: "/stok", label: "Stok", izin: "stok" },
  { href: "/pengeluaran", label: "Pengeluaran", izin: "biaya" },
  { href: "/laporan", label: "Laporan", izin: "laporan" },
  { href: "/menu", label: "Menu", izin: "menu" },
  { href: "/pengguna", label: "Pengguna", izin: "user" },
];

export function filterNav(dimiliki: readonly string[]) {
  return ITEM_NAV.filter((item) => bolehAkses(dimiliki, item.izin));
}
```

(Catatan: "Stok" & "Menu" dipertahankan sebagai bentuk pendek istilah yang sama; "Biaya"→"Pengeluaran" dan "Akun"→"Pengguna" adalah kata berbeda sehingga diganti.)

- [ ] **Step 3: Login — label & autoComplete**

Di `web/src/app/login/page.tsx`, ganti blok input Email:

```tsx
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
```

dan ganti label + input Password menjadi:

```tsx
        <label className="mt-3 block text-sm font-semibold text-[#7A7260]">
          Kata sandi
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
```

(Pesan error "Email atau password salah. Coba lagi." ganti menjadi "Email atau kata sandi salah. Coba lagi.")

- [ ] **Step 4: Hapus SVG scaffold**

```bash
git rm web/public/next.svg web/public/vercel.svg web/public/file.svg web/public/globe.svg web/public/window.svg
```

- [ ] **Step 5: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 25 passed; build sukses tanpa error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: cache getPengguna, istilah nav konsisten, label kata sandi, bersihkan svg

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Stok — daftar & kelola bahan

**Files:**
- Create: `web/src/lib/aksi.ts`
- Create: `web/src/components/lembar.tsx`
- Create: `web/src/app/(app)/stok/jenis.ts`
- Create: `web/src/app/(app)/stok/actions.ts`
- Create: `web/src/app/(app)/stok/form-bahan.tsx`
- Modify: `web/src/app/(app)/stok/page.tsx` (ganti placeholder)

**Interfaces:**
- Consumes: `wajibIzin` (auth), `buatClientServer` (supabase), `formatJumlah`, `formatRupiahDesimal` (Task 2).
- Produces (dipakai Task 5, 6, 7):
  - `type HasilAksi = { ok: true } | { ok: false; pesan: string }` di `web/src/lib/aksi.ts`.
  - Komponen `Lembar({ buka, judul, onTutup, children })` di `web/src/components/lembar.tsx`.
  - `type Bahan = { id: string; nama: string; satuan: string; stok: number; harga_rata: number; min_stok: number; aktif: boolean }` di `stok/jenis.ts`.
  - Server actions `simpanBahan(formData): Promise<HasilAksi>`, `setAktifBahan(id, aktif): Promise<HasilAksi>`.

- [ ] **Step 1: Tipe hasil aksi & tipe bahan**

Create `web/src/lib/aksi.ts`:

```ts
export type HasilAksi = { ok: true } | { ok: false; pesan: string };
```

Create `web/src/app/(app)/stok/jenis.ts`:

```ts
export type Bahan = {
  id: string;
  nama: string;
  satuan: string;
  stok: number;
  harga_rata: number;
  min_stok: number;
  aktif: boolean;
};
```

- [ ] **Step 2: Komponen Lembar (sheet bawah / dialog)**

Create `web/src/components/lembar.tsx`:

```tsx
"use client";

export function Lembar({
  buka,
  judul,
  onTutup,
  children,
}: {
  buka: boolean;
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
}) {
  if (!buka) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onTutup}>
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="display text-lg">{judul}</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--pudar)] hover:bg-[var(--kertas)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Server actions bahan**

Create `web/src/app/(app)/stok/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanBahan(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const id = String(formData.get("id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const satuan = String(formData.get("satuan") ?? "").trim();
  const minStok = Number(formData.get("min_stok") ?? 0);
  if (!nama || !satuan) {
    return { ok: false, pesan: "Nama dan satuan wajib diisi." };
  }
  if (!Number.isFinite(minStok) || minStok < 0) {
    return { ok: false, pesan: "Batas minimum tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = id
    ? await supabase
        .from("ingredients")
        .update({ nama, satuan, min_stok: minStok })
        .eq("id", id)
    : await supabase
        .from("ingredients")
        .insert({ nama, satuan, min_stok: minStok });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}

export async function setAktifBahan(
  id: string,
  aktif: boolean
): Promise<HasilAksi> {
  await wajibIzin("stok");
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("ingredients")
    .update({ aktif })
    .eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}
```

- [ ] **Step 4: Form bahan (tambah/ubah/nonaktifkan)**

Create `web/src/app/(app)/stok/form-bahan.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { setAktifBahan, simpanBahan } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormBahan({ bahan }: { bahan?: Bahan }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await simpanBahan(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function gantiAktif() {
    if (!bahan) return;
    setSibuk(true);
    const hasil = await setAktifBahan(bahan.id, !bahan.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={
          bahan
            ? "text-sm font-semibold text-[var(--hijau)] underline"
            : "rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
        }
      >
        {bahan ? "Ubah" : "+ Tambah bahan"}
      </button>
      <Lembar
        buka={buka}
        judul={bahan ? `Ubah ${bahan.nama}` : "Tambah bahan"}
        onTutup={() => setBuka(false)}
      >
        <form onSubmit={kirim}>
          {bahan ? <input type="hidden" name="id" value={bahan.id} /> : null}
          <label className={kelasLabel}>
            Nama
            <input name="nama" required defaultValue={bahan?.nama ?? ""} className={kelasInput} />
          </label>
          <label className={kelasLabel}>
            Satuan
            <input
              name="satuan"
              required
              defaultValue={bahan?.satuan ?? ""}
              list="saran-satuan"
              className={kelasInput}
            />
          </label>
          <datalist id="saran-satuan">
            <option value="gram" />
            <option value="ml" />
            <option value="pcs" />
            <option value="butir" />
          </datalist>
          <label className={kelasLabel}>
            Batas minimum stok
            <input
              name="min_stok"
              type="number"
              step="0.001"
              min="0"
              defaultValue={bahan ? String(bahan.min_stok) : "0"}
              className={kelasInput}
            />
          </label>
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan
          </button>
          {bahan ? (
            <button
              type="button"
              onClick={gantiAktif}
              disabled={sibuk}
              className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)]"
            >
              {bahan.aktif ? "Nonaktifkan bahan" : "Aktifkan lagi"}
            </button>
          ) : null}
        </form>
      </Lembar>
    </>
  );
}
```

- [ ] **Step 5: Halaman stok (daftar bahan)**

Ganti seluruh isi `web/src/app/(app)/stok/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatJumlah, formatRupiahDesimal } from "@/lib/format";
import { FormBahan } from "./form-bahan";
import type { Bahan } from "./jenis";

export default async function HalamanStok() {
  await wajibIzin("stok");
  const supabase = await buatClientServer();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, nama, satuan, stok, harga_rata, min_stok, aktif")
    .order("nama");
  if (error) throw new Error(`Gagal memuat bahan: ${error.message}`);
  const semua = (data ?? []) as Bahan[];
  const aktif = semua.filter((b) => b.aktif);
  const nonaktif = semua.filter((b) => !b.aktif);
  const urut = [
    ...aktif.filter((b) => b.stok <= b.min_stok),
    ...aktif.filter((b) => b.stok > b.min_stok),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Stok Bahan</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            Bahan di bawah batas minimum tampil paling atas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormBahan />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--garis)] text-left text-xs uppercase tracking-wide text-[var(--pudar)]">
              <th className="px-3 py-2">Bahan</th>
              <th className="px-3 py-2 text-right">Stok</th>
              <th className="px-3 py-2 text-right">Batas min</th>
              <th className="px-3 py-2 text-right">Harga rata-rata</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {urut.map((b) => {
              const menipis = b.stok <= b.min_stok;
              return (
                <tr key={b.id} className="border-b border-[var(--garis)] last:border-0">
                  <td className="px-3 py-2 font-semibold">
                    {b.nama}
                    {menipis ? (
                      <span className="ml-2 rounded bg-[#F9E9E4] px-1.5 py-0.5 text-[11px] font-bold text-[var(--merah)]">
                        {b.stok < 0 ? "minus — perlu opname" : "menipis"}
                      </span>
                    ) : null}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatJumlah(b.stok)} {b.satuan}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatJumlah(b.min_stok)} {b.satuan}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatRupiahDesimal(b.harga_rata)}/{b.satuan}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <FormBahan bahan={b} />
                  </td>
                </tr>
              );
            })}
            {urut.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--pudar)]">
                  Belum ada bahan. Tambahkan lewat tombol “+ Tambah bahan”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {nonaktif.length > 0 ? (
        <details className="mt-3 text-sm text-[var(--pudar)]">
          <summary className="cursor-pointer">Bahan nonaktif ({nonaktif.length})</summary>
          <ul className="mt-2 space-y-1">
            {nonaktif.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2"
              >
                <span>{b.nama}</span>
                <FormBahan bahan={b} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Test + build + smoke**

```bash
cd web && npm test && npm run build
```
Expected: 25 passed; build sukses; route `/stok` tetap ƒ (dynamic).

Dev smoke (tanpa login, hanya memastikan tidak 500):

```bash
cd web && npm run dev
```
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/stok` → Expected: `307` (redirect ke /login). Hentikan dev server.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/aksi.ts web/src/components/lembar.tsx "web/src/app/(app)/stok"
git commit -m "feat: stok — daftar bahan, tambah/ubah/nonaktif, penanda menipis

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Stok — catat belanja & opname

**Files:**
- Modify: `web/src/app/(app)/stok/actions.ts` (tambah `catatBelanja`, `catatOpname`)
- Create: `web/src/app/(app)/stok/form-belanja.tsx`
- Create: `web/src/app/(app)/stok/form-opname.tsx`
- Modify: `web/src/app/(app)/stok/page.tsx` (pasang kedua form di header)

**Interfaces:**
- Consumes: RPC `catat_belanja`/`catat_opname` (Task 1), `hitungRataRata`, `formatJumlah`, `formatRupiahDesimal` (Task 2), `Lembar`, `Bahan`, `HasilAksi` (Task 4).
- Produces: server actions `catatBelanja(formData): Promise<HasilAksi>`, `catatOpname(formData): Promise<HasilAksi>`.

- [ ] **Step 1: Tambah server actions**

Tambahkan di AKHIR `web/src/app/(app)/stok/actions.ts`:

```ts
export async function catatBelanja(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const qty = Number(formData.get("qty"));
  const total = Number(formData.get("total_harga"));
  if (!ingredientId) return { ok: false, pesan: "Pilih bahan dulu." };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, pesan: "Jumlah harus lebih dari 0." };
  }
  if (!Number.isInteger(total) || total <= 0) {
    return { ok: false, pesan: "Total harga harus bilangan bulat lebih dari 0." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("catat_belanja", {
    p_ingredient_id: ingredientId,
    p_qty: qty,
    p_total_harga: total,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}

export async function catatOpname(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const fisik = Number(formData.get("stok_fisik"));
  if (!ingredientId) return { ok: false, pesan: "Pilih bahan dulu." };
  if (!Number.isFinite(fisik) || fisik < 0) {
    return { ok: false, pesan: "Stok fisik tidak boleh negatif." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("catat_opname", {
    p_ingredient_id: ingredientId,
    p_stok_fisik: fisik,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}
```

- [ ] **Step 2: Form belanja dengan preview rata-rata baru**

Create `web/src/app/(app)/stok/form-belanja.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatRupiahDesimal } from "@/lib/format";
import { hitungRataRata } from "@/lib/inventori";
import { catatBelanja } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormBelanja({ bahan }: { bahan: Bahan[] }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [idBahan, setIdBahan] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");

  const pilihan = bahan.find((b) => b.id === idBahan);
  const preview = useMemo(() => {
    const q = Number(qty);
    const t = Number(total);
    if (!pilihan || !Number.isFinite(q) || q <= 0 || !Number.isFinite(t) || t <= 0) {
      return null;
    }
    return hitungRataRata(pilihan.stok, pilihan.harga_rata, q, t);
  }, [pilihan, qty, total]);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatBelanja(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setIdBahan("");
      setQty("");
      setTotal("");
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
      >
        + Catat belanja
      </button>
      <Lembar buka={buka} judul="Catat belanja bahan" onTutup={() => setBuka(false)}>
        <form onSubmit={kirim}>
          <label className={kelasLabel}>
            Bahan
            <select
              name="ingredient_id"
              required
              value={idBahan}
              onChange={(e) => setIdBahan(e.target.value)}
              className={kelasInput}
            >
              <option value="">— pilih —</option>
              {bahan.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama} ({b.satuan})
                </option>
              ))}
            </select>
          </label>
          <label className={kelasLabel}>
            Jumlah{pilihan ? ` (${pilihan.satuan})` : ""}
            <input
              name="qty"
              type="number"
              step="0.001"
              min="0.001"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={kelasInput}
            />
          </label>
          <label className={kelasLabel}>
            Total harga (Rp)
            <input
              name="total_harga"
              type="number"
              step="1"
              min="1"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={kelasInput}
            />
          </label>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--garis)] pt-3 text-sm">
            <span className="text-[var(--pudar)]">Harga rata-rata baru</span>
            <b className="uang">
              {preview !== null && pilihan
                ? `${formatRupiahDesimal(preview)}/${pilihan.satuan}`
                : "—"}
            </b>
          </div>
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan belanja
          </button>
          <p className="mt-2 text-[11px] text-[var(--pudar)]">
            Belanja tidak bisa diubah setelah disimpan — salah input dikoreksi lewat stok opname.
          </p>
        </form>
      </Lembar>
    </>
  );
}
```

- [ ] **Step 3: Form opname dengan preview selisih**

Create `web/src/app/(app)/stok/form-opname.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatJumlah } from "@/lib/format";
import { catatOpname } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormOpname({ bahan }: { bahan: Bahan[] }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [idBahan, setIdBahan] = useState("");
  const [fisik, setFisik] = useState("");

  const pilihan = bahan.find((b) => b.id === idBahan);
  const angkaFisik = Number(fisik);
  const selisih =
    pilihan && fisik !== "" && Number.isFinite(angkaFisik) && angkaFisik >= 0
      ? angkaFisik - pilihan.stok
      : null;

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatOpname(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setIdBahan("");
      setFisik("");
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--enamel)]"
      >
        Stok opname
      </button>
      <Lembar buka={buka} judul="Stok opname" onTutup={() => setBuka(false)}>
        <form onSubmit={kirim}>
          <label className={kelasLabel}>
            Bahan
            <select
              name="ingredient_id"
              required
              value={idBahan}
              onChange={(e) => setIdBahan(e.target.value)}
              className={kelasInput}
            >
              <option value="">— pilih —</option>
              {bahan.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama} — catatan: {formatJumlah(b.stok)} {b.satuan}
                </option>
              ))}
            </select>
          </label>
          <label className={kelasLabel}>
            Hasil hitung fisik{pilihan ? ` (${pilihan.satuan})` : ""}
            <input
              name="stok_fisik"
              type="number"
              step="0.001"
              min="0"
              required
              value={fisik}
              onChange={(e) => setFisik(e.target.value)}
              className={kelasInput}
            />
          </label>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--garis)] pt-3 text-sm">
            <span className="text-[var(--pudar)]">Selisih dari catatan</span>
            <b
              className={`uang ${
                selisih !== null && selisih < 0 ? "text-[var(--merah)]" : ""
              }`}
            >
              {selisih !== null && pilihan
                ? `${selisih > 0 ? "+" : ""}${formatJumlah(selisih)} ${pilihan.satuan}`
                : "—"}
            </b>
          </div>
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan opname
          </button>
          <p className="mt-2 text-[11px] text-[var(--pudar)]">
            Harga rata-rata tidak berubah — opname hanya mengoreksi jumlah stok.
          </p>
        </form>
      </Lembar>
    </>
  );
}
```

- [ ] **Step 4: Pasang di halaman**

Di `web/src/app/(app)/stok/page.tsx`, tambahkan dua import setelah import `FormBahan`:

```tsx
import { FormBelanja } from "./form-belanja";
import { FormOpname } from "./form-opname";
```

dan ganti blok tombol header:

```tsx
        <div className="flex flex-wrap gap-2">
          <FormOpname bahan={aktif} />
          <FormBelanja bahan={aktif} />
          <FormBahan />
        </div>
```

(`aktif` sudah ada di halaman — daftar bahan aktif terurut nama; hanya bahan aktif yang bisa dibelanjakan/diopname, selaras validasi `and aktif` di fungsi SQL.)

- [ ] **Step 5: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 25 passed; build sukses tanpa error/warning.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/(app)/stok"
git commit -m "feat: stok — catat belanja (preview rata-rata) & opname (preview selisih)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Menu — kelola menu & varian

**Files:**
- Create: `web/src/app/(app)/menu/jenis.ts`
- Create: `web/src/app/(app)/menu/actions.ts`
- Create: `web/src/app/(app)/menu/form-menu.tsx`
- Create: `web/src/app/(app)/menu/form-varian.tsx`
- Modify: `web/src/app/(app)/menu/page.tsx` (ganti placeholder)

**Interfaces:**
- Consumes: `wajibIzin`, `buatClientServer`, `formatRupiah`, `Lembar`, `HasilAksi`.
- Produces (dipakai Task 7):
  - Tipe di `menu/jenis.ts`: `Produk { id; nama; kategori; aktif }`, `Varian { id; product_id; nama; harga; aktif }`, `BarisResep { id; variant_id; ingredient_id; qty }`, `BahanResep { id; nama; satuan; harga_rata; aktif }`.
  - Server actions `simpanMenu`, `setAktifMenu`, `simpanVarian`, `setAktifVarian` (semua `Promise<HasilAksi>`).

- [ ] **Step 1: Tipe menu**

Create `web/src/app/(app)/menu/jenis.ts`:

```ts
export type Produk = {
  id: string;
  nama: string;
  kategori: string;
  aktif: boolean;
};

export type Varian = {
  id: string;
  product_id: string;
  nama: string;
  harga: number;
  aktif: boolean;
};

export type BarisResep = {
  id: string;
  variant_id: string;
  ingredient_id: string;
  qty: number;
};

export type BahanResep = {
  id: string;
  nama: string;
  satuan: string;
  harga_rata: number;
  aktif: boolean;
};
```

- [ ] **Step 2: Server actions menu & varian**

Create `web/src/app/(app)/menu/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanMenu(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("menu");
  const id = String(formData.get("id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const kategori = String(formData.get("kategori") ?? "").trim();
  if (!nama || !kategori) {
    return { ok: false, pesan: "Nama dan kategori wajib diisi." };
  }

  const supabase = await buatClientServer();

  if (id) {
    const { error } = await supabase
      .from("products")
      .update({ nama, kategori })
      .eq("id", id);
    if (error) return { ok: false, pesan: error.message };
  } else {
    const namaVarian = String(formData.get("nama_varian") ?? "").trim();
    const harga = Number(formData.get("harga"));
    if (!namaVarian) {
      return { ok: false, pesan: "Nama varian pertama wajib diisi." };
    }
    if (!Number.isInteger(harga) || harga < 0) {
      return { ok: false, pesan: "Harga tidak valid." };
    }
    const { data: produk, error } = await supabase
      .from("products")
      .insert({ nama, kategori })
      .select("id")
      .single();
    if (error || !produk) {
      return { ok: false, pesan: error?.message ?? "Gagal membuat menu." };
    }
    const { error: errVarian } = await supabase
      .from("product_variants")
      .insert({ product_id: produk.id, nama: namaVarian, harga });
    if (errVarian) {
      // varian pertama gagal: hapus produk yatim agar aturan "minimal satu varian" terjaga
      await supabase.from("products").delete().eq("id", produk.id);
      return { ok: false, pesan: errVarian.message };
    }
  }
  revalidatePath("/menu");
  return { ok: true };
}

export async function setAktifMenu(id: string, aktif: boolean): Promise<HasilAksi> {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const { error } = await supabase.from("products").update({ aktif }).eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}

export async function simpanVarian(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("menu");
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const harga = Number(formData.get("harga"));
  if (!nama) return { ok: false, pesan: "Nama varian wajib diisi." };
  if (!Number.isInteger(harga) || harga < 0) {
    return { ok: false, pesan: "Harga tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = id
    ? await supabase.from("product_variants").update({ nama, harga }).eq("id", id)
    : await supabase
        .from("product_variants")
        .insert({ product_id: productId, nama, harga });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}

export async function setAktifVarian(id: string, aktif: boolean): Promise<HasilAksi> {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("product_variants")
    .update({ aktif })
    .eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}
```

- [ ] **Step 3: Form menu (tambah dengan varian pertama / ubah / nonaktif)**

Create `web/src/app/(app)/menu/form-menu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { setAktifMenu, simpanMenu } from "./actions";
import type { Produk } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormMenu({
  menu,
  kategoriAda,
}: {
  menu?: Produk;
  kategoriAda: string[];
}) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await simpanMenu(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function gantiAktif() {
    if (!menu) return;
    setSibuk(true);
    const hasil = await setAktifMenu(menu.id, !menu.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={
          menu
            ? "text-sm font-semibold text-[var(--hijau)] underline"
            : "rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
        }
      >
        {menu ? "Ubah" : "+ Tambah menu"}
      </button>
      <Lembar
        buka={buka}
        judul={menu ? `Ubah ${menu.nama}` : "Tambah menu"}
        onTutup={() => setBuka(false)}
      >
        <form onSubmit={kirim}>
          {menu ? <input type="hidden" name="id" value={menu.id} /> : null}
          <label className={kelasLabel}>
            Nama menu
            <input name="nama" required defaultValue={menu?.nama ?? ""} className={kelasInput} />
          </label>
          <label className={kelasLabel}>
            Kategori
            <input
              name="kategori"
              required
              defaultValue={menu?.kategori ?? ""}
              list="saran-kategori"
              className={kelasInput}
            />
          </label>
          <datalist id="saran-kategori">
            {kategoriAda.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          {menu ? null : (
            <>
              <p className="mt-4 border-t border-[var(--garis)] pt-3 text-sm font-bold text-[var(--hijau-tua)]">
                Varian pertama
              </p>
              <label className={kelasLabel}>
                Nama varian (mis. Panas / Es)
                <input name="nama_varian" required className={kelasInput} />
              </label>
              <label className={kelasLabel}>
                Harga jual (Rp)
                <input name="harga" type="number" step="1" min="0" required className={kelasInput} />
              </label>
            </>
          )}
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan
          </button>
          {menu ? (
            <button
              type="button"
              onClick={gantiAktif}
              disabled={sibuk}
              className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)]"
            >
              {menu.aktif ? "Nonaktifkan menu" : "Aktifkan lagi"}
            </button>
          ) : null}
        </form>
      </Lembar>
    </>
  );
}
```

- [ ] **Step 4: Form varian**

Create `web/src/app/(app)/menu/form-varian.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { setAktifVarian, simpanVarian } from "./actions";
import type { Varian } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormVarian({
  productId,
  varian,
}: {
  productId: string;
  varian?: Varian;
}) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await simpanVarian(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function gantiAktif() {
    if (!varian) return;
    setSibuk(true);
    const hasil = await setAktifVarian(varian.id, !varian.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={
          varian
            ? "text-sm font-semibold text-[var(--hijau)] underline"
            : "rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--kertas)]"
        }
      >
        {varian ? "Ubah" : "+ Varian"}
      </button>
      <Lembar
        buka={buka}
        judul={varian ? `Ubah varian ${varian.nama}` : "Tambah varian"}
        onTutup={() => setBuka(false)}
      >
        <form onSubmit={kirim}>
          {varian ? <input type="hidden" name="id" value={varian.id} /> : null}
          <input type="hidden" name="product_id" value={productId} />
          <label className={kelasLabel}>
            Nama varian (mis. Panas / Es)
            <input name="nama" required defaultValue={varian?.nama ?? ""} className={kelasInput} />
          </label>
          <label className={kelasLabel}>
            Harga jual (Rp)
            <input
              name="harga"
              type="number"
              step="1"
              min="0"
              required
              defaultValue={varian ? String(varian.harga) : ""}
              className={kelasInput}
            />
          </label>
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan
          </button>
          {varian ? (
            <button
              type="button"
              onClick={gantiAktif}
              disabled={sibuk}
              className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)]"
            >
              {varian.aktif ? "Nonaktifkan varian" : "Aktifkan lagi"}
            </button>
          ) : null}
        </form>
      </Lembar>
    </>
  );
}
```

- [ ] **Step 5: Halaman menu (tanpa resep — resep di Task 7)**

Ganti seluruh isi `web/src/app/(app)/menu/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { FormMenu } from "./form-menu";
import { FormVarian } from "./form-varian";
import type { Produk, Varian } from "./jenis";

export default async function HalamanMenu() {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const [produkRes, varianRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, nama, kategori, aktif")
      .order("kategori")
      .order("nama"),
    supabase
      .from("product_variants")
      .select("id, product_id, nama, harga, aktif")
      .order("nama"),
  ]);
  if (produkRes.error) {
    throw new Error(`Gagal memuat menu: ${produkRes.error.message}`);
  }
  if (varianRes.error) {
    throw new Error(`Gagal memuat varian: ${varianRes.error.message}`);
  }
  const produk = (produkRes.data ?? []) as Produk[];
  const varian = (varianRes.data ?? []) as Varian[];
  const kategoriAda = [...new Set(produk.map((p) => p.kategori))];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Menu &amp; Resep</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            HPP dihitung dari resep × harga rata-rata bahan saat ini.
          </p>
        </div>
        <FormMenu kategoriAda={kategoriAda} />
      </div>

      <div className="mt-4 space-y-3">
        {produk.map((p) => (
          <section
            key={p.id}
            className={`rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 ${
              p.aktif ? "" : "opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-[var(--hijau-tua)]">
                  {p.nama}
                  {p.aktif ? "" : " (nonaktif)"}
                </h2>
                <p className="text-xs uppercase tracking-wide text-[var(--pudar)]">
                  {p.kategori}
                </p>
              </div>
              <div className="flex gap-2">
                <FormVarian productId={p.id} />
                <FormMenu kategoriAda={kategoriAda} menu={p} />
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {varian
                .filter((v) => v.product_id === p.id)
                .map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {v.nama}
                      {v.aktif ? "" : " (nonaktif)"}
                    </span>
                    <span className="flex items-center gap-3">
                      <b className="uang">{formatRupiah(v.harga)}</b>
                      <FormVarian productId={p.id} varian={v} />
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {produk.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
            Belum ada menu. Tambahkan lewat tombol “+ Tambah menu”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 25 passed; build sukses.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/(app)/menu"
git commit -m "feat: menu — kelola menu & varian (tambah/ubah/nonaktif, kategori saran)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Menu — resep & HPP live

**Files:**
- Modify: `web/src/app/(app)/menu/actions.ts` (tambah `simpanBarisResep`, `hapusBarisResep`)
- Create: `web/src/app/(app)/menu/resep.tsx`
- Modify: `web/src/app/(app)/menu/page.tsx` (fetch resep + bahan, HPP, margin, penanda)

**Interfaces:**
- Consumes: `hitungHPP`, `formatJumlah`, `formatRupiahDesimal` (Task 2); tipe & actions Task 6.
- Produces: server actions `simpanBarisResep(formData): Promise<HasilAksi>` (upsert takaran, `onConflict: "variant_id,ingredient_id"`), `hapusBarisResep(id): Promise<HasilAksi>`.

- [ ] **Step 1: Actions resep**

Tambahkan di AKHIR `web/src/app/(app)/menu/actions.ts`:

```ts
export async function simpanBarisResep(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("menu");
  const variantId = String(formData.get("variant_id") ?? "");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const qty = Number(formData.get("qty"));
  if (!variantId || !ingredientId) return { ok: false, pesan: "Pilih bahan dulu." };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, pesan: "Takaran harus lebih dari 0." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("recipe_items")
    .upsert(
      { variant_id: variantId, ingredient_id: ingredientId, qty },
      { onConflict: "variant_id,ingredient_id" }
    );
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}

export async function hapusBarisResep(id: string): Promise<HasilAksi> {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const { error } = await supabase.from("recipe_items").delete().eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}
```

- [ ] **Step 2: Komponen editor resep**

Create `web/src/app/(app)/menu/resep.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatJumlah, formatRupiahDesimal } from "@/lib/format";
import { hapusBarisResep, simpanBarisResep } from "./actions";
import type { BahanResep, BarisResep } from "./jenis";

export type BarisResepTampil = BarisResep & {
  namaBahan: string;
  satuan: string;
  hargaRata: number;
  bahanAktif: boolean;
};

export function Resep({
  variantId,
  baris,
  bahan,
}: {
  variantId: string;
  baris: BarisResepTampil[];
  bahan: BahanResep[];
}) {
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function tambah(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSibuk(true);
    const hasil = await simpanBarisResep(new FormData(form));
    setSibuk(false);
    if (hasil.ok) {
      form.reset();
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function hapus(id: string) {
    setSibuk(true);
    const hasil = await hapusBarisResep(id);
    setSibuk(false);
    if (!hasil.ok) setPesan(hasil.pesan);
  }

  return (
    <details className="mt-2 w-full">
      <summary className="cursor-pointer text-xs font-semibold text-[var(--hijau)]">
        Resep ({baris.length} bahan)
      </summary>
      <div className="mt-2 rounded-lg border border-[var(--garis)] bg-[var(--kertas)] p-2 text-sm">
        {baris.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 border-b border-[var(--garis)] px-1 py-1.5 last:border-0"
          >
            <span>
              {r.namaBahan}
              {r.bahanAktif ? "" : " (nonaktif)"}
            </span>
            <span className="flex items-center gap-3">
              <span className="uang">
                {formatJumlah(r.qty)} {r.satuan}
              </span>
              <span className="uang text-[var(--pudar)]">
                {formatRupiahDesimal(r.qty * r.hargaRata)}
              </span>
              <button
                type="button"
                onClick={() => hapus(r.id)}
                disabled={sibuk}
                aria-label={`Hapus ${r.namaBahan}`}
                className="font-bold text-[var(--merah)]"
              >
                ×
              </button>
            </span>
          </div>
        ))}
        <form onSubmit={tambah} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="variant_id" value={variantId} />
          <label className="min-w-40 flex-1 text-xs font-semibold text-[var(--pudar)]">
            Bahan
            <select
              name="ingredient_id"
              required
              className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1.5 text-sm text-[var(--tinta)]"
            >
              <option value="">— pilih —</option>
              {bahan.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama} ({b.satuan})
                </option>
              ))}
            </select>
          </label>
          <label className="w-24 text-xs font-semibold text-[var(--pudar)]">
            Takaran
            <input
              name="qty"
              type="number"
              step="0.001"
              min="0.001"
              required
              className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1.5 text-sm text-[var(--tinta)]"
            />
          </label>
          <button
            type="submit"
            disabled={sibuk}
            className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] disabled:opacity-60"
          >
            Simpan
          </button>
        </form>
        {pesan ? (
          <p className="mt-2 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-2 py-1.5 text-xs text-[var(--merah)]">
            {pesan}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] text-[var(--pudar)]">
          Memilih bahan yang sudah ada di resep akan mengganti takarannya.
        </p>
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Halaman menu lengkap (resep + HPP + margin + penanda)**

Ganti seluruh isi `web/src/app/(app)/menu/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah, formatRupiahDesimal } from "@/lib/format";
import { hitungHPP } from "@/lib/inventori";
import { FormMenu } from "./form-menu";
import { FormVarian } from "./form-varian";
import { Resep, type BarisResepTampil } from "./resep";
import type { BahanResep, BarisResep, Produk, Varian } from "./jenis";

export default async function HalamanMenu() {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const [produkRes, varianRes, resepRes, bahanRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, nama, kategori, aktif")
      .order("kategori")
      .order("nama"),
    supabase
      .from("product_variants")
      .select("id, product_id, nama, harga, aktif")
      .order("nama"),
    supabase.from("recipe_items").select("id, variant_id, ingredient_id, qty"),
    supabase
      .from("ingredients")
      .select("id, nama, satuan, harga_rata, aktif")
      .order("nama"),
  ]);
  if (produkRes.error) {
    throw new Error(`Gagal memuat menu: ${produkRes.error.message}`);
  }
  if (varianRes.error) {
    throw new Error(`Gagal memuat varian: ${varianRes.error.message}`);
  }
  if (resepRes.error) {
    throw new Error(`Gagal memuat resep: ${resepRes.error.message}`);
  }
  if (bahanRes.error) {
    throw new Error(`Gagal memuat bahan: ${bahanRes.error.message}`);
  }
  const produk = (produkRes.data ?? []) as Produk[];
  const varian = (varianRes.data ?? []) as Varian[];
  const resep = (resepRes.data ?? []) as BarisResep[];
  const bahanSemua = (bahanRes.data ?? []) as BahanResep[];
  const kategoriAda = [...new Set(produk.map((p) => p.kategori))];
  const bahanAktif = bahanSemua.filter((b) => b.aktif);
  const petaBahan = new Map(bahanSemua.map((b) => [b.id, b]));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Menu &amp; Resep</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            HPP dihitung dari resep × harga rata-rata bahan saat ini.
          </p>
        </div>
        <FormMenu kategoriAda={kategoriAda} />
      </div>

      <div className="mt-4 space-y-3">
        {produk.map((p) => (
          <section
            key={p.id}
            className={`rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 ${
              p.aktif ? "" : "opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-[var(--hijau-tua)]">
                  {p.nama}
                  {p.aktif ? "" : " (nonaktif)"}
                </h2>
                <p className="text-xs uppercase tracking-wide text-[var(--pudar)]">
                  {p.kategori}
                </p>
              </div>
              <div className="flex gap-2">
                <FormVarian productId={p.id} />
                <FormMenu kategoriAda={kategoriAda} menu={p} />
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {varian
                .filter((v) => v.product_id === p.id)
                .map((v) => {
                  const barisVarian: BarisResepTampil[] = resep
                    .filter((r) => r.variant_id === v.id)
                    .map((r) => {
                      const b = petaBahan.get(r.ingredient_id);
                      return {
                        ...r,
                        namaBahan: b?.nama ?? "(bahan terhapus)",
                        satuan: b?.satuan ?? "",
                        hargaRata: b?.harga_rata ?? 0,
                        bahanAktif: b?.aktif ?? false,
                      };
                    });
                  const hpp = hitungHPP(
                    barisVarian.map((r) => ({ qty: r.qty, hargaRata: r.hargaRata }))
                  );
                  return (
                    <li
                      key={v.id}
                      className="rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {v.nama}
                          {v.aktif ? "" : " (nonaktif)"}
                          {hpp === null ? (
                            <span className="ml-2 rounded bg-[#FBF3DC] px-1.5 py-0.5 text-[11px] font-bold text-[#8A6D1D]">
                              belum ada resep
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="uang text-[var(--pudar)]">
                            HPP {hpp === null ? "—" : formatRupiahDesimal(hpp)}
                            {hpp === null
                              ? ""
                              : ` · Margin ${formatRupiahDesimal(v.harga - hpp)}`}
                          </span>
                          <b className="uang">{formatRupiah(v.harga)}</b>
                          <FormVarian productId={p.id} varian={v} />
                        </span>
                      </div>
                      <Resep variantId={v.id} baris={barisVarian} bahan={bahanAktif} />
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        {produk.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
            Belum ada menu. Tambahkan lewat tombol “+ Tambah menu”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test + build + smoke**

```bash
cd web && npm test && npm run build
```
Expected: 25 passed; build sukses.

Dev smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/menu` (dev server berjalan) → `307`. Hentikan dev server.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/(app)/menu"
git commit -m "feat: menu — editor resep, HPP live, margin, penanda belum ada resep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Verifikasi produksi *(sebagian perlu tindakan user)*

**Files:** tidak ada file baru.

**Interfaces:**
- Consumes: seluruh task sebelumnya, ter-deploy ke produksi (Vercel auto-deploy `main`).

- [ ] **Step 1: Pastikan migrasi ter-push**

Jika Task 1 Step 3 tadi BLOCKED: user menjalankan `npx supabase login`, lalu dari root repo `npx supabase db push`. Verifikasi di dashboard → Database → Functions: `catat_belanja` dan `catat_opname` muncul.

- [ ] **Step 2: Merge & deploy**

Setelah semua task selesai + review akhir: merge branch ke `main`, push — Vercel auto-deploy.

- [ ] **Step 3: Walkthrough produksi** *(user, login sebagai owner)*

1. `/stok` → **+ Tambah bahan**: "Kopi uji", satuan gram, batas min 100 → muncul dengan badge "menipis" (stok 0 ≤ 100).
2. **+ Catat belanja**: Kopi uji, 500 gr, total Rp50.000 → preview `Rp100/gram` → simpan → daftar: stok 500, rata Rp100.
3. **+ Catat belanja** lagi: 1.000 gr, total Rp130.000 → preview `Rp120/gram` (contoh spec!) → simpan → stok 1.500, rata Rp120.
4. **Stok opname**: Kopi uji, fisik 1.400 → selisih `−100 gram` (merah) → simpan → stok 1.400, rata tetap Rp120.
5. `/menu` → **+ Tambah menu**: "Kopi susu uji", kategori "Kopi", varian pertama "Es" Rp15.000 → varian tampil dengan badge "belum ada resep", HPP —.
6. Buka **Resep** varian Es → tambah: Kopi uji, takaran 18 → HPP `Rp2.160` (18 × 120), margin `Rp12.840`, badge hilang.
7. Rapikan: nonaktifkan menu "Kopi susu uji" dan bahan "Kopi uji" (data ledger boleh tetap — nonaktif cukup).

- [ ] **Step 4 (opsional): Uji penolakan izin** *(butuh user kedua)*

Di dashboard Supabase → Authentication → Add user (mis. `kasir-uji@seteguk.local`, Auto Confirm) TANPA menambah baris `user_permissions`. Login sebagai user itu di produksi → menu Stok/Menu tidak tampil di navigasi; akses langsung `/stok` → terlempar ke beranda. (Modul Pengguna untuk kelola user dari app dibangun di Rencana 3; user uji bisa dihapus lagi dari dashboard.)

- [ ] **Step 5 (opsional): Bersihkan data uji total**

Jika ingin ledger benar-benar bersih, di SQL Editor:

```sql
delete from public.recipe_items where ingredient_id in (select id from public.ingredients where nama = 'Kopi uji');
delete from public.stock_movements where ingredient_id in (select id from public.ingredients where nama = 'Kopi uji');
delete from public.purchases where ingredient_id in (select id from public.ingredients where nama = 'Kopi uji');
delete from public.product_variants where product_id in (select id from public.products where nama = 'Kopi susu uji');
delete from public.products where nama = 'Kopi susu uji';
delete from public.ingredients where nama = 'Kopi uji';
```

---

## Catatan untuk Rencana 3 (Kasir & Laporan)

- RPC `catat_penjualan` (security definer, atomik): insert `sales` + `sale_items` (HPP dibekukan dari resep × `harga_rata` saat itu) + potong stok per resep + `stock_movements` tipe `penjualan`. Void lewat RPC serupa (tabel `sales` append-only via Data API — policy UPDATE langsung sudah dihapus).
- Layar kasir memakai `products`/`product_variants`/`recipe_items` yang aktif; urutan tile mengikuti penjualan terlaris.
- Laporan harian WIB: omzet − HPP tersimpan − pengeluaran; selisih tutup kasir.
- Kelola pengguna butuh `SUPABASE_SERVICE_ROLE_KEY` (server-only env).
