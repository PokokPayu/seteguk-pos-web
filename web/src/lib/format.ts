export function formatRupiah(n: number): string {
  const bulat = Math.round(n);
  const angka = Math.abs(bulat).toLocaleString("id-ID");
  return bulat < 0 ? `−Rp${angka}` : `Rp${angka}`;
}
