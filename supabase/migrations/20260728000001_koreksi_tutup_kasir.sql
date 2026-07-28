-- Koreksi tutup kasir: ubah nominal & buka kembali, selalu berjejak.
--
-- Seluruh mutasi cash_closings dipindahkan ke fungsi security definer di berkas
-- ini, dan policy tulis tabelnya DIHAPUS. Alasannya: kalau policy update/delete
-- diberikan ke pemegang izin 'user', dia bisa memanggil Data API langsung
-- (.update()/.delete()) dan mengubah angka tanpa melewati penulisan log —
-- persis yang ingin dicegah. Policy insert lama juga dihapus karena tutup kasir
-- kini lewat tutup_kasir().

-- ===== Log koreksi =====
create table public.cash_closing_log (
  id uuid primary key default gen_random_uuid(),
  -- tanggal kasir yang dikoreksi, BUKAN tanggal aksi (itu created_at)
  tanggal date not null,
  aksi text not null check (aksi in ('ubah','buka','tutup_ulang')),
  tunai_sistem_lama integer,
  tunai_fisik_lama integer,
  selisih_lama integer,
  tunai_sistem_baru integer,
  tunai_fisik_baru integer,
  selisih_baru integer,
  alasan text not null check (length(btrim(alasan)) >= 3),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index cash_closing_log_tanggal_idx on public.cash_closing_log (tanggal);

alter table public.cash_closing_log enable row level security;

-- Hanya bisa dibaca. Tidak ada policy insert/update/delete: penulisan eksklusif
-- lewat fungsi security definer di bawah, dan baris log tidak pernah diubah.
create policy "baca log tutup kasir" on public.cash_closing_log
  for select using (
    public.has_permission(auth.uid(), 'laporan')
    or public.has_permission(auth.uid(), 'user')
  );

-- ===== Tutup jalur tulis langsung ke cash_closings =====
drop policy "catat tutup kasir" on public.cash_closings;

-- ===== Tunai sistem satu tanggal =====
-- Angka turunan: selalu dihitung ulang dari penjualan, tidak pernah disalin
-- dari baris penutupan lama.
create or replace function public.tunai_sistem_tanggal(p_tanggal date)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(si.qty * si.harga), 0)::integer
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where s.metode = 'tunai'
    and s.status = 'selesai'
    and (s.waktu at time zone 'Asia/Jakarta')::date = p_tanggal;
$$;

-- ===== Tutup kasir (bertanggal) =====
create or replace function public.tutup_kasir(
  p_tanggal date,
  p_tunai_fisik integer,
  p_catatan text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_sistem integer;
  v_pernah boolean;
begin
  if p_tanggal is null then
    raise exception 'tanggal tidak valid';
  end if;
  if p_tanggal > v_hari_ini then
    raise exception 'tanggal di masa depan';
  end if;
  -- Kasir hanya boleh menutup hari berjalan; tanggal lampau butuh izin user.
  if p_tanggal = v_hari_ini then
    if not (public.has_permission(auth.uid(), 'kasir')
            or public.has_permission(auth.uid(), 'user')) then
      raise exception 'butuh izin kasir';
    end if;
  else
    if not public.has_permission(auth.uid(), 'user') then
      raise exception 'butuh izin user';
    end if;
  end if;
  if p_tunai_fisik is null or p_tunai_fisik < 0 then
    raise exception 'nominal tidak valid';
  end if;

  v_sistem := public.tunai_sistem_tanggal(p_tanggal);
  -- Ada log untuk tanggal ini = tanggal ini pernah dibuka/dikoreksi, jadi
  -- penutupan sekarang adalah penutupan ULANG dan wajib ikut tercatat.
  -- Penutupan pertama yang normal tidak mengotori log.
  v_pernah := exists (
    select 1 from public.cash_closing_log where tanggal = p_tanggal
  );

  begin
    insert into public.cash_closings
      (tanggal, tunai_sistem, tunai_fisik, selisih, catatan, created_by)
    values
      (p_tanggal, v_sistem, p_tunai_fisik, p_tunai_fisik - v_sistem,
       coalesce(p_catatan, ''), auth.uid());
  exception when unique_violation then
    raise exception 'kasir tanggal ini sudah ditutup';
  end;

  if v_pernah then
    insert into public.cash_closing_log
      (tanggal, aksi, tunai_sistem_baru, tunai_fisik_baru, selisih_baru,
       alasan, created_by)
    values
      (p_tanggal, 'tutup_ulang', v_sistem, p_tunai_fisik,
       p_tunai_fisik - v_sistem,
       -- catatan boleh kosong/pendek, tapi kolom alasan wajib >= 3 karakter
       case when length(btrim(coalesce(p_catatan, ''))) >= 3
            then btrim(p_catatan)
            else 'tutup ulang setelah dibuka' end,
       auth.uid());
  end if;
end;
$$;

-- ===== Ubah nominal =====
create or replace function public.ubah_tutup_kasir(
  p_tanggal date,
  p_tunai_fisik integer,
  p_alasan text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lama public.cash_closings%rowtype;
  v_sistem integer;
begin
  if not public.has_permission(auth.uid(), 'user') then
    raise exception 'butuh izin user';
  end if;
  if p_tunai_fisik is null or p_tunai_fisik < 0 then
    raise exception 'nominal tidak valid';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'alasan wajib diisi';
  end if;

  -- for update: menyerialkan dua pemilik yang mengubah/membuka tanggal sama.
  select * into v_lama from public.cash_closings
  where tanggal = p_tanggal for update;
  if not found then
    raise exception 'tutup kasir tanggal ini sudah dibuka';
  end if;
  if v_lama.tunai_fisik = p_tunai_fisik then
    raise exception 'nominal tidak berubah';
  end if;

  v_sistem := public.tunai_sistem_tanggal(p_tanggal);

  update public.cash_closings
  set tunai_sistem = v_sistem,
      tunai_fisik = p_tunai_fisik,
      selisih = p_tunai_fisik - v_sistem
  where tanggal = p_tanggal;

  insert into public.cash_closing_log
    (tanggal, aksi, tunai_sistem_lama, tunai_fisik_lama, selisih_lama,
     tunai_sistem_baru, tunai_fisik_baru, selisih_baru, alasan, created_by)
  values
    (p_tanggal, 'ubah', v_lama.tunai_sistem, v_lama.tunai_fisik, v_lama.selisih,
     v_sistem, p_tunai_fisik, p_tunai_fisik - v_sistem, btrim(p_alasan),
     auth.uid());
end;
$$;

-- ===== Buka kembali =====
-- Menghapus barisnya, bukan menandai status: void_penjualan mengunci lewat
-- exists(...) dan laporan_harian memakai left join, jadi menghapus otomatis
-- membuka kunci void dan mengosongkan selisih hari itu tanpa menyentuh
-- keduanya. Jejaknya tetap utuh di cash_closing_log.
create or replace function public.buka_kasir(p_tanggal date, p_alasan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lama public.cash_closings%rowtype;
begin
  if not public.has_permission(auth.uid(), 'user') then
    raise exception 'butuh izin user';
  end if;
  if length(btrim(coalesce(p_alasan, ''))) < 3 then
    raise exception 'alasan wajib diisi';
  end if;

  select * into v_lama from public.cash_closings
  where tanggal = p_tanggal for update;
  if not found then
    raise exception 'tutup kasir tanggal ini sudah dibuka';
  end if;

  insert into public.cash_closing_log
    (tanggal, aksi, tunai_sistem_lama, tunai_fisik_lama, selisih_lama,
     alasan, created_by)
  values
    (p_tanggal, 'buka', v_lama.tunai_sistem, v_lama.tunai_fisik, v_lama.selisih,
     btrim(p_alasan), auth.uid());

  delete from public.cash_closings where tanggal = p_tanggal;
end;
$$;

-- ===== Baca untuk halaman Laporan =====
-- security definer karena butuh nama pelaku: RLS profiles hanya mengizinkan
-- melihat profil sendiri, kecuali pemegang izin 'user'. Fungsi ini membuka
-- tepat satu kolom nama, jauh lebih sempit daripada melonggarkan RLS profiles.
create or replace function public.daftar_tutup_kasir(p_dari date, p_sampai date)
returns table (
  tanggal date,
  tunai_sistem integer,
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
    select c.tanggal, c.tunai_sistem, c.tunai_fisik, c.selisih, c.catatan,
           coalesce(p.nama, 'Pengguna')
    from public.cash_closings c
    left join public.profiles p on p.id = c.created_by
    where c.tanggal between p_dari and p_sampai
    order by c.tanggal desc;
end;
$$;

create or replace function public.riwayat_tutup_kasir(p_dari date, p_sampai date)
returns table (
  tanggal date,
  aksi text,
  tunai_fisik_lama integer,
  tunai_fisik_baru integer,
  alasan text,
  oleh text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.has_permission(auth.uid(), 'laporan')
          or public.has_permission(auth.uid(), 'user')) then
    raise exception 'butuh izin laporan';
  end if;
  return query
    select l.tanggal, l.aksi, l.tunai_fisik_lama, l.tunai_fisik_baru, l.alasan,
           coalesce(p.nama, 'Pengguna'), l.created_at
    from public.cash_closing_log l
    left join public.profiles p on p.id = l.created_by
    where l.tanggal between p_dari and p_sampai
    order by l.created_at desc;
end;
$$;

-- ===== Hak akses Data API =====
grant select on public.cash_closing_log to authenticated;

revoke execute on function public.tunai_sistem_tanggal(date) from public, anon;
revoke execute on function public.tutup_kasir(date, integer, text) from public, anon;
revoke execute on function public.ubah_tutup_kasir(date, integer, text) from public, anon;
revoke execute on function public.buka_kasir(date, text) from public, anon;
revoke execute on function public.daftar_tutup_kasir(date, date) from public, anon;
revoke execute on function public.riwayat_tutup_kasir(date, date) from public, anon;

-- tunai_sistem_tanggal sengaja TIDAK di-grant ke authenticated: hanya dipanggil
-- dari dalam fungsi lain (konteks pemilik), jadi tidak perlu jadi permukaan API.
grant execute on function public.tutup_kasir(date, integer, text) to authenticated;
grant execute on function public.ubah_tutup_kasir(date, integer, text) to authenticated;
grant execute on function public.buka_kasir(date, text) to authenticated;
grant execute on function public.daftar_tutup_kasir(date, date) to authenticated;
grant execute on function public.riwayat_tutup_kasir(date, date) to authenticated;
