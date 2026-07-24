"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";

export type HasilPenjualan =
  | { ok: true; stokMinus: string[] }
  | { ok: false; pesan: string };

export async function catatPenjualan(
  metode: "tunai" | "qris",
  uangDiterima: number | null,
  items: { variantId: string; qty: number }[]
): Promise<HasilPenjualan> {
  await wajibIzin("kasir");
  if (items.length === 0) {
    return { ok: false, pesan: "Keranjang masih kosong." };
  }
  if (metode !== "tunai" && metode !== "qris") {
    return { ok: false, pesan: "Metode pembayaran tidak valid." };
  }
  if (
    metode === "tunai" &&
    (uangDiterima === null || !Number.isInteger(uangDiterima) || uangDiterima < 0)
  ) {
    return { ok: false, pesan: "Uang diterima tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("catat_penjualan", {
    p_metode: metode,
    p_uang_diterima: metode === "tunai" ? uangDiterima : null,
    p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
  });
  if (error) return { ok: false, pesan: error.message };

  // Penjualan tidak pernah diblokir walau stok jadi minus (spec) — beri tahu
  // kasir bahan mana yang minus supaya diopname.
  const { data: minus } = await supabase
    .from("ingredients")
    .select("nama")
    .eq("aktif", true)
    .lt("stok", 0)
    .order("nama");

  revalidatePath("/kasir");
  revalidatePath("/stok");
  return {
    ok: true,
    stokMinus: ((minus ?? []) as { nama: string }[]).map((b) => b.nama),
  };
}
