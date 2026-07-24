# Rencana 4/4: Pengeluaran, Laporan & Kelola Pengguna

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melengkapi aplikasi: catat pengeluaran operasional, laporan laba (harian, rentang, bulanan, grafik), dan kelola pengguna termasuk membuat akun login baru — plus melunasi utang teknis Rencana 2-3.

**Architecture:** Dua fungsi SQL baca (SECURITY INVOKER, dijaga RLS) — `laporan_harian` mengembalikan satu baris per hari yang menyalakan seluruh laporan, dan `terlaris`. Agregasi rentang/bulanan dilakukan fungsi TS murni ber-unit-test. Pembuatan akun memakai klien admin terpisah yang dilindungi paket `server-only`.

**Tech Stack:** Next.js 16 (App Router, server actions, TS strict), Supabase (Postgres + RLS + RPC), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-24-laporan-admin-design.md` (induk: `2026-07-24-seteguk-pos-design.md`)

## Global Constraints

- Copy UI Bahasa Indonesia, sentence case. Izin per halaman: `/pengeluaran` → `biaya`, `/laporan` → `laporan`, `/pengguna` → `user`.
- Uang: nominal & omzet `integer` rupiah; HPP `numeric(12,2)`. Batas hari **Asia/Jakarta (WIB)** — pakai `tanggalJakarta`/`awalHariJakarta` dari `@/lib/kasir`, jangan bikin logika tanggal baru.
- **HPP selalu dibaca dari `sale_items.hpp`** (sudah dibekukan saat transaksi) — jangan pernah hitung ulang dari resep.
- Fungsi laporan **SECURITY INVOKER** (bukan definer): RLS pemanggil yang menjaga. Jangan tambahkan `security definer`.
- **`SUPABASE_SERVICE_ROLE_KEY` tidak boleh berawalan `NEXT_PUBLIC_`**, hanya boleh diimpor lewat modul ber-`import "server-only"`, dan hanya dipakai di satu server action yang dibuka `wajibIzin("user")`.
- **Warna grafik sudah divalidasi** dengan `scripts/validate_palette.js` skill dataviz: batang laba positif `var(--hijau-daun)` #2F9068, negatif `var(--merah)` #C2452D di atas `var(--enamel)`. Hasil: lightness/chroma/normal-vision/contrast PASS, CVD ΔE 7.6 (band 6-8) — **sah HANYA dengan secondary encoding**, jadi posisi batang (atas/bawah garis nol), `aria-label` per batang, dan tabel angka **wajib ada**. JANGAN ganti ke `var(--hijau)` #17493B: gagal lightness+chroma (terbaca abu-abu sebagai isian).
- Satu sumbu, satu seri. Tanpa library grafik baru.
- TypeScript strict, tanpa `any` — hasil query Supabase di-cast ke tipe lokal.
- Next.js 16: middleware `web/src/proxy.ts` (JANGAN diubah). Bila ragu API, baca `web/node_modules/next/dist/docs/`.
- `web/.env.local` = kredensial PRODUKSI. **Dilarang menulis data uji lewat skrip/RPC**; mutasi data hanya lewat UI produksi di Task 10 (user). Dilarang: `supabase db push`/`login`/`link`/`db reset` (push dilakukan user).
- Setiap commit diakhiri: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Migrasi fungsi laporan

**Files:**
- Create: `supabase/migrations/20260724000004_fungsi_laporan.sql`

**Interfaces:**
- Consumes: `sales`, `sale_items`, `expenses`, `cash_closings` (migrasi sebelumnya).
- Produces (dipanggil Task 4-5):
  - `public.laporan_harian(p_dari date, p_sampai date)` → tabel `(tanggal date, omzet bigint, hpp numeric, pengeluaran bigint, laba numeric, transaksi bigint, tunai bigint, qris bigint, selisih_kasir integer)`, satu baris per tanggal dalam rentang (hari tanpa data tetap muncul bernilai 0).
  - `public.terlaris(p_dari date, p_sampai date, p_limit integer)` → tabel `(nama text, terjual bigint)`.

- [ ] **Step 1: Tulis migrasi**

Create `supabase/migrations/20260724000004_fungsi_laporan.sql`:

```sql
-- Fungsi laporan bersifat SECURITY INVOKER (default): RLS pemanggil yang
-- menjaga. Policy "baca penjualan"/"baca item penjualan"/"baca pengeluaran"/
-- "baca tutup kasir" sudah mensyaratkan izin laporan (atau kasir/biaya).
-- Pengguna tanpa izin cukup mendapat nol baris, bukan error.

create or replace function public.laporan_harian(p_dari date, p_sampai date)
returns table (
  tanggal date,
  omzet bigint,
  hpp numeric,
  pengeluaran bigint,
  laba numeric,
  transaksi bigint,
  tunai bigint,
  qris bigint,
  selisih_kasir integer
)
language sql stable set search_path = public
as $$
  with hari as (
    select generate_series(p_dari, p_sampai, interval '1 day')::date as tanggal
  ),
  jual as (
    select
      (s.waktu at time zone 'Asia/Jakarta')::date as tanggal,
      coalesce(sum(si.qty * si.harga), 0)::bigint as omzet,
      coalesce(sum(si.qty * si.hpp), 0) as hpp,
      count(distinct s.id)::bigint as transaksi,
      coalesce(sum(si.qty * si.harga) filter (where s.metode = 'tunai'), 0)::bigint as tunai,
      coalesce(sum(si.qty * si.harga) filter (where s.metode = 'qris'), 0)::bigint as qris
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.status = 'selesai'
      and (s.waktu at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
    group by 1
  ),
  biaya as (
    select e.tanggal, coalesce(sum(e.nominal), 0)::bigint as pengeluaran
    from public.expenses e
    where e.tanggal between p_dari and p_sampai
    group by 1
  )
  select
    h.tanggal,
    coalesce(j.omzet, 0)::bigint,
    coalesce(j.hpp, 0),
    coalesce(b.pengeluaran, 0)::bigint,
    coalesce(j.omzet, 0) - coalesce(j.hpp, 0) - coalesce(b.pengeluaran, 0),
    coalesce(j.transaksi, 0)::bigint,
    coalesce(j.tunai, 0)::bigint,
    coalesce(j.qris, 0)::bigint,
    c.selisih
  from hari h
  left join jual j on j.tanggal = h.tanggal
  left join biaya b on b.tanggal = h.tanggal
  left join public.cash_closings c on c.tanggal = h.tanggal
  order by h.tanggal;
$$;

create or replace function public.terlaris(
  p_dari date,
  p_sampai date,
  p_limit integer default 5
)
returns table (nama text, terjual bigint)
language sql stable set search_path = public
as $$
  select si.nama_snapshot, sum(si.qty)::bigint as terjual
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'selesai'
    and (s.waktu at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
  group by si.nama_snapshot
  order by terjual desc, si.nama_snapshot
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.laporan_harian(date, date) from public, anon;
revoke execute on function public.terlaris(date, date, integer) from public, anon;
grant execute on function public.laporan_harian(date, date) to authenticated;
grant execute on function public.terlaris(date, date, integer) to authenticated;
```

- [ ] **Step 2: Sanity check urutan**

```bash
ls supabase/migrations/
```
Expected: empat file berurutan, `20260724000004_fungsi_laporan.sql` paling akhir.

- [ ] **Step 3: Commit (JANGAN push)**

```bash
git add supabase/migrations/20260724000004_fungsi_laporan.sql
git commit -m "feat: fungsi SQL laporan_harian & terlaris

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Fungsi agregasi laporan (TDD)

**Files:**
- Create: `web/src/lib/laporan.ts`
- Create: `web/src/lib/laporan.test.ts`

**Interfaces:**
- Consumes: —
- Produces (dipakai Task 4-5):
  - `type BarisHarian = { tanggal: string; omzet: number; hpp: number; pengeluaran: number; laba: number; transaksi: number; tunai: number; qris: number; selisih_kasir: number | null }`
  - `type Ringkasan = { omzet: number; hpp: number; pengeluaran: number; laba: number; transaksi: number; tunai: number; qris: number }`
  - `ringkasRentang(baris: BarisHarian[]): Ringkasan`
  - `kelompokBulanan(baris: BarisHarian[]): { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }[]`
  - `rataPerTransaksi(omzet: number, transaksi: number): number`

- [ ] **Step 1: Tulis test yang gagal**

Create `web/src/lib/laporan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  kelompokBulanan,
  rataPerTransaksi,
  ringkasRentang,
  type BarisHarian,
} from "./laporan";

function baris(
  tanggal: string,
  omzet: number,
  hpp: number,
  pengeluaran: number,
  transaksi = 1,
  tunai = 0,
  qris = 0
): BarisHarian {
  return {
    tanggal,
    omzet,
    hpp,
    pengeluaran,
    laba: omzet - hpp - pengeluaran,
    transaksi,
    tunai,
    qris,
    selisih_kasir: null,
  };
}

describe("ringkasRentang", () => {
  it("rentang kosong bernilai nol semua", () => {
    expect(ringkasRentang([])).toEqual({
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    });
  });
  it("menjumlahkan beberapa hari", () => {
    const r = ringkasRentang([
      baris("2026-07-23", 100000, 40000, 10000, 5, 60000, 40000),
      baris("2026-07-24", 200000, 80000, 5000, 8, 120000, 80000),
    ]);
    expect(r.omzet).toBe(300000);
    expect(r.hpp).toBe(120000);
    expect(r.pengeluaran).toBe(15000);
    expect(r.laba).toBe(165000);
    expect(r.transaksi).toBe(13);
    expect(r.tunai).toBe(180000);
    expect(r.qris).toBe(120000);
  });
  it("laba bisa negatif (rugi)", () => {
    expect(ringkasRentang([baris("2026-07-24", 50000, 30000, 40000)]).laba).toBe(
      -20000
    );
  });
});

describe("kelompokBulanan", () => {
  it("mengelompokkan per bulan dan menjumlahkan", () => {
    const hasil = kelompokBulanan([
      baris("2026-06-30", 100000, 40000, 10000),
      baris("2026-07-01", 200000, 80000, 20000),
      baris("2026-07-15", 300000, 90000, 10000),
    ]);
    expect(hasil).toHaveLength(2);
    expect(hasil[0].bulan).toBe("2026-06");
    expect(hasil[0].omzet).toBe(100000);
    expect(hasil[1].bulan).toBe("2026-07");
    expect(hasil[1].omzet).toBe(500000);
    expect(hasil[1].laba).toBe(500000 - 170000 - 30000);
  });
  it("rentang kosong menghasilkan array kosong", () => {
    expect(kelompokBulanan([])).toEqual([]);
  });
});

describe("rataPerTransaksi", () => {
  it("membagi omzet dengan jumlah transaksi", () => {
    expect(rataPerTransaksi(100000, 4)).toBe(25000);
  });
  it("nol transaksi menghasilkan nol, bukan bagi nol", () => {
    expect(rataPerTransaksi(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd web && npm test
```
Expected: FAIL — `Cannot find module './laporan'`.

- [ ] **Step 3: Implementasi**

Create `web/src/lib/laporan.ts`:

```ts
export type BarisHarian = {
  tanggal: string;
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
  selisih_kasir: number | null;
};

export type Ringkasan = {
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
};

export function ringkasRentang(baris: BarisHarian[]): Ringkasan {
  return baris.reduce<Ringkasan>(
    (s, b) => ({
      omzet: s.omzet + b.omzet,
      hpp: s.hpp + b.hpp,
      pengeluaran: s.pengeluaran + b.pengeluaran,
      laba: s.laba + b.laba,
      transaksi: s.transaksi + b.transaksi,
      tunai: s.tunai + b.tunai,
      qris: s.qris + b.qris,
    }),
    {
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    }
  );
}

export function kelompokBulanan(
  baris: BarisHarian[]
): { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }[] {
  const peta = new Map<
    string,
    { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }
  >();
  for (const b of baris) {
    const bulan = b.tanggal.slice(0, 7); // YYYY-MM
    const ada = peta.get(bulan) ?? {
      bulan,
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
    };
    ada.omzet += b.omzet;
    ada.hpp += b.hpp;
    ada.pengeluaran += b.pengeluaran;
    ada.laba += b.laba;
    peta.set(bulan, ada);
  }
  return [...peta.values()].sort((a, b) => a.bulan.localeCompare(b.bulan));
}

export function rataPerTransaksi(omzet: number, transaksi: number): number {
  return transaksi > 0 ? omzet / transaksi : 0;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
cd web && npm test
```
Expected: 42 passed (35 lama + 7 baru).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/laporan.ts web/src/lib/laporan.test.ts
git commit -m "feat: ringkasRentang, kelompokBulanan, rataPerTransaksi (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Modul Pengeluaran

**Files:**
- Create: `web/src/app/(app)/pengeluaran/jenis.ts`
- Create: `web/src/app/(app)/pengeluaran/actions.ts`
- Create: `web/src/app/(app)/pengeluaran/form-pengeluaran.tsx`
- Modify: `web/src/app/(app)/pengeluaran/page.tsx` (ganti placeholder)

**Interfaces:**
- Consumes: `wajibIzin`, `buatClientServer`, `formatRupiah`, `tanggalJakarta` (`@/lib/kasir`), `Lembar`, `HasilAksi`.
- Produces: `catatPengeluaran(formData): Promise<HasilAksi>`, `tambahKategori(nama): Promise<HasilAksi>`; tipe `Kategori`, `Pengeluaran`.

- [ ] **Step 1: Tipe**

Create `web/src/app/(app)/pengeluaran/jenis.ts`:

```ts
export type Kategori = { id: string; nama: string };

export type Pengeluaran = {
  id: string;
  tanggal: string;
  nominal: number;
  catatan: string;
  category_id: string;
};
```

- [ ] **Step 2: Server actions**

Create `web/src/app/(app)/pengeluaran/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import type { HasilAksi } from "@/lib/aksi";

export async function catatPengeluaran(formData: FormData): Promise<HasilAksi> {
  const pengguna = await wajibIzin("biaya");
  const tanggal = String(formData.get("tanggal") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const nominal = Number(formData.get("nominal"));
  const catatan = String(formData.get("catatan") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, pesan: "Tanggal tidak valid." };
  }
  if (!categoryId) return { ok: false, pesan: "Pilih kategori dulu." };
  if (!Number.isInteger(nominal) || nominal <= 0) {
    return { ok: false, pesan: "Nominal harus bilangan bulat lebih dari 0." };
  }

  const supabase = await buatClientServer();
  // expenses.created_by NOT NULL tanpa default — isi dari pengguna yang login.
  const { error } = await supabase.from("expenses").insert({
    tanggal,
    category_id: categoryId,
    nominal,
    catatan,
    created_by: pengguna.id,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengeluaran");
  revalidatePath("/laporan");
  return { ok: true };
}

export async function tambahKategori(nama: string): Promise<HasilAksi> {
  await wajibIzin("biaya");
  const bersih = nama.trim();
  if (!bersih) return { ok: false, pesan: "Nama kategori wajib diisi." };
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("expense_categories")
    .insert({ nama: bersih });
  if (error) {
    return {
      ok: false,
      pesan:
        error.code === "23505" ? "Kategori itu sudah ada." : error.message,
    };
  }
  revalidatePath("/pengeluaran");
  return { ok: true };
}
```

- [ ] **Step 3: Form pengeluaran**

Create `web/src/app/(app)/pengeluaran/form-pengeluaran.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { catatPengeluaran, tambahKategori } from "./actions";
import type { Kategori } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormPengeluaran({
  kategori,
  hariIni,
}: {
  kategori: Kategori[];
  hariIni: string;
}) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [kategoriBaru, setKategoriBaru] = useState("");

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatPengeluaran(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  async function simpanKategori() {
    setSibuk(true);
    const hasil = await tambahKategori(kategoriBaru);
    setSibuk(false);
    if (hasil.ok) {
      setKategoriBaru("");
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
        + Catat pengeluaran
      </button>
      {buka ? (
        <Lembar buka judul="Catat pengeluaran" onTutup={() => setBuka(false)}>
          <form onSubmit={kirim}>
            <label className={kelasLabel}>
              Tanggal
              <input
                name="tanggal"
                type="date"
                required
                defaultValue={hariIni}
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Kategori
              <select name="category_id" required className={kelasInput}>
                <option value="">— pilih —</option>
                {kategori.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className={kelasLabel}>
              Nominal (Rp)
              <input
                name="nominal"
                type="number"
                step="1"
                min="1"
                required
                inputMode="numeric"
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Catatan (opsional)
              <input name="catatan" maxLength={200} className={kelasInput} />
            </label>
            {pesan ? (
              <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
                {pesan}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sibuk}
              className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] disabled:opacity-50"
            >
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          </form>

          <div className="mt-4 border-t border-[var(--garis)] pt-3">
            <p className="text-xs font-semibold text-[var(--pudar)]">
              Kategori baru
            </p>
            <div className="mt-1 flex gap-2">
              <input
                value={kategoriBaru}
                onChange={(e) => setKategoriBaru(e.target.value)}
                placeholder="mis. Perbaikan alat"
                className="flex-1 rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={simpanKategori}
                disabled={sibuk || !kategoriBaru.trim()}
                className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Tambah
              </button>
            </div>
          </div>
        </Lembar>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Pemilih bulan (klien)**

Create `web/src/app/(app)/pengeluaran/pilih-bulan.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

export function PilihBulan({ bulan }: { bulan: string }) {
  const router = useRouter();
  return (
    <label className="text-sm font-semibold text-[var(--pudar)]">
      Bulan{" "}
      <input
        type="month"
        value={bulan}
        onChange={(e) => router.push(`/pengeluaran?bulan=${e.target.value}`)}
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-[var(--tinta)]"
      />
    </label>
  );
}
```

- [ ] **Step 5: Halaman pengeluaran**

Ganti seluruh isi `web/src/app/(app)/pengeluaran/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { tanggalJakarta } from "@/lib/kasir";
import { FormPengeluaran } from "./form-pengeluaran";
import { PilihBulan } from "./pilih-bulan";
import type { Kategori, Pengeluaran } from "./jenis";

export default async function HalamanPengeluaran({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string }>;
}) {
  await wajibIzin("biaya");
  const { bulan } = await searchParams;
  const hariIni = tanggalJakarta(new Date());
  const bulanAktif = /^\d{4}-\d{2}$/.test(bulan ?? "")
    ? (bulan as string)
    : hariIni.slice(0, 7);
  const awal = `${bulanAktif}-01`;
  const akhirDate = new Date(`${awal}T00:00:00Z`);
  akhirDate.setUTCMonth(akhirDate.getUTCMonth() + 1);
  const akhir = akhirDate.toISOString().slice(0, 10);

  const supabase = await buatClientServer();
  const [katRes, keluarRes] = await Promise.all([
    supabase.from("expense_categories").select("id, nama").order("nama"),
    supabase
      .from("expenses")
      .select("id, tanggal, nominal, catatan, category_id")
      .gte("tanggal", awal)
      .lt("tanggal", akhir)
      .order("tanggal", { ascending: false }),
  ]);
  if (katRes.error) {
    throw new Error(`Gagal memuat kategori: ${katRes.error.message}`);
  }
  if (keluarRes.error) {
    throw new Error(`Gagal memuat pengeluaran: ${keluarRes.error.message}`);
  }
  const kategori = (katRes.data ?? []) as Kategori[];
  const daftar = (keluarRes.data ?? []) as Pengeluaran[];
  const namaKategori = new Map(kategori.map((k) => [k.id, k.nama]));
  const total = daftar.reduce((s, e) => s + e.nominal, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Pengeluaran</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            Hanya biaya non-bahan (listrik, gas, gaji, sewa). Belanja bahan
            dicatat di Stok — biayanya masuk lewat HPP saat terpakai.
          </p>
        </div>
        <FormPengeluaran kategori={kategori} hariIni={hariIni} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2">
        <PilihBulan bulan={bulanAktif} />
        <span className="text-sm">
          Total bulan ini <b className="uang">{formatRupiah(total)}</b>
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {daftar.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3 text-sm"
          >
            <span className="min-w-0">
              <b>{e.catatan || namaKategori.get(e.category_id) || "Pengeluaran"}</b>
              <br />
              <span className="text-xs text-[var(--pudar)]">
                {e.tanggal} · {namaKategori.get(e.category_id) ?? "—"}
              </span>
            </span>
            <b className="uang">{formatRupiah(e.nominal)}</b>
          </li>
        ))}
        {daftar.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-center text-sm text-[var(--pudar)]">
            Belum ada pengeluaran bulan ini.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Test + build + smoke**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses; `/pengeluaran` ƒ.

Dev smoke: `npm run dev` (bg), `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/pengeluaran` → `307`. Hentikan dev server.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/(app)/pengeluaran"
git commit -m "feat: pengeluaran — catat biaya operasional, kategori baru, daftar per bulan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Laporan — buku kas, mini-stat, rentang & terlaris

**Files:**
- Create: `web/src/app/(app)/laporan/pilih-rentang.tsx`
- Modify: `web/src/app/(app)/laporan/page.tsx` (ganti placeholder)

**Interfaces:**
- Consumes: RPC `laporan_harian`/`terlaris` (Task 1), `ringkasRentang`/`rataPerTransaksi`/`BarisHarian` (Task 2), `tanggalJakarta`.
- Produces: halaman laporan dengan `rentang` lewat searchParams (`?dari=YYYY-MM-DD&sampai=YYYY-MM-DD`); komponen `PilihRentang`.

- [ ] **Step 1: Pemilih rentang (klien)**

Create `web/src/app/(app)/laporan/pilih-rentang.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

export function PilihRentang({
  dari,
  sampai,
  hariIni,
}: {
  dari: string;
  sampai: string;
  hariIni: string;
}) {
  const router = useRouter();

  function pergi(d: string, s: string) {
    router.push(`/laporan?dari=${d}&sampai=${s}`);
  }
  function mundur(hari: number): string {
    const t = new Date(`${hariIni}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - hari);
    return t.toISOString().slice(0, 10);
  }

  const preset: { label: string; dari: string; sampai: string }[] = [
    { label: "Hari ini", dari: hariIni, sampai: hariIni },
    { label: "7 hari", dari: mundur(6), sampai: hariIni },
    { label: "Bulan ini", dari: `${hariIni.slice(0, 7)}-01`, sampai: hariIni },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {preset.map((p) => {
        const aktif = p.dari === dari && p.sampai === sampai;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => pergi(p.dari, p.sampai)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              aktif
                ? "border-[var(--hijau)] bg-[var(--hijau)] text-[#F6F3E6]"
                : "border-[var(--garis-kuat)] bg-[var(--enamel)] text-[var(--pudar)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <input
        type="date"
        value={dari}
        max={sampai}
        onChange={(e) => pergi(e.target.value, sampai)}
        aria-label="Tanggal mulai"
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-sm"
      />
      <span className="text-sm text-[var(--pudar)]">s/d</span>
      <input
        type="date"
        value={sampai}
        min={dari}
        max={hariIni}
        onChange={(e) => pergi(dari, e.target.value)}
        aria-label="Tanggal akhir"
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 2: Halaman laporan**

Ganti seluruh isi `web/src/app/(app)/laporan/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { tanggalJakarta } from "@/lib/kasir";
import {
  rataPerTransaksi,
  ringkasRentang,
  type BarisHarian,
} from "@/lib/laporan";
import { PilihRentang } from "./pilih-rentang";

const TGL = /^\d{4}-\d{2}-\d{2}$/;

export default async function HalamanLaporan({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string }>;
}) {
  await wajibIzin("laporan");
  const sp = await searchParams;
  const hariIni = tanggalJakarta(new Date());
  const dari = TGL.test(sp.dari ?? "") ? (sp.dari as string) : hariIni;
  const sampaiMentah = TGL.test(sp.sampai ?? "")
    ? (sp.sampai as string)
    : hariIni;
  const sampai = sampaiMentah < dari ? dari : sampaiMentah;

  const supabase = await buatClientServer();
  const [harianRes, terlarisRes] = await Promise.all([
    supabase.rpc("laporan_harian", { p_dari: dari, p_sampai: sampai }),
    supabase.rpc("terlaris", { p_dari: dari, p_sampai: sampai, p_limit: 5 }),
  ]);
  if (harianRes.error) {
    throw new Error(`Gagal memuat laporan: ${harianRes.error.message}`);
  }
  if (terlarisRes.error) {
    throw new Error(`Gagal memuat terlaris: ${terlarisRes.error.message}`);
  }

  const harian: BarisHarian[] = (
    (harianRes.data ?? []) as Record<string, unknown>[]
  ).map((b) => ({
    tanggal: String(b.tanggal),
    omzet: Number(b.omzet),
    hpp: Number(b.hpp),
    pengeluaran: Number(b.pengeluaran),
    laba: Number(b.laba),
    transaksi: Number(b.transaksi),
    tunai: Number(b.tunai),
    qris: Number(b.qris),
    selisih_kasir: b.selisih_kasir === null ? null : Number(b.selisih_kasir),
  }));
  const terlaris = ((terlarisRes.data ?? []) as Record<string, unknown>[]).map(
    (t) => ({ nama: String(t.nama), terjual: Number(t.terjual) })
  );

  const r = ringkasRentang(harian);
  const selisih = harian.reduce(
    (s, b) => s + (b.selisih_kasir ?? 0),
    0
  );
  const satuHari = dari === sampai;

  return (
    <div>
      <h1 className="display text-2xl">Laporan</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        {satuHari ? `Tanggal ${dari}` : `${dari} s/d ${sampai}`}
      </p>
      <div className="mt-3">
        <PilihRentang dari={dari} sampai={sampai} hariIni={hariIni} />
      </div>

      <section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
        <h2 className="display text-lg">Buku kas</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt>
              Omzet penjualan{" "}
              <span className="text-[var(--pudar)]">
                ({r.transaksi} transaksi)
              </span>
            </dt>
            <dd className="uang">{formatRupiah(r.omzet)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>HPP bahan terpakai</dt>
            <dd className="uang">− {formatRupiah(r.hpp)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Pengeluaran operasional</dt>
            <dd className="uang">− {formatRupiah(r.pengeluaran)}</dd>
          </div>
        </dl>
        <div
          className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2.5 ${
            r.laba < 0
              ? "bg-[#F9E9E4] text-[var(--merah)]"
              : "bg-[var(--hijau)] text-[#F6F3E6]"
          }`}
        >
          <b>Laba bersih</b>
          <b className="uang text-lg">{formatRupiah(r.laba)}</b>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { l: "Tunai di laci", v: formatRupiah(r.tunai) },
          { l: "Masuk QRIS", v: formatRupiah(r.qris) },
          { l: "Transaksi", v: String(r.transaksi) },
          {
            l: "Rata-rata / transaksi",
            v: formatRupiah(rataPerTransaksi(r.omzet, r.transaksi)),
          },
          { l: "Selisih tutup kasir", v: formatRupiah(selisih) },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3"
          >
            <p className="text-xs text-[var(--pudar)]">{s.l}</p>
            <p className="uang mt-0.5 font-bold">{s.v}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
        <h2 className="display text-lg">Terlaris</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {terlaris.map((t, i) => (
            <li key={t.nama} className="flex items-center gap-2">
              <span className="w-5 text-[var(--pudar)]">{i + 1}</span>
              <span className="min-w-0 flex-1">{t.nama}</span>
              <b className="uang">{t.terjual}×</b>
            </li>
          ))}
          {terlaris.length === 0 ? (
            <li className="text-[var(--pudar)]">Belum ada penjualan.</li>
          ) : null}
        </ol>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Test + build + smoke**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses; `/laporan` ƒ.

Dev smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/laporan` → `307`.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(app)/laporan"
git commit -m "feat: laporan — buku kas, mini-stat, pemilih rentang, terlaris

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Laporan — grafik laba 7 hari & rekap bulanan

**Files:**
- Create: `web/src/app/(app)/laporan/grafik-laba.tsx`
- Modify: `web/src/app/(app)/laporan/page.tsx` (pasang grafik + rekap bulanan)

**Interfaces:**
- Consumes: `BarisHarian`, `kelompokBulanan` (Task 2), `formatRupiah`.
- Produces: komponen `GrafikLaba({ baris })`.

**Aturan grafik (WAJIB — sudah divalidasi, jangan diubah):** batang positif `var(--hijau-daun)`, negatif `var(--merah)`, di atas `var(--enamel)`. Pasangan ini lolos lightness/chroma/normal-vision/contrast, tetapi separasi buta-warna ΔE 7.6 (band 6-8) sehingga **hanya sah bila polaritas juga dikodekan tanpa warna**: batang positif di atas garis nol & negatif di bawah, `aria-label` per batang, dan tabel angka. Jangan ganti ke `var(--hijau)` (#17493B) — gagal lightness+chroma, batang akan terbaca abu-abu.

- [ ] **Step 1: Komponen grafik**

Create `web/src/app/(app)/laporan/grafik-laba.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import type { BarisHarian } from "@/lib/laporan";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function labelHari(tanggal: string): string {
  return HARI[new Date(`${tanggal}T00:00:00+07:00`).getUTCDay()] ?? tanggal;
}

export function GrafikLaba({ baris }: { baris: BarisHarian[] }) {
  const [tabel, setTabel] = useState(false);
  const data = baris.slice(-7);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.laba)), 1);
  const TINGGI_POS = 96;
  const TINGGI_NEG = 40;

  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--pudar)]">Belum ada data untuk grafik.</p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-lg">Laba bersih 7 hari terakhir</h2>
        <button
          type="button"
          onClick={() => setTabel((t) => !t)}
          className="text-sm font-semibold text-[var(--hijau)] underline"
        >
          {tabel ? "Lihat grafik" : "Lihat tabel angka"}
        </button>
      </div>

      {tabel ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--pudar)]">
              <th className="py-1">Tanggal</th>
              <th className="py-1 text-right">Laba bersih</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.tanggal} className="border-t border-[var(--garis)]">
                <td className="py-1">
                  {labelHari(d.tanggal)}, {d.tanggal}
                </td>
                <td
                  className={`uang py-1 text-right ${
                    d.laba < 0 ? "text-[var(--merah)]" : ""
                  }`}
                >
                  {formatRupiah(d.laba)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div
            className="mt-3 flex items-end gap-1.5"
            style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
          >
            {data.map((d) => {
              const positif = d.laba >= 0;
              const tinggi = Math.round(
                (Math.abs(d.laba) / maxAbs) *
                  (positif ? TINGGI_POS - 8 : TINGGI_NEG - 4)
              );
              return (
                <div
                  key={d.tanggal}
                  className="group relative flex flex-1 flex-col"
                  style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
                >
                  {/* setengah atas: batang positif menempel garis nol */}
                  <div
                    className="flex items-end justify-center"
                    style={{ height: `${TINGGI_POS}px` }}
                  >
                    {positif ? (
                      <span
                        className="w-full rounded-t bg-[var(--hijau-daun)]"
                        style={{ height: `${tinggi}px` }}
                      />
                    ) : null}
                  </div>
                  {/* garis nol */}
                  <span className="block h-px w-full bg-[var(--garis-kuat)]" />
                  {/* setengah bawah: batang negatif */}
                  <div
                    className="flex items-start justify-center"
                    style={{ height: `${TINGGI_NEG}px` }}
                  >
                    {!positif ? (
                      <span
                        className="w-full rounded-b bg-[var(--merah)]"
                        style={{ height: `${tinggi}px` }}
                      />
                    ) : null}
                  </div>
                  {/* target hover/fokus + label aksesibilitas */}
                  <button
                    type="button"
                    aria-label={`${labelHari(d.tanggal)} ${d.tanggal}: laba ${formatRupiah(d.laba)}`}
                    className="absolute inset-0 cursor-default"
                  />
                  <span className="pointer-events-none absolute -top-1 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--tinta)] px-1.5 py-0.5 text-[11px] text-[#F6F3E6] group-hover:block group-focus-within:block">
                    {formatRupiah(d.laba)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 text-center text-[11px] text-[var(--pudar)]">
            {data.map((d) => (
              <span key={d.tanggal} className="flex-1">
                {labelHari(d.tanggal)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pasang grafik + rekap bulanan di halaman**

Di `web/src/app/(app)/laporan/page.tsx`:

Tambahkan dua import (di bagian atas bersama import lain):

```tsx
import { kelompokBulanan } from "@/lib/laporan";
import { GrafikLaba } from "./grafik-laba";
```

(Gabungkan `kelompokBulanan` ke dalam import `@/lib/laporan` yang sudah ada.)

Tambahkan sebelum `return (`:

```tsx
  const bulanan = kelompokBulanan(harian);
```

Lalu sisipkan dua section ini tepat sebelum `<section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">` yang berisi "Terlaris":

```tsx
      <section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
        <GrafikLaba baris={harian} />
      </section>

      {bulanan.length > 1 ? (
        <section className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
          <h2 className="display text-lg">Rekap bulanan</h2>
          <table className="mt-2 w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--pudar)]">
                <th className="py-1">Bulan</th>
                <th className="py-1 text-right">Omzet</th>
                <th className="py-1 text-right">HPP</th>
                <th className="py-1 text-right">Pengeluaran</th>
                <th className="py-1 text-right">Laba bersih</th>
              </tr>
            </thead>
            <tbody>
              {bulanan.map((b) => (
                <tr key={b.bulan} className="border-t border-[var(--garis)]">
                  <td className="py-1">{b.bulan}</td>
                  <td className="uang py-1 text-right">{formatRupiah(b.omzet)}</td>
                  <td className="uang py-1 text-right">{formatRupiah(b.hpp)}</td>
                  <td className="uang py-1 text-right">
                    {formatRupiah(b.pengeluaran)}
                  </td>
                  <td
                    className={`uang py-1 text-right font-bold ${
                      b.laba < 0 ? "text-[var(--merah)]" : ""
                    }`}
                  >
                    {formatRupiah(b.laba)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
```

- [ ] **Step 3: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses tanpa warning.

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/(app)/laporan"
git commit -m "feat: laporan — grafik laba 7 hari (aksesibel) & rekap bulanan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Pengguna — daftar, ubah izin, aktif/nonaktif

**Files:**
- Create: `web/src/app/(app)/pengguna/jenis.ts`
- Create: `web/src/app/(app)/pengguna/actions.ts`
- Create: `web/src/app/(app)/pengguna/kartu-pengguna.tsx`
- Modify: `web/src/app/(app)/pengguna/page.tsx` (ganti placeholder)
- Modify: `web/src/lib/auth.ts` (tolak pengguna nonaktif)

**Interfaces:**
- Consumes: `wajibIzin`, `buatClientServer`, `SEMUA_IZIN`/`LABEL_IZIN`/`Izin` (`@/lib/permissions`), `Lembar`, `HasilAksi`.
- Produces: `simpanIzin(userId, izin[]): Promise<HasilAksi>`, `setAktifPengguna(userId, aktif): Promise<HasilAksi>`; tipe `PenggunaBaris`.

- [ ] **Step 1: Tolak pengguna nonaktif**

Di `web/src/lib/auth.ts`, ubah query profil agar ikut mengambil `aktif` dan menolak yang nonaktif. Ganti pemanggilan `.select("nama")` menjadi `.select("nama, aktif")`, lalu tepat sebelum `return {` tambahkan:

```ts
  // profiles.aktif = false berarti akses dicabut
  if (profilRes.data && profilRes.data.aktif === false) return null;
```

- [ ] **Step 2: Tipe**

Create `web/src/app/(app)/pengguna/jenis.ts`:

```ts
export type PenggunaBaris = {
  id: string;
  nama: string;
  email: string;
  aktif: boolean;
  izin: string[];
};
```

- [ ] **Step 3: Server actions**

Create `web/src/app/(app)/pengguna/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { SEMUA_IZIN } from "@/lib/permissions";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanIzin(
  userId: string,
  izin: string[]
): Promise<HasilAksi> {
  const pengguna = await wajibIzin("user");
  if (!userId) return { ok: false, pesan: "Pengguna tidak dikenali." };
  const bersih = izin.filter((i) => (SEMUA_IZIN as readonly string[]).includes(i));
  if (bersih.length === 0) {
    return { ok: false, pesan: "Centang minimal satu hak akses." };
  }
  // Jangan sampai mengunci diri sendiri keluar dari modul pengguna
  if (userId === pengguna.id && !bersih.includes("user")) {
    return {
      ok: false,
      pesan: "Tidak bisa mencabut izin kelola pengguna milik sendiri.",
    };
  }

  const supabase = await buatClientServer();
  const { error: errHapus } = await supabase
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);
  if (errHapus) return { ok: false, pesan: errHapus.message };
  const { error } = await supabase
    .from("user_permissions")
    .insert(bersih.map((p) => ({ user_id: userId, permission: p })));
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengguna");
  return { ok: true };
}

export async function setAktifPengguna(
  userId: string,
  aktif: boolean
): Promise<HasilAksi> {
  const pengguna = await wajibIzin("user");
  if (userId === pengguna.id && !aktif) {
    return { ok: false, pesan: "Tidak bisa menonaktifkan akun sendiri." };
  }
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("profiles")
    .update({ aktif })
    .eq("id", userId);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengguna");
  return { ok: true };
}
```

- [ ] **Step 4: Kartu pengguna + sheet izin**

Create `web/src/app/(app)/pengguna/kartu-pengguna.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { LABEL_IZIN, SEMUA_IZIN } from "@/lib/permissions";
import { setAktifPengguna, simpanIzin } from "./actions";
import type { PenggunaBaris } from "./jenis";

export function KartuPengguna({ pengguna }: { pengguna: PenggunaBaris }) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const semua = pengguna.izin.length === SEMUA_IZIN.length;

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dipilih = new FormData(e.currentTarget).getAll("izin").map(String);
    setSibuk(true);
    const hasil = await simpanIzin(pengguna.id, dipilih);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  async function gantiAktif() {
    setSibuk(true);
    const hasil = await setAktifPengguna(pengguna.id, !pengguna.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <div
      className={`rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 ${
        pengguna.aktif ? "" : "opacity-60"
      }`}
    >
      <p className="font-bold text-[var(--hijau-tua)]">
        {pengguna.nama}
        {pengguna.aktif ? "" : " (nonaktif)"}
      </p>
      <p className="text-xs text-[var(--pudar)]">{pengguna.email}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {semua ? (
          <span className="rounded bg-[var(--hijau)] px-1.5 py-0.5 text-[11px] font-bold text-[#F6F3E6]">
            Semua akses
          </span>
        ) : (
          pengguna.izin.map((i) => (
            <span
              key={i}
              className="rounded bg-[var(--kertas)] px-1.5 py-0.5 text-[11px] text-[var(--pudar)]"
            >
              {LABEL_IZIN[i as keyof typeof LABEL_IZIN] ?? i}
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="mt-3 text-sm font-semibold text-[var(--hijau)] underline"
      >
        Atur akses
      </button>

      {buka ? (
        <Lembar buka judul={`Akses ${pengguna.nama}`} onTutup={() => setBuka(false)}>
          <form onSubmit={simpan}>
            <div className="space-y-1.5">
              {SEMUA_IZIN.map((i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="izin"
                    value={i}
                    defaultChecked={pengguna.izin.includes(i)}
                    className="mt-0.5"
                  />
                  <span>{LABEL_IZIN[i]}</span>
                </label>
              ))}
            </div>
            {pesan ? (
              <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
                {pesan}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sibuk}
              className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] disabled:opacity-50"
            >
              {sibuk ? "Menyimpan…" : "Simpan akses"}
            </button>
          </form>
          <button
            type="button"
            onClick={gantiAktif}
            disabled={sibuk}
            className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)] disabled:opacity-50"
          >
            {pengguna.aktif ? "Nonaktifkan pengguna" : "Aktifkan lagi"}
          </button>
        </Lembar>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Halaman pengguna**

Ganti seluruh isi `web/src/app/(app)/pengguna/page.tsx` dengan:

```tsx
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { KartuPengguna } from "./kartu-pengguna";
import type { PenggunaBaris } from "./jenis";

export default async function HalamanPengguna() {
  await wajibIzin("user");
  const supabase = await buatClientServer();
  const [profilRes, izinRes] = await Promise.all([
    supabase.from("profiles").select("id, nama, aktif").order("nama"),
    supabase.from("user_permissions").select("user_id, permission"),
  ]);
  if (profilRes.error) {
    throw new Error(`Gagal memuat pengguna: ${profilRes.error.message}`);
  }
  if (izinRes.error) {
    throw new Error(`Gagal memuat izin: ${izinRes.error.message}`);
  }

  const izinPer = new Map<string, string[]>();
  for (const b of (izinRes.data ?? []) as {
    user_id: string;
    permission: string;
  }[]) {
    izinPer.set(b.user_id, [...(izinPer.get(b.user_id) ?? []), b.permission]);
  }
  const daftar: PenggunaBaris[] = (
    (profilRes.data ?? []) as { id: string; nama: string; aktif: boolean }[]
  ).map((p) => ({
    id: p.id,
    nama: p.nama,
    email: "",
    aktif: p.aktif,
    izin: izinPer.get(p.id) ?? [],
  }));

  return (
    <div>
      <h1 className="display text-2xl">Pengguna</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        Atur siapa boleh mengakses modul apa. Pengguna nonaktif tidak bisa masuk.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {daftar.map((p) => (
          <KartuPengguna key={p.id} pengguna={p} />
        ))}
      </div>
    </div>
  );
}
```

Catatan: kolom email tidak tersedia lewat `profiles` (email ada di `auth.users` yang tak bisa dibaca klien biasa), jadi kartu menampilkan email kosong untuk sementara — Task 7 mengisinya lewat klien admin.

- [ ] **Step 6: Test + build + smoke**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses; `/pengguna` ƒ.

Dev smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/pengguna` → `307`.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/(app)/pengguna" web/src/lib/auth.ts
git commit -m "feat: pengguna — daftar, atur izin, aktif/nonaktif (aktif kini berlaku)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Pengguna — buat akun baru (service role, server-only)

**Files:**
- Create: `web/src/lib/supabase/admin.ts`
- Modify: `web/src/app/(app)/pengguna/actions.ts` (tambah `buatPengguna`)
- Create: `web/src/app/(app)/pengguna/form-pengguna-baru.tsx`
- Modify: `web/src/app/(app)/pengguna/page.tsx` (tombol + email dari admin)
- Modify: `web/.env.example`

**Interfaces:**
- Consumes: `wajibIzin`, `SEMUA_IZIN`.
- Produces: `buatClientAdmin()` (server-only), `buatPengguna(formData): Promise<HasilAksi>`.

- [ ] **Step 1: Pasang paket `server-only`**

```bash
cd web && npm install server-only
```

- [ ] **Step 2: Klien admin**

Create `web/src/lib/supabase/admin.ts`:

```ts
import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Klien Supabase dengan service role key — MENEMBUS SELURUH RLS.
 * Impor "server-only" di atas membuat build GAGAL bila modul ini sampai
 * terimpor dari komponen klien. Hanya boleh dipakai di server action yang
 * sudah memeriksa izin lebih dulu.
 */
export function buatClientAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kunci) return null;
  return createClient(url, kunci, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 3: Action buat pengguna**

Tambahkan import di BAGIAN ATAS `web/src/app/(app)/pengguna/actions.ts`:

```ts
import { buatClientAdmin } from "@/lib/supabase/admin";
```

lalu tambahkan fungsi ini di AKHIR file:

```ts
export async function buatPengguna(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("user");
  const nama = String(formData.get("nama") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const izin = formData.getAll("izin").map(String);

  if (!nama) return { ok: false, pesan: "Nama wajib diisi." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, pesan: "Email tidak valid." };
  }
  if (password.length < 8) {
    return { ok: false, pesan: "Password minimal 8 karakter." };
  }
  const bersih = izin.filter((i) => (SEMUA_IZIN as readonly string[]).includes(i));
  if (bersih.length === 0) {
    return { ok: false, pesan: "Centang minimal satu hak akses." };
  }

  const admin = buatClientAdmin();
  if (!admin) {
    return {
      ok: false,
      pesan:
        "Fitur buat akun belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY belum diisi).",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama },
  });
  if (error || !data.user) {
    return { ok: false, pesan: error?.message ?? "Gagal membuat akun." };
  }

  // Trigger handle_new_user sudah membuat baris profiles; pastikan namanya benar.
  await admin.from("profiles").update({ nama }).eq("id", data.user.id);
  const { error: errIzin } = await admin
    .from("user_permissions")
    .insert(bersih.map((p) => ({ user_id: data.user.id, permission: p })));
  if (errIzin) return { ok: false, pesan: errIzin.message };

  revalidatePath("/pengguna");
  return { ok: true };
}
```

- [ ] **Step 4: Form pengguna baru**

Create `web/src/app/(app)/pengguna/form-pengguna-baru.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { LABEL_IZIN, SEMUA_IZIN } from "@/lib/permissions";
import { buatPengguna } from "./actions";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormPenggunaBaru() {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await buatPengguna(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
      >
        + Pengguna baru
      </button>
      {buka ? (
        <Lembar buka judul="Pengguna baru" onTutup={() => setBuka(false)}>
          <form onSubmit={kirim}>
            <label className={kelasLabel}>
              Nama
              <input name="nama" required className={kelasInput} />
            </label>
            <label className={kelasLabel}>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Password (minimal 8 karakter)
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                className={kelasInput}
              />
            </label>
            <p className="mt-3 text-sm font-semibold text-[var(--pudar)]">
              Hak akses
            </p>
            <div className="mt-1 space-y-1.5">
              {SEMUA_IZIN.map((i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                >
                  <input type="checkbox" name="izin" value={i} className="mt-0.5" />
                  <span>{LABEL_IZIN[i]}</span>
                </label>
              ))}
            </div>
            {pesan ? (
              <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
                {pesan}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sibuk}
              className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] disabled:opacity-50"
            >
              {sibuk ? "Membuat…" : "Buat akun"}
            </button>
          </form>
        </Lembar>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Pasang tombol + isi email di halaman**

Di `web/src/app/(app)/pengguna/page.tsx`:

Tambahkan import:

```tsx
import { buatClientAdmin } from "@/lib/supabase/admin";
import { FormPenggunaBaru } from "./form-pengguna-baru";
```

Tambahkan setelah `const izinPer = ...` selesai dibangun (sebelum `const daftar`):

```tsx
  // Email hanya bisa dibaca lewat klien admin; bila belum dikonfigurasi,
  // kartu tampil tanpa email.
  const admin = buatClientAdmin();
  const emailPer = new Map<string, string>();
  if (admin) {
    const { data: adminUsers } = await admin.auth.admin.listUsers();
    for (const u of adminUsers?.users ?? []) {
      if (u.email) emailPer.set(u.id, u.email);
    }
  }
```

Ganti `email: "",` menjadi `email: emailPer.get(p.id) ?? "",`.

Ganti blok judul menjadi (menambahkan tombol di kanan):

```tsx
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Pengguna</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            Atur siapa boleh mengakses modul apa. Pengguna nonaktif tidak bisa masuk.
          </p>
        </div>
        <FormPenggunaBaru />
      </div>
```

- [ ] **Step 6: Dokumentasikan env**

Tambahkan baris ini di AKHIR `web/.env.example`:

```bash
# Server-only. JANGAN diberi awalan NEXT_PUBLIC_ — kunci ini menembus seluruh RLS.
# Ambil dari Supabase dashboard → Settings → API → service_role.
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

- [ ] **Step 7: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses. (Tanpa env service role, halaman tetap build & jalan — email kosong dan tombol buat akun mengembalikan pesan konfigurasi.)

- [ ] **Step 8: Commit**

```bash
git add "web/src/app/(app)/pengguna" web/src/lib/supabase/admin.ts web/.env.example web/package.json web/package-lock.json
git commit -m "feat: pengguna — buat akun baru lewat admin API (server-only)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Utang teknis SQL — buat_menu atomik & nama unik

**Files:**
- Create: `supabase/migrations/20260724000005_utang_teknis.sql`
- Modify: `web/src/app/(app)/menu/actions.ts` (pakai RPC `buat_menu`)

**Interfaces:**
- Produces: `public.buat_menu(p_nama text, p_kategori text, p_nama_varian text, p_harga integer) returns uuid`.

- [ ] **Step 1: Migrasi**

Create `supabase/migrations/20260724000005_utang_teknis.sql`:

```sql
-- Pembuatan menu + varian pertama harus atomik: sebelumnya dua langkah
-- terpisah dengan hapus-kompensasi, sehingga bisa meninggalkan menu tanpa varian.
create or replace function public.buat_menu(
  p_nama text,
  p_kategori text,
  p_nama_varian text,
  p_harga integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_produk_id uuid;
begin
  if not public.has_permission(auth.uid(), 'menu') then
    raise exception 'butuh izin menu';
  end if;
  if btrim(coalesce(p_nama,'')) = '' or btrim(coalesce(p_kategori,'')) = '' then
    raise exception 'nama dan kategori wajib diisi';
  end if;
  if btrim(coalesce(p_nama_varian,'')) = '' then
    raise exception 'nama varian wajib diisi';
  end if;
  if p_harga is null or p_harga < 0 then
    raise exception 'harga tidak valid';
  end if;

  insert into public.products (nama, kategori)
  values (btrim(p_nama), btrim(p_kategori))
  returning id into v_produk_id;

  insert into public.product_variants (product_id, nama, harga)
  values (v_produk_id, btrim(p_nama_varian), p_harga);

  return v_produk_id;
end;
$$;

revoke execute on function public.buat_menu(text, text, text, integer) from public, anon;
grant execute on function public.buat_menu(text, text, text, integer) to authenticated;

-- Cegah nama ganda (abaikan besar-kecil huruf) pada bahan & menu.
create unique index ingredients_nama_unik on public.ingredients (lower(nama));
create unique index products_nama_unik on public.products (lower(nama));
```

- [ ] **Step 2: Pakai RPC di action menu**

Di `web/src/app/(app)/menu/actions.ts`, di dalam `simpanMenu`, ganti seluruh cabang `else` (jalur pembuatan menu baru — yang meng-insert `products` lalu `product_variants` dan menghapus produk bila varian gagal) dengan:

```ts
  } else {
    const namaVarian = String(formData.get("nama_varian") ?? "").trim();
    const harga = Number(formData.get("harga"));
    if (!namaVarian) {
      return { ok: false, pesan: "Nama varian pertama wajib diisi." };
    }
    if (!Number.isInteger(harga) || harga < 0) {
      return { ok: false, pesan: "Harga tidak valid." };
    }
    const { error } = await supabase.rpc("buat_menu", {
      p_nama: nama,
      p_kategori: kategori,
      p_nama_varian: namaVarian,
      p_harga: harga,
    });
    if (error) {
      return {
        ok: false,
        pesan:
          error.code === "23505" ? "Menu dengan nama itu sudah ada." : error.message,
      };
    }
  }
```

- [ ] **Step 3: Pesan nama ganda untuk bahan**

Di `web/src/app/(app)/stok/actions.ts`, di `simpanBahan`, ganti baris `if (error) return { ok: false, pesan: error.message };` menjadi:

```ts
  if (error) {
    return {
      ok: false,
      pesan:
        error.code === "23505" ? "Bahan dengan nama itu sudah ada." : error.message,
    };
  }
```

- [ ] **Step 4: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724000005_utang_teknis.sql "web/src/app/(app)/menu/actions.ts" "web/src/app/(app)/stok/actions.ts"
git commit -m "fix: buat_menu atomik lewat RPC + nama bahan/menu unik

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Utang teknis UI — peringatan stok minus per transaksi

**Files:**
- Create: `supabase/migrations/20260724000006_stok_minus_transaksi.sql`
- Modify: `web/src/app/(app)/kasir/actions.ts` (pakai daftar dari RPC)

**Interfaces:**
- Consumes: `catat_penjualan` (Rencana 3).
- Produces: `catat_penjualan` versi baru yang ikut mengembalikan `stok_minus` (array nama bahan yang menjadi minus **akibat transaksi ini**).

**PENTING — jangan ubah `20260724000003` di tempat.** Migrasi itu mungkin sudah diterapkan ke produksi (user diminta `supabase db push` setelah Rencana 3). Mengedit migrasi yang sudah diterapkan **tidak berefek apa pun** — Supabase melacak migrasi berdasarkan nama, jadi file yang diubah tidak dijalankan ulang dan perubahannya hilang diam-diam. Karena itu task ini membuat migrasi BARU berisi `create or replace` fungsi utuh, yang benar baik migrasi lama sudah diterapkan maupun belum.

- [ ] **Step 1: Migrasi baru — catat_penjualan mengembalikan stok_minus**

Create `supabase/migrations/20260724000006_stok_minus_transaksi.sql` (fungsi utuh; hanya bagian pemotongan stok dan `return` yang berbeda dari versi sebelumnya):

```sql
-- Ganti catat_penjualan agar peringatan stok minus hanya menyebut bahan yang
-- menjadi minus AKIBAT transaksi ini, bukan semua bahan yang sedang minus
-- (sebelumnya peringatan muncul terus-menerus sampai diopname).
-- Dibuat sebagai migrasi baru (create or replace) supaya tetap berlaku
-- walau migrasi 20260724000003 sudah terlanjur diterapkan.
create or replace function public.catat_penjualan(
  p_metode text,
  p_uang_diterima integer,
  p_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total integer := 0;
  v_item jsonb;
  v_qty integer;
  v_varian public.product_variants%rowtype;
  v_produk_nama text;
  v_hpp numeric(12,2);
  v_pakai record;
  v_kembalian integer;
  v_minus text[] := '{}';
  v_nama_bahan text;
  v_stok_baru numeric;
begin
  if not public.has_permission(auth.uid(), 'kasir') then
    raise exception 'butuh izin kasir';
  end if;
  if p_metode is null or p_metode not in ('tunai','qris') then
    raise exception 'metode pembayaran tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'keranjang kosong';
  end if;

  insert into public.sales (metode, status, created_by)
  values (p_metode, 'selesai', auth.uid())
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'jumlah item harus lebih dari 0';
    end if;

    select * into v_varian
    from public.product_variants
    where id = (v_item ->> 'variant_id')::uuid and aktif;
    if not found then
      raise exception 'varian tidak ditemukan atau nonaktif';
    end if;

    select nama into v_produk_nama
    from public.products where id = v_varian.product_id;

    -- HPP dibekukan: resep x harga rata-rata bahan SAAT INI
    select coalesce(round(sum(ri.qty * i.harga_rata), 2), 0)
      into v_hpp
    from public.recipe_items ri
    join public.ingredients i on i.id = ri.ingredient_id
    where ri.variant_id = v_varian.id;

    insert into public.sale_items
      (sale_id, variant_id, nama_snapshot, qty, harga, hpp)
    values
      (v_sale_id, v_varian.id,
       btrim(coalesce(v_produk_nama,'') || ' ' || v_varian.nama),
       v_qty, v_varian.harga, v_hpp);

    v_total := v_total + v_qty * v_varian.harga;
  end loop;

  if p_metode = 'tunai' then
    if p_uang_diterima is null or p_uang_diterima < v_total then
      raise exception 'uang diterima kurang dari total';
    end if;
    v_kembalian := p_uang_diterima - v_total;
    update public.sales
    set uang_diterima = p_uang_diterima,
        kembalian = v_kembalian
    where id = v_sale_id;
  end if;

  -- Potong stok: agregasi pemakaian per bahan lintas semua item.
  -- Stok boleh menjadi minus (tidak diblokir) sesuai spec; bahan yang
  -- menjadi minus dicatat untuk diperingatkan ke kasir.
  for v_pakai in
    select ri.ingredient_id, sum(ri.qty * si.qty) as pakai
    from public.sale_items si
    join public.recipe_items ri on ri.variant_id = si.variant_id
    where si.sale_id = v_sale_id
    group by ri.ingredient_id
  loop
    update public.ingredients
    set stok = stok - v_pakai.pakai
    where id = v_pakai.ingredient_id
    returning nama, stok into v_nama_bahan, v_stok_baru;

    if v_stok_baru < 0 then
      v_minus := array_append(v_minus, v_nama_bahan);
    end if;

    insert into public.stock_movements
      (ingredient_id, tipe, qty, ref_id, created_by)
    values
      (v_pakai.ingredient_id, 'penjualan', -v_pakai.pakai, v_sale_id, auth.uid());
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'total', v_total,
    'kembalian', coalesce(v_kembalian, 0),
    'stok_minus', to_jsonb(v_minus)
  );
end;
$$;
```

(Argumen fungsi tidak berubah, jadi `grant`/`revoke` dari migrasi 0003 tetap berlaku — tidak perlu diulang.)

- [ ] **Step 2: Pakai daftar itu di action**

Di `web/src/app/(app)/kasir/actions.ts`, di `catatPenjualan`: hapus query `supabase.from("ingredients").select("nama").eq("aktif", true).lt("stok", 0)` beserta pemakaiannya, lalu baca daftar dari payload RPC. Ganti bagian yang menyusun nilai balik menjadi:

```ts
  const hasil = data as {
    total?: unknown;
    kembalian?: unknown;
    stok_minus?: unknown;
  } | null;
  const stokMinus = Array.isArray(hasil?.stok_minus)
    ? hasil.stok_minus.map(String)
    : [];

  revalidatePath("/kasir");
  revalidatePath("/stok");
  return {
    ok: true,
    stokMinus,
    total: Number(hasil?.total ?? 0),
    kembalian: Number(hasil?.kembalian ?? 0),
  };
```

- [ ] **Step 3: Test + build**

```bash
cd web && npm test && npm run build
```
Expected: 42 passed; build sukses.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260724000006_stok_minus_transaksi.sql "web/src/app/(app)/kasir/actions.ts"
git commit -m "fix: peringatan stok minus hanya untuk bahan transaksi ini

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Verifikasi produksi *(perlu tindakan user)*

**Files:** tidak ada.

- [ ] **Step 1: Isi env service role** *(user)*

Ambil dari Supabase dashboard → Settings → API → `service_role`. Tambahkan ke `web/.env.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

dan ke Vercel → Project → Settings → Environment Variables (nama sama, **tanpa** `NEXT_PUBLIC_`).

- [ ] **Step 2: Push migrasi & deploy** *(user)*

```bash
cd /Users/arvinfairuz/Documents/seteguk
npx supabase db push
git push
```
Verifikasi di dashboard → Database → Functions: `laporan_harian`, `terlaris`, `buat_menu` muncul, dan `catat_penjualan` sudah versi baru (mengembalikan `stok_minus`).

- [ ] **Step 3: Walkthrough** *(user, login owner)*

1. `/pengeluaran` → **+ Catat pengeluaran**: kategori "Listrik & air", nominal `50000`, catatan "uji" → muncul di daftar, total bertambah. Coba **tambah kategori baru** → muncul di pilihan.
2. `/laporan` → preset **Hari ini**: omzet & jumlah transaksi cocok dengan riwayat kasir; **HPP** terisi; **Pengeluaran** = Rp50.000 tadi; **Laba bersih** = omzet − HPP − pengeluaran. Mini-stat tunai/QRIS cocok dengan metode transaksi.
3. Preset **7 hari** → grafik muncul; ketuk **"Lihat tabel angka"** → tabel angka yang sama tampil (uji aksesibilitas). Hover/Tab ke batang → nilai muncul.
4. Kalau rentangnya melintasi dua bulan → **Rekap bulanan** muncul.
5. `/pengguna` → kartu owner tampil dengan badge "Semua akses" dan email terisi.
6. **+ Pengguna baru**: nama "Kasir Uji", email bebas, password ≥8 karakter, centang **hanya** izin Kasir → Buat akun.
7. **Logout, login sebagai Kasir Uji** → hanya menu Kasir yang tampil; buka `/laporan` langsung → terlempar ke beranda.
8. Login lagi sebagai owner → `/pengguna` → **Nonaktifkan** Kasir Uji. Coba login sebagai Kasir Uji → **tidak bisa masuk** (dilempar ke /login).
9. Coba **nonaktifkan akun sendiri** → ditolak dengan pesan. Coba **hapus centang "Kelola pengguna"** pada akun sendiri → ditolak.
10. `/menu` → tambah menu dengan nama yang sudah ada → ditolak "Menu dengan nama itu sudah ada". `/stok` → tambah bahan dengan nama yang sudah ada → ditolak serupa.

- [ ] **Step 4: Bersihkan data uji** *(opsional)*

Nonaktifkan pengguna "Kasir Uji" (atau hapus lewat dashboard Authentication), dan catat pengeluaran penyesuaian bila perlu.

---

## Selesai

Setelah Rencana 4, seluruh spec induk (`2026-07-24-seteguk-pos-design.md`) terpenuhi: kasir, menu & resep, stok, pengeluaran, laporan, dan pengguna. Utang teknis yang tersisa dan sengaja tidak dikerjakan: ekstrak `<FormLembar>` bersama (dedup `kelasInput`/`kelasLabel` + `role="dialog"`/Escape pada `Lembar`) dan `supabase gen types` untuk mengganti cast manual — keduanya perbaikan kualitas internal tanpa dampak perilaku, cocok dikerjakan kapan saja.
