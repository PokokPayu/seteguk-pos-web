import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { FormMenu } from "./form-menu";
import { FormVarian } from "./form-varian";
import type { Produk, Varian } from "./jenis";

export default async function HalamanMenu() {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const [produkRes, varianRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, nama, kategori, aktif")
      .order("kategori")
      .order("nama"),
    supabase
      .from("product_variants")
      .select("id, product_id, nama, harga, aktif")
      .order("nama"),
  ]);
  if (produkRes.error) {
    throw new Error(`Gagal memuat menu: ${produkRes.error.message}`);
  }
  if (varianRes.error) {
    throw new Error(`Gagal memuat varian: ${varianRes.error.message}`);
  }
  const produk = (produkRes.data ?? []) as Produk[];
  const varian = (varianRes.data ?? []) as Varian[];
  const kategoriAda = [...new Set(produk.map((p) => p.kategori))];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Menu &amp; Resep</h1>
          <p className="mt-1 text-sm text-[var(--pudar)]">
            HPP dihitung dari resep × harga rata-rata bahan saat ini.
          </p>
        </div>
        <FormMenu kategoriAda={kategoriAda} />
      </div>

      <div className="mt-4 space-y-3">
        {produk.map((p) => (
          <section
            key={p.id}
            className={`rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 ${
              p.aktif ? "" : "opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-[var(--hijau-tua)]">
                  {p.nama}
                  {p.aktif ? "" : " (nonaktif)"}
                </h2>
                <p className="text-xs uppercase tracking-wide text-[var(--pudar)]">
                  {p.kategori}
                </p>
              </div>
              <div className="flex gap-2">
                <FormVarian productId={p.id} />
                <FormMenu kategoriAda={kategoriAda} menu={p} />
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {varian
                .filter((v) => v.product_id === p.id)
                .map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      {v.nama}
                      {v.aktif ? "" : " (nonaktif)"}
                    </span>
                    <span className="flex items-center gap-3">
                      <b className="uang">{formatRupiah(v.harga)}</b>
                      <FormVarian productId={p.id} varian={v} />
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {produk.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
            Belum ada menu. Tambahkan lewat tombol “+ Tambah menu”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
