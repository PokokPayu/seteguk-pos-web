import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { tanggalJakarta } from "@/lib/kasir";
import { FormPengeluaran } from "./form-pengeluaran";
import { PilihBulan } from "./pilih-bulan";
import type { Kategori, Pengeluaran } from "./jenis";

export default async function HalamanPengeluaran({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string }>;
}) {
  await wajibIzin("biaya");
  const { bulan } = await searchParams;
  const hariIni = tanggalJakarta(new Date());
  const bulanAktif = /^\d{4}-\d{2}$/.test(bulan ?? "")
    ? (bulan as string)
    : hariIni.slice(0, 7);
  const awal = `${bulanAktif}-01`;
  const akhirDate = new Date(`${awal}T00:00:00Z`);
  akhirDate.setUTCMonth(akhirDate.getUTCMonth() + 1);
  const akhir = akhirDate.toISOString().slice(0, 10);

  const supabase = await buatClientServer();
  const [katRes, keluarRes] = await Promise.all([
    supabase.from("expense_categories").select("id, nama").order("nama"),
    supabase
      .from("expenses")
      .select("id, tanggal, nominal, catatan, category_id")
      .gte("tanggal", awal)
      .lt("tanggal", akhir)
      .order("tanggal", { ascending: false }),
  ]);
  if (katRes.error) {
    throw new Error(`Gagal memuat kategori: ${katRes.error.message}`);
  }
  if (keluarRes.error) {
    throw new Error(`Gagal memuat pengeluaran: ${keluarRes.error.message}`);
  }
  const kategori = (katRes.data ?? []) as Kategori[];
  const daftar = (keluarRes.data ?? []) as Pengeluaran[];
  const namaKategori = new Map(kategori.map((k) => [k.id, k.nama]));
  const total = daftar.reduce((s, e) => s + e.nominal, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Pengeluaran</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            Hanya biaya non-bahan (listrik, gas, gaji, sewa). Belanja bahan
            dicatat di Stok — biayanya masuk lewat HPP saat terpakai.
          </p>
        </div>
        <FormPengeluaran kategori={kategori} hariIni={hariIni} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2">
        <PilihBulan bulan={bulanAktif} />
        <span className="text-sm">
          Total bulan ini <b className="uang">{formatRupiah(total)}</b>
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {daftar.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3 text-sm"
          >
            <span className="min-w-0">
              <b>{e.catatan || namaKategori.get(e.category_id) || "Pengeluaran"}</b>
              <br />
              <span className="text-xs text-[var(--pudar)]">
                {e.tanggal} · {namaKategori.get(e.category_id) ?? "—"}
              </span>
            </span>
            <b className="uang">{formatRupiah(e.nominal)}</b>
          </li>
        ))}
        {daftar.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-center text-sm text-[var(--pudar)]">
            Belum ada pengeluaran bulan ini.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
