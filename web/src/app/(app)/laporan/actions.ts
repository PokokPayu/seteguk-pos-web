"use server";

import { revalidatePath } from "next/cache";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import {
  alasanValid,
  nominalValid,
  pesanErrorRpc,
  tanggalValid,
} from "@/lib/tutup-kasir";
import type { HasilAksi } from "@/lib/aksi";

// Validasi di sini hanya untuk pesan yang cepat dan enak dibaca. Penjaga
// sebenarnya ada di dalam RPC, yang mengecek izin dan aturan yang sama.
function periksa(tanggal: string, alasan: string): string | null {
  if (!tanggalValid(tanggal)) return "Tanggal tidak valid.";
  if (!alasanValid(alasan)) return "Alasan wajib diisi, minimal 3 karakter.";
  return null;
}

function segarkan() {
  revalidatePath("/laporan");
  revalidatePath("/kasir");
}

export async function ubahTutupKasir(
  tanggal: string,
  tunaiFisik: number,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("ubah_tutup_kasir", {
    p_tanggal: tanggal,
    p_tunai_fisik: tunaiFisik,
    p_alasan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}

export async function bukaKasir(
  tanggal: string,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("buka_kasir", {
    p_tanggal: tanggal,
    p_alasan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}

export async function tutupKasirTanggal(
  tanggal: string,
  tunaiFisik: number,
  alasan: string
): Promise<HasilAksi> {
  await wajibIzin("user");
  const salah = periksa(tanggal, alasan);
  if (salah) return { ok: false, pesan: salah };
  if (!nominalValid(tunaiFisik)) {
    return { ok: false, pesan: "Jumlah tunai fisik tidak valid." };
  }

  const supabase = await buatClientServer();
  const { error } = await supabase.rpc("tutup_kasir", {
    p_tanggal: tanggal,
    p_tunai_fisik: tunaiFisik,
    p_catatan: alasan.trim(),
  });
  if (error) return { ok: false, pesan: pesanErrorRpc(error.message) };

  segarkan();
  return { ok: true };
}
