# Rencana 1/3: Fondasi — Scaffold, Skema DB, Auth & Izin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi Next.js yang bisa di-login, dengan skema database lengkap di Supabase, sistem izin per user, dan kerangka navigasi 6 modul (halaman masih placeholder).

**Architecture:** Next.js App Router (server components + server actions) di `web/`, Supabase hosted (PostgreSQL + Auth) dengan migrasi di `supabase/`. Permission dicek di server lewat helper `wajibIzin()`; RLS di database sebagai lapisan kedua lewat fungsi `has_permission()`. UI memakai token desain dari prototype (hijau warung, kertas nota, mono untuk uang).

**Tech Stack:** Next.js 15 (TypeScript, App Router, Tailwind), @supabase/ssr + @supabase/supabase-js v2, Supabase CLI (migrasi), Vitest (unit test).

**Spec:** `docs/superpowers/specs/2026-07-24-seteguk-pos-design.md`

## Global Constraints

- Semua copy UI berbahasa Indonesia; sentence case; istilah konsisten dengan spec (Kasir, Stok Bahan, Pengeluaran, Laporan, Menu & Resep, Pengguna).
- Daftar izin PERSIS: `kasir`, `void`, `menu`, `stok`, `biaya`, `laporan`, `user` — id ini dipakai di DB (check constraint), TypeScript, dan navigasi.
- Uang: harga jual/nominal disimpan sebagai `integer` rupiah; HPP `numeric(12,2)`; harga rata-rata bahan `numeric(14,4)`; stok `numeric(14,3)`.
- Zona waktu laporan: Asia/Jakarta (WIB). Belum dipakai di plan ini, tapi kolom waktu semua `timestamptz`.
- TypeScript `strict` (default create-next-app) — jangan pakai `any`.
- Tidak ada fitur di luar spec: tanpa struk, tanpa offline, tanpa open bill, tanpa multi-cabang.
- Setiap commit diakhiri baris: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Scaffold Next.js + Vitest + util format uang

**Files:**
- Create: `web/` (via create-next-app)
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/format.ts`
- Test: `web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `formatRupiah(n: number): string` — dipakai semua layar uang di plan 2 & 3. Negatif memakai tanda minus tipografis: `−Rp45.000`.

- [ ] **Step 1: Scaffold aplikasi**

Jalankan dari root repo (`/Users/arvinfairuz/Documents/seteguk`):

```bash
npx create-next-app@latest web --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --turbopack --no-git
```

(`--no-git` karena repo git sudah ada di root.)

- [ ] **Step 2: Verifikasi dev server hidup**

```bash
cd web && npm run dev
```
Expected: `Local: http://localhost:3000` — buka, halaman default Next tampil. Hentikan dengan Ctrl+C.

- [ ] **Step 3: Pasang Vitest**

```bash
cd web && npm install -D vitest
```

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

Tambahkan script di `web/package.json` (di dalam `"scripts"`):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Tulis test yang gagal untuk formatRupiah**

Create `web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("memformat nol", () => {
    expect(formatRupiah(0)).toBe("Rp0");
  });
  it("memakai titik pemisah ribuan gaya id-ID", () => {
    expect(formatRupiah(15000)).toBe("Rp15.000");
    expect(formatRupiah(1234567)).toBe("Rp1.234.567");
  });
  it("membulatkan pecahan HPP", () => {
    expect(formatRupiah(5390.4)).toBe("Rp5.390");
    expect(formatRupiah(5390.5)).toBe("Rp5.391");
  });
  it("menampilkan negatif dengan tanda minus di depan Rp", () => {
    expect(formatRupiah(-45000)).toBe("−Rp45.000");
  });
});
```

- [ ] **Step 5: Jalankan test, pastikan gagal**

```bash
cd web && npm test
```
Expected: FAIL — `Cannot find module './format'` (atau serupa).

- [ ] **Step 6: Implementasi minimal**

Create `web/src/lib/format.ts`:

```ts
export function formatRupiah(n: number): string {
  const bulat = Math.round(n);
  const angka = Math.abs(bulat).toLocaleString("id-ID");
  return bulat < 0 ? `−Rp${angka}` : `Rp${angka}`;
}
```

- [ ] **Step 7: Jalankan test, pastikan lulus**

```bash
cd web && npm test
```
Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat: scaffold Next.js + Vitest + util formatRupiah

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Skema database Supabase (migrasi + RLS)

**Files:**
- Create: `supabase/` (via supabase init, di root repo)
- Create: `supabase/migrations/20260724000001_skema_awal.sql`

**Interfaces:**
- Consumes: —
- Produces: seluruh tabel spec + fungsi `public.has_permission(uid uuid, perm text) returns boolean`; trigger auto-buat baris `profiles` saat user auth baru dibuat. Nama tabel & kolom di bawah dipakai verbatim oleh plan 2 & 3.

- [ ] **Step 1: Inisialisasi Supabase CLI**

Dari root repo:

```bash
npx supabase init
```
Expected: folder `supabase/` berisi `config.toml`. Jika CLI belum ada, perintah ini otomatis mengunduhnya.

- [ ] **Step 2: Tulis migrasi skema lengkap**

Create `supabase/migrations/20260724000001_skema_awal.sql`:

```sql
-- ===== Profil & izin =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nama text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in ('kasir','void','menu','stok','biaya','laporan','user')),
  primary key (user_id, permission)
);

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from user_permissions where user_id = uid and permission = perm
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nama)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Bahan & stok =====
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  satuan text not null,
  stok numeric(14,3) not null default 0,
  harga_rata numeric(14,4) not null default 0,
  min_stok numeric(14,3) not null default 0,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id),
  qty numeric(14,3) not null check (qty > 0),
  total_harga integer not null check (total_harga > 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id),
  tipe text not null check (tipe in ('belanja','penjualan','opname','void')),
  qty numeric(14,3) not null, -- positif = masuk, negatif = keluar
  ref_id uuid, -- id purchases / sales terkait, null untuk opname
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index stock_movements_ingredient_idx on public.stock_movements (ingredient_id, created_at);

-- ===== Menu & resep =====
create table public.products (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kategori text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  nama text not null,
  harga integer not null check (harga >= 0),
  aktif boolean not null default true
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  qty numeric(14,3) not null check (qty > 0),
  unique (variant_id, ingredient_id)
);

-- ===== Penjualan =====
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  waktu timestamptz not null default now(),
  metode text not null check (metode in ('tunai','qris')),
  status text not null default 'selesai' check (status in ('selesai','void')),
  uang_diterima integer, -- hanya tunai
  kembalian integer,     -- hanya tunai
  created_by uuid not null references public.profiles (id)
);
create index sales_waktu_idx on public.sales (waktu);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  nama_snapshot text not null, -- "Kopi Susu Es" saat transaksi
  qty integer not null check (qty > 0),
  harga integer not null,          -- harga jual satuan saat transaksi
  hpp numeric(12,2) not null       -- HPP satuan dibekukan saat transaksi
);

-- ===== Pengeluaran =====
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null default (now() at time zone 'Asia/Jakarta')::date,
  category_id uuid not null references public.expense_categories (id),
  nominal integer not null check (nominal > 0),
  catatan text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index expenses_tanggal_idx on public.expenses (tanggal);

-- ===== Tutup kasir =====
create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  tunai_sistem integer not null,
  tunai_fisik integer not null,
  selisih integer not null,
  catatan text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ===== Kategori pengeluaran bawaan =====
insert into public.expense_categories (nama) values
  ('Gas & bahan bakar'), ('Listrik & air'), ('Gaji'), ('Sewa'),
  ('Perlengkapan'), ('Lainnya');

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.ingredients enable row level security;
alter table public.purchases enable row level security;
alter table public.stock_movements enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.recipe_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_closings enable row level security;

-- profiles: lihat profil sendiri; kelola semua butuh izin 'user'
create policy "profil sendiri" on public.profiles
  for select using (id = auth.uid());
create policy "kelola profil" on public.profiles
  for all using (public.has_permission(auth.uid(), 'user'));

-- user_permissions: lihat izin sendiri; kelola butuh 'user'
create policy "izin sendiri" on public.user_permissions
  for select using (user_id = auth.uid());
create policy "kelola izin" on public.user_permissions
  for all using (public.has_permission(auth.uid(), 'user'));

-- master data: semua user login boleh baca (layar kasir butuh);
-- tulis butuh izin modulnya
create policy "baca bahan" on public.ingredients
  for select using (auth.uid() is not null);
create policy "tulis bahan" on public.ingredients
  for all using (public.has_permission(auth.uid(), 'stok'));

create policy "baca produk" on public.products
  for select using (auth.uid() is not null);
create policy "tulis produk" on public.products
  for all using (public.has_permission(auth.uid(), 'menu'));

create policy "baca varian" on public.product_variants
  for select using (auth.uid() is not null);
create policy "tulis varian" on public.product_variants
  for all using (public.has_permission(auth.uid(), 'menu'));

create policy "baca resep" on public.recipe_items
  for select using (auth.uid() is not null);
create policy "tulis resep" on public.recipe_items
  for all using (public.has_permission(auth.uid(), 'menu'));

-- stok: belanja & pergerakan butuh 'stok' (pergerakan dari penjualan
-- ditulis lewat fungsi security definer di plan 3, bukan langsung)
create policy "baca belanja" on public.purchases
  for select using (public.has_permission(auth.uid(), 'stok') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat belanja" on public.purchases
  for insert with check (public.has_permission(auth.uid(), 'stok'));

create policy "baca pergerakan" on public.stock_movements
  for select using (public.has_permission(auth.uid(), 'stok') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat pergerakan" on public.stock_movements
  for insert with check (public.has_permission(auth.uid(), 'stok'));

-- penjualan: catat butuh 'kasir'; baca butuh 'kasir' atau 'laporan';
-- void (update status) butuh 'void'
create policy "baca penjualan" on public.sales
  for select using (public.has_permission(auth.uid(), 'kasir') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat penjualan" on public.sales
  for insert with check (public.has_permission(auth.uid(), 'kasir'));
create policy "void penjualan" on public.sales
  for update using (public.has_permission(auth.uid(), 'void'));

create policy "baca item penjualan" on public.sale_items
  for select using (public.has_permission(auth.uid(), 'kasir') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat item penjualan" on public.sale_items
  for insert with check (public.has_permission(auth.uid(), 'kasir'));

-- pengeluaran
create policy "baca kategori pengeluaran" on public.expense_categories
  for select using (auth.uid() is not null);
create policy "kelola kategori pengeluaran" on public.expense_categories
  for all using (public.has_permission(auth.uid(), 'biaya'));

create policy "baca pengeluaran" on public.expenses
  for select using (public.has_permission(auth.uid(), 'biaya') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat pengeluaran" on public.expenses
  for insert with check (public.has_permission(auth.uid(), 'biaya'));

-- tutup kasir
create policy "baca tutup kasir" on public.cash_closings
  for select using (public.has_permission(auth.uid(), 'kasir') or public.has_permission(auth.uid(), 'laporan'));
create policy "catat tutup kasir" on public.cash_closings
  for insert with check (public.has_permission(auth.uid(), 'kasir'));
```

- [ ] **Step 3: Buat project Supabase hosted & link** *(perlu tindakan user — berhenti dan minta user melakukan ini jika kredensial belum ada)*

1. Buka https://supabase.com → New project → nama `seteguk-pos`, region Southeast Asia (Singapore), catat database password.
2. Dari root repo:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

`<PROJECT_REF>` ada di URL dashboard project (`https://supabase.com/dashboard/project/<PROJECT_REF>`).

- [ ] **Step 4: Push migrasi**

```bash
npx supabase db push
```
Expected: `Applying migration 20260724000001_skema_awal.sql... Finished supabase db push.`

- [ ] **Step 5: Verifikasi skema**

Di Supabase dashboard → SQL Editor, jalankan:

```sql
select count(*) as jumlah_tabel from information_schema.tables
where table_schema = 'public';
select public.has_permission(gen_random_uuid(), 'kasir') as harus_false;
select count(*) as kategori from public.expense_categories;
```
Expected: `jumlah_tabel` = 13, `harus_false` = false, `kategori` = 6.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "feat: skema database lengkap + RLS + has_permission

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Wiring Supabase di Next.js + halaman login + user owner

**Files:**
- Create: `web/src/lib/supabase/server.ts`
- Create: `web/src/lib/supabase/client.ts`
- Create: `web/src/middleware.ts`
- Create: `web/src/app/login/page.tsx`
- Create: `web/src/app/login/actions.ts`
- Create: `web/.env.local` (jangan di-commit) dan `web/.env.example`

**Interfaces:**
- Consumes: skema Task 2 (trigger `handle_new_user` otomatis membuat profil).
- Produces: `buatClientServer(): Promise<SupabaseClient>` (server), `buatClientBrowser(): SupabaseClient` (browser), middleware yang me-redirect user belum login ke `/login`.

- [ ] **Step 1: Install dependency**

```bash
cd web && npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Env vars**

Create `web/.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key dari dashboard: Settings → API>
```

Copy jadi `web/.env.local` dan isi nilai asli dari dashboard Supabase (Settings → API). Pastikan `.env.local` tercakup `.gitignore` bawaan create-next-app (`.env*` — ya).

- [ ] **Step 3: Client server & browser**

Create `web/src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function buatClientServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // dipanggil dari Server Component — aman diabaikan,
            // middleware yang me-refresh session
          }
        },
      },
    }
  );
}
```

Create `web/src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function buatClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Middleware refresh session + redirect**

Create `web/src/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

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
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 5: Halaman login**

Create `web/src/app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";

export async function masuk(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await buatClientServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?gagal=1");
  }
  redirect("/");
}
```

Create `web/src/app/login/page.tsx`:

```tsx
import { masuk } from "./actions";

export default async function HalamanLogin({
  searchParams,
}: {
  searchParams: Promise<{ gagal?: string }>;
}) {
  const { gagal } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-[#F5F1E6] p-4">
      <form
        action={masuk}
        className="w-full max-w-sm rounded-xl border border-[#E3DCC7] bg-[#FFFDF6] p-6"
      >
        <p className="text-xs tracking-[0.28em] uppercase text-[#7A7260]">
          Warung Kopi
        </p>
        <h1 className="text-3xl font-bold text-[#17493B]">SETEGUK</h1>
        {gagal ? (
          <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[#C2452D]">
            Email atau password salah. Coba lagi.
          </p>
        ) : null}
        <label className="mt-5 block text-sm font-semibold text-[#7A7260]">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-[#7A7260]">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
        <button
          type="submit"
          className="mt-5 w-full rounded-lg bg-[#17493B] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[#0F3D2E]"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Buat user owner** *(perlu tindakan user jika email/password belum ditentukan)*

Di Supabase dashboard → Authentication → Users → Add user → email `aliaidid@gmail.com`, password pilihan owner, centang "Auto Confirm User". Lalu di SQL Editor:

```sql
update public.profiles set nama = 'Alia'
where id = (select id from auth.users where email = 'aliaidid@gmail.com');

insert into public.user_permissions (user_id, permission)
select id, unnest(array['kasir','void','menu','stok','biaya','laporan','user'])
from auth.users where email = 'aliaidid@gmail.com';
```

Verifikasi: `select count(*) from public.user_permissions;` → 7.

- [ ] **Step 7: Verifikasi alur login manual**

```bash
cd web && npm run dev
```
1. Buka `http://localhost:3000` → harus redirect ke `/login`.
2. Login dengan password salah → pesan "Email atau password salah".
3. Login benar → masuk ke `/` (masih halaman default Next — diganti di Task 5).

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat: wiring Supabase, middleware session, halaman login

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Helper izin (TDD) + guard server

**Files:**
- Create: `web/src/lib/permissions.ts`
- Create: `web/src/lib/nav.ts`
- Create: `web/src/lib/auth.ts`
- Test: `web/src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `buatClientServer()` dari Task 3.
- Produces:
  - `SEMUA_IZIN: readonly ["kasir","void","menu","stok","biaya","laporan","user"]`, `type Izin`, `LABEL_IZIN: Record<Izin, string>`
  - `bolehAkses(dimiliki: readonly string[], butuh: Izin): boolean`
  - `ITEM_NAV: { href: string; label: string; izin: Izin }[]` dan `filterNav(dimiliki: readonly string[])`
  - `getPengguna(): Promise<Pengguna | null>` dengan `type Pengguna = { id: string; nama: string; izin: string[] }`
  - `wajibIzin(butuh: Izin): Promise<Pengguna>` — redirect `/login` jika belum login, redirect `/` jika tak berizin.

- [ ] **Step 1: Tulis test yang gagal**

Create `web/src/lib/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bolehAkses, SEMUA_IZIN } from "./permissions";
import { filterNav, ITEM_NAV } from "./nav";

describe("bolehAkses", () => {
  it("true jika izin dimiliki", () => {
    expect(bolehAkses(["kasir", "stok"], "kasir")).toBe(true);
  });
  it("false jika izin tidak dimiliki", () => {
    expect(bolehAkses(["kasir"], "laporan")).toBe(false);
  });
  it("false untuk daftar kosong", () => {
    expect(bolehAkses([], "kasir")).toBe(false);
  });
});

describe("filterNav", () => {
  it("hanya menampilkan modul yang diizinkan", () => {
    const nav = filterNav(["kasir", "laporan"]);
    expect(nav.map((n) => n.href)).toEqual(["/kasir", "/laporan"]);
  });
  it("owner dengan semua izin melihat semua modul", () => {
    expect(filterNav([...SEMUA_IZIN])).toHaveLength(ITEM_NAV.length);
  });
  it("izin void tidak memunculkan item nav sendiri", () => {
    expect(filterNav(["void"])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd web && npm test
```
Expected: FAIL — module `./permissions` / `./nav` belum ada.

- [ ] **Step 3: Implementasi**

Create `web/src/lib/permissions.ts`:

```ts
export const SEMUA_IZIN = [
  "kasir",
  "void",
  "menu",
  "stok",
  "biaya",
  "laporan",
  "user",
] as const;

export type Izin = (typeof SEMUA_IZIN)[number];

export const LABEL_IZIN: Record<Izin, string> = {
  kasir: "Kasir",
  void: "Void transaksi",
  menu: "Kelola menu & resep",
  stok: "Kelola stok",
  biaya: "Catat pengeluaran",
  laporan: "Lihat laporan",
  user: "Kelola pengguna",
};

export function bolehAkses(
  dimiliki: readonly string[],
  butuh: Izin
): boolean {
  return dimiliki.includes(butuh);
}
```

Create `web/src/lib/nav.ts`:

```ts
import { bolehAkses, type Izin } from "./permissions";

export const ITEM_NAV: { href: string; label: string; izin: Izin }[] = [
  { href: "/kasir", label: "Kasir", izin: "kasir" },
  { href: "/stok", label: "Stok", izin: "stok" },
  { href: "/pengeluaran", label: "Biaya", izin: "biaya" },
  { href: "/laporan", label: "Laporan", izin: "laporan" },
  { href: "/menu", label: "Menu", izin: "menu" },
  { href: "/pengguna", label: "Akun", izin: "user" },
];

export function filterNav(dimiliki: readonly string[]) {
  return ITEM_NAV.filter((item) => bolehAkses(dimiliki, item.izin));
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
cd web && npm test
```
Expected: semua test lulus (10 total: 4 formatRupiah + 6 izin/nav).

- [ ] **Step 5: Guard server**

Create `web/src/lib/auth.ts`:

```ts
import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";
import { bolehAkses, type Izin } from "@/lib/permissions";

export type Pengguna = { id: string; nama: string; izin: string[] };

export async function getPengguna(): Promise<Pengguna | null> {
  const supabase = await buatClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profil }, { data: baris }] = await Promise.all([
    supabase.from("profiles").select("nama").eq("id", user.id).single(),
    supabase.from("user_permissions").select("permission").eq("user_id", user.id),
  ]);

  return {
    id: user.id,
    nama: profil?.nama ?? user.email ?? "Pengguna",
    izin: (baris ?? []).map((b) => b.permission),
  };
}

export async function wajibIzin(butuh: Izin): Promise<Pengguna> {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  if (!bolehAkses(pengguna.izin, butuh)) redirect("/");
  return pengguna;
}
```

- [ ] **Step 6: Pastikan build bersih**

```bash
cd web && npm run build
```
Expected: build sukses tanpa error TypeScript.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat: helper izin, filter navigasi, guard wajibIzin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Kerangka aplikasi — token desain, navigasi, halaman modul placeholder

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/layout.tsx`
- Create: `web/src/app/(app)/layout.tsx`
- Create: `web/src/app/(app)/page.tsx`
- Create: `web/src/components/navigasi.tsx`
- Create: `web/src/app/(app)/kasir/page.tsx`, `web/src/app/(app)/stok/page.tsx`, `web/src/app/(app)/pengeluaran/page.tsx`, `web/src/app/(app)/laporan/page.tsx`, `web/src/app/(app)/menu/page.tsx`, `web/src/app/(app)/pengguna/page.tsx`
- Delete: `web/src/app/page.tsx` (digantikan `(app)/page.tsx`)

**Interfaces:**
- Consumes: `getPengguna`, `wajibIzin` (Task 4), `filterNav` (Task 4).
- Produces: layout `(app)` yang menyuntikkan navigasi sesuai izin; token CSS `--hijau`, `--hijau-tua`, `--kertas`, `--enamel`, `--tinta`, `--pudar`, `--garis`, `--garis-kuat`, `--kunyit`, `--merah`, dan util class `.uang` — dipakai semua layar plan 2 & 3.

- [ ] **Step 1: Token desain di globals.css**

Modify `web/src/app/globals.css` — ganti seluruh isi dengan:

```css
@import "tailwindcss";

:root {
  --hijau-tua: #0f3d2e;
  --hijau: #17493b;
  --hijau-daun: #2f9068;
  --kertas: #f5f1e6;
  --enamel: #fffdf6;
  --tinta: #241f15;
  --pudar: #7a7260;
  --garis: #e3dcc7;
  --garis-kuat: #cfc5a8;
  --kunyit: #dfa320;
  --merah: #c2452d;
}

body {
  background: var(--kertas);
  color: var(--tinta);
}

.uang {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.display {
  font-family: "Avenir Next Condensed", "Arial Narrow", "sans-serif-condensed",
    sans-serif;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
```

- [ ] **Step 2: Root layout metadata**

Modify `web/src/app/layout.tsx` — ganti seluruh isi dengan:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seteguk POS",
  description: "POS Warung Kopi Seteguk",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Komponen navigasi**

Create `web/src/components/navigasi.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function Navigasi({ items, nama }: { items: Item[]; nama: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[216px] shrink-0 flex-col sticky top-0 h-screen bg-[var(--hijau)] text-[#F2EEDF]">
        <div className="border-b border-white/15 px-4 py-5 [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_5px,transparent_5px_11px)]">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#BFD4C4]">
            Warung Kopi
          </p>
          <p className="display text-3xl leading-tight">SETEGUK</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                pathname.startsWith(item.href)
                  ? "bg-[var(--kertas)] font-bold text-[var(--hijau-tua)]"
                  : "text-[#D8E2D3] hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/15 px-4 py-3 text-xs text-[#BFD4C4]">
          Masuk sebagai <b className="text-[#F2EEDF]">{nama}</b>
        </div>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[60px] border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 items-center justify-center text-[11px] font-semibold ${
              pathname.startsWith(item.href)
                ? "text-[var(--hijau-tua)]"
                : "text-[var(--pudar)]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Layout (app) + halaman beranda**

Create `web/src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getPengguna } from "@/lib/auth";
import { filterNav } from "@/lib/nav";
import { Navigasi } from "@/components/navigasi";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <Navigasi items={filterNav(pengguna.izin)} nama={pengguna.nama} />
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-7 md:pb-7">{children}</main>
    </div>
  );
}
```

Delete `web/src/app/page.tsx`, lalu create `web/src/app/(app)/page.tsx`:

```tsx
import { getPengguna } from "@/lib/auth";
import { filterNav } from "@/lib/nav";
import Link from "next/link";

export default async function Beranda() {
  const pengguna = (await getPengguna())!;
  const nav = filterNav(pengguna.izin);
  return (
    <div>
      <h1 className="display text-2xl">Halo, {pengguna.nama}</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        Pilih modul untuk mulai bekerja.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 md:max-w-lg">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 font-bold text-[var(--hijau-tua)] hover:border-[var(--hijau)]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Enam halaman modul placeholder**

Setiap file sama polanya — ganti izin & judul sesuai tabel:

| File | `wajibIzin` | Judul |
|---|---|---|
| `(app)/kasir/page.tsx` | `"kasir"` | Kasir |
| `(app)/stok/page.tsx` | `"stok"` | Stok Bahan |
| `(app)/pengeluaran/page.tsx` | `"biaya"` | Pengeluaran |
| `(app)/laporan/page.tsx` | `"laporan"` | Laporan |
| `(app)/menu/page.tsx` | `"menu"` | Menu & Resep |
| `(app)/pengguna/page.tsx` | `"user"` | Pengguna |

Contoh `web/src/app/(app)/kasir/page.tsx` (ulangi pola untuk kelima file lain):

```tsx
import { wajibIzin } from "@/lib/auth";

export default async function HalamanKasir() {
  await wajibIzin("kasir");
  return (
    <div>
      <h1 className="display text-2xl">Kasir</h1>
      <p className="mt-2 rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
        Modul ini dibangun di rencana berikutnya.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verifikasi manual**

```bash
cd web && npm run dev
```
1. Login sebagai owner → beranda menyapa "Halo, Alia", 6 modul tampil di sidebar.
2. Buka `/kasir` → judul Kasir + placeholder.
3. Uji guard: di Supabase SQL Editor jalankan `delete from user_permissions where permission = 'laporan' and user_id = (select id from auth.users where email = 'aliaidid@gmail.com');` → refresh → menu Laporan hilang; akses langsung `http://localhost:3000/laporan` → terlempar ke beranda. Kembalikan: `insert into user_permissions (user_id, permission) select id, 'laporan' from auth.users where email = 'aliaidid@gmail.com';`
4. Kecilkan window (< 768px) → navigasi pindah ke bawah.

- [ ] **Step 7: Build + test bersih**

```bash
cd web && npm run build && npm test
```
Expected: build sukses, 10 test lulus.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "feat: kerangka aplikasi — token desain, navigasi per izin, halaman modul

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy ke Vercel

**Files:**
- Tidak ada file baru — konfigurasi di dashboard Vercel.

**Interfaces:**
- Consumes: seluruh task sebelumnya.
- Produces: URL produksi (mis. `seteguk-pos.vercel.app`) yang bisa diakses owner dari mana saja.

- [ ] **Step 1: Push repo ke GitHub** *(perlu tindakan user jika belum ada remote)*

```bash
gh repo create seteguk-pos --private --source . --push
```
(Atau buat repo manual di github.com lalu `git remote add origin ... && git push -u origin main`.)

- [ ] **Step 2: Import di Vercel** *(perlu tindakan user)*

1. https://vercel.com → Add New Project → import repo `seteguk-pos`.
2. Root Directory: `web`. Framework terdeteksi Next.js.
3. Environment Variables: isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nilai sama dengan `.env.local`).
4. Deploy.

- [ ] **Step 3: Smoke test produksi**

1. Buka URL produksi → redirect `/login`.
2. Login owner → beranda + 6 modul.
3. Logout belum ada UI-nya (masuk plan berikutnya) — cukup verifikasi login.

- [ ] **Step 4: Catat URL produksi**

Tambahkan URL produksi ke `README.md` root repo:

```markdown
# Seteguk POS

POS Warung Kopi Seteguk. Spec: `docs/superpowers/specs/`, rencana: `docs/superpowers/plans/`.

- Aplikasi: `web/` (Next.js) — produksi: <URL_VERCEL>
- Database: Supabase, migrasi di `supabase/migrations/`
- Prototype desain: `prototype/index.html`
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README + URL produksi

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

---

## Catatan untuk rencana berikutnya

- **Rencana 2 (Inventori & Menu):** CRUD bahan, catat belanja dengan update moving average di fungsi SQL atomik, opname + selisih ke `stock_movements`, CRUD menu/varian/resep, tampilan HPP per varian. Logika moving average dan HPP ditulis sebagai fungsi murni TypeScript yang di-unit-test, dieksekusi lewat fungsi database.
- **Rencana 3 (Kasir & Laporan):** fungsi RPC `catat_penjualan` (security definer, atomik: insert sales + items + potong stok + movements), void, tutup kasir, pengeluaran, laporan harian/bulanan + grafik, kelola pengguna (butuh service role key untuk membuat auth user — env `SUPABASE_SERVICE_ROLE_KEY` server-only).
