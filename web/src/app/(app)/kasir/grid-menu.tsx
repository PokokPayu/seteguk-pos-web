"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { formatRupiah } from "@/lib/format";
import { terbangKeKeranjang } from "./terbang";
import type { ProdukKasir } from "./jenis";

export function GridMenu({
  produk,
  varianDefault,
  onTambah,
  onPilihVarian,
}: {
  produk: ProdukKasir[];
  varianDefault: Record<string, string>;
  onTambah: (produkId: string, variantId: string) => void;
  onPilihVarian: (produkId: string, variantId: string) => void;
}) {
  const [kategori, setKategori] = useState("Semua");
  const [pilihUntuk, setPilihUntuk] = useState<ProdukKasir | null>(null);

  const daftarKategori = ["Semua", ...new Set(produk.map((p) => p.kategori))];
  const tampil =
    kategori === "Semua" ? produk : produk.filter((p) => p.kategori === kategori);

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {daftarKategori.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKategori(k)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${
              k === kategori
                ? "border-[var(--hijau)] bg-[var(--hijau)] text-[#F6F3E6]"
                : "border-[var(--garis-kuat)] bg-[var(--enamel)] text-[var(--pudar)]"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {tampil.map((p) => {
          const aktifId = varianDefault[p.id] ?? p.varian[0]?.id;
          const v = p.varian.find((x) => x.id === aktifId) ?? p.varian[0];
          if (!v) return null;
          return (
            <div
              key={p.id}
              className="relative flex flex-col rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3 text-left transition-colors hover:border-[var(--hijau)]"
            >
              <button
                type="button"
                onClick={(e) => {
                  terbangKeKeranjang(e.currentTarget);
                  onTambah(p.id, v.id);
                }}
                className="flex flex-1 flex-col items-start text-left transition-transform active:scale-[.98]"
              >
                <span className="text-[11px] uppercase tracking-wide text-[var(--pudar)]">
                  {p.kategori}
                  {p.terjualHariIni > 0 ? ` · ${p.terjualHariIni}× hari ini` : ""}
                </span>
                <span className="mt-0.5 font-bold">{p.nama}</span>
                <span className="uang mt-auto pt-2 font-bold text-[var(--hijau-tua)]">
                  {formatRupiah(v.harga)}
                </span>
              </button>
              {p.varian.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setPilihUntuk(p)}
                  aria-label={`Pilih varian ${p.nama}`}
                  className="mt-2 self-start rounded-full border border-[var(--garis-kuat)] bg-white px-3 py-1 text-xs font-semibold text-[var(--hijau-tua)] transition-colors hover:border-[var(--hijau)]"
                >
                  {v.nama} ▾
                </button>
              ) : null}
            </div>
          );
        })}
        {tampil.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
            Belum ada menu aktif. Tambahkan lewat halaman Menu.
          </p>
        ) : null}
      </div>

      <Lembar
        buka={pilihUntuk !== null}
        judul={pilihUntuk ? `Pilih varian ${pilihUntuk.nama}` : ""}
        onTutup={() => setPilihUntuk(null)}
      >
        <div className="space-y-2">
          {pilihUntuk?.varian.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onPilihVarian(pilihUntuk.id, v.id);
                onTambah(pilihUntuk.id, v.id);
                setPilihUntuk(null);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2.5 text-sm font-semibold"
            >
              <span>{v.nama}</span>
              <span className="uang">{formatRupiah(v.harga)}</span>
            </button>
          ))}
        </div>
      </Lembar>
    </div>
  );
}
