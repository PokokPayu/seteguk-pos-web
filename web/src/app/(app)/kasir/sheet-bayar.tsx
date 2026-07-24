"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatRupiah } from "@/lib/format";
import { hitungKembalian } from "@/lib/kasir";

const NOMINAL_CEPAT = [20000, 50000, 100000];

export function SheetBayar({
  buka,
  total,
  sibuk,
  pesan,
  onTutup,
  onBayar,
}: {
  buka: boolean;
  total: number;
  sibuk: boolean;
  pesan: string;
  onTutup: () => void;
  onBayar: (metode: "tunai" | "qris", uangDiterima: number | null) => void;
}) {
  const [metode, setMetode] = useState<"tunai" | "qris">("tunai");
  const [diterima, setDiterima] = useState("");

  const angka = Number(diterima);
  const valid = Number.isInteger(angka) && angka >= 0;
  const kembalian = valid ? hitungKembalian(total, angka) : 0;
  const kurang = metode === "tunai" && (!valid || angka < total);

  return (
    <Lembar buka={buka} judul="Pembayaran" onTutup={onTutup}>
      <div className="flex items-center justify-between border-b border-[var(--garis)] pb-3">
        <span className="text-sm text-[var(--pudar)]">Total</span>
        <b className="uang text-xl">{formatRupiah(total)}</b>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["tunai", "qris"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetode(m)}
            className={`rounded-lg border px-3 py-2.5 font-bold ${
              metode === m
                ? "border-[var(--hijau)] bg-[var(--hijau)] text-[#F6F3E6]"
                : "border-[var(--garis-kuat)] bg-white text-[var(--hijau-tua)]"
            }`}
          >
            {m === "tunai" ? "Tunai" : "QRIS"}
          </button>
        ))}
      </div>

      {metode === "tunai" ? (
        <>
          <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
            Uang diterima
            <input
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              value={diterima}
              onChange={(e) => setDiterima(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDiterima(String(total))}
              className="rounded-lg border border-[var(--garis-kuat)] px-3 py-1.5 text-sm font-semibold"
            >
              Uang pas
            </button>
            {NOMINAL_CEPAT.filter((n) => n >= total).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDiterima(String(n))}
                className="rounded-lg border border-[var(--garis-kuat)] px-3 py-1.5 text-sm font-semibold"
              >
                {formatRupiah(n)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[var(--garis)] pt-3">
            <span className="text-sm text-[var(--pudar)]">Kembalian</span>
            <b className={`uang ${kurang ? "text-[var(--merah)]" : ""}`}>
              {valid ? formatRupiah(kembalian) : "—"}
            </b>
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-[var(--garis)] bg-white px-3 py-3 text-sm text-[var(--pudar)]">
          Pembayaran QRIS dicatat manual — pastikan pembayaran pelanggan sudah
          masuk sebelum menyelesaikan.
        </p>
      )}

      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}

      <button
        type="button"
        disabled={sibuk || kurang}
        onClick={() => onBayar(metode, metode === "tunai" ? angka : null)}
        className="mt-4 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-50"
      >
        {sibuk ? "Menyimpan…" : "Selesai"}
      </button>
    </Lembar>
  );
}
