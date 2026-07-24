-- Fungsi laporan bersifat SECURITY INVOKER (default): RLS pemanggil yang
-- menjaga. Policy "baca penjualan"/"baca item penjualan"/"baca pengeluaran"/
-- "baca tutup kasir" sudah mensyaratkan izin laporan (atau kasir/biaya).
-- Pengguna tanpa izin cukup mendapat nol baris, bukan error.

create or replace function public.laporan_harian(p_dari date, p_sampai date)
returns table (
  tanggal date,
  omzet bigint,
  hpp numeric,
  pengeluaran bigint,
  laba numeric,
  transaksi bigint,
  tunai bigint,
  qris bigint,
  selisih_kasir integer
)
language sql stable set search_path = public
as $$
  with hari as (
    select generate_series(p_dari, p_sampai, interval '1 day')::date as tanggal
  ),
  jual as (
    select
      (s.waktu at time zone 'Asia/Jakarta')::date as tanggal,
      coalesce(sum(si.qty * si.harga), 0)::bigint as omzet,
      coalesce(sum(si.qty * si.hpp), 0) as hpp,
      count(distinct s.id)::bigint as transaksi,
      coalesce(sum(si.qty * si.harga) filter (where s.metode = 'tunai'), 0)::bigint as tunai,
      coalesce(sum(si.qty * si.harga) filter (where s.metode = 'qris'), 0)::bigint as qris
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.status = 'selesai'
      and (s.waktu at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
    group by 1
  ),
  biaya as (
    select e.tanggal, coalesce(sum(e.nominal), 0)::bigint as pengeluaran
    from public.expenses e
    where e.tanggal between p_dari and p_sampai
    group by 1
  )
  select
    h.tanggal,
    coalesce(j.omzet, 0)::bigint,
    coalesce(j.hpp, 0),
    coalesce(b.pengeluaran, 0)::bigint,
    coalesce(j.omzet, 0) - coalesce(j.hpp, 0) - coalesce(b.pengeluaran, 0),
    coalesce(j.transaksi, 0)::bigint,
    coalesce(j.tunai, 0)::bigint,
    coalesce(j.qris, 0)::bigint,
    c.selisih
  from hari h
  left join jual j on j.tanggal = h.tanggal
  left join biaya b on b.tanggal = h.tanggal
  left join public.cash_closings c on c.tanggal = h.tanggal
  order by h.tanggal;
$$;

create or replace function public.terlaris(
  p_dari date,
  p_sampai date,
  p_limit integer default 5
)
returns table (nama text, terjual bigint)
language sql stable set search_path = public
as $$
  select si.nama_snapshot, sum(si.qty)::bigint as terjual
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'selesai'
    and (s.waktu at time zone 'Asia/Jakarta')::date between p_dari and p_sampai
  group by si.nama_snapshot
  order by terjual desc, si.nama_snapshot
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.laporan_harian(date, date) from public, anon;
revoke execute on function public.terlaris(date, date, integer) from public, anon;
grant execute on function public.laporan_harian(date, date) to authenticated;
grant execute on function public.terlaris(date, date, integer) to authenticated;
