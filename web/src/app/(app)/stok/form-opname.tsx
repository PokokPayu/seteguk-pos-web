"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { useToast } from "@/components/toast";
import { formatJumlah } from "@/lib/format";
import { catatOpname } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormOpname({ bahan }: { bahan: Bahan[] }) {
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [idBahan, setIdBahan] = useState("");
  const [fisik, setFisik] = useState("");

  const pilihan = bahan.find((b) => b.id === idBahan);
  const angkaFisik = Number(fisik);
  const selisih =
    pilihan && fisik !== "" && Number.isFinite(angkaFisik) && angkaFisik >= 0
      ? angkaFisik - pilihan.stok
      : null;

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatOpname(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setIdBahan("");
      setFisik("");
      setPesan("");
      toast("Opname tersimpan — stok dikoreksi");
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--enamel)]"
      >
        Stok opname
      </button>
      <Lembar buka={buka} judul="Stok opname" onTutup={() => setBuka(false)}>
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
                  {b.nama} — catatan: {formatJumlah(b.stok)} {b.satuan}
                </option>
              ))}
            </select>
          </label>
          <label className={kelasLabel}>
            Hasil hitung fisik{pilihan ? ` (${pilihan.satuan})` : ""}
            <input
              name="stok_fisik"
              type="number"
              step="0.001"
              min="0"
              required
              value={fisik}
              onChange={(e) => setFisik(e.target.value)}
              className={kelasInput}
            />
          </label>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--garis)] pt-3 text-sm">
            <span className="text-[var(--pudar)]">Selisih dari catatan</span>
            <b
              className={`uang ${
                selisih !== null && selisih < 0 ? "text-[var(--merah)]" : ""
              }`}
            >
              {selisih !== null && pilihan
                ? `${selisih > 0 ? "+" : ""}${formatJumlah(selisih)} ${pilihan.satuan}`
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
            className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] active:scale-[.99] hover:bg-[var(--hijau-tua)] disabled:opacity-50"
          >
            Simpan opname
          </button>
          <p className="mt-2 text-[11px] text-[var(--pudar)]">
            Harga rata-rata tidak berubah — opname hanya mengoreksi jumlah stok.
          </p>
        </form>
      </Lembar>
    </>
  );
}
