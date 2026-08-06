-- daftar_tutup_kasir memanggil tunai_sistem_tanggal() di dalam select list,
-- jadi fungsi itu dijalankan sekali untuk SETIAP baris penutupan. Tiap
-- pemanggilan memindai seluruh tabel sales — indeks tidak bisa dipakai karena
-- filternya berupa ekspresi (waktu at time zone 'Asia/Jakarta')::date.
--
-- Biayanya karena itu O(jumlah penutupan × jumlah penjualan), tumbuh kuadratik
-- seiring warung beroperasi. Terukur di replika lokal:
--
--   31 penutupan  /   539 penjualan →  31 pemindaian,  16,9 ms
--  365 penutupan  / 6.039 penjualan → 365 pemindaian, 468,8 ms  (99,7% waktunya)
--
-- Bentuknya persis cacat RLS yang diperbaiki di 20260806000001: kerja yang
-- seharusnya sekali per query malah diulang per baris.
--
-- Perbaikannya menghitung tunai seluruh rentang dalam satu agregasi, lalu
-- menempelkannya lewat left join. Satu pemindaian, berapa pun penutupannya.
--
-- tunai_sistem_tanggal() sendiri TIDAK diubah dan tidak dihapus: tutup_kasir()
-- dan ubah_tutup_kasir() memanggilnya untuk satu tanggal, dan di sana bentuknya
-- memang tepat.

create or replace function public.daftar_tutup_kasir(p_dari date, p_sampai date)
returns table (
  tanggal date,
  tunai_sistem integer,
  tunai_sistem_kini integer,
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
    with tunai as (
      -- Definisi identik dengan tunai_sistem_tanggal(), hanya dikelompokkan
      -- per tanggal alih-alih dihitung ulang satu per satu.
      select (s.waktu at time zone 'Asia/Jakarta')::date as tanggal,
             sum(si.qty * si.harga)::integer as jumlah
      from public.sales s
      join public.sale_items si on si.sale_id = s.id
      where s.metode = 'tunai'
        and s.status = 'selesai'
        and (s.waktu at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
      group by 1
    )
    select c.tanggal, c.tunai_sistem,
           coalesce(t.jumlah, 0), c.tunai_fisik, c.selisih,
           c.catatan, coalesce(p.nama, 'Pengguna')
    from public.cash_closings c
    left join public.profiles p on p.id = c.created_by
    left join tunai t on t.tanggal = c.tanggal
    where c.tanggal between p_dari and p_sampai
    order by c.tanggal desc;
end;
$$;

revoke execute on function public.daftar_tutup_kasir(date, date) from public, anon;
grant execute on function public.daftar_tutup_kasir(date, date) to authenticated;
