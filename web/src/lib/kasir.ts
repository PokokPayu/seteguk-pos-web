export function hitungKembalian(total: number, diterima: number): number {
  return diterima - total;
}

export function totalKeranjang(
  item: { qty: number; harga: number }[]
): number {
  return item.reduce((s, i) => s + i.qty * i.harga, 0);
}

// en-CA menghasilkan format YYYY-MM-DD
const FORMAT_TANGGAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function tanggalJakarta(sekarang: Date): string {
  return FORMAT_TANGGAL.format(sekarang);
}

export function awalHariJakarta(sekarang: Date): string {
  return `${tanggalJakarta(sekarang)}T00:00:00+07:00`;
}
