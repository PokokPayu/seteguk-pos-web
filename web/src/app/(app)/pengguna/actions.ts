"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { buatClientAdmin } from "@/lib/supabase/admin";
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

export async function buatPengguna(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("user");
  const nama = String(formData.get("nama") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const izin = formData.getAll("izin").map(String);

  if (!nama) return { ok: false, pesan: "Nama wajib diisi." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, pesan: "Email tidak valid." };
  }
  if (password.length < 8) {
    return { ok: false, pesan: "Password minimal 8 karakter." };
  }
  const bersih = izin.filter((i) => (SEMUA_IZIN as readonly string[]).includes(i));
  if (bersih.length === 0) {
    return { ok: false, pesan: "Centang minimal satu hak akses." };
  }

  const admin = buatClientAdmin();
  if (!admin) {
    return {
      ok: false,
      pesan:
        "Fitur buat akun belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY belum diisi).",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama },
  });
  if (error || !data.user) {
    return { ok: false, pesan: error?.message ?? "Gagal membuat akun." };
  }

  // Trigger handle_new_user sudah membuat baris profiles; pastikan namanya benar.
  await admin.from("profiles").update({ nama }).eq("id", data.user.id);
  const { error: errIzin } = await admin
    .from("user_permissions")
    .insert(bersih.map((p) => ({ user_id: data.user.id, permission: p })));
  if (errIzin) return { ok: false, pesan: errIzin.message };

  revalidatePath("/pengguna");
  return { ok: true };
}
