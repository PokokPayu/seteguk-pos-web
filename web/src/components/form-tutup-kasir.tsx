"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { alasanValid, nominalValid } from "@/lib/tutup-kasir";
import type { HasilAksi } from "@/lib/aksi";

// State (fisik/teks/pesan) sengaja hidup dan mati bersama mount komponen ini.
// Pemanggil WAJIB merender FormTutupKasir hanya saat lembarnya terbuka; kalau
// dirender tanpa syarat, nilai lama akan terbawa lagi saat lembar dibuka ulang
// setelah dibatalkan.
export function FormTutupKasir({
  tunaiSistem,
  nilaiAwal,
  labelTombol,
  perluAlasan,
  onSimpan,
  onSelesai,
}: {
  tunaiSistem: number;
  nilaiAwal?: number;
  labelTombol: string;
  perluAlasan: boolean;
  onSimpan: (tunaiFisik: number, teks: string) => Promise<HasilAksi>;
  onSelesai: () => void;
}) {
  const [fisik, setFisik] = useState(
    nilaiAwal === undefined ? "" : String(nilaiAwal)
  );
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  const angka = Number(fisik);
  const angkaOk = fisik !== "" && nominalValid(angka);
  const teksOk = !perluAlasan || alasanValid(teks);
  const valid = angkaOk && teksOk;
  const selisih = angkaOk ? angka - tunaiSistem : null;

  async function simpan() {
    if (!valid) return;
    setSibuk(true);
    const hasil = await onSimpan(angka, teks.trim());
    setSibuk(false);
    if (hasil.ok) {
      onSelesai();
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--garis)] pb-3">
        <span className="text-sm text-[var(--pudar)]">Tunai menurut sistem</span>
        <b className="uang">{formatRupiah(tunaiSistem)}</b>
      </div>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        Tunai fisik di laci
        <input
          type="number"
          step="1"
          min="0"
          inputMode="numeric"
          value={fisik}
          onChange={(e) => setFisik(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        {perluAlasan ? "Alasan (wajib)" : "Catatan (opsional)"}
        <input
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--garis)] pt-3">
        <span className="text-sm text-[var(--pudar)]">Selisih</span>
        <b
          className={`uang ${
            selisih !== null && selisih < 0 ? "text-[var(--merah)]" : ""
          }`}
        >
          {selisih === null ? "—" : formatRupiah(selisih)}
        </b>
      </div>
      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}
      <button
        type="button"
        disabled={sibuk || !valid}
        onClick={simpan}
        className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] active:scale-[.99] hover:bg-[var(--hijau-tua)] disabled:opacity-50"
      >
        {sibuk ? "Menyimpan…" : labelTombol}
      </button>
    </>
  );
}
