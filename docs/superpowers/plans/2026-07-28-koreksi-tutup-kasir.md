# Koreksi & Buka Kembali Tutup Kasir — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemegang izin `user` bisa mengubah nominal tutup kasir dan membuka kembali hari yang telanjur ditutup, lewat section baru di halaman Laporan, dengan setiap perubahan tercatat di log wajib-alasan.

**Architecture:** Semua mutasi `cash_closings` dipindahkan ke fungsi SQL `security definer` yang menulis `cash_closing_log` dalam transaksi yang sama — tabelnya sendiri sengaja kehilangan seluruh policy tulis, sehingga tidak ada jalan mengubah angka tanpa jejak lewat Data API. UI berupa satu section server component di halaman Laporan plus lembar aksi client component, memakai ulang form tutup kasir yang diangkat dari layar Kasir. Logika murni (validasi, pemetaan pesan error, perumusan kalimat riwayat) hidup di `web/src/lib/tutup-kasir.ts` dan diuji dengan Vitest.

**Tech Stack:** Next.js 16 (App Router, server actions, TS strict), Supabase (Postgres + RLS + RPC via @supabase/ssr), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-koreksi-tutup-kasir-design.md`

## Global Constraints

- Semua copy UI Bahasa Indonesia, sentence case.
- Aksi koreksi (ubah nominal, buka kembali, tutup tanggal lampau) butuh izin **`user`**. Tidak ada izin baru — `SEMUA_IZIN` di `web/src/lib/permissions.ts` tidak berubah.
- Fungsi SQL `security definer` WAJIB mengecek `public.has_permission(auth.uid(), '<izin>')` di dalamnya, karena melewati RLS.
- `cash_closings` **tidak boleh** punya policy `insert`, `update`, atau `delete`. Satu-satunya jalan mengubahnya adalah RPC di Task 1. Ini yang membuat log tidak bisa dilewati.
- Alasan wajib: minimal 3 karakter setelah `btrim`. Divalidasi di server action **dan** di dalam RPC.
- Uang: `integer` rupiah. `tunai_sistem` **selalu dihitung ulang** dari penjualan, tidak pernah dipakai ulang dari baris lama.
- Batas hari memakai **Asia/Jakarta (WIB)**: `(waktu at time zone 'Asia/Jakarta')::date`.
- TypeScript strict, tanpa `any` — hasil RPC (untyped) di-cast ke tipe lokal.
- Next.js 16: middleware bernama `web/src/proxy.ts` (JANGAN diubah); `cookies()` async. Bila ragu API, baca `web/node_modules/next/dist/docs/`.
- Konvensi grant tiap objek SQL baru: `revoke execute ... from public, anon;` lalu `grant execute ... to authenticated;` (lihat `20260724000003_fungsi_kasir.sql:197-202`). Tabel baru butuh `grant select ... to authenticated;`.
- `web/.env.local` berisi kredensial Supabase **PRODUKSI**. **Dilarang menulis data uji lewat skrip/RPC.** Dilarang keras menjalankan `supabase db reset` atau `supabase db push` — push migrasi dilakukan user di Task 7.
- Perintah uji: `cd web && npm test`. Lint: `cd web && npm run lint`.
- Setiap commit diakhiri baris: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 1: Migrasi SQL — tabel log, penutupan jalur tulis, lima fungsi

**Files:**
- Create: `supabase/migrations/20260728000001_koreksi_tutup_kasir.sql`

**Interfaces:**
- Consumes: `public.cash_closings`, `public.sales`, `public.sale_items`, `public.profiles`, `public.has_permission(uuid, text)` dari migrasi sebelumnya.
- Produces (dipanggil Task 3, 5, 6 lewat `supabase.rpc`):
  - `public.tutup_kasir(p_tanggal date, p_tunai_fisik integer, p_catatan text) returns void`
  - `public.ubah_tutup_kasir(p_tanggal date, p_tunai_fisik integer, p_alasan text) returns void`
  - `public.buka_kasir(p_tanggal date, p_alasan text) returns void`
  - `public.daftar_tutup_kasir(p_dari date, p_sampai date) returns table (tanggal date, tunai_sistem integer, tunai_fisik integer, selisih integer, catatan text, oleh text)`
  - `public.riwayat_tutup_kasir(p_dari date, p_sampai date) returns table (tanggal date, aksi text, tunai_fisik_lama integer, tunai_fisik_baru integer, alasan text, oleh text, created_at timestamptz)`

- [ ] **Step 1: Tulis migrasi**

Create `supabase/migrations/20260728000001_koreksi_tutup_kasir.sql`:

```sql
-- Koreksi tutup kasir: ubah nominal & buka kembali, selalu berjejak.
--
-- Seluruh mutasi cash_closings dipindahkan ke fungsi security definer di berkas
-- ini, dan policy tulis tabelnya DIHAPUS. Alasannya: kalau policy update/delete
-- diberikan ke pemegang izin 'user', dia bisa memanggil Data API langsung
-- (.update()/.delete()) dan mengubah angka tanpa melewati penulisan log —
-- persis yang ingin dicegah. Policy insert lama juga dihapus karena tutup kasir
-- kini lewat tutup_kasir().

-- ===== Log koreksi =====
create table public.cash_closing_log (
  id uuid primary key default gen_random_uuid(),
  -- tanggal kasir yang dikoreksi, BUKAN tanggal aksi (itu created_at)
  tanggal date not null,
  aksi text not null check (aksi in ('ubah','buka','tutup_ulang')),
  tunai_sistem_lama integer,
  tunai_fisik_lama integer,
  selisih_lama integer,
  tunai_sistem_baru integer,
  tunai_fisik_baru integer,
  selisih_baru integer,
  alasan text not null check (length(btrim(alasan)) >= 3),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index cash_closing_log_tanggal_idx on public.cash_closing_log (tanggal);

alter table public.cash_closing_log enable row level security;

-- Hanya bisa dibaca. Tidak ada policy insert/update/delete: penulisan eksklusif
-- lewat fungsi security definer di bawah, dan baris log tidak pernah diubah.
create policy "baca log tutup kasir" on public.cash_closing_log
  for select using (
    public.has_permission(auth.uid(), 'laporan')
    or public.has_permission(auth.uid(), 'user')
  );

-- ===== Tutup jalur tulis langsung ke cash_closings =====
drop policy "catat tutup kasir" on public.cash_closings;

-- ===== Tunai sistem satu tanggal =====
-- Angka turunan: selalu dihitung ulang dari penjualan, tidak pernah disalin
-- dari baris penutupan lama.
create or replace function public.tunai_sistem_tanggal(p_tanggal date)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(si.qty * si.harga), 0)::integer
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where s.metode = 'tunai'
    and s.status = 'selesai'
    and (s.waktu at time zone 'Asia/Jakarta')::date = p_tanggal;
$$;

-- ===== Tutup kasir (bertanggal) =====
create or replace function public.tutup_kasir(
  p_tanggal date,
  p_tunai_fisik integer,
  p_catatan text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_sistem integer;
  v_pernah boolean;
begin
  if p_tanggal is null then
    raise exception 'tanggal tidak valid';
  end if;
  if p_tanggal > v_hari_ini then
    raise exception 'tanggal di masa depan';
  end if;
  -- Kasir hanya boleh menutup hari berjalan; tanggal lampau butuh izin user.
  if p_tanggal = v_hari_ini then
    if not (public.has_permission(auth.uid(), 'kasir')
            or public.has_permission(auth.uid(), 'user')) then
      raise exception 'butuh izin kasir';
    end if;
  else
    if not public.has_permission(auth.uid(), 'user') then
      raise exception 'butuh izin user';
    end if;
  end if;
  if p_tunai_fisik is null or p_tunai_fisik < 0 then
    raise exception 'nominal tidak valid';
  end if;

  v_sistem := public.tunai_sistem_tanggal(p_tanggal);
  -- Ada log untuk tanggal ini = tanggal ini pernah dibuka/dikoreksi, jadi
  -- penutupan sekarang adalah penutupan ULANG dan wajib ikut tercatat.
  -- Penutupan pertama yang normal tidak mengotori log.
  v_pernah := exists (
    select 1 from public.cash_closing_log where tanggal = p_tanggal
  );

  begin
    insert into public.cash_closings
      (tanggal, tunai_sistem, tunai_fisik, selisih, catatan, created_by)
    values
      (p_tanggal, v_sistem, p_tunai_fisik, p_tunai_fisik - v_sistem,
       coalesce(p_catatan, ''), auth.uid());
  exception when unique_violation then
    raise exception 'kasir tanggal ini sudah ditutup';
  end;

  if v_pernah then
    insert into public.cash_closing_log
      (tanggal, aksi, tunai_sistem_baru, tunai_fisik_baru, selisih_baru,
       alasan, created_by)
    values
      (p_tanggal, 'tutup_ulang', v_sistem, p_tunai_fisik,
       p_tunai_fisik - v_sistem,
       -- catatan boleh kosong/pendek, tapi kolom alasan wajib >= 3 karakter
       case when length(btrim(coalesce(p_catatan, ''))) >= 3
            then btrim(p_catatan)
            else 'tutup ulang setelah dibuka' end,
       auth.uid());
  end if;
end;
$$;

-- ===== Ubah nominal =====
create or replace function public.ubah_tutup_kasir(
  p_tanggal date,
  p_tunai_fisik integer,
  p_alasan text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lama public.cash_closings%rowtype;
  v_sistem integer;
begin
  if not public.has_permission(auth.uid(), 'user') then
    raise exception 'butuh izin user';
  end if;
  if p_tunai_fisik is null or p_tunai_fisik < 0 then
    raise exception 'nominal tidak valid';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'alasan wajib diisi';
  end if;

  -- for update: menyerialkan dua pemilik yang mengubah/membuka tanggal sama.
  select * into v_lama from public.cash_closings
  where tanggal = p_tanggal for update;
  if not found then
    raise exception 'tutup kasir tanggal ini sudah dibuka';
  end if;
  if v_lama.tunai_fisik = p_tunai_fisik then
    raise exception 'nominal tidak berubah';
  end if;

  v_sistem := public.tunai_sistem_tanggal(p_tanggal);

  update public.cash_closings
  set tunai_sistem = v_sistem,
      tunai_fisik = p_tunai_fisik,
      selisih = p_tunai_fisik - v_sistem
  where tanggal = p_tanggal;

  insert into public.cash_closing_log
    (tanggal, aksi, tunai_sistem_lama, tunai_fisik_lama, selisih_lama,
     tunai_sistem_baru, tunai_fisik_baru, selisih_baru, alasan, created_by)
  values
    (p_tanggal, 'ubah', v_lama.tunai_sistem, v_lama.tunai_fisik, v_lama.selisih,
     v_sistem, p_tunai_fisik, p_tunai_fisik - v_sistem, btrim(p_alasan),
     auth.uid());
end;
$$;

-- ===== Buka kembali =====
-- Menghapus barisnya, bukan menandai status: void_penjualan mengunci lewat
-- exists(...) dan laporan_harian memakai left join, jadi menghapus otomatis
-- membuka kunci void dan mengosongkan selisih hari itu tanpa menyentuh
-- keduanya. Jejaknya tetap utuh di cash_closing_log.
create or replace function public.buka_kasir(p_tanggal date, p_alasan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lama public.cash_closings%rowtype;
begin
  if not public.has_permission(auth.uid(), 'user') then
    raise exception 'butuh izin user';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'alasan wajib diisi';
  end if;

  select * into v_lama from public.cash_closings
  where tanggal = p_tanggal for update;
  if not found then
    raise exception 'tutup kasir tanggal ini sudah dibuka';
  end if;

  insert into public.cash_closing_log
    (tanggal, aksi, tunai_sistem_lama, tunai_fisik_lama, selisih_lama,
     alasan, created_by)
  values
    (p_tanggal, 'buka', v_lama.tunai_sistem, v_lama.tunai_fisik, v_lama.selisih,
     btrim(p_alasan), auth.uid());

  delete from public.cash_closings where tanggal = p_tanggal;
end;
$$;

-- ===== Baca untuk halaman Laporan =====
-- security definer karena butuh nama pelaku: RLS profiles hanya mengizinkan
-- melihat profil sendiri, kecuali pemegang izin 'user'. Fungsi ini membuka
-- tepat satu kolom nama, jauh lebih sempit daripada melonggarkan RLS profiles.
create or replace function public.daftar_tutup_kasir(p_dari date, p_sampai date)
returns table (
  tanggal date,
  tunai_sistem integer,
  tunai_fisik integer,
  selisih integer,
  catatan text,
  oleh text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.has_permission(auth.uid(), 'laporan')
          or public.has_permission(auth.uid(), 'user')) then
    raise exception 'butuh izin laporan';
  end if;
  return query
    select c.tanggal, c.tunai_sistem, c.tunai_fisik, c.selisih, c.catatan,
           coalesce(p.nama, 'Pengguna')
    from public.cash_closings c
    left join public.profiles p on p.id = c.created_by
    where c.tanggal between p_dari and p_sampai
    order by c.tanggal desc;
end;
$$;

create or replace function public.riwayat_tutup_kasir(p_dari date, p_sampai date)
returns table (
  tanggal date,
  aksi text,
  tunai_fisik_lama integer,
  tunai_fisik_baru integer,
  alasan text,
  oleh text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.has_permission(auth.uid(), 'laporan')
          or public.has_permission(auth.uid(), 'user')) then
    raise exception 'butuh izin laporan';
  end if;
  return query
    select l.tanggal, l.aksi, l.tunai_fisik_lama, l.tunai_fisik_baru, l.alasan,
           coalesce(p.nama, 'Pengguna'), l.created_at
    from public.cash_closing_log l
    left join public.profiles p on p.id = l.created_by
    where l.tanggal between p_dari and p_sampai
    order by l.created_at desc;
end;
$$;

-- ===== Hak akses Data API =====
grant select on public.cash_closing_log to authenticated;

revoke execute on function public.tunai_sistem_tanggal(date) from public, anon;
revoke execute on function public.tutup_kasir(date, integer, text) from public, anon;
revoke execute on function public.ubah_tutup_kasir(date, integer, text) from public, anon;
revoke execute on function public.buka_kasir(date, text) from public, anon;
revoke execute on function public.daftar_tutup_kasir(date, date) from public, anon;
revoke execute on function public.riwayat_tutup_kasir(date, date) from public, anon;

-- tunai_sistem_tanggal sengaja TIDAK di-grant ke authenticated: hanya dipanggil
-- dari dalam fungsi lain (konteks pemilik), jadi tidak perlu jadi permukaan API.
grant execute on function public.tutup_kasir(date, integer, text) to authenticated;
grant execute on function public.ubah_tutup_kasir(date, integer, text) to authenticated;
grant execute on function public.buka_kasir(date, text) to authenticated;
grant execute on function public.daftar_tutup_kasir(date, date) to authenticated;
grant execute on function public.riwayat_tutup_kasir(date, date) to authenticated;
```

- [ ] **Step 2: Periksa migrasi terbaca sebagai SQL yang sah**

Migrasi TIDAK dijalankan terhadap produksi oleh agen. Verifikasi yang boleh dilakukan hanyalah pembacaan ulang berkas: pastikan setiap `create or replace function` ditutup `$$;`, setiap `begin ... end` berpasangan, dan seluruh nama fungsi di blok `grant` cocok persis dengan tanda tangan yang dideklarasikan (termasuk tipe parameternya).

Run: `grep -c '^\$\$;' supabase/migrations/20260728000001_koreksi_tutup_kasir.sql`
Expected: `6` (tunai_sistem_tanggal, tutup_kasir, ubah_tutup_kasir, buka_kasir, daftar_tutup_kasir, riwayat_tutup_kasir)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260728000001_koreksi_tutup_kasir.sql
git commit -m "$(cat <<'EOF'
feat(sql): log koreksi tutup kasir + RPC ubah, buka, tutup bertanggal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Logika murni `lib/tutup-kasir.ts` (TDD)

**Files:**
- Create: `web/src/lib/tutup-kasir.ts`
- Test: `web/src/lib/tutup-kasir.test.ts`

**Interfaces:**
- Consumes: `formatRupiah` dari `web/src/lib/format.ts`, `tanggalJakarta` dari `web/src/lib/kasir.ts`.
- Produces (dipakai Task 3, 5, 6):
  - `type AksiLog = "ubah" | "buka" | "tutup_ulang"`
  - `type BarisLog = { tanggal: string; aksi: AksiLog; tunai_fisik_lama: number | null; tunai_fisik_baru: number | null; alasan: string; oleh: string; created_at: string }`
  - `type BarisTutup = { tanggal: string; tunai_sistem: number; tunai_fisik: number; selisih: number; catatan: string; oleh: string }`
  - `alasanValid(alasan: string): boolean`
  - `nominalValid(n: number): boolean`
  - `tanggalValid(tanggal: string): boolean`
  - `pesanErrorRpc(pesan: string): string`
  - `formatTanggalPendek(tanggal: string): string`
  - `kalimatRiwayat(b: BarisLog): string`

- [ ] **Step 1: Tulis test yang gagal**

Create `web/src/lib/tutup-kasir.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  alasanValid,
  formatTanggalPendek,
  kalimatRiwayat,
  nominalValid,
  pesanErrorRpc,
  tanggalValid,
  type BarisLog,
} from "./tutup-kasir";

describe("alasanValid", () => {
  it("kosong ditolak", () => {
    expect(alasanValid("")).toBe(false);
  });
  it("spasi saja ditolak", () => {
    expect(alasanValid("   ")).toBe(false);
  });
  it("dua karakter ditolak", () => {
    expect(alasanValid("ok")).toBe(false);
  });
  it("tiga karakter diterima", () => {
    expect(alasanValid("typo")).toBe(true);
  });
  it("dihitung setelah trim", () => {
    expect(alasanValid("  ab  ")).toBe(false);
  });
});

describe("nominalValid", () => {
  it("nol diterima", () => {
    expect(nominalValid(0)).toBe(true);
  });
  it("negatif ditolak", () => {
    expect(nominalValid(-1)).toBe(false);
  });
  it("pecahan ditolak", () => {
    expect(nominalValid(1500.5)).toBe(false);
  });
  it("NaN ditolak", () => {
    expect(nominalValid(Number.NaN)).toBe(false);
  });
});

describe("tanggalValid", () => {
  it("format YYYY-MM-DD diterima", () => {
    expect(tanggalValid("2026-07-28")).toBe(true);
  });
  it("format lain ditolak", () => {
    expect(tanggalValid("28-07-2026")).toBe(false);
  });
  it("kosong ditolak", () => {
    expect(tanggalValid("")).toBe(false);
  });
});

describe("pesanErrorRpc", () => {
  it("sudah ditutup", () => {
    expect(pesanErrorRpc("kasir tanggal ini sudah ditutup")).toBe(
      "Kasir tanggal ini sudah ditutup."
    );
  });
  it("sudah dibuka orang lain", () => {
    expect(pesanErrorRpc("tutup kasir tanggal ini sudah dibuka")).toBe(
      "Tutup kasir tanggal ini sudah dibuka oleh pengguna lain."
    );
  });
  it("nominal tidak berubah", () => {
    expect(pesanErrorRpc("nominal tidak berubah")).toBe(
      "Nominal tidak berubah."
    );
  });
  it("izin kurang", () => {
    expect(pesanErrorRpc("butuh izin user")).toBe(
      "Anda tidak punya akses untuk aksi ini."
    );
  });
  it("tanggal di masa depan", () => {
    expect(pesanErrorRpc("tanggal di masa depan")).toBe(
      "Tanggal itu belum terjadi."
    );
  });
  it("pesan tak dikenal diteruskan apa adanya", () => {
    expect(pesanErrorRpc("connection reset")).toBe("connection reset");
  });
});

describe("formatTanggalPendek", () => {
  it("menghapus nol di depan tanggal", () => {
    expect(formatTanggalPendek("2026-08-03")).toBe("3 Agu 2026");
  });
  it("bulan Juli", () => {
    expect(formatTanggalPendek("2026-07-28")).toBe("28 Jul 2026");
  });
  it("Desember", () => {
    expect(formatTanggalPendek("2025-12-31")).toBe("31 Des 2025");
  });
});

const DASAR: BarisLog = {
  tanggal: "2026-07-27",
  aksi: "ubah",
  tunai_fisik_lama: 350000,
  tunai_fisik_baru: 380000,
  alasan: "salah ketik nol",
  oleh: "Arvin",
  created_at: "2026-08-03T02:00:00Z",
};

describe("kalimatRiwayat", () => {
  it("aksi ubah menyebut nilai lama dan baru", () => {
    expect(kalimatRiwayat(DASAR)).toBe(
      'Nominal diubah Rp350.000 → Rp380.000 — Arvin, 3 Agu 2026, "salah ketik nol"'
    );
  });
  it("aksi buka menyebut nilai yang dibatalkan", () => {
    expect(
      kalimatRiwayat({
        ...DASAR,
        aksi: "buka",
        tunai_fisik_baru: null,
        alasan: "kasir salah pencet",
      })
    ).toBe(
      'Kasir dibuka kembali (fisik Rp350.000) — Arvin, 3 Agu 2026, "kasir salah pencet"'
    );
  });
  it("aksi tutup_ulang menyebut nilai baru", () => {
    expect(
      kalimatRiwayat({
        ...DASAR,
        aksi: "tutup_ulang",
        tunai_fisik_lama: null,
        alasan: "tutup ulang setelah dibuka",
      })
    ).toBe(
      'Ditutup ulang Rp380.000 — Arvin, 3 Agu 2026, "tutup ulang setelah dibuka"'
    );
  });
  it("waktu aksi dibaca dalam WIB, bukan UTC", () => {
    // 20:00 UTC = 03:00 WIB keesokan harinya
    expect(
      kalimatRiwayat({ ...DASAR, created_at: "2026-08-03T20:00:00Z" })
    ).toContain("4 Agu 2026");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd web && npm test -- tutup-kasir`
Expected: FAIL — `Failed to resolve import "./tutup-kasir"`.

- [ ] **Step 3: Tulis implementasi minimal**

Create `web/src/lib/tutup-kasir.ts`:

```ts
import { formatRupiah } from "./format";
import { tanggalJakarta } from "./kasir";

export type AksiLog = "ubah" | "buka" | "tutup_ulang";

export type BarisLog = {
  tanggal: string;
  aksi: AksiLog;
  tunai_fisik_lama: number | null;
  tunai_fisik_baru: number | null;
  alasan: string;
  oleh: string;
  created_at: string;
};

export type BarisTutup = {
  tanggal: string;
  tunai_sistem: number;
  tunai_fisik: number;
  selisih: number;
  catatan: string;
  oleh: string;
};

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export function alasanValid(alasan: string): boolean {
  return alasan.trim().length >= 3;
}

export function nominalValid(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

export function tanggalValid(tanggal: string): boolean {
  return POLA_TANGGAL.test(tanggal);
}

// Pesan `raise exception` dari RPC muncul apa adanya di error.message PostgREST.
// Yang dikenal diterjemahkan jadi kalimat utuh; sisanya diteruskan supaya
// kegagalan tak terduga tidak tersamarkan jadi pesan generik.
const PETA_PESAN: [string, string][] = [
  ["sudah ditutup", "Kasir tanggal ini sudah ditutup."],
  ["sudah dibuka", "Tutup kasir tanggal ini sudah dibuka oleh pengguna lain."],
  ["nominal tidak berubah", "Nominal tidak berubah."],
  ["nominal tidak valid", "Jumlah tunai fisik tidak valid."],
  ["alasan wajib", "Alasan wajib diisi, minimal 3 karakter."],
  ["butuh izin", "Anda tidak punya akses untuk aksi ini."],
  ["tanggal di masa depan", "Tanggal itu belum terjadi."],
  ["tanggal tidak valid", "Tanggal tidak valid."],
];

export function pesanErrorRpc(pesan: string): string {
  for (const [kunci, hasil] of PETA_PESAN) {
    if (pesan.includes(kunci)) return hasil;
  }
  return pesan;
}

// Ditulis manual, bukan Intl: singkatan bulan Indonesia berbeda antar versi ICU
// ("Agu" vs "Agt"), dan riwayat ini diuji dengan pencocokan persis.
const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export function formatTanggalPendek(tanggal: string): string {
  const [tahun, bulan, hari] = tanggal.split("-");
  return `${Number(hari)} ${BULAN[Number(bulan) - 1]} ${tahun}`;
}

export function kalimatRiwayat(b: BarisLog): string {
  const waktu = formatTanggalPendek(tanggalJakarta(new Date(b.created_at)));
  const inti =
    b.aksi === "ubah"
      ? `Nominal diubah ${formatRupiah(b.tunai_fisik_lama ?? 0)} → ${formatRupiah(
          b.tunai_fisik_baru ?? 0
        )}`
      : b.aksi === "buka"
        ? `Kasir dibuka kembali (fisik ${formatRupiah(b.tunai_fisik_lama ?? 0)})`
        : `Ditutup ulang ${formatRupiah(b.tunai_fisik_baru ?? 0)}`;
  return `${inti} — ${b.oleh}, ${waktu}, "${b.alasan}"`;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd web && npm test`
Expected: PASS, seluruh berkas test (termasuk yang lama) hijau.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/tutup-kasir.ts web/src/lib/tutup-kasir.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): validasi & perumusan riwayat koreksi tutup kasir

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `tutupKasir` beralih ke RPC

**Files:**
- Modify: `web/src/app/(app)/kasir/actions.ts:83-133`

**Interfaces:**
- Consumes: RPC `tutup_kasir` (Task 1), `pesanErrorRpc` (Task 2), `tanggalJakarta` dari `web/src/lib/kasir.ts`.
- Produces: `tutupKasir(tunaiFisik: number, catatan: string): Promise<HasilAksi>` — tanda tangan **tidak berubah**, sehingga `sheet-tutup-kasir.tsx` tetap jalan.

Setelah Task 1, policy insert `cash_closings` hilang, jadi `.insert()` langsung yang ada sekarang akan ditolak. Task ini yang menggantinya.

- [ ] **Step 1: Ganti isi `tutupKasir`**

Di `web/src/app/(app)/kasir/actions.ts`, ganti seluruh fungsi `tutupKasir` (baris 83-133) menjadi:

```ts
export async function tutupKasir(
  tunaiFisik: number,
  catatan: string
): Promise<HasilAksi> {
  await wajibIzin("kasir");
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  // Tunai sistem dihitung di dalam RPC, bukan di sini — satu jalur perhitungan
  // yang sama dipakai kasir maupun pemilik yang menutup tanggal lampau.
  const { error } = await supabase.rpc("tutup_kasir", {
    p_tanggal: tanggalJakarta(new Date()),
    p_tunai_fisik: tunaiFisik,
    p_catatan: catatan,
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  revalidatePath("/kasir");
  revalidatePath("/laporan");
  return { ok: true };
}
```

- [ ] **Step 2: Rapikan import**

Di bagian atas berkas yang sama: hapus `awalHariJakarta` dari import `@/lib/kasir` (tidak lagi dipakai di berkas ini — `tanggalJakarta` tetap dipakai), lalu tambahkan:

```ts
import { nominalValid, pesanErrorRpc } from "@/lib/tutup-kasir";
```

- [ ] **Step 3: Verifikasi tipe & lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: keduanya lolos tanpa error. Kalau `awalHariJakarta` masih terimport tapi tak terpakai, lint akan menandainya — hapus.

- [ ] **Step 4: Jalankan test**

Run: `cd web && npm test`
Expected: PASS (test lama tetap hijau; `awalHariJakarta` masih dipakai `kasir/page.tsx` sehingga testnya tetap relevan).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\(app\)/kasir/actions.ts
git commit -m "$(cat <<'EOF'
refactor(kasir): tutupKasir lewat RPC bertanggal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Angkat form tutup kasir jadi komponen bersama

**Files:**
- Create: `web/src/components/form-tutup-kasir.tsx`
- Modify: `web/src/app/(app)/kasir/sheet-tutup-kasir.tsx`

**Interfaces:**
- Consumes: `alasanValid`, `nominalValid` (Task 2); `formatRupiah`; `HasilAksi` dari `web/src/lib/aksi.ts`.
- Produces (dipakai Task 6):
  ```ts
  FormTutupKasir(props: {
    tunaiSistem: number;
    nilaiAwal?: number;
    labelTombol: string;
    perluAlasan: boolean;
    onSimpan: (tunaiFisik: number, teks: string) => Promise<HasilAksi>;
    onSelesai: () => void;
  })
  ```
  `teks` adalah catatan bila `perluAlasan` false, dan alasan bila true.

Komponen ini harus tetap **di-mount hanya saat lembar terbuka** (lihat komentar di `sheet-tutup-kasir.tsx:8-11`): state-nya sengaja hidup dan mati bersama mount, supaya nilai lama tidak terbawa saat lembar dibuka ulang setelah dibatalkan.

- [ ] **Step 1: Buat komponen bersama**

Create `web/src/components/form-tutup-kasir.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { alasanValid, nominalValid } from "@/lib/tutup-kasir";
import type { HasilAksi } from "@/lib/aksi";

// State (fisik/teks/pesan) sengaja hidup dan mati bersama mount komponen ini.
// Pemanggil WAJIB merender FormTutupKasir hanya saat lembarnya terbuka; kalau
// dirender tanpa syarat, nilai lama akan terbawa lagi saat lembar dibuka ulang
// setelah dibatalkan.
export function FormTutupKasir({
  tunaiSistem,
  nilaiAwal,
  labelTombol,
  perluAlasan,
  onSimpan,
  onSelesai,
}: {
  tunaiSistem: number;
  nilaiAwal?: number;
  labelTombol: string;
  perluAlasan: boolean;
  onSimpan: (tunaiFisik: number, teks: string) => Promise<HasilAksi>;
  onSelesai: () => void;
}) {
  const [fisik, setFisik] = useState(
    nilaiAwal === undefined ? "" : String(nilaiAwal)
  );
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  const angka = Number(fisik);
  const angkaOk = fisik !== "" && nominalValid(angka);
  const teksOk = !perluAlasan || alasanValid(teks);
  const valid = angkaOk && teksOk;
  const selisih = angkaOk ? angka - tunaiSistem : null;

  async function simpan() {
    if (!valid) return;
    setSibuk(true);
    const hasil = await onSimpan(angka, teks.trim());
    setSibuk(false);
    if (hasil.ok) {
      onSelesai();
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--garis)] pb-3">
        <span className="text-sm text-[var(--pudar)]">Tunai menurut sistem</span>
        <b className="uang">{formatRupiah(tunaiSistem)}</b>
      </div>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        Tunai fisik di laci
        <input
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={fisik}
          onChange={(e) => setFisik(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        {perluAlasan ? "Alasan (wajib)" : "Catatan (opsional)"}
        <input
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--garis)] pt-3">
        <span className="text-sm text-[var(--pudar)]">Selisih</span>
        <b
          className={`uang ${
            selisih !== null && selisih < 0 ? "text-[var(--merah)]" : ""
          }`}
        >
          {selisih === null ? "—" : formatRupiah(selisih)}
        </b>
      </div>
      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}
      <button
        type="button"
        disabled={sibuk || !valid}
        onClick={simpan}
        className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] active:scale-[.99] hover:bg-[var(--hijau-tua)] disabled:opacity-50"
      >
        {sibuk ? "Menyimpan…" : labelTombol}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Pakai komponen itu di layar Kasir**

Ganti seluruh isi `web/src/app/(app)/kasir/sheet-tutup-kasir.tsx` (definisi `FormTutupKasir` lokal ikut dihapus) menjadi:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { FormTutupKasir } from "@/components/form-tutup-kasir";
import { formatRupiah } from "@/lib/format";
import { tutupKasir } from "./actions";

export function SheetTutupKasir({
  tunaiSistem,
  sudahDitutup,
}: {
  tunaiSistem: number;
  sudahDitutup: { tunai_fisik: number; selisih: number } | null;
}) {
  const [buka, setBuka] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--enamel)]"
      >
        Tutup kasir
      </button>
      <Lembar buka={buka} judul="Tutup kasir" onTutup={() => setBuka(false)}>
        {sudahDitutup ? (
          <div className="text-sm">
            <p className="rounded-lg border border-[var(--garis)] bg-white px-3 py-3">
              Kasir hari ini sudah ditutup. Tunai fisik{" "}
              <b className="uang">{formatRupiah(sudahDitutup.tunai_fisik)}</b>,
              selisih{" "}
              <b className="uang">{formatRupiah(sudahDitutup.selisih)}</b>.
            </p>
          </div>
        ) : buka ? (
          <FormTutupKasir
            tunaiSistem={tunaiSistem}
            labelTombol="Simpan tutup kasir"
            perluAlasan={false}
            onSimpan={(tunaiFisik, catatan) =>
              tutupKasir(Math.round(tunaiFisik), catatan)
            }
            onSelesai={() => setBuka(false)}
          />
        ) : null}
      </Lembar>
    </>
  );
}
```

- [ ] **Step 3: Verifikasi tipe & lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: keduanya lolos.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/form-tutup-kasir.tsx web/src/app/\(app\)/kasir/sheet-tutup-kasir.tsx
git commit -m "$(cat <<'EOF'
refactor(kasir): angkat FormTutupKasir jadi komponen bersama

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Server action koreksi di halaman Laporan

**Files:**
- Create: `web/src/app/(app)/laporan/actions.ts`

**Interfaces:**
- Consumes: RPC `ubah_tutup_kasir`, `buka_kasir`, `tutup_kasir` (Task 1); `alasanValid`, `nominalValid`, `tanggalValid`, `pesanErrorRpc` (Task 2); `wajibIzin` dari `web/src/lib/auth.ts`.
- Produces (dipakai Task 6):
  - `ubahTutupKasir(tanggal: string, tunaiFisik: number, alasan: string): Promise<HasilAksi>`
  - `bukaKasir(tanggal: string, alasan: string): Promise<HasilAksi>`
  - `tutupKasirTanggal(tanggal: string, tunaiFisik: number, alasan: string): Promise<HasilAksi>`

- [ ] **Step 1: Tulis server action**

Create `web/src/app/(app)/laporan/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import {
  alasanValid,
  nominalValid,
  pesanErrorRpc,
  tanggalValid,
} from "@/lib/tutup-kasir";
import type { HasilAksi } from "@/lib/aksi";

// Validasi di sini hanya untuk pesan yang cepat dan enak dibaca. Penjaga
// sebenarnya ada di dalam RPC, yang mengecek izin dan aturan yang sama.
function periksa(tanggal: string, alasan: string): string | null {
  if (!tanggalValid(tanggal)) return "Tanggal tidak valid.";
  if (!alasanValid(alasan)) return "Alasan wajib diisi, minimal 3 karakter.";
  return null;
}

function segarkan() {
  revalidatePath("/laporan");
  revalidatePath("/kasir");
}

export async function ubahTutupKasir(
  tanggal: string,
  tunaiFisik: number,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("ubah_tutup_kasir", {
    p_tanggal: tanggal,
    p_tunai_fisik: tunaiFisik,
    p_alasan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}

export async function bukaKasir(
  tanggal: string,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("buka_kasir", {
    p_tanggal: tanggal,
    p_alasan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}

export async function tutupKasirTanggal(
  tanggal: string,
  tunaiFisik: number,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("tutup_kasir", {
    p_tanggal: tanggal,
    p_tunai_fisik: tunaiFisik,
    p_catatan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}
```

- [ ] **Step 2: Verifikasi tipe & lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: keduanya lolos.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/laporan/actions.ts
git commit -m "$(cat <<'EOF'
feat(laporan): server action ubah, buka & tutup ulang kasir

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Section "Tutup kasir" di halaman Laporan

**Files:**
- Create: `web/src/app/(app)/laporan/section-tutup-kasir.tsx`
- Modify: `web/src/app/(app)/laporan/page.tsx`

**Interfaces:**
- Consumes: RPC `daftar_tutup_kasir`, `riwayat_tutup_kasir` (Task 1); `BarisLog`, `BarisTutup`, `kalimatRiwayat`, `formatTanggalPendek` (Task 2); `FormTutupKasir` (Task 4); `ubahTutupKasir`, `bukaKasir`, `tutupKasirTanggal` (Task 5); `Lembar`, `useToast`, `formatRupiah`, `bolehAkses`.
- Produces: `SectionTutupKasir(props: { baris: BarisTutup[]; log: BarisLog[]; tanggalKosong: string[]; bolehKoreksi: boolean })`.

`tanggalKosong` adalah tanggal dalam rentang yang **belum** punya penutupan — dihitung di server dari `laporan_harian` yang sudah dimuat halaman ini.

- [ ] **Step 1: Buat komponen section**

Create `web/src/app/(app)/laporan/section-tutup-kasir.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { FormTutupKasir } from "@/components/form-tutup-kasir";
import { useToast } from "@/components/toast";
import { formatRupiah } from "@/lib/format";
import {
  formatTanggalPendek,
  kalimatRiwayat,
  type BarisLog,
  type BarisTutup,
} from "@/lib/tutup-kasir";
import { bukaKasir, tutupKasirTanggal, ubahTutupKasir } from "./actions";

type Aksi =
  | { jenis: "ubah"; baris: BarisTutup }
  | { jenis: "buka"; baris: BarisTutup }
  | { jenis: "tutup"; tanggal: string };

function Riwayat({ log }: { log: BarisLog[] }) {
  if (log.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[var(--garis)] pt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--pudar)]">
        Riwayat
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-[var(--pudar)]">
        {log.map((b, i) => (
          <li key={i}>{kalimatRiwayat(b)}</li>
        ))}
      </ul>
    </div>
  );
}

function LembarBuka({
  baris,
  onTutup,
}: {
  baris: BarisTutup;
  onTutup: () => void;
}) {
  const toast = useToast();
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function jalankan() {
    setSibuk(true);
    const hasil = await bukaKasir(baris.tanggal, alasan.trim());
    setSibuk(false);
    if (hasil.ok) {
      toast(`Kasir ${formatTanggalPendek(baris.tanggal)} dibuka kembali`);
      onTutup();
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <p className="rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2.5 text-sm text-[var(--merah)]">
        Setelah dibuka, transaksi tanggal ini bisa dibatalkan (void) lagi dan
        selisih hari itu hilang dari laporan sampai ditutup ulang.
      </p>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        Alasan (wajib)
        <input
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}
      <button
        type="button"
        disabled={sibuk || alasan.trim().length < 3}
        onClick={jalankan}
        className="mt-4 w-full rounded-lg bg-[var(--merah)] px-4 py-3 font-bold text-[#F6F3E6] active:scale-[.99] disabled:opacity-50"
      >
        {sibuk ? "Membuka…" : "Buka kembali"}
      </button>
    </>
  );
}

export function SectionTutupKasir({
  baris,
  log,
  tanggalKosong,
  bolehKoreksi,
}: {
  baris: BarisTutup[];
  log: BarisLog[];
  tanggalKosong: string[];
  bolehKoreksi: boolean;
}) {
  const toast = useToast();
  const [aksi, setAksi] = useState<Aksi | null>(null);

  const tanggalAksi =
    aksi === null
      ? null
      : aksi.jenis === "tutup"
        ? aksi.tanggal
        : aksi.baris.tanggal;
  const logAksi =
    tanggalAksi === null ? [] : log.filter((l) => l.tanggal === tanggalAksi);

  return (
    <section className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
      <h2 className="display text-lg">Tutup kasir</h2>
      <table className="mt-2 w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-[var(--pudar)]">
            <th className="py-1">Tanggal</th>
            <th className="py-1 text-right">Sistem</th>
            <th className="py-1 text-right">Fisik</th>
            <th className="py-1 text-right">Selisih</th>
            <th className="py-1">Oleh</th>
            {bolehKoreksi ? <th className="py-1" /> : null}
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.tanggal} className="border-t border-[var(--garis)]">
              <td className="py-1.5">{formatTanggalPendek(b.tanggal)}</td>
              <td className="uang py-1.5 text-right">
                {formatRupiah(b.tunai_sistem)}
              </td>
              <td className="uang py-1.5 text-right">
                {formatRupiah(b.tunai_fisik)}
              </td>
              <td
                className={`uang py-1.5 text-right font-bold ${
                  b.selisih < 0 ? "text-[var(--merah)]" : ""
                }`}
              >
                {formatRupiah(b.selisih)}
              </td>
              <td className="py-1.5 text-[var(--pudar)]">{b.oleh}</td>
              {bolehKoreksi ? (
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setAksi({ jenis: "ubah", baris: b })}
                    className="text-sm font-semibold text-[var(--hijau)] underline"
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => setAksi({ jenis: "buka", baris: b })}
                    className="ml-3 text-sm font-semibold text-[var(--merah)] underline"
                  >
                    Buka kembali
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {tanggalKosong.map((t) => (
            <tr key={t} className="border-t border-[var(--garis)]">
              <td className="py-1.5">{formatTanggalPendek(t)}</td>
              <td
                colSpan={4}
                className="py-1.5 text-[var(--pudar)]"
              >
                Belum ditutup
              </td>
              {bolehKoreksi ? (
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setAksi({ jenis: "tutup", tanggal: t })}
                    className="text-sm font-semibold text-[var(--hijau)] underline"
                  >
                    Tutup kasir
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {baris.length === 0 && tanggalKosong.length === 0 ? (
            <tr>
              <td
                colSpan={bolehKoreksi ? 6 : 5}
                className="py-2 text-[var(--pudar)]"
              >
                Belum ada penutupan kasir pada rentang ini.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <Lembar
        buka={aksi !== null}
        judul={
          aksi === null
            ? ""
            : aksi.jenis === "ubah"
              ? `Ubah nominal ${formatTanggalPendek(aksi.baris.tanggal)}`
              : aksi.jenis === "buka"
                ? `Buka kembali ${formatTanggalPendek(aksi.baris.tanggal)}`
                : `Tutup kasir ${formatTanggalPendek(aksi.tanggal)}`
        }
        onTutup={() => setAksi(null)}
      >
        {aksi === null ? null : aksi.jenis === "ubah" ? (
          <FormTutupKasir
            tunaiSistem={aksi.baris.tunai_sistem}
            nilaiAwal={aksi.baris.tunai_fisik}
            labelTombol="Simpan perubahan"
            perluAlasan
            onSimpan={async (tunaiFisik, alasan) => {
              const hasil = await ubahTutupKasir(
                aksi.baris.tanggal,
                Math.round(tunaiFisik),
                alasan
              );
              if (hasil.ok) toast("Nominal tutup kasir diperbarui");
              return hasil;
            }}
            onSelesai={() => setAksi(null)}
          />
        ) : aksi.jenis === "buka" ? (
          <LembarBuka baris={aksi.baris} onTutup={() => setAksi(null)} />
        ) : (
          <FormTutupKasir
            tunaiSistem={0}
            labelTombol="Simpan tutup kasir"
            perluAlasan
            onSimpan={async (tunaiFisik, alasan) => {
              const hasil = await tutupKasirTanggal(
                aksi.tanggal,
                Math.round(tunaiFisik),
                alasan
              );
              if (hasil.ok) toast("Kasir ditutup");
              return hasil;
            }}
            onSelesai={() => setAksi(null)}
          />
        )}
        {aksi === null ? null : <Riwayat log={logAksi} />}
      </Lembar>
    </section>
  );
}
```

Catatan: pada lembar "Tutup kasir tanggal X", `tunaiSistem` diberi `0` karena angka sistem untuk tanggal lampau tidak dimuat di klien — RPC menghitungnya sendiri saat menyimpan, dan hasil sebenarnya langsung tampil di tabel setelah `revalidatePath`. Preview selisih di lembar itu karenanya sama dengan nominal yang diketik; ini disengaja dan bukan bug.

- [ ] **Step 2: Muat data & render section di halaman Laporan**

Di `web/src/app/(app)/laporan/page.tsx`:

1. Tambah import:

```ts
import { bolehAkses } from "@/lib/permissions";
import { SectionTutupKasir } from "./section-tutup-kasir";
import type { BarisLog, BarisTutup } from "@/lib/tutup-kasir";
```

2. Ganti baris 21 `await wajibIzin("laporan");` menjadi:

```ts
const pengguna = await wajibIzin("laporan");
```

3. Tambahkan dua RPC ke `Promise.all` yang sudah ada (baris 31-34) sehingga menjadi:

```ts
  const [harianRes, terlarisRes, tutupRes, logRes] = await Promise.all([
    supabase.rpc("laporan_harian", { p_dari: dari, p_sampai: sampai }),
    supabase.rpc("terlaris", { p_dari: dari, p_sampai: sampai, p_limit: 5 }),
    supabase.rpc("daftar_tutup_kasir", { p_dari: dari, p_sampai: sampai }),
    supabase.rpc("riwayat_tutup_kasir", { p_dari: dari, p_sampai: sampai }),
  ]);
```

4. Tambahkan pemeriksaan error setelah dua pemeriksaan yang sudah ada:

```ts
  if (tutupRes.error) {
    throw new Error(`Gagal memuat tutup kasir: ${tutupRes.error.message}`);
  }
  if (logRes.error) {
    throw new Error(`Gagal memuat riwayat kasir: ${logRes.error.message}`);
  }
```

5. Setelah pemetaan `terlaris` (baris 55-57), tambahkan:

```ts
  const tutup = ((tutupRes.data ?? []) as Record<string, unknown>[]).map(
    (b) => ({
      tanggal: String(b.tanggal),
      tunai_sistem: Number(b.tunai_sistem),
      tunai_fisik: Number(b.tunai_fisik),
      selisih: Number(b.selisih),
      catatan: String(b.catatan ?? ""),
      oleh: String(b.oleh ?? "Pengguna"),
    })
  ) as BarisTutup[];
  const log = ((logRes.data ?? []) as Record<string, unknown>[]).map((b) => ({
    tanggal: String(b.tanggal),
    aksi: String(b.aksi) as BarisLog["aksi"],
    tunai_fisik_lama:
      b.tunai_fisik_lama === null ? null : Number(b.tunai_fisik_lama),
    tunai_fisik_baru:
      b.tunai_fisik_baru === null ? null : Number(b.tunai_fisik_baru),
    alasan: String(b.alasan),
    oleh: String(b.oleh ?? "Pengguna"),
    created_at: String(b.created_at),
  })) as BarisLog[];

  // Tanggal dalam rentang yang belum punya penutupan. laporan_harian sudah
  // memuat satu baris per hari, jadi tidak perlu query tambahan.
  const sudah = new Set(tutup.map((t) => t.tanggal));
  const tanggalKosong = harian
    .map((h) => h.tanggal)
    .filter((t) => !sudah.has(t) && t <= hariIni)
    .sort()
    .reverse();
```

6. Sisipkan section di JSX, tepat setelah `</section>` penutup blok `GrafikLaba` (baris 143):

```tsx
      <SectionTutupKasir
        baris={tutup}
        log={log}
        tanggalKosong={tanggalKosong}
        bolehKoreksi={bolehAkses(pengguna.izin, "user")}
      />
```

- [ ] **Step 3: Verifikasi tipe & lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: keduanya lolos.

- [ ] **Step 4: Jalankan seluruh test**

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 5: Pastikan build produksi lolos**

Run: `cd web && npm run build`
Expected: build sukses. Ini menangkap kesalahan batas server/client component yang tidak terlihat oleh `tsc`.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(app\)/laporan/section-tutup-kasir.tsx web/src/app/\(app\)/laporan/page.tsx
git commit -m "$(cat <<'EOF'
feat(laporan): section tutup kasir dengan koreksi & riwayat

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verifikasi manual di produksi (dikerjakan user)

**Files:** tidak ada perubahan kode.

Migrasi Task 1 dan kode Task 3-6 **harus naik bersamaan**: begitu migrasi jalan, policy insert `cash_closings` hilang, sehingga kode lama yang masih memakai `.insert()` langsung akan gagal menutup kasir.

- [ ] **Step 1: User menjalankan migrasi**

User menjalankan `supabase db push` (atau menempelkan isi migrasi di SQL Editor Supabase). Agen tidak boleh menjalankannya.

- [ ] **Step 2: Deploy kode**

Push ke `origin/main`; Vercel auto-deploy.

- [ ] **Step 3: Checklist verifikasi manual**

Hal-hal berikut tidak tercakup unit test (RLS, isi RPC, atomisitas transaksi), jadi diperiksa langsung di aplikasi:

- [ ] Tutup kasir hari ini dari layar Kasir → tersimpan, dan **tidak** memunculkan baris riwayat baru (penutupan pertama tidak mengotori log).
- [ ] Di Laporan, ubah nominal hari itu dengan alasan "salah ketik" → nominal & selisih berubah, kartu "Selisih tutup kasir" ikut berubah, riwayat menampilkan `Nominal diubah … → …`.
- [ ] Coba ubah dengan nominal yang sama persis → ditolak, pesan "Nominal tidak berubah."
- [ ] Coba ubah dengan alasan 2 karakter → tombol simpan tetap nonaktif.
- [ ] Buka kembali tanggal itu → baris berubah jadi "Belum ditutup", selisih hilang dari laporan.
- [ ] Void satu transaksi tanggal itu dari layar Kasir → berhasil (sebelumnya terkunci).
- [ ] Tutup ulang tanggal itu dari Laporan → `tunai_sistem` yang tersimpan **lebih kecil** dari sebelumnya (mencerminkan transaksi yang di-void), dan riwayat menampilkan `Ditutup ulang …`.
- [ ] Login sebagai pengguna dengan izin `laporan` **tanpa** `user`: kolom tombol tidak muncul, dan tabel tetap terbaca.
- [ ] Sebagai pengguna itu juga, panggil RPC langsung dari konsol browser:
      `await supabase.rpc('ubah_tutup_kasir', { p_tanggal: '<tanggal>', p_tunai_fisik: 1, p_alasan: 'tes' })`
      → harus error `butuh izin user`.
- [ ] Uji bypass log sebagai pemegang izin `user`: `supabase.from('cash_closings').update({ tunai_fisik: 1 }).eq('tanggal', '<tanggal>')`, lalu `.delete()`, lalu `.insert()` → ketiganya harus gagal / tidak mengubah baris, karena `cash_closings` tidak punya policy tulis.

- [ ] **Step 4: Catat hasil**

Jika ada langkah yang gagal, catat pesan errornya persis dan hentikan — jangan menambal dengan melonggarkan policy tanpa membahasnya lebih dulu.

---

## Catatan Penyimpangan dari Spec

Dua hal berubah saat rencana ini disusun, dan spec sudah ikut diperbarui:

1. **`web/src/lib/kasir.ts` tidak jadi diubah.** Rencana awal menambahkan `akhirHariJakarta`, tetapi setelah perhitungan rentang WIB pindah ke dalam RPC, tidak ada pemanggilnya di TypeScript. Logika murni yang baru berkumpul di `web/src/lib/tutup-kasir.ts`.
2. **Halaman Laporan membaca lewat dua RPC**, bukan query tabel langsung. RLS `profiles` hanya mengizinkan seseorang melihat profilnya sendiri kecuali punya izin `user`, sehingga nama pelaku akan `null` bagi pemegang `laporan` saja. Fungsi `security definer` yang membuka tepat satu kolom nama lebih sempit daripada melonggarkan RLS `profiles`.
