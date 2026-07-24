-- profiles.aktif sebelumnya hanya ditegakkan di lapisan aplikasi, sehingga
-- pengguna nonaktif yang masih memegang token bisa memanggil RPC/tabel
-- langsung. Sekarang izin ikut batal begitu akunnya dinonaktifkan.
create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from user_permissions up
    join profiles p on p.id = up.user_id
    where up.user_id = uid
      and up.permission = perm
      and p.aktif
  );
$$;
