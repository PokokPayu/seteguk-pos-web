export type BarisHarian = {
  tanggal: string;
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
  selisih_kasir: number | null;
};

export type Ringkasan = {
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
};

export function ringkasRentang(baris: BarisHarian[]): Ringkasan {
  return baris.reduce<Ringkasan>(
    (s, b) => ({
      omzet: s.omzet + b.omzet,
      hpp: s.hpp + b.hpp,
      pengeluaran: s.pengeluaran + b.pengeluaran,
      laba: s.laba + b.laba,
      transaksi: s.transaksi + b.transaksi,
      tunai: s.tunai + b.tunai,
      qris: s.qris + b.qris,
    }),
    {
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    }
  );
}

export function kelompokBulanan(
  baris: BarisHarian[]
): { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }[] {
  const peta = new Map<
    string,
    { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }
  >();
  for (const b of baris) {
    const bulan = b.tanggal.slice(0, 7); // YYYY-MM
    const ada = peta.get(bulan) ?? {
      bulan,
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
    };
    ada.omzet += b.omzet;
    ada.hpp += b.hpp;
    ada.pengeluaran += b.pengeluaran;
    ada.laba += b.laba;
    peta.set(bulan, ada);
  }
  return [...peta.values()].sort((a, b) => a.bulan.localeCompare(b.bulan));
}

export function rataPerTransaksi(omzet: number, transaksi: number): number {
  return transaksi > 0 ? omzet / transaksi : 0;
}
