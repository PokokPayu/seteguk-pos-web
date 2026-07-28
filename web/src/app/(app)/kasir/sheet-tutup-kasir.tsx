"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { FormTutupKasir } from "@/components/form-tutup-kasir";
import { formatRupiah } from "@/lib/format";
import { tutupKasir } from "./actions";

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
            labelTombol="Simpan tutup kasir"
            perluAlasan={false}
            onSimpan={(tunaiFisik, catatan) =>
              tutupKasir(Math.round(tunaiFisik), catatan)
            }
            onSelesai={() => setBuka(false)}
          />
        ) : null}
      </Lembar>
    </>
  );
}
