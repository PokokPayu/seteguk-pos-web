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
