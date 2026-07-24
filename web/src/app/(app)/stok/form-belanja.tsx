"use client";

import { useMemo, useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatRupiahDesimal } from "@/lib/format";
import { hitungRataRata } from "@/lib/inventori";
import { catatBelanja } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormBelanja({ bahan }: { bahan: Bahan[] }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [idBahan, setIdBahan] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");

  const pilihan = bahan.find((b) => b.id === idBahan);
  const preview = useMemo(() => {
    const q = Number(qty);
    const t = Number(total);
    if (!pilihan || !Number.isFinite(q) || q <= 0 || !Number.isFinite(t) || t <= 0) {
      return null;
    }
    return hitungRataRata(pilihan.stok, pilihan.harga_rata, q, t);
  }, [pilihan, qty, total]);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatBelanja(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setIdBahan("");
      setQty("");
      setTotal("");
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
      >
        + Catat belanja
      </button>
      <Lembar buka={buka} judul="Catat belanja bahan" onTutup={() => setBuka(false)}>
        <form onSubmit={kirim}>
          <label className={kelasLabel}>
            Bahan
            <select
              name="ingredient_id"
              required
              value={idBahan}
              onChange={(e) => setIdBahan(e.target.value)}
              className={kelasInput}
            >
              <option value="">— pilih —</option>
              {bahan.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama} ({b.satuan})
                </option>
              ))}
            </select>
          </label>
          <label className={kelasLabel}>
            Jumlah{pilihan ? ` (${pilihan.satuan})` : ""}
            <input
              name="qty"
              type="number"
              step="0.001"
              min="0.001"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={kelasInput}
            />
          </label>
          <label className={kelasLabel}>
            Total harga (Rp)
            <input
              name="total_harga"
              type="number"
              step="1"
              min="1"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={kelasInput}
            />
          </label>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--garis)] pt-3 text-sm">
            <span className="text-[var(--pudar)]">Harga rata-rata baru</span>
            <b className="uang">
              {preview !== null && pilihan
                ? `${formatRupiahDesimal(preview)}/${pilihan.satuan}`
                : "—"}
            </b>
          </div>
          {pesan ? (
            <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
              {pesan}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-60"
          >
            Simpan belanja
          </button>
          <p className="mt-2 text-[11px] text-[var(--pudar)]">
            Belanja tidak bisa diubah setelah disimpan — salah input dikoreksi lewat stok opname.
          </p>
        </form>
      </Lembar>
    </>
  );
}
