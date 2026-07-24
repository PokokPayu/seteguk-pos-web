import { cache } from "react";
import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";
import { bolehAkses, type Izin } from "@/lib/permissions";

export type Pengguna = { id: string; nama: string; izin: string[] };

// cache(): satu request satu kali query, walau dipanggil layout + page.
export const getPengguna = cache(async (): Promise<Pengguna | null> => {
  const supabase = await buatClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profilRes, izinRes] = await Promise.all([
    supabase.from("profiles").select("nama, aktif").eq("id", user.id).single(),
    supabase.from("user_permissions").select("permission").eq("user_id", user.id),
  ]);
  if (profilRes.error) {
    console.error("getPengguna: gagal baca profil", profilRes.error);
  }
  if (izinRes.error) {
    console.error("getPengguna: gagal baca izin", izinRes.error);
  }

  // profiles.aktif = false berarti akses dicabut
  if (profilRes.data && profilRes.data.aktif === false) return null;

  return {
    id: user.id,
    nama: profilRes.data?.nama ?? user.email ?? "Pengguna",
    izin: (izinRes.data ?? []).map((b) => b.permission),
  };
});

export async function wajibIzin(butuh: Izin): Promise<Pengguna> {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  if (!bolehAkses(pengguna.izin, butuh)) redirect("/");
  return pengguna;
}
