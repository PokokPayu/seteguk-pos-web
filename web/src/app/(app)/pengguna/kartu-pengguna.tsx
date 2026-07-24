"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { LABEL_IZIN, SEMUA_IZIN } from "@/lib/permissions";
import { setAktifPengguna, simpanIzin } from "./actions";
import type { PenggunaBaris } from "./jenis";

export function KartuPengguna({ pengguna }: { pengguna: PenggunaBaris }) {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const semua = pengguna.izin.length === SEMUA_IZIN.length;

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dipilih = new FormData(e.currentTarget).getAll("izin").map(String);
    setSibuk(true);
    const hasil = await simpanIzin(pengguna.id, dipilih);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  async function gantiAktif() {
    setSibuk(true);
    const hasil = await setAktifPengguna(pengguna.id, !pengguna.aktif);
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <div
      className={`rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 ${
        pengguna.aktif ? "" : "opacity-60"
      }`}
    >
      <p className="font-bold text-[var(--hijau-tua)]">
        {pengguna.nama}
        {pengguna.aktif ? "" : " (nonaktif)"}
      </p>
      <p className="text-xs text-[var(--pudar)]">{pengguna.email}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {semua ? (
          <span className="rounded bg-[var(--hijau)] px-1.5 py-0.5 text-[11px] font-bold text-[#F6F3E6]">
            Semua akses
          </span>
        ) : (
          pengguna.izin.map((i) => (
            <span
              key={i}
              className="rounded bg-[var(--kertas)] px-1.5 py-0.5 text-[11px] text-[var(--pudar)]"
            >
              {LABEL_IZIN[i as keyof typeof LABEL_IZIN] ?? i}
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="mt-3 text-sm font-semibold text-[var(--hijau)] underline"
      >
        Atur akses
      </button>

      {buka ? (
        <Lembar buka judul={`Akses ${pengguna.nama}`} onTutup={() => setBuka(false)}>
          <form onSubmit={simpan}>
            <div className="space-y-1.5">
              {SEMUA_IZIN.map((i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="izin"
                    value={i}
                    defaultChecked={pengguna.izin.includes(i)}
                    className="mt-0.5"
                  />
                  <span>{LABEL_IZIN[i]}</span>
                </label>
              ))}
            </div>
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
              {sibuk ? "Menyimpan…" : "Simpan akses"}
            </button>
          </form>
          <button
            type="button"
            onClick={gantiAktif}
            disabled={sibuk}
            className="mt-2 w-full rounded-lg border border-[var(--garis-kuat)] px-4 py-2.5 text-sm font-semibold text-[var(--pudar)] disabled:opacity-50"
          >
            {pengguna.aktif ? "Nonaktifkan pengguna" : "Aktifkan lagi"}
          </button>
        </Lembar>
      ) : null}
    </div>
  );
}
