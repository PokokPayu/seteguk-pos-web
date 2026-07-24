export const SEMUA_IZIN = [
  "kasir",
  "void",
  "menu",
  "stok",
  "biaya",
  "laporan",
  "user",
] as const;

export type Izin = (typeof SEMUA_IZIN)[number];

export const LABEL_IZIN: Record<Izin, string> = {
  kasir: "Kasir",
  void: "Void transaksi",
  menu: "Kelola menu & resep",
  stok: "Kelola stok",
  biaya: "Catat pengeluaran",
  laporan: "Lihat laporan",
  user: "Kelola pengguna",
};

export function bolehAkses(
  dimiliki: readonly string[],
  butuh: Izin
): boolean {
  return dimiliki.includes(butuh);
}
