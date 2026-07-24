export type Produk = {
  id: string;
  nama: string;
  kategori: string;
  aktif: boolean;
};

export type Varian = {
  id: string;
  product_id: string;
  nama: string;
  harga: number;
  aktif: boolean;
};

export type BarisResep = {
  id: string;
  variant_id: string;
  ingredient_id: string;
  qty: number;
};

export type BahanResep = {
  id: string;
  nama: string;
  satuan: string;
  harga_rata: number;
  aktif: boolean;
};
