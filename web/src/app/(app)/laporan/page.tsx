import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { tanggalJakarta } from "@/lib/kasir";
import {
  kelompokBulanan,
  rataPerTransaksi,
  ringkasRentang,
  type BarisHarian,
} from "@/lib/laporan";
import { bolehAkses } from "@/lib/permissions";
import type { BarisLog, BarisTutup } from "@/lib/tutup-kasir";
import { GrafikLaba } from "./grafik-laba";
import { PilihRentang } from "./pilih-rentang";
import { SectionTutupKasir } from "./section-tutup-kasir";

const TGL = /^\d{4}-\d{2}-\d{2}$/;

export default async function HalamanLaporan({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string }>;
}) {
  const pengguna = await wajibIzin("laporan");
  const sp = await searchParams;
  const hariIni = tanggalJakarta(new Date());
  const dari = TGL.test(sp.dari ?? "") ? (sp.dari as string) : hariIni;
  const sampaiMentah = TGL.test(sp.sampai ?? "")
    ? (sp.sampai as string)
    : hariIni;
  const sampai = sampaiMentah < dari ? dari : sampaiMentah;

  const supabase = await buatClientServer();
  const [harianRes, terlarisRes, tutupRes, logRes] = await Promise.all([
    supabase.rpc("laporan_harian", { p_dari: dari, p_sampai: sampai }),
    supabase.rpc("terlaris", { p_dari: dari, p_sampai: sampai, p_limit: 5 }),
    supabase.rpc("daftar_tutup_kasir", { p_dari: dari, p_sampai: sampai }),
    supabase.rpc("riwayat_tutup_kasir", { p_dari: dari, p_sampai: sampai }),
  ]);
  if (harianRes.error) {
    throw new Error(`Gagal memuat laporan: ${harianRes.error.message}`);
  }
  if (terlarisRes.error) {
    throw new Error(`Gagal memuat terlaris: ${terlarisRes.error.message}`);
  }
  if (tutupRes.error) {
    throw new Error(`Gagal memuat tutup kasir: ${tutupRes.error.message}`);
  }
  if (logRes.error) {
    throw new Error(`Gagal memuat riwayat kasir: ${logRes.error.message}`);
  }

  const harian: BarisHarian[] = (
    (harianRes.data ?? []) as Record<string, unknown>[]
  ).map((b) => ({
    tanggal: String(b.tanggal),
    omzet: Number(b.omzet),
    hpp: Number(b.hpp),
    pengeluaran: Number(b.pengeluaran),
    laba: Number(b.laba),
    transaksi: Number(b.transaksi),
    tunai: Number(b.tunai),
    qris: Number(b.qris),
    selisih_kasir: b.selisih_kasir === null ? null : Number(b.selisih_kasir),
  }));
  const terlaris = ((terlarisRes.data ?? []) as Record<string, unknown>[]).map(
    (t) => ({ nama: String(t.nama), terjual: Number(t.terjual) })
  );
  const tutup = ((tutupRes.data ?? []) as Record<string, unknown>[]).map(
    (b) => ({
      tanggal: String(b.tanggal),
      tunai_sistem: Number(b.tunai_sistem),
      tunai_sistem_kini: Number(b.tunai_sistem_kini),
      tunai_fisik: Number(b.tunai_fisik),
      selisih: Number(b.selisih),
      catatan: String(b.catatan ?? ""),
      oleh: String(b.oleh ?? "Pengguna"),
    })
  ) as BarisTutup[];
  const log = ((logRes.data ?? []) as Record<string, unknown>[]).map((b) => ({
    tanggal: String(b.tanggal),
    aksi: String(b.aksi) as BarisLog["aksi"],
    tunai_fisik_lama:
      b.tunai_fisik_lama === null ? null : Number(b.tunai_fisik_lama),
    tunai_fisik_baru:
      b.tunai_fisik_baru === null ? null : Number(b.tunai_fisik_baru),
    alasan: String(b.alasan),
    oleh: String(b.oleh ?? "Pengguna"),
    created_at: String(b.created_at),
  })) as BarisLog[];

  // Tanggal dalam rentang yang belum punya penutupan. laporan_harian sudah
  // memuat satu baris per hari beserta total tunainya, jadi tidak perlu query
  // tambahan — kolom `tunai` memakai definisi yang sama dengan
  // tunai_sistem_tanggal di RPC (penjualan tunai berstatus selesai hari itu).
  const sudah = new Set(tutup.map((t) => t.tanggal));
  const kosong = harian
    .filter((h) => !sudah.has(h.tanggal) && h.tanggal <= hariIni)
    .map((h) => ({ tanggal: h.tanggal, tunaiSistem: h.tunai }))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const r = ringkasRentang(harian);
  const selisih = harian.reduce(
    (s, b) => s + (b.selisih_kasir ?? 0),
    0
  );
  const satuHari = dari === sampai;
  const bulanan = kelompokBulanan(harian);

  return (
    <div>
      <h1 className="display text-2xl">Laporan</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        {satuHari ? `Tanggal ${dari}` : `${dari} s/d ${sampai}`}
      </p>
      <div className="mt-3">
        <PilihRentang dari={dari} sampai={sampai} hariIni={hariIni}>
          <section className="relative mt-4 overflow-hidden rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 pl-7">
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-4 top-0 w-px bg-[rgba(194,69,45,0.4)]"
            />
            <h2 className="display text-lg">Buku kas</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt>
                  Omzet penjualan{" "}
                  <span className="text-[var(--pudar)]">
                    ({r.transaksi} transaksi)
                  </span>
                </dt>
                <dd className="uang">{formatRupiah(r.omzet)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>HPP bahan terpakai</dt>
                <dd className="uang">− {formatRupiah(r.hpp)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pengeluaran operasional</dt>
                <dd className="uang">− {formatRupiah(r.pengeluaran)}</dd>
              </div>
            </dl>
            <div className="mt-4 text-center">
              <div
                className={`inline-block -rotate-2 rounded-[10px] border-[3px] px-7 pb-3 pt-2.5 ${
                  r.laba < 0
                    ? "border-[var(--merah)] text-[var(--merah)]"
                    : "border-[var(--hijau-daun)] text-[var(--hijau-tua)]"
                }`}
              >
                <div className="display text-[13px] tracking-[0.16em]">
                  {satuHari ? "Laba bersih hari ini" : "Laba bersih"}
                </div>
                <div className="display text-4xl [font-variant-numeric:tabular-nums]">
                  {formatRupiah(r.laba)}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { l: "Tunai di laci", v: formatRupiah(r.tunai) },
              { l: "Masuk QRIS", v: formatRupiah(r.qris) },
              { l: "Transaksi", v: String(r.transaksi) },
              {
                l: "Rata-rata / transaksi",
                v: formatRupiah(rataPerTransaksi(r.omzet, r.transaksi)),
              },
              { l: "Selisih tutup kasir", v: formatRupiah(selisih) },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3"
              >
                <p className="text-xs text-[var(--pudar)]">{s.l}</p>
                <p className="uang mt-0.5 font-bold">{s.v}</p>
              </div>
            ))}
          </div>

          <section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
            <GrafikLaba baris={harian} />
          </section>

          <SectionTutupKasir
            baris={tutup}
            kosong={kosong}
            log={log}
            bolehKoreksi={bolehAkses(pengguna.izin, "user")}
          />

          {bulanan.length > 1 ? (
            <section className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
              <h2 className="display text-lg">Rekap bulanan</h2>
              <table className="mt-2 w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--pudar)]">
                    <th className="py-1">Bulan</th>
                    <th className="py-1 text-right">Omzet</th>
                    <th className="py-1 text-right">HPP</th>
                    <th className="py-1 text-right">Pengeluaran</th>
                    <th className="py-1 text-right">Laba bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {bulanan.map((b) => (
                    <tr key={b.bulan} className="border-t border-[var(--garis)]">
                      <td className="py-1">{b.bulan}</td>
                      <td className="uang py-1 text-right">{formatRupiah(b.omzet)}</td>
                      <td className="uang py-1 text-right">{formatRupiah(b.hpp)}</td>
                      <td className="uang py-1 text-right">
                        {formatRupiah(b.pengeluaran)}
                      </td>
                      <td
                        className={`uang py-1 text-right font-bold ${
                          b.laba < 0 ? "text-[var(--merah)]" : ""
                        }`}
                      >
                        {formatRupiah(b.laba)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
            <h2 className="display text-lg">Terlaris</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {terlaris.map((t, i) => (
                <li key={t.nama} className="flex items-center gap-2">
                  <span className="w-5 text-[var(--pudar)]">{i + 1}</span>
                  <span className="min-w-0 flex-1">{t.nama}</span>
                  <b className="uang">{t.terjual}×</b>
                </li>
              ))}
              {terlaris.length === 0 ? (
                <li className="text-[var(--pudar)]">Belum ada penjualan.</li>
              ) : null}
            </ol>
          </section>
        </PilihRentang>
      </div>
    </div>
  );
}
