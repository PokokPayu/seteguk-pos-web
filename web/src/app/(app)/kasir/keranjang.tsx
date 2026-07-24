"use client";

import { formatRupiah } from "@/lib/format";
import { totalKeranjang } from "@/lib/kasir";
import type { BarisKeranjang } from "./jenis";

export function Keranjang({
  isi,
  onUbahQty,
  onBayar,
}: {
  isi: BarisKeranjang[];
  onUbahQty: (variantId: string, delta: number) => void;
  onBayar: () => void;
}) {
  const total = totalKeranjang(isi);
  const jumlah = isi.reduce((s, b) => s + b.qty, 0);

  return (
    <div className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-lg">Pesanan</h2>
        <span className="text-sm text-[var(--pudar)]">
          {jumlah > 0 ? `${jumlah} item` : ""}
        </span>
      </div>

      {isi.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--garis-kuat)] p-4 text-center text-sm text-[var(--pudar)]">
          Belum ada pesanan.
          <br />
          Ketuk menu untuk menambah.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--garis)]">
          {isi.map((b) => (
            <li key={b.variantId} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{b.produkNama}</span>
                <br />
                <span className="text-xs text-[var(--pudar)]">
                  {b.varianNama} · {formatRupiah(b.harga)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUbahQty(b.variantId, -1)}
                  aria-label={`Kurangi ${b.produkNama}`}
                  className="h-8 w-8 rounded-lg border border-[var(--garis-kuat)] font-bold"
                >
                  −
                </button>
                <span className="uang w-6 text-center font-bold">{b.qty}</span>
                <button
                  type="button"
                  onClick={() => onUbahQty(b.variantId, 1)}
                  aria-label={`Tambah ${b.produkNama}`}
                  className="h-8 w-8 rounded-lg border border-[var(--garis-kuat)] font-bold"
                >
                  +
                </button>
              </span>
              <span className="uang w-20 text-right text-sm font-bold">
                {formatRupiah(b.qty * b.harga)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--garis)] pt-3">
        <span className="font-semibold text-[var(--pudar)]">Total</span>
        <b className="uang text-xl">{formatRupiah(total)}</b>
      </div>
      <button
        type="button"
        disabled={isi.length === 0}
        onClick={onBayar}
        className="mt-3 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)] disabled:opacity-50"
      >
        Bayar
      </button>
    </div>
  );
}
