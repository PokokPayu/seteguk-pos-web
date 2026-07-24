import { bolehAkses, type Izin } from "./permissions";

export const ITEM_NAV: { href: string; label: string; izin: Izin }[] = [
  { href: "/kasir", label: "Kasir", izin: "kasir" },
  { href: "/stok", label: "Stok", izin: "stok" },
  { href: "/pengeluaran", label: "Biaya", izin: "biaya" },
  { href: "/laporan", label: "Laporan", izin: "laporan" },
  { href: "/menu", label: "Menu", izin: "menu" },
  { href: "/pengguna", label: "Akun", izin: "user" },
];

export function filterNav(dimiliki: readonly string[]) {
  return ITEM_NAV.filter((item) => bolehAkses(dimiliki, item.izin));
}
