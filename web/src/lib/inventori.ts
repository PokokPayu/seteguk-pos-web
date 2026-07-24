export function hitungRataRata(
  stokLama: number,
  rataLama: number,
  qtyBeli: number,
  totalBeli: number
): number {
  // stok minus diperlakukan 0 agar rata-rata tidak terdistorsi (identik fungsi SQL)
  const stok = Math.max(stokLama, 0);
  const rata = (stok * rataLama + totalBeli) / (stok + qtyBeli);
  return Math.round(rata * 10000) / 10000;
}

export function hitungHPP(
  baris: { qty: number; hargaRata: number }[]
): number | null {
  if (baris.length === 0) return null;
  const total = baris.reduce((s, b) => s + b.qty * b.hargaRata, 0);
  return Math.round(total * 100) / 100;
}
