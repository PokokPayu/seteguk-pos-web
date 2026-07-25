import { cache } from "react";
import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";
import { bolehAkses, type Izin } from "@/lib/permissions";

export type Pengguna = { id: string; nama: string; izin: string[] };

// cache(): satu request satu kali query, walau dipanggil layout + page.
export const getPengguna = cache(async (): Promise<Pengguna | null> => {
  const supabase = await buatClientServer();
  // getClaims(): verifikasi JWT lokal, tanpa round-trip ke server Auth —
  // lihat catatan di proxy.ts.
  const claims = await supabase.auth
    .getClaims()
    .then(({ data, error }) => {
      if (error) console.error("getPengguna: getClaims gagal", error);
      return data?.claims ?? null;
    })
    .catch((err: unknown) => {
      // Token rusak (bukan AuthError) bikin getClaims melempar — anggap belum login.
      console.error("getPengguna: getClaims melempar", err);
      return null;
    });
  if (!claims) return null;

  const [profilRes, izinRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("nama, aktif")
      .eq("id", claims.sub)
      .single(),
    supabase
      .from("user_permissions")
      .select("permission")
      .eq("user_id", claims.sub),
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
    id: claims.sub,
    nama: profilRes.data?.nama ?? claims.email ?? "Pengguna",
    izin: (izinRes.data ?? []).map((b) => b.permission),
  };
});

export async function wajibIzin(butuh: Izin): Promise<Pengguna> {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/keluar");
  if (!bolehAkses(pengguna.izin, butuh)) redirect("/");
  return pengguna;
}
