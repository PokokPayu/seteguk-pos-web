"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { labelHari, type BarisHarian } from "@/lib/laporan";

export function GrafikLaba({ baris }: { baris: BarisHarian[] }) {
  const [tabel, setTabel] = useState(false);
  const data = baris.slice(-7);
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.laba)), 1);
  const TINGGI_POS = 96;
  const TINGGI_NEG = 40;

  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--pudar)]">Belum ada data untuk grafik.</p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-lg">Laba bersih 7 hari terakhir</h2>
        <button
          type="button"
          onClick={() => setTabel((t) => !t)}
          className="text-sm font-semibold text-[var(--hijau)] underline"
        >
          {tabel ? "Lihat grafik" : "Lihat tabel angka"}
        </button>
      </div>

      {tabel ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--pudar)]">
              <th className="py-1">Tanggal</th>
              <th className="py-1 text-right">Laba bersih</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.tanggal} className="border-t border-[var(--garis)]">
                <td className="py-1">
                  {labelHari(d.tanggal)}, {d.tanggal}
                </td>
                <td
                  className={`uang py-1 text-right ${
                    d.laba < 0 ? "text-[var(--merah)]" : ""
                  }`}
                >
                  {formatRupiah(d.laba)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div
            className="mt-3 flex items-end gap-1.5"
            style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
          >
            {data.map((d) => {
              const positif = d.laba >= 0;
              const tinggi = Math.round(
                (Math.abs(d.laba) / maxAbs) *
                  (positif ? TINGGI_POS - 8 : TINGGI_NEG - 4)
              );
              return (
                <div
                  key={d.tanggal}
                  className="group relative flex flex-1 flex-col"
                  style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
                >
                  {/* setengah atas: batang positif menempel garis nol */}
                  <div
                    className="flex items-end justify-center"
                    style={{ height: `${TINGGI_POS}px` }}
                  >
                    {positif ? (
                      <span
                        className="w-full rounded-t bg-[var(--hijau-daun)]"
                        style={{ height: `${tinggi}px` }}
                      />
                    ) : null}
                  </div>
                  {/* garis nol */}
                  <span className="block h-px w-full bg-[var(--garis-kuat)]" />
                  {/* setengah bawah: batang negatif */}
                  <div
                    className="flex items-start justify-center"
                    style={{ height: `${TINGGI_NEG}px` }}
                  >
                    {!positif ? (
                      <span
                        className="w-full rounded-b bg-[var(--merah)]"
                        style={{ height: `${tinggi}px` }}
                      />
                    ) : null}
                  </div>
                  {/* target hover/fokus + label aksesibilitas */}
                  <button
                    type="button"
                    aria-label={`${labelHari(d.tanggal)} ${d.tanggal}: laba ${formatRupiah(d.laba)}`}
                    className="absolute inset-0 cursor-default"
                  />
                  <span className="pointer-events-none absolute -top-1 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--tinta)] px-1.5 py-0.5 text-[11px] text-[#F6F3E6] group-hover:block group-focus-within:block">
                    {formatRupiah(d.laba)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 text-center text-[11px] text-[var(--pudar)]">
            {data.map((d) => (
              <span key={d.tanggal} className="flex-1">
                {labelHari(d.tanggal)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
