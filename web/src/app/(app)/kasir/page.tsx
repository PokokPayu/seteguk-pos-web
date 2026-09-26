import { bolehAkses } from "@/lib/permissions";
import { wajibIzin } from "@/lib/auth";
import { buatClientServer } from "@/lib/supabase/server";
import { awalHariJakarta, tanggalJakarta } from "@/lib/kasir";
import { LayarKasir } from "./layar-kasir";
import type { ProdukKasir, TransaksiRiwayat } from "./jenis";

type BarisProduk = { id: string; nama: string; kategori: string };
type BarisVarian = {
  id: string;
  product_id: string;
  nama: string;
  harga: number;
};
type BarisPeringkat = {
  variant_id: string;
  product_id: string;
  terjual_30h: number;
  terjual_hari_ini: number;
};

export default async function HalamanKasir() {
  const pengguna = await wajibIzin("kasir");
  const supabase = await buatClientServer();
  const [produkRes, varianRes, peringkatRes, riwayatRes, tutupRes] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, nama, kategori")
        .eq("aktif", true)
        .order("nama"),
      supabase
        .from("product_variants")
        .select("id, product_id, nama, harga")
        .eq("aktif", true)
        .order("nama"),
      supabase.rpc("peringkat_varian"),
      supabase
        .from("sales")
        .select(
          "id, waktu, metode, status, tersembunyi, sale_items(nama_snapshot, qty, harga)"
        )
        .gte("waktu", awalHariJakarta(new Date()))
        .order("waktu", { ascending: false }),
      supabase
        .from("cash_closings")
        .select("tunai_fisik, selisih")
        .eq("tanggal", tanggalJakarta(new Date()))
        .maybeSingle(),
    ]);
  if (produkRes.error) {
    throw new Error(`Gagal memuat menu: ${produkRes.error.message}`);
  }
  if (varianRes.error) {
    throw new Error(`Gagal memuat varian: ${varianRes.error.message}`);
  }
  if (peringkatRes.error) {
    throw new Error(`Gagal memuat peringkat: ${peringkatRes.error.message}`);
  }
  if (riwayatRes.error) {
    throw new Error(`Gagal memuat riwayat: ${riwayatRes.error.message}`);
  }
  if (tutupRes.error) {
    throw new Error(`Gagal memuat tutup kasir: ${tutupRes.error.message}`);
  }

  const produk = (produkRes.data ?? []) as BarisProduk[];
  const varian = (varianRes.data ?? []) as BarisVarian[];
  const peringkat = (peringkatRes.data ?? []) as BarisPeringkat[];
  const riwayat = (riwayatRes.data ?? []).map((t) => {
    const baris = t as {
      id: string;
      waktu: string;
      metode: "tunai" | "qris";
      status: "selesai" | "void";
      tersembunyi: boolean;
      sale_items: { nama_snapshot: string; qty: number; harga: number }[] | null;
    };
    return {
      id: baris.id,
      waktu: baris.waktu,
      metode: baris.metode,
      status: baris.status,
      tersembunyi: baris.tersembunyi,
      items: baris.sale_items ?? [],
    };
  }) as TransaksiRiwayat[];

  const tunaiSistem = riwayat
    .filter((t) => t.status === "selesai" && t.metode === "tunai")
    .reduce(
      (s, t) => s + t.items.reduce((x, i) => x + i.qty * i.harga, 0),
      0
    );
  const sudahDitutup = (tutupRes.data ?? null) as {
    tunai_fisik: number;
    selisih: number;
  } | null;

  const terjualVarian = new Map<string, number>();
  const terjual30Produk = new Map<string, number>();
  const hariIniProduk = new Map<string, number>();
  for (const p of peringkat) {
    terjualVarian.set(p.variant_id, Number(p.terjual_30h));
    terjual30Produk.set(
      p.product_id,
      (terjual30Produk.get(p.product_id) ?? 0) + Number(p.terjual_30h)
    );
    hariIniProduk.set(
      p.product_id,
      (hariIniProduk.get(p.product_id) ?? 0) + Number(p.terjual_hari_ini)
    );
  }

  // Urutan tile dihitung sekali di server (terlaris 30 hari) agar tidak
  // berpindah-pindah selama kasir bekerja.
  const daftar: ProdukKasir[] = produk
    .map((p) => ({
      id: p.id,
      nama: p.nama,
      kategori: p.kategori,
      terjualHariIni: hariIniProduk.get(p.id) ?? 0,
      varian: varian
        .filter((v) => v.product_id === p.id)
        .map((v) => ({ ...v, terjual: terjualVarian.get(v.id) ?? 0 })),
    }))
    .filter((p) => p.varian.length > 0)
    .sort(
      (a, b) =>
        (terjual30Produk.get(b.id) ?? 0) - (terjual30Produk.get(a.id) ?? 0) ||
        a.nama.localeCompare(b.nama, "id-ID")
    );

  return (
    <div>
      <h1 className="display text-2xl">Kasir</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        Ketuk menu untuk menambah ke pesanan.
      </p>
      <div className="mt-4">
        <LayarKasir
          produk={daftar}
          riwayat={riwayat}
          bolehVoid={bolehAkses(pengguna.izin, "void")}
          bolehSembunyi={
            bolehAkses(pengguna.izin, "void") &&
            bolehAkses(pengguna.izin, "user")
          }
          tunaiSistem={tunaiSistem}
          sudahDitutup={sudahDitutup}
        />
      </div>
    </div>
  );
}
