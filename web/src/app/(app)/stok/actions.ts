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
  if (error) {
    return {
      ok: false,
      pesan:
        error.code === "23505"
          ? "Bahan dengan nama itu sudah ada — mungkin sedang nonaktif. Cek daftar nonaktif."
          : error.message,
    };
  }
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

export async function catatBelanja(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const qty = Number(formData.get("qty"));
  const total = Number(formData.get("total_harga"));
  if (!ingredientId) return { ok: false, pesan: "Pilih bahan dulu." };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, pesan: "Jumlah harus lebih dari 0." };
  }
  if (!Number.isInteger(total) || total <= 0) {
    return { ok: false, pesan: "Total harga harus bilangan bulat lebih dari 0." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("catat_belanja", {
    p_ingredient_id: ingredientId,
    p_qty: qty,
    p_total_harga: total,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}

export async function catatOpname(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("stok");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const fisik = Number(formData.get("stok_fisik"));
  if (!ingredientId) return { ok: false, pesan: "Pilih bahan dulu." };
  if (!Number.isFinite(fisik) || fisik < 0) {
    return { ok: false, pesan: "Stok fisik tidak boleh negatif." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("catat_opname", {
    p_ingredient_id: ingredientId,
    p_stok_fisik: fisik,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/stok");
  return { ok: true };
}
