"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import type { HasilAksi } from "@/lib/aksi";

export async function simpanMenu(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("menu");
  const id = String(formData.get("id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const kategori = String(formData.get("kategori") ?? "").trim();
  if (!nama || !kategori) {
    return { ok: false, pesan: "Nama dan kategori wajib diisi." };
  }

  const supabase = await buatClientServer();

  if (id) {
    const { error } = await supabase
      .from("products")
      .update({ nama, kategori })
      .eq("id", id);
    if (error) return { ok: false, pesan: error.message };
  } else {
    const namaVarian = String(formData.get("nama_varian") ?? "").trim();
    const harga = Number(formData.get("harga"));
    if (!namaVarian) {
      return { ok: false, pesan: "Nama varian pertama wajib diisi." };
    }
    if (!Number.isInteger(harga) || harga < 0) {
      return { ok: false, pesan: "Harga tidak valid." };
    }
    const { data: produk, error } = await supabase
      .from("products")
      .insert({ nama, kategori })
      .select("id")
      .single();
    if (error || !produk) {
      return { ok: false, pesan: error?.message ?? "Gagal membuat menu." };
    }
    const { error: errVarian } = await supabase
      .from("product_variants")
      .insert({ product_id: produk.id, nama: namaVarian, harga });
    if (errVarian) {
      // varian pertama gagal: hapus produk yatim agar aturan "minimal satu varian" terjaga
      await supabase.from("products").delete().eq("id", produk.id);
      return { ok: false, pesan: errVarian.message };
    }
  }
  revalidatePath("/menu");
  return { ok: true };
}

export async function setAktifMenu(id: string, aktif: boolean): Promise<HasilAksi> {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const { error } = await supabase.from("products").update({ aktif }).eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}

export async function simpanVarian(formData: FormData): Promise<HasilAksi> {
  await wajibIzin("menu");
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const nama = String(formData.get("nama") ?? "").trim();
  const harga = Number(formData.get("harga"));
  if (!nama) return { ok: false, pesan: "Nama varian wajib diisi." };
  if (!Number.isInteger(harga) || harga < 0) {
    return { ok: false, pesan: "Harga tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = id
    ? await supabase.from("product_variants").update({ nama, harga }).eq("id", id)
    : await supabase
        .from("product_variants")
        .insert({ product_id: productId, nama, harga });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}

export async function setAktifVarian(id: string, aktif: boolean): Promise<HasilAksi> {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("product_variants")
    .update({ aktif })
    .eq("id", id);
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/menu");
  return { ok: true };
}
