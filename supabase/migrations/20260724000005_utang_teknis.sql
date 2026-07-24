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
create unique index if not exists ingredients_nama_unik on public.ingredients (lower(nama));
create unique index if not exists products_nama_unik on public.products (lower(nama));
