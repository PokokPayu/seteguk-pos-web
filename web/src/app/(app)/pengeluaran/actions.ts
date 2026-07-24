"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { tanggalJakarta } from "@/lib/kasir";
import type { HasilAksi } from "@/lib/aksi";

export async function catatPengeluaran(formData: FormData): Promise<HasilAksi> {
  const pengguna = await wajibIzin("biaya");
  const tanggal = String(formData.get("tanggal") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const nominal = Number(formData.get("nominal"));
  const catatan = String(formData.get("catatan") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { ok: false, pesan: "Tanggal tidak valid." };
  }
  if (tanggal > tanggalJakarta(new Date())) {
    return { ok: false, pesan: "Tanggal tidak boleh di masa depan." };
  }
  if (!categoryId) return { ok: false, pesan: "Pilih kategori dulu." };
  if (!Number.isInteger(nominal) || nominal <= 0) {
    return { ok: false, pesan: "Nominal harus bilangan bulat lebih dari 0." };
  }

  const supabase = await buatClientServer();
  // expenses.created_by NOT NULL tanpa default — isi dari pengguna yang login.
  const { error } = await supabase.from("expenses").insert({
    tanggal,
    category_id: categoryId,
    nominal,
    catatan,
    created_by: pengguna.id,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/pengeluaran");
  revalidatePath("/laporan");
  return { ok: true };
}

export async function tambahKategori(nama: string): Promise<HasilAksi> {
  await wajibIzin("biaya");
  const bersih = nama.trim();
  if (!bersih) return { ok: false, pesan: "Nama kategori wajib diisi." };
  const supabase = await buatClientServer();
  const { error } = await supabase
    .from("expense_categories")
    .insert({ nama: bersih });
  if (error) {
    return {
      ok: false,
      pesan:
        error.code === "23505" ? "Kategori itu sudah ada." : error.message,
    };
  }
  revalidatePath("/pengeluaran");
  return { ok: true };
}
