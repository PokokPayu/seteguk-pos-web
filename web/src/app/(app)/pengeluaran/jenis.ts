export type Kategori = { id: string; nama: string };

export type Pengeluaran = {
  id: string;
  tanggal: string;
  nominal: number;
  catatan: string;
  category_id: string;
};
