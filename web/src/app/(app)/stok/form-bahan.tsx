"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { setAktifBahan, simpanBahan } from "./actions";
import type { Bahan } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormBahan({ bahan }: { bahan?: Bahan }) {
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await simpanBahan(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) {
      setBuka(false);
      setPesan("");
    } else {
      setPesan(hasil.pesan);
    }
  }

  async function gantiAktif() {
    if (!bahan) return;
    setSibuk(true);
    const hasil = await setAktifBahan(bahan.id, !bahan.aktif);
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
          bahan
            ? "text-sm font-semibold text-[var(--hijau)] underline"
            : "rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
        }
      >
        {bahan ? "Ubah" : "+ Tambah bahan"}
      </button>
      <Lembar
        buka={buka}
        judul={bahan ? `Ubah ${bahan.nama}` : "Tambah bahan"}
        onTutup={() => setBuka(false)}
      >
        <form onSubmit={kirim}>
          {bahan ? <input type="hidden" name="id" value={bahan.id} /> : null}
          <label className={kelasLabel}>
            Nama
            <input name="nama" required defaultValue={bahan?.nama ?? ""} className={kelasInput} />
          </label>
          <label className={kelasLabel}>
            Satuan
            <input
              name="satuan"
              required
              defaultValue={bahan?.satuan ?? ""}
              list="saran-satuan"
              className={kelasInput}
            />
          </label>
          <datalist id="saran-satuan">
            <option value="gram" />
            <option value="ml" />
            <option value="pcs" />
            <option value="butir" />
          </datalist>
          <label className={kelasLabel}>
            Batas minimum stok
            <input
              name="min_stok"
              type="number"
              step="0.001"
              min="0"
              defaultValue={bahan ? String(bahan.min_stok) : "0"}
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
          {bahan ? (
            <button
              type="button"
              onClick={gantiAktif}
              disabled={sibuk}
              className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)]"
            >
              {bahan.aktif ? "Nonaktifkan bahan" : "Aktifkan lagi"}
            </button>
          ) : null}
        </form>
      </Lembar>
    </>
  );
}
