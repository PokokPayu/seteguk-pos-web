export type VarianKasir = {
  id: string;
  product_id: string;
  nama: string;
  harga: number;
  terjual: number;
};

export type ProdukKasir = {
  id: string;
  nama: string;
  kategori: string;
  terjualHariIni: number;
  varian: VarianKasir[];
};

export type BarisKeranjang = {
  variantId: string;
  produkNama: string;
  varianNama: string;
  harga: number;
  qty: number;
};

export type ItemRiwayat = {
  nama_snapshot: string;
  qty: number;
  harga: number;
};

export type TransaksiRiwayat = {
  id: string;
  waktu: string;
  metode: "tunai" | "qris";
  status: "selesai" | "void";
  /** Void tersembunyi — hanya pernah sampai ke admin (RLS). */
  tersembunyi: boolean;
  items: ItemRiwayat[];
};
