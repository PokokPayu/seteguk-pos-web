import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatJumlah, formatRupiahDesimal } from "@/lib/format";
import { FormBahan } from "./form-bahan";
import { FormBelanja } from "./form-belanja";
import { FormOpname } from "./form-opname";
import type { Bahan } from "./jenis";

export default async function HalamanStok() {
  await wajibIzin("stok");
  const supabase = await buatClientServer();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, nama, satuan, stok, harga_rata, min_stok, aktif")
    .order("nama");
  if (error) throw new Error(`Gagal memuat bahan: ${error.message}`);
  const semua = (data ?? []) as Bahan[];
  const aktif = semua.filter((b) => b.aktif);
  const nonaktif = semua.filter((b) => !b.aktif);
  const urut = [
    ...aktif.filter((b) => b.stok <= b.min_stok),
    ...aktif.filter((b) => b.stok > b.min_stok),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Stok Bahan</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            Bahan di bawah batas minimum tampil paling atas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormOpname bahan={aktif} />
          <FormBelanja bahan={aktif} />
          <FormBahan />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--garis)] bg-[var(--enamel)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--garis)] text-left text-xs uppercase tracking-wide text-[var(--pudar)]">
              <th className="px-3 py-2">Bahan</th>
              <th className="px-3 py-2 text-right">Stok</th>
              <th className="px-3 py-2 text-right">Batas min</th>
              <th className="px-3 py-2 text-right">Harga rata-rata</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {urut.map((b) => {
              const habis = b.stok <= 0;
              const menipis = b.stok <= b.min_stok;
              const rasio = Math.max(
                0,
                Math.min(1, b.stok / (b.min_stok * 3 || 1))
              );
              const warnaMeter = habis
                ? "var(--merah)"
                : menipis
                  ? "var(--kunyit)"
                  : "var(--hijau-daun)";
              return (
                <tr key={b.id} className="border-b border-[var(--garis)] last:border-0">
                  <td className="px-3 py-2 align-top font-semibold">
                    {b.nama}
                    {habis ? (
                      <span className="ml-2 whitespace-nowrap rounded-full border border-[#EAC6BB] bg-[var(--merah-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--merah)]">
                        {b.stok < 0 ? "Minus — perlu opname" : "Habis"}
                      </span>
                    ) : menipis ? (
                      <span className="ml-2 whitespace-nowrap rounded-full border border-[#EBD9A6] bg-[var(--kunyit-bg)] px-2 py-0.5 text-[11px] font-bold text-[#8A6510]">
                        Menipis
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="uang">
                      {formatJumlah(b.stok)} {b.satuan}
                    </div>
                    <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[#EDE7D6]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${rasio * 100}%`,
                          background: warnaMeter,
                        }}
                      />
                    </div>
                  </td>
                  <td className="uang px-3 py-2 text-right align-top">
                    {formatJumlah(b.min_stok)} {b.satuan}
                  </td>
                  <td className="uang px-3 py-2 text-right align-top">
                    {formatRupiahDesimal(b.harga_rata)}/{b.satuan}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <FormBahan bahan={b} />
                  </td>
                </tr>
              );
            })}
            {urut.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--pudar)]">
                  Belum ada bahan. Tambahkan lewat tombol “+ Tambah bahan”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {nonaktif.length > 0 ? (
        <details className="mt-3 text-sm text-[var(--pudar)]">
          <summary className="cursor-pointer">Bahan nonaktif ({nonaktif.length})</summary>
          <ul className="mt-2 space-y-1">
            {nonaktif.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2"
              >
                <span>{b.nama}</span>
                <FormBahan bahan={b} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
