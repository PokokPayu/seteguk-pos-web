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
