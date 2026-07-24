import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { formatRupiah, formatRupiahDesimal } from "@/lib/format";
import { hitungHPP } from "@/lib/inventori";
import { FormMenu } from "./form-menu";
import { FormVarian } from "./form-varian";
import { Resep, type BarisResepTampil } from "./resep";
import type { BahanResep, BarisResep, Produk, Varian } from "./jenis";

export default async function HalamanMenu() {
  await wajibIzin("menu");
  const supabase = await buatClientServer();
  const [produkRes, varianRes, resepRes, bahanRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, nama, kategori, aktif")
      .order("kategori")
      .order("nama"),
    supabase
      .from("product_variants")
      .select("id, product_id, nama, harga, aktif")
      .order("nama"),
    supabase.from("recipe_items").select("id, variant_id, ingredient_id, qty"),
    supabase
      .from("ingredients")
      .select("id, nama, satuan, harga_rata, aktif")
      .order("nama"),
  ]);
  if (produkRes.error) {
    throw new Error(`Gagal memuat menu: ${produkRes.error.message}`);
  }
  if (varianRes.error) {
    throw new Error(`Gagal memuat varian: ${varianRes.error.message}`);
  }
  if (resepRes.error) {
    throw new Error(`Gagal memuat resep: ${resepRes.error.message}`);
  }
  if (bahanRes.error) {
    throw new Error(`Gagal memuat bahan: ${bahanRes.error.message}`);
  }
  const produk = (produkRes.data ?? []) as Produk[];
  const varian = (varianRes.data ?? []) as Varian[];
  const resep = (resepRes.data ?? []) as BarisResep[];
  const bahanSemua = (bahanRes.data ?? []) as BahanResep[];
  const kategoriAda = [...new Set(produk.map((p) => p.kategori))];
  const bahanAktif = bahanSemua.filter((b) => b.aktif);
  const petaBahan = new Map(bahanSemua.map((b) => [b.id, b]));

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
                .map((v) => {
                  const barisVarian: BarisResepTampil[] = resep
                    .filter((r) => r.variant_id === v.id)
                    .map((r) => {
                      const b = petaBahan.get(r.ingredient_id);
                      return {
                        ...r,
                        namaBahan: b?.nama ?? "(bahan terhapus)",
                        satuan: b?.satuan ?? "",
                        hargaRata: b?.harga_rata ?? 0,
                        bahanAktif: b?.aktif ?? false,
                      };
                    });
                  const hpp = hitungHPP(
                    barisVarian.map((r) => ({ qty: r.qty, hargaRata: r.hargaRata }))
                  );
                  return (
                    <li
                      key={v.id}
                      className="rounded-lg border border-[var(--garis)] bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {v.nama}
                          {v.aktif ? "" : " (nonaktif)"}
                          {hpp === null ? (
                            <span className="ml-2 rounded bg-[#FBF3DC] px-1.5 py-0.5 text-[11px] font-bold text-[#8A6D1D]">
                              belum ada resep
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="uang text-[var(--pudar)]">
                            HPP {hpp === null ? "—" : formatRupiahDesimal(hpp)}
                            {hpp === null
                              ? ""
                              : ` · Margin ${formatRupiahDesimal(v.harga - hpp)}`}
                          </span>
                          <b className="uang">{formatRupiah(v.harga)}</b>
                          <FormVarian productId={p.id} varian={v} />
                        </span>
                      </div>
                      <Resep variantId={v.id} baris={barisVarian} bahan={bahanAktif} />
                    </li>
                  );
                })}
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
