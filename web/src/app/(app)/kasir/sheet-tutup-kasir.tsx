"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatRupiah } from "@/lib/format";
import { tutupKasir } from "./actions";

// Form terpisah dari SheetTutupKasir supaya state (fisik/catatan/pesan) hidup
// dan mati bersama mount-nya — SheetTutupKasir sendiri selalu ter-mount
// (dirender tanpa syarat oleh LayarKasir), jadi kalau state ini ada di sana,
// nilai lama akan terbawa lagi saat lembar dibuka ulang setelah dibatalkan.
function FormTutupKasir({
  tunaiSistem,
  onSelesai,
}: {
  tunaiSistem: number;
  onSelesai: () => void;
}) {
  const [fisik, setFisik] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  const angka = Number(fisik);
  const valid = fisik !== "" && Number.isFinite(angka) && angka >= 0;
  const selisih = valid ? angka - tunaiSistem : null;

  async function simpan() {
    if (!valid) return;
    setSibuk(true);
    const hasil = await tutupKasir(Math.round(angka), catatan.trim());
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
        <span className="text-sm text-[var(--pudar)]">
          Tunai menurut sistem
        </span>
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
        Catatan (opsional)
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
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
        {sibuk ? "Menyimpan…" : "Simpan tutup kasir"}
      </button>
    </>
  );
}

export function SheetTutupKasir({
  tunaiSistem,
  sudahDitutup,
}: {
  tunaiSistem: number;
  sudahDitutup: { tunai_fisik: number; selisih: number } | null;
}) {
  const [buka, setBuka] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg border border-[var(--garis-kuat)] px-3 py-2 text-sm font-semibold text-[var(--hijau-tua)] hover:bg-[var(--enamel)]"
      >
        Tutup kasir
      </button>
      <Lembar buka={buka} judul="Tutup kasir" onTutup={() => setBuka(false)}>
        {sudahDitutup ? (
          <div className="text-sm">
            <p className="rounded-lg border border-[var(--garis)] bg-white px-3 py-3">
              Kasir hari ini sudah ditutup. Tunai fisik{" "}
              <b className="uang">{formatRupiah(sudahDitutup.tunai_fisik)}</b>,
              selisih{" "}
              <b className="uang">{formatRupiah(sudahDitutup.selisih)}</b>.
            </p>
          </div>
        ) : buka ? (
          <FormTutupKasir
            tunaiSistem={tunaiSistem}
            onSelesai={() => setBuka(false)}
          />
        ) : null}
      </Lembar>
    </>
  );
}
