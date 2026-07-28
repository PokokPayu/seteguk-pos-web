"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { tanggalJakarta } from "@/lib/kasir";
import { nominalValid, pesanErrorRpc } from "@/lib/tutup-kasir";
import type { HasilAksi } from "@/lib/aksi";

export type HasilPenjualan =
  | { ok: true; stokMinus: string[]; total: number; kembalian: number }
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
  const itemValid = items.every(
    (i) =>
      typeof i.variantId === "string" &&
      i.variantId.length > 0 &&
      Number.isInteger(i.qty) &&
      i.qty > 0 &&
      i.qty <= 999
  );
  if (!itemValid) {
    return { ok: false, pesan: "Item pesanan tidak valid." };
  }

  const supabase = await buatClientServer();
  const { data, error } = await supabase.rpc("catat_penjualan", {
    p_metode: metode,
    p_uang_diterima: metode === "tunai" ? uangDiterima : null,
    p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
  });
  if (error) return { ok: false, pesan: error.message };

  const hasil = data as {
    total?: unknown;
    kembalian?: unknown;
    stok_minus?: unknown;
  } | null;
  const stokMinus = Array.isArray(hasil?.stok_minus)
    ? hasil.stok_minus.map(String)
    : [];

  revalidatePath("/kasir");
  revalidatePath("/stok");
  return {
    ok: true,
    stokMinus,
    total: Number(hasil?.total ?? 0),
    kembalian: Number(hasil?.kembalian ?? 0),
  };
}

export async function voidPenjualan(saleId: string): Promise<HasilAksi> {
  await wajibIzin("void");
  if (!saleId) return { ok: false, pesan: "Transaksi tidak dikenali." };
  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("void_penjualan", {
    p_sale_id: saleId,
  });
  if (error) return { ok: false, pesan: error.message };
  revalidatePath("/kasir");
  revalidatePath("/stok");
  return { ok: true };
}

export async function tutupKasir(
  tunaiFisik: number,
  catatan: string
): Promise<HasilAksi> {
  await wajibIzin("kasir");
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  // Tunai sistem dihitung di dalam RPC, bukan di sini — satu jalur perhitungan
  // yang sama dipakai kasir maupun pemilik yang menutup tanggal lampau.
  const { error } = await supabase.rpc("tutup_kasir", {
    p_tanggal: tanggalJakarta(new Date()),
    p_tunai_fisik: tunaiFisik,
    p_catatan: catatan,
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  revalidatePath("/kasir");
  revalidatePath("/laporan");
  return { ok: true };
}
