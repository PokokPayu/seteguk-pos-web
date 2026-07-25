"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { formatJumlah, formatRupiahDesimal } from "@/lib/format";
import { hapusBarisResep, simpanBarisResep } from "./actions";
import type { BahanResep, BarisResep } from "./jenis";

export type BarisResepTampil = BarisResep & {
  namaBahan: string;
  satuan: string;
  hargaRata: number;
  bahanAktif: boolean;
};

export function Resep({
  variantId,
  baris,
  bahan,
}: {
  variantId: string;
  baris: BarisResepTampil[];
  bahan: BahanResep[];
}) {
  const toast = useToast();
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function tambah(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSibuk(true);
    const hasil = await simpanBarisResep(new FormData(form));
    setSibuk(false);
    if (hasil.ok) {
      form.reset();
      setPesan("");
      toast("Resep diperbarui");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function hapus(id: string) {
    setSibuk(true);
    const hasil = await hapusBarisResep(id);
    setSibuk(false);
    if (hasil.ok) toast("Bahan dihapus dari resep");
    else setPesan(hasil.pesan);
  }

  return (
    <details className="mt-2 w-full">
      <summary className="cursor-pointer text-xs font-semibold text-[var(--hijau)]">
        Resep ({baris.length} bahan)
      </summary>
      <div className="mt-2 rounded-lg border border-[var(--garis)] bg-[var(--kertas)] p-2 text-sm">
        {baris.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 border-b border-[var(--garis)] px-1 py-1.5 last:border-0"
          >
            <span>
              {r.namaBahan}
              {r.bahanAktif ? "" : " (nonaktif)"}
            </span>
            <span className="flex items-center gap-3">
              <span className="uang">
                {formatJumlah(r.qty)} {r.satuan}
              </span>
              <span className="uang text-[var(--pudar)]">
                {formatRupiahDesimal(r.qty * r.hargaRata)}
              </span>
              <button
                type="button"
                onClick={() => hapus(r.id)}
                disabled={sibuk}
                aria-label={`Hapus ${r.namaBahan}`}
                className="font-bold text-[var(--merah)]"
              >
                ×
              </button>
            </span>
          </div>
        ))}
        <form onSubmit={tambah} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="variant_id" value={variantId} />
          <label className="min-w-40 flex-1 text-xs font-semibold text-[var(--pudar)]">
            Bahan
            <select
              name="ingredient_id"
              required
              className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1.5 text-sm text-[var(--tinta)]"
            >
              <option value="">— pilih —</option>
              {bahan.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama} ({b.satuan})
                </option>
              ))}
            </select>
          </label>
          <label className="w-24 text-xs font-semibold text-[var(--pudar)]">
            Takaran
            <input
              name="qty"
              type="number"
              step="0.001"
              min="0.001"
              required
              className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1.5 text-sm text-[var(--tinta)]"
            />
          </label>
          <button
            type="submit"
            disabled={sibuk}
            className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] disabled:opacity-50"
          >
            Simpan
          </button>
        </form>
        {pesan ? (
          <p className="mt-2 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-2 py-1.5 text-xs text-[var(--merah)]">
            {pesan}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] text-[var(--pudar)]">
          Memilih bahan yang sudah ada di resep akan mengganti takarannya.
        </p>
      </div>
    </details>
  );
}
