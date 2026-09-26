-- Void tersembunyi: pemegang izin 'user' (admin) bisa membatalkan transaksi
-- sekaligus menghilangkannya dari pandangan pegawai.
--
-- Kegunaannya menguji kejujuran tutup kasir. Transaksi tunai yang di-void
-- tersembunyi tidak lagi dihitung di tunai sistem, padahal uangnya tetap ada
-- di laci. Pegawai yang menghitung laci dengan jujur akan melaporkan selisih
-- lebih sebesar transaksi itu; pegawai yang sekadar menyalin angka sistem
-- ("uang pas") ketahuan karena selisihnya nol.
--
-- Selebihnya void tersembunyi PERSIS void biasa: status 'void', stok
-- dikembalikan, dan tidak dihitung di omzet, laporan, maupun tunai sistem.
-- Semua fungsi yang sudah menyaring status = 'selesai' karena itu tidak perlu
-- diubah.

alter table public.sales
  add column if not exists tersembunyi boolean not null default false;

-- Disalin ke sale_items agar policy baca item bisa menyaring tanpa menengok
-- tabel sales per baris. Menengok sales dari policy sale_items juga butuh
-- fungsi security definer yang di-grant ke authenticated — fungsi itu bisa
-- dipanggil langsung lewat Data API dan membocorkan daftar transaksi
-- tersembunyi ke pegawai yang justru sedang diuji.
alter table public.sale_items
  add column if not exists tersembunyi boolean not null default false;

-- ===== RLS: baris tersembunyi hanya terbaca admin =====
-- Setiap has_permission() dibungkus subquery skalar tersendiri supaya tetap
-- dievaluasi sekali per query (lihat 20260806000001), bukan per baris.
drop policy if exists "baca penjualan" on public.sales;
create policy "baca penjualan" on public.sales
  for select using (
    (select public.has_permission(auth.uid(), 'kasir')
         or public.has_permission(auth.uid(), 'laporan'))
    and (not tersembunyi
         or (select public.has_permission(auth.uid(), 'user')))
  );

drop policy if exists "baca item penjualan" on public.sale_items;
create policy "baca item penjualan" on public.sale_items
  for select using (
    (select public.has_permission(auth.uid(), 'kasir')
         or public.has_permission(auth.uid(), 'laporan'))
    and (not tersembunyi
         or (select public.has_permission(auth.uid(), 'user')))
  );

-- ===== void_penjualan dengan mode sembunyi =====
-- Versi satu argumen dihapus: dua overload dengan parameter ber-default
-- membuat panggilan void_penjualan(p_sale_id => ...) ambigu di PostgREST.
drop function if exists public.void_penjualan(uuid);

create or replace function public.void_penjualan(
  p_sale_id uuid,
  p_sembunyi boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sembunyi boolean := coalesce(p_sembunyi, false);
  v_status text;
  v_waktu timestamptz;
  v_mv record;
begin
  if not public.has_permission(auth.uid(), 'void') then
    raise exception 'butuh izin void';
  end if;
  if v_sembunyi and not public.has_permission(auth.uid(), 'user') then
    raise exception 'butuh izin kelola pengguna untuk menyembunyikan void';
  end if;

  select status, waktu into v_status, v_waktu
  from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'transaksi tidak ditemukan';
  end if;
  if v_status <> 'selesai' then
    raise exception 'transaksi sudah dibatalkan';
  end if;
  if exists (
    select 1 from public.cash_closings
    where tanggal = (v_waktu at time zone 'Asia/Jakarta')::date
  ) then
    raise exception 'kasir tanggal transaksi ini sudah ditutup';
  end if;

  update public.sales
  set status = 'void', tersembunyi = v_sembunyi
  where id = p_sale_id;
  if v_sembunyi then
    update public.sale_items set tersembunyi = true where sale_id = p_sale_id;
  end if;

  -- Kembalikan stok dengan MEMBALIK movement asli transaksi ini, bukan
  -- menghitung ulang dari resep sekarang (resep bisa sudah berubah).
  for v_mv in
    select ingredient_id, qty
    from public.stock_movements
    where ref_id = p_sale_id and tipe = 'penjualan'
  loop
    -- qty asli negatif, jadi mengurangi qty berarti menambah stok kembali
    update public.ingredients
    set stok = stok - v_mv.qty
    where id = v_mv.ingredient_id;

    insert into public.stock_movements
      (ingredient_id, tipe, qty, ref_id, created_by)
    values
      (v_mv.ingredient_id, 'void', -v_mv.qty, p_sale_id, auth.uid());
  end loop;
end;
$$;

revoke execute on function public.void_penjualan(uuid, boolean) from public, anon;
grant execute on function public.void_penjualan(uuid, boolean) to authenticated;
