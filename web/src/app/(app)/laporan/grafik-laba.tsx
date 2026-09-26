"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { judulGrafik, seriGrafik, type BarisHarian } from "@/lib/laporan";

export function GrafikLaba({ baris }: { baris: BarisHarian[] }) {
  const [tabel, setTabel] = useState(false);
  const { satuan, titik: data } = seriGrafik(baris);
  const rapat = data.length > 7;
  // Batang tipis butuh jarak tipis juga; 30 × 6px sudah memakan separuh layar HP.
  const jarak = data.length > 16 ? "gap-px" : rapat ? "gap-1" : "gap-1.5";
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
        <h2 className="display text-lg">
          {judulGrafik(satuan)}
        </h2>
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
              <th className="py-1">
                {satuan === "hari" ? "Tanggal" : satuan === "minggu" ? "Minggu" : "Bulan"}
              </th>
              <th className="py-1 text-right">Laba bersih</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.kunci} className="border-t border-[var(--garis)]">
                <td className="py-1">{d.labelPanjang}</td>
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
            className="relative mt-3"
            style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
          >
            {/* garis grid tengah area positif */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 h-px bg-[var(--garis)]"
              style={{ top: `${TINGGI_POS / 2}px` }}
            />
            <div className={`flex h-full items-end ${jarak}`}>
              {data.map((d, i) => {
                const positif = d.laba >= 0;
                const kini = i === data.length - 1;
                const tinggi = Math.round(
                  (Math.abs(d.laba) / maxAbs) *
                    (positif ? TINGGI_POS - 8 : TINGGI_NEG - 4)
                );
                return (
                  <div
                    key={d.kunci}
                    className="group relative flex min-w-0 flex-1 flex-col"
                    style={{ height: `${TINGGI_POS + TINGGI_NEG}px` }}
                  >
                    {/* setengah atas: batang positif menempel garis nol */}
                    <div
                      className="flex items-end justify-center"
                      style={{ height: `${TINGGI_POS}px` }}
                    >
                      {positif ? (
                        <span
                          className={`w-full rounded-t ${
                            kini ? "bg-[var(--hijau)]" : "bg-[var(--hijau-daun)]"
                          }`}
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
                      aria-label={`${d.labelPanjang}: laba ${formatRupiah(d.laba)}`}
                      className="absolute inset-0 cursor-default"
                    />
                    {kini ? (
                      // Batang terakhir yang tipis: rata kanan supaya nominal
                      // tidak meluber keluar kartu.
                      <span
                        className={`uang pointer-events-none absolute whitespace-nowrap text-[10px] font-bold text-[var(--hijau-tua)] ${
                          rapat ? "right-0" : "left-1/2 -translate-x-1/2"
                        }`}
                        style={
                          positif
                            ? { bottom: `${TINGGI_NEG + tinggi + 4}px` }
                            : { top: `${TINGGI_POS + tinggi + 4}px` }
                        }
                      >
                        {formatRupiah(d.laba)}
                      </span>
                    ) : (
                      <span
                        className={`pointer-events-none absolute -top-1 z-10 hidden whitespace-nowrap rounded bg-[var(--tinta)] px-1.5 py-0.5 text-[11px] text-[#F6F3E6] group-hover:block group-focus-within:block ${
                          // Tooltip di separuh kanan membuka ke kiri, supaya
                          // tidak terpotong tepi kartu saat batangnya tipis.
                          !rapat
                            ? "left-1/2 -translate-x-1/2"
                            : i < data.length / 2
                              ? "left-0"
                              : "right-0"
                        }`}
                      >
                        {rapat ? `${d.labelPanjang} · ` : ""}
                        {formatRupiah(d.laba)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Label dijarangkan tapi tetap satu slot per batang, jadi posisinya
              selalu lurus dengan batangnya; label boleh meluber ke slot
              tetangga yang kosong. */}
          <div
            aria-hidden="true"
            className={`mt-1 flex text-center text-[11px] text-[var(--pudar)] ${jarak}`}
          >
            {data.map((d, i) => (
              <span
                key={d.kunci}
                className={`flex min-w-0 flex-1 justify-center whitespace-nowrap ${
                  i === data.length - 1
                    ? "font-bold text-[var(--hijau-tua)]"
                    : ""
                }`}
              >
                {d.tampilLabel ? d.label : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
