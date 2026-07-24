"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanBahan(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const id = String(formData.get("id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const satuan = String(formData.get("satuan") ?? "").trim();
  const minStok = Number(formData.get("min_stok") ?? 0);
  if (!nama || !satuan) {
    return { ok: false, pesan: "Nama dan satuan wajib diisi." };
  }
  if (!Number.isFinite(minStok) || minStok < 0) {
    return { ok: false, pesan: "Batas minimum tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = id
    ? await supabase
        .from("ingredients")
        .update({ nama, satuan, min_stok: minStok })
        .eq("id", id)
    : await supabase
        .from("ingredients")
        .insert({ nama, satuan, min_stok: minStok });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}

export async function setAktifBahan(
  id: string,
  aktif: boolean
): Promise<HasilAksi> {
  await wajibIzin("stok");
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("ingredients")
    .update({ aktif })
    .eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}
