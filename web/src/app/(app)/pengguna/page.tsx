import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { KartuPengguna } from "./kartu-pengguna";
import type { PenggunaBaris } from "./jenis";

export default async function HalamanPengguna() {
  await wajibIzin("user");
  const supabase = await buatClientServer();
  const [profilRes, izinRes] = await Promise.all([
    supabase.from("profiles").select("id, nama, aktif").order("nama"),
    supabase.from("user_permissions").select("user_id, permission"),
  ]);
  if (profilRes.error) {
    throw new Error(`Gagal memuat pengguna: ${profilRes.error.message}`);
  }
  if (izinRes.error) {
    throw new Error(`Gagal memuat izin: ${izinRes.error.message}`);
  }

  const izinPer = new Map<string, string[]>();
  for (const b of (izinRes.data ?? []) as {
    user_id: string;
    permission: string;
  }[]) {
    izinPer.set(b.user_id, [...(izinPer.get(b.user_id) ?? []), b.permission]);
  }
  const daftar: PenggunaBaris[] = (
    (profilRes.data ?? []) as { id: string; nama: string; aktif: boolean }[]
  ).map((p) => ({
    id: p.id,
    nama: p.nama,
    email: "",
    aktif: p.aktif,
    izin: izinPer.get(p.id) ?? [],
  }));

  return (
    <div>
      <h1 className="display text-2xl">Pengguna</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        Atur siapa boleh mengakses modul apa. Pengguna nonaktif tidak bisa masuk.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {daftar.map((p) => (
          <KartuPengguna key={p.id} pengguna={p} />
        ))}
      </div>
    </div>
  );
}
