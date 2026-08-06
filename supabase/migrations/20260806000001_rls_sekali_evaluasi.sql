-- Halaman Laporan kena `canceling statement due to statement timeout` untuk
-- rentang tujuh hari, padahal tabelnya baru ratusan baris. Penyebabnya bukan
-- querynya: query yang sama lewat service_role (RLS dilewati) selesai di bawah
-- satu detik untuk 67 hari.
--
-- has_permission() adalah SECURITY DEFINER, dan Postgres TIDAK BISA meng-inline
-- fungsi security definer. Predikat policy yang memanggilnya secara telanjang
-- karena itu dievaluasi ulang untuk SETIAP BARIS yang dipindai. Satu laporan
-- memindai sales + sale_items + expenses + cash_closings, masing-masing dengan
-- dua panggilan (izin kasir/stok/biaya ATAU laporan) — ribuan pemanggilan
-- fungsi, dan setiap pemanggilan menanggung ongkos pergantian role, set
-- search_path, serta plan tersendiri.
--
-- Membungkus predikat dalam subquery skalar tanpa FROM membuat planner
-- mengangkatnya jadi InitPlan: dievaluasi SEKALI per query, lalu hasil
-- booleannya dipakai ulang untuk semua baris. Aturan izinnya sendiri tidak
-- berubah sedikit pun — hanya jumlah evaluasinya.
--
-- Semua policy yang memanggil has_permission()/auth.uid() ikut diperbaiki,
-- bukan hanya yang dipakai Laporan: cacatnya identik di semua tabel, jadi
-- membiarkan sisanya hanya menunda timeout yang sama di halaman lain begitu
-- datanya bertambah.

-- ===== profiles & user_permissions =====
drop policy if exists "profil sendiri" on public.profiles;
create policy "profil sendiri" on public.profiles
  for select using (id = (select auth.uid()));

drop policy if exists "kelola profil" on public.profiles;
create policy "kelola profil" on public.profiles
  for all using ((select public.has_permission(auth.uid(), 'user')));

drop policy if exists "izin sendiri" on public.user_permissions;
create policy "izin sendiri" on public.user_permissions
  for select using (user_id = (select auth.uid()));

drop policy if exists "kelola izin" on public.user_permissions;
create policy "kelola izin" on public.user_permissions
  for all using ((select public.has_permission(auth.uid(), 'user')));

-- ===== master data =====
drop policy if exists "baca bahan" on public.ingredients;
create policy "baca bahan" on public.ingredients
  for select using ((select auth.uid()) is not null);

drop policy if exists "tulis bahan" on public.ingredients;
create policy "tulis bahan" on public.ingredients
  for all using ((select public.has_permission(auth.uid(), 'stok')));

drop policy if exists "baca produk" on public.products;
create policy "baca produk" on public.products
  for select using ((select auth.uid()) is not null);

drop policy if exists "tulis produk" on public.products;
create policy "tulis produk" on public.products
  for all using ((select public.has_permission(auth.uid(), 'menu')));

drop policy if exists "baca varian" on public.product_variants;
create policy "baca varian" on public.product_variants
  for select using ((select auth.uid()) is not null);

drop policy if exists "tulis varian" on public.product_variants;
create policy "tulis varian" on public.product_variants
  for all using ((select public.has_permission(auth.uid(), 'menu')));

drop policy if exists "baca resep" on public.recipe_items;
create policy "baca resep" on public.recipe_items
  for select using ((select auth.uid()) is not null);

drop policy if exists "tulis resep" on public.recipe_items;
create policy "tulis resep" on public.recipe_items
  for all using ((select public.has_permission(auth.uid(), 'menu')));

-- ===== stok =====
drop policy if exists "baca belanja" on public.purchases;
create policy "baca belanja" on public.purchases
  for select using ((
    select public.has_permission(auth.uid(), 'stok')
        or public.has_permission(auth.uid(), 'laporan')
  ));

drop policy if exists "catat belanja" on public.purchases;
create policy "catat belanja" on public.purchases
  for insert with check ((select public.has_permission(auth.uid(), 'stok')));

drop policy if exists "baca pergerakan" on public.stock_movements;
create policy "baca pergerakan" on public.stock_movements
  for select using ((
    select public.has_permission(auth.uid(), 'stok')
        or public.has_permission(auth.uid(), 'laporan')
  ));

drop policy if exists "catat pergerakan" on public.stock_movements;
create policy "catat pergerakan" on public.stock_movements
  for insert with check ((select public.has_permission(auth.uid(), 'stok')));

-- ===== penjualan =====
-- Policy insert sales/sale_items sengaja tetap TIDAK ADA (dihapus di
-- 20260724000003): catat_penjualan() adalah satu-satunya jalur tulis yang sah.
drop policy if exists "baca penjualan" on public.sales;
create policy "baca penjualan" on public.sales
  for select using ((
    select public.has_permission(auth.uid(), 'kasir')
        or public.has_permission(auth.uid(), 'laporan')
  ));

drop policy if exists "baca item penjualan" on public.sale_items;
create policy "baca item penjualan" on public.sale_items
  for select using ((
    select public.has_permission(auth.uid(), 'kasir')
        or public.has_permission(auth.uid(), 'laporan')
  ));

-- ===== pengeluaran =====
drop policy if exists "baca kategori pengeluaran" on public.expense_categories;
create policy "baca kategori pengeluaran" on public.expense_categories
  for select using ((select auth.uid()) is not null);

drop policy if exists "kelola kategori pengeluaran" on public.expense_categories;
create policy "kelola kategori pengeluaran" on public.expense_categories
  for all using ((select public.has_permission(auth.uid(), 'biaya')));

drop policy if exists "baca pengeluaran" on public.expenses;
create policy "baca pengeluaran" on public.expenses
  for select using ((
    select public.has_permission(auth.uid(), 'biaya')
        or public.has_permission(auth.uid(), 'laporan')
  ));

drop policy if exists "catat pengeluaran" on public.expenses;
create policy "catat pengeluaran" on public.expenses
  for insert with check ((select public.has_permission(auth.uid(), 'biaya')));

-- ===== tutup kasir =====
-- Policy insert cash_closings sengaja tetap TIDAK ADA (dihapus di
-- 20260728000001): mutasinya eksklusif lewat fungsi security definer.
drop policy if exists "baca tutup kasir" on public.cash_closings;
create policy "baca tutup kasir" on public.cash_closings
  for select using ((
    select public.has_permission(auth.uid(), 'kasir')
        or public.has_permission(auth.uid(), 'laporan')
  ));

drop policy if exists "baca log tutup kasir" on public.cash_closing_log;
create policy "baca log tutup kasir" on public.cash_closing_log
  for select using ((
    select public.has_permission(auth.uid(), 'laporan')
        or public.has_permission(auth.uid(), 'user')
  ));
