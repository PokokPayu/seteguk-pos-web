import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatJumlah, formatRupiahDesimal } from "@/lib/format";
import { FormBahan } from "./form-bahan";
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
              const menipis = b.stok <= b.min_stok;
              return (
                <tr key={b.id} className="border-b border-[var(--garis)] last:border-0">
                  <td className="px-3 py-2 font-semibold">
                    {b.nama}
                    {menipis ? (
                      <span className="ml-2 rounded bg-[#F9E9E4] px-1.5 py-0.5 text-[11px] font-bold text-[var(--merah)]">
                        {b.stok < 0 ? "minus — perlu opname" : "menipis"}
                      </span>
                    ) : null}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatJumlah(b.stok)} {b.satuan}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatJumlah(b.min_stok)} {b.satuan}
                  </td>
                  <td className="uang px-3 py-2 text-right">
                    {formatRupiahDesimal(b.harga_rata)}/{b.satuan}
                  </td>
                  <td className="px-3 py-2 text-right">
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
