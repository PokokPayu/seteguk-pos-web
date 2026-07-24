"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { SEMUA_IZIN } from "@/lib/permissions";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanIzin(
  userId: string,
  izin: string[]
): Promise<HasilAksi> {
  const pengguna = await wajibIzin("user");
  if (!userId) return { ok: false, pesan: "Pengguna tidak dikenali." };
  const bersih = izin.filter((i) => (SEMUA_IZIN as readonly string[]).includes(i));
  if (bersih.length === 0) {
    return { ok: false, pesan: "Centang minimal satu hak akses." };
  }
  // Jangan sampai mengunci diri sendiri keluar dari modul pengguna
  if (userId === pengguna.id && !bersih.includes("user")) {
    return {
      ok: false,
      pesan: "Tidak bisa mencabut izin kelola pengguna milik sendiri.",
    };
  }

  const supabase = await buatClientServer();
  const { error: errHapus } = await supabase
    .from("user_permissions")
    .delete()
    .eq("user_id", userId);
  if (errHapus) return { ok: false, pesan: errHapus.message };
  const { error } = await supabase
    .from("user_permissions")
    .insert(bersih.map((p) => ({ user_id: userId, permission: p })));
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengguna");
  return { ok: true };
}

export async function setAktifPengguna(
  userId: string,
  aktif: boolean
): Promise<HasilAksi> {
  const pengguna = await wajibIzin("user");
  if (userId === pengguna.id && !aktif) {
    return { ok: false, pesan: "Tidak bisa menonaktifkan akun sendiri." };
  }
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("profiles")
    .update({ aktif })
    .eq("id", userId);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengguna");
  return { ok: true };
}
