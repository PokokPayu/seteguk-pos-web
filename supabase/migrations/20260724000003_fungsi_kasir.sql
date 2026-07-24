-- Fungsi kasir. catat_penjualan & void_penjualan bersifat security definer
-- (melewati RLS) sehingga izin dicek eksplisit di dalam fungsi.
-- peringkat_varian sengaja BUKAN security definer: cukup jalan di bawah RLS
-- pemanggil (policy "baca penjualan" mengizinkan izin kasir atau laporan).

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
  -- Stok boleh menjadi minus (tidak diblokir) sesuai spec.
  for v_pakai in
    select ri.ingredient_id, sum(ri.qty * si.qty) as pakai
    from public.sale_items si
    join public.recipe_items ri on ri.variant_id = si.variant_id
    where si.sale_id = v_sale_id
    group by ri.ingredient_id
  loop
    update public.ingredients
    set stok = stok - v_pakai.pakai
    where id = v_pakai.ingredient_id;

    insert into public.stock_movements
      (ingredient_id, tipe, qty, ref_id, created_by)
    values
      (v_pakai.ingredient_id, 'penjualan', -v_pakai.pakai, v_sale_id, auth.uid());
  end loop;

  return jsonb_build_object('sale_id', v_sale_id, 'total', v_total, 'kembalian', coalesce(v_kembalian, 0));
end;
$$;

create or replace function public.void_penjualan(p_sale_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
  v_waktu timestamptz;
  v_mv record;
begin
  if not public.has_permission(auth.uid(), 'void') then
    raise exception 'butuh izin void';
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

  update public.sales set status = 'void' where id = p_sale_id;

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

-- Peringkat penjualan varian 30 hari terakhir + hitungan hari ini (WIB).
-- SECURITY INVOKER: RLS "baca penjualan"/"baca item penjualan" yang menjaga.
create or replace function public.peringkat_varian()
returns table (
  variant_id uuid,
  product_id uuid,
  terjual_30h bigint,
  terjual_hari_ini bigint
)
language sql stable set search_path = public
as $$
  select
    si.variant_id,
    pv.product_id,
    coalesce(sum(si.qty), 0)::bigint as terjual_30h,
    coalesce(sum(si.qty) filter (
      where (s.waktu at time zone 'Asia/Jakarta')::date
          = (now() at time zone 'Asia/Jakarta')::date
    ), 0)::bigint as terjual_hari_ini
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  join public.product_variants pv on pv.id = si.variant_id
  where s.status = 'selesai'
    and s.waktu >= now() - interval '30 days'
  group by si.variant_id, pv.product_id;
$$;

-- Index untuk lookup pembalikan stok saat void_penjualan (filter by ref_id).
create index stock_movements_ref_idx on public.stock_movements (ref_id) where ref_id is not null;

-- Tutup celah insert langsung: catat_penjualan (security definer) adalah
-- satu-satunya jalur tulis yang sah untuk sales/sale_items — lewat RPC ini
-- HPP dibekukan, stok dipotong, dan ledger stock_movements ikut tercatat.
-- Policy insert langsung sebelumnya memungkinkan pengguna ber-izin kasir
-- memotong jalur ini lewat Data API (forged hpp, tanpa potong stok/ledger).
drop policy if exists "catat penjualan" on public.sales;
drop policy if exists "catat item penjualan" on public.sale_items;

-- GRANT eksplisit: migrasi terdahulu hanya meng-grant fungsi yang ada saat itu.
revoke execute on function public.catat_penjualan(text, integer, jsonb) from public, anon;
revoke execute on function public.void_penjualan(uuid) from public, anon;
revoke execute on function public.peringkat_varian() from public, anon;
grant execute on function public.catat_penjualan(text, integer, jsonb) to authenticated;
grant execute on function public.void_penjualan(uuid) to authenticated;
grant execute on function public.peringkat_varian() to authenticated;
