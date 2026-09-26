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

/**
 * Menu yang tampil di grid kasir: kategori terpilih dan kata kunci. Tiap kata
 * harus muncul di nama menu atau salah satu variannya, jadi "kopi es" tetap
 * menemukan "Kopi Susu" yang punya varian "Es".
 */
export function saringMenu<
  T extends { nama: string; kategori: string; varian: { nama: string }[] },
>(menu: T[], kategori: string, kata: string): T[] {
  const kunci = kata.toLocaleLowerCase("id-ID").split(/\s+/).filter(Boolean);
  return menu.filter((m) => {
    if (kategori !== "Semua" && m.kategori !== kategori) return false;
    const teks = [m.nama, ...m.varian.map((v) => v.nama)]
      .join(" ")
      .toLocaleLowerCase("id-ID");
    return kunci.every((k) => teks.includes(k));
  });
}
