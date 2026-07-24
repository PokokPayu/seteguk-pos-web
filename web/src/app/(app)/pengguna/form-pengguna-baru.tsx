"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { LABEL_IZIN, SEMUA_IZIN } from "@/lib/permissions";
import { buatPengguna } from "./actions";

const kelasInput =
  "mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]";
const kelasLabel = "mt-3 block text-sm font-semibold text-[var(--pudar)]";

export function FormPenggunaBaru() {
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSibuk(true);
    const hasil = await buatPengguna(new FormData(e.currentTarget));
    setSibuk(false);
    if (hasil.ok) setBuka(false);
    else setPesan(hasil.pesan);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="rounded-lg bg-[var(--hijau)] px-3 py-2 text-sm font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
      >
        + Pengguna baru
      </button>
      {buka ? (
        <Lembar buka judul="Pengguna baru" onTutup={() => setBuka(false)}>
          <form onSubmit={kirim}>
            <label className={kelasLabel}>
              Nama
              <input name="nama" required className={kelasInput} />
            </label>
            <label className={kelasLabel}>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                className={kelasInput}
              />
            </label>
            <label className={kelasLabel}>
              Password (minimal 8 karakter)
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                className={kelasInput}
              />
            </label>
            <p className="mt-3 text-sm font-semibold text-[var(--pudar)]">
              Hak akses
            </p>
            <div className="mt-1 space-y-1.5">
              {SEMUA_IZIN.map((i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                >
                  <input type="checkbox" name="izin" value={i} className="mt-0.5" />
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
              {sibuk ? "Membuat…" : "Buat akun"}
            </button>
          </form>
        </Lembar>
      ) : null}
    </>
  );
}
