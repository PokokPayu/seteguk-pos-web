import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";
import { bolehAkses, type Izin } from "@/lib/permissions";

export type Pengguna = { id: string; nama: string; izin: string[] };

export async function getPengguna(): Promise<Pengguna | null> {
  const supabase = await buatClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profil }, { data: baris }] = await Promise.all([
    supabase.from("profiles").select("nama").eq("id", user.id).single(),
    supabase.from("user_permissions").select("permission").eq("user_id", user.id),
  ]);

  return {
    id: user.id,
    nama: profil?.nama ?? user.email ?? "Pengguna",
    izin: (baris ?? []).map((b) => b.permission),
  };
}

export async function wajibIzin(butuh: Izin): Promise<Pengguna> {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  if (!bolehAkses(pengguna.izin, butuh)) redirect("/");
  return pengguna;
}
