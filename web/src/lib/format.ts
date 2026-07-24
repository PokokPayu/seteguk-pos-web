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
  return `Rp${n.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}
