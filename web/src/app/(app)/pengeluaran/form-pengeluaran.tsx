"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { catatPengeluaran, tambahKategori } from "./actions";
import type { Kategori } from "./jenis";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormPengeluaran({
  kategori,
  hariIni,
}: {
  kategori: Kategori[];
  hariIni: string;
}) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [kategoriBaru, setKategoriBaru] = useState("");

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await catatPengeluaran(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  async function simpanKategori() {
    setSibuk(true);
    const hasil = await tambahKategori(kategoriBaru);
    setSibuk(false);
    if (hasil.ok) {
      setKategoriBaru("");
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
        + Catat pengeluaran
      </button>
      {buka ? (
        <Lembar buka judul="Catat pengeluaran" onTutup={() => setBuka(false)}>
          <form onSubmit={kirim}>
            <label className={kelasLabel}>
              Tanggal
              <input
                name="tanggal"
                type="date"
                required
                defaultValue={hariIni}
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Kategori
              <select name="category_id" required className={kelasInput}>
                <option value="">— pilih —</option>
                {kategori.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className={kelasLabel}>
              Nominal (Rp)
              <input
                name="nominal"
                type="number"
                step="1"
                min="1"
                required
                inputMode="numeric"
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Catatan (opsional)
              <input name="catatan" maxLength={200} className={kelasInput} />
            </label>
            {pesan ? (
              <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
                {pesan}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sibuk}
              className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] disabled:opacity-50"
            >
              {sibuk ? "Menyimpan…" : "Simpan"}
            </button>
          </form>

          <div className="mt-4 border-t border-[var(--garis)] pt-3">
            <p className="text-xs font-semibold text-[var(--pudar)]">
              Kategori baru
            </p>
            <div className="mt-1 flex gap-2">
              <input
                value={kategoriBaru}
                onChange={(e) => setKategoriBaru(e.target.value)}
                placeholder="mis. Perbaikan alat"
                className="flex-1 rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={simpanKategori}
                disabled={sibuk || !kategoriBaru.trim()}
                className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Tambah
              </button>
            </div>
          </div>
        </Lembar>
      ) : null}
    </>
  );
}
