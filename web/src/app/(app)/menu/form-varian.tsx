"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { setAktifVarian, simpanVarian } from "./actions";
import type { Varian } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormVarian({
  productId,
  varian,
}: {
  productId: string;
  varian?: Varian;
}) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await simpanVarian(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function gantiAktif() {
    if (!varian) return;
    setSibuk(true);
    const hasil = await setAktifVarian(varian.id, !varian.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={
          varian
            ? "text-sm font-semibold text-[var(--hijau)] underline"
            : "rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--kertas)]"
        }
      >
        {varian ? "Ubah" : "+ Varian"}
      </button>
      <Lembar
        buka={buka}
        judul={varian ? `Ubah varian ${varian.nama}` : "Tambah varian"}
        onTutup={() => setBuka(false)}
      >
        <form onSubmit={kirim}>
          {varian ? <input type="hidden" name="id" value={varian.id} /> : null}
          <input type="hidden" name="product_id" value={productId} />
          <label className={kelasLabel}>
            Nama varian (mis. Panas / Es)
            <input name="nama" required defaultValue={varian?.nama ?? ""} className={kelasInput} />
          </label>
          <label className={kelasLabel}>
            Harga jual (Rp)
            <input
              name="harga"
              type="number"
              step="1"
              min="0"
              required
              defaultValue={varian ? String(varian.harga) : ""}
              className={kelasInput}
            />
          </label>
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
            Simpan
          </button>
          {varian ? (
            <button
              type="button"
              onClick={gantiAktif}
              disabled={sibuk}
              className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)]"
            >
              {varian.aktif ? "Nonaktifkan varian" : "Aktifkan lagi"}
            </button>
          ) : null}
        </form>
      </Lembar>
    </>
  );
}
