export function formatRupiah(n: number): string {
  const bulat = Math.round(n);
  const angka = Math.abs(bulat).toLocaleString("id-ID");
  return bulat < 0 ? `−Rp${angka}` : `Rp${angka}`;
}

export function formatJumlah(n: number): string {
  return n
    .toLocaleString("id-ID", { maximumFractionDigits: 3 })
    .replace("-", "−");
}

export function formatRupiahDesimal(n: number): string {
  const angka = Math.abs(n).toLocaleString("id-ID", {
    maximumFractionDigits: 2,
  });
  return n < 0 ? `−Rp${angka}` : `Rp${angka}`;
}
