"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { awalHariJakarta, tanggalJakarta } from "@/lib/kasir";
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

  const hasil = data as { total?: unknown; kembalian?: unknown } | null;

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
  const pengguna = await wajibIzin("kasir");
  if (!Number.isInteger(tunaiFisik) || tunaiFisik < 0) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  const sekarang = new Date();

  // Tunai sistem = total penjualan TUNAI berstatus selesai hari ini (WIB).
  // Dihitung ulang di server — jangan percaya angka dari klien.
  const { data, error } = await supabase
    .from("sales")
    .select("sale_items(qty, harga)")
    .eq("metode", "tunai")
    .eq("status", "selesai")
    .gte("waktu", awalHariJakarta(sekarang));
  if (error) return { ok: false, pesan: error.message };

  const baris = (data ?? []) as {
    sale_items: { qty: number; harga: number }[] | null;
  }[];
  const tunaiSistem = baris.reduce(
    (s, b) => s + (b.sale_items ?? []).reduce((x, i) => x + i.qty * i.harga, 0),
    0
  );

  const { error: errSimpan } = await supabase.from("cash_closings").insert({
    tanggal: tanggalJakarta(sekarang),
    tunai_sistem: tunaiSistem,
    tunai_fisik: tunaiFisik,
    selisih: tunaiFisik - tunaiSistem,
    catatan,
    created_by: pengguna.id,
  });
  if (errSimpan) {
    // 23505 = unique_violation pada kolom tanggal (satu penutupan per hari)
    return {
      ok: false,
      pesan:
        errSimpan.code === "23505"
          ? "Kasir hari ini sudah ditutup."
          : errSimpan.message,
    };
  }
  revalidatePath("/kasir");
  return { ok: true };
}
