"use client";

import { useState } from "react";
import { Lembar } from "@/components/lembar";
import { FormTutupKasir } from "@/components/form-tutup-kasir";
import { useToast } from "@/components/toast";
import { formatRupiah } from "@/lib/format";
import {
  formatTanggalPendek,
  kalimatRiwayat,
  type BarisLog,
  type BarisTutup,
} from "@/lib/tutup-kasir";
import { bukaKasir, tutupKasirTanggal, ubahTutupKasir } from "./actions";

type Aksi =
  | { jenis: "ubah"; baris: BarisTutup }
  | { jenis: "buka"; baris: BarisTutup }
  | { jenis: "tutup"; tanggal: string; tunaiSistem: number };

function Riwayat({ log }: { log: BarisLog[] }) {
  if (log.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[var(--garis)] pt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--pudar)]">
        Riwayat
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-[var(--pudar)]">
        {log.map((b, i) => (
          <li key={i}>{kalimatRiwayat(b)}</li>
        ))}
      </ul>
    </div>
  );
}

function LembarBuka({
  baris,
  onTutup,
}: {
  baris: BarisTutup;
  onTutup: () => void;
}) {
  const toast = useToast();
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function jalankan() {
    setSibuk(true);
    const hasil = await bukaKasir(baris.tanggal, alasan.trim());
    setSibuk(false);
    if (hasil.ok) {
      toast(`Kasir ${formatTanggalPendek(baris.tanggal)} dibuka kembali`);
      onTutup();
    } else {
      setPesan(hasil.pesan);
    }
  }

  return (
    <>
      <p className="rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2.5 text-sm text-[var(--merah)]">
        Setelah dibuka, transaksi tanggal ini bisa dibatalkan (void) lagi dan
        selisih hari itu hilang dari laporan sampai ditutup ulang.
      </p>
      <label className="mt-3 block text-sm font-semibold text-[var(--pudar)]">
        Alasan (wajib)
        <input
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--garis-kuat)] bg-white px-3 py-2 text-[var(--tinta)]"
        />
      </label>
      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}
      <button
        type="button"
        disabled={sibuk || alasan.trim().length < 3}
        onClick={jalankan}
        className="mt-4 w-full rounded-lg bg-[var(--merah)] px-4 py-3 font-bold text-[#F6F3E6] active:scale-[.99] disabled:opacity-50"
      >
        {sibuk ? "Membuka…" : "Buka kembali"}
      </button>
    </>
  );
}

export function SectionTutupKasir({
  baris,
  kosong,
  log,
  bolehKoreksi,
}: {
  baris: BarisTutup[];
  kosong: { tanggal: string; tunaiSistem: number }[];
  log: BarisLog[];
  bolehKoreksi: boolean;
}) {
  const toast = useToast();
  const [aksi, setAksi] = useState<Aksi | null>(null);

  const tanggalAksi =
    aksi === null
      ? null
      : aksi.jenis === "tutup"
        ? aksi.tanggal
        : aksi.baris.tanggal;
  const logAksi =
    tanggalAksi === null ? [] : log.filter((l) => l.tanggal === tanggalAksi);

  return (
    <section className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
      <h2 className="display text-lg">Tutup kasir</h2>
      <table className="mt-2 w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-[var(--pudar)]">
            <th className="py-1">Tanggal</th>
            <th className="py-1 text-right">Sistem</th>
            <th className="py-1 text-right">Fisik</th>
            <th className="py-1 text-right">Selisih</th>
            <th className="py-1">Oleh</th>
            {bolehKoreksi ? <th className="py-1" /> : null}
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.tanggal} className="border-t border-[var(--garis)]">
              <td className="py-1.5">{formatTanggalPendek(b.tanggal)}</td>
              <td className="uang py-1.5 text-right">
                {formatRupiah(b.tunai_sistem)}
              </td>
              <td className="uang py-1.5 text-right">
                {formatRupiah(b.tunai_fisik)}
              </td>
              <td
                className={`uang py-1.5 text-right font-bold ${
                  b.selisih < 0 ? "text-[var(--merah)]" : ""
                }`}
              >
                {formatRupiah(b.selisih)}
              </td>
              <td className="py-1.5 text-[var(--pudar)]">{b.oleh}</td>
              {bolehKoreksi ? (
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setAksi({ jenis: "ubah", baris: b })}
                    className="text-sm font-semibold text-[var(--hijau)] underline"
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => setAksi({ jenis: "buka", baris: b })}
                    className="ml-3 text-sm font-semibold text-[var(--merah)] underline"
                  >
                    Buka kembali
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {kosong.map((k) => (
            <tr key={k.tanggal} className="border-t border-[var(--garis)]">
              <td className="py-1.5">{formatTanggalPendek(k.tanggal)}</td>
              <td className="uang py-1.5 text-right">
                {formatRupiah(k.tunaiSistem)}
              </td>
              <td colSpan={3} className="py-1.5 text-[var(--pudar)]">
                Belum ditutup
              </td>
              {bolehKoreksi ? (
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() =>
                      setAksi({
                        jenis: "tutup",
                        tanggal: k.tanggal,
                        tunaiSistem: k.tunaiSistem,
                      })
                    }
                    className="text-sm font-semibold text-[var(--hijau)] underline"
                  >
                    Tutup kasir
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {baris.length === 0 && kosong.length === 0 ? (
            <tr>
              <td
                colSpan={bolehKoreksi ? 6 : 5}
                className="py-2 text-[var(--pudar)]"
              >
                Belum ada penutupan kasir pada rentang ini.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <Lembar
        buka={aksi !== null}
        judul={
          aksi === null
            ? ""
            : aksi.jenis === "ubah"
              ? `Ubah nominal ${formatTanggalPendek(aksi.baris.tanggal)}`
              : aksi.jenis === "buka"
                ? `Buka kembali ${formatTanggalPendek(aksi.baris.tanggal)}`
                : `Tutup kasir ${formatTanggalPendek(aksi.tanggal)}`
        }
        onTutup={() => setAksi(null)}
      >
        {aksi === null ? null : aksi.jenis === "ubah" ? (
          <FormTutupKasir
            tunaiSistem={aksi.baris.tunai_sistem}
            nilaiAwal={aksi.baris.tunai_fisik}
            labelTombol="Simpan perubahan"
            perluAlasan
            onSimpan={async (tunaiFisik, alasan) => {
              const hasil = await ubahTutupKasir(
                aksi.baris.tanggal,
                Math.round(tunaiFisik),
                alasan
              );
              if (hasil.ok) toast("Nominal tutup kasir diperbarui");
              return hasil;
            }}
            onSelesai={() => setAksi(null)}
          />
        ) : aksi.jenis === "buka" ? (
          <LembarBuka baris={aksi.baris} onTutup={() => setAksi(null)} />
        ) : (
          <FormTutupKasir
            tunaiSistem={aksi.tunaiSistem}
            labelTombol="Simpan tutup kasir"
            perluAlasan
            onSimpan={async (tunaiFisik, alasan) => {
              const hasil = await tutupKasirTanggal(
                aksi.tanggal,
                Math.round(tunaiFisik),
                alasan
              );
              if (hasil.ok) toast("Kasir ditutup");
              return hasil;
            }}
            onSelesai={() => setAksi(null)}
          />
        )}
        {aksi === null ? null : <Riwayat log={logAksi} />}
      </Lembar>
    </section>
  );
}
