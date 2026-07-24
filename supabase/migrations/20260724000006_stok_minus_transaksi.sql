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
