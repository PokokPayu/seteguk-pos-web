import { describe, expect, it } from "vitest";
import {
  kelompokBulanan,
  labelHari,
  rataPerTransaksi,
  ringkasRentang,
  type BarisHarian,
} from "./laporan";

function baris(
  tanggal: string,
  omzet: number,
  hpp: number,
  pengeluaran: number,
  transaksi = 1,
  tunai = 0,
  qris = 0
): BarisHarian {
  return {
    tanggal,
    omzet,
    hpp,
    pengeluaran,
    laba: omzet - hpp - pengeluaran,
    transaksi,
    tunai,
    qris,
    selisih_kasir: null,
  };
}

describe("ringkasRentang", () => {
  it("rentang kosong bernilai nol semua", () => {
    expect(ringkasRentang([])).toEqual({
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    });
  });
  it("menjumlahkan beberapa hari", () => {
    const r = ringkasRentang([
      baris("2026-07-23", 100000, 40000, 10000, 5, 60000, 40000),
      baris("2026-07-24", 200000, 80000, 5000, 8, 120000, 80000),
    ]);
    expect(r.omzet).toBe(300000);
    expect(r.hpp).toBe(120000);
    expect(r.pengeluaran).toBe(15000);
    expect(r.laba).toBe(165000);
    expect(r.transaksi).toBe(13);
    expect(r.tunai).toBe(180000);
    expect(r.qris).toBe(120000);
  });
  it("laba bisa negatif (rugi)", () => {
    expect(ringkasRentang([baris("2026-07-24", 50000, 30000, 40000)]).laba).toBe(
      -20000
    );
  });
});

describe("kelompokBulanan", () => {
  it("mengelompokkan per bulan dan menjumlahkan", () => {
    const hasil = kelompokBulanan([
      baris("2026-06-30", 100000, 40000, 10000),
      baris("2026-07-01", 200000, 80000, 20000),
      baris("2026-07-15", 300000, 90000, 10000),
    ]);
    expect(hasil).toHaveLength(2);
    expect(hasil[0].bulan).toBe("2026-06");
    expect(hasil[0].omzet).toBe(100000);
    expect(hasil[1].bulan).toBe("2026-07");
    expect(hasil[1].omzet).toBe(500000);
    expect(hasil[1].laba).toBe(500000 - 170000 - 30000);
  });
  it("rentang kosong menghasilkan array kosong", () => {
    expect(kelompokBulanan([])).toEqual([]);
  });
});

describe("rataPerTransaksi", () => {
  it("membagi omzet dengan jumlah transaksi", () => {
    expect(rataPerTransaksi(100000, 4)).toBe(25000);
  });
  it("nol transaksi menghasilkan nol, bukan bagi nol", () => {
    expect(rataPerTransaksi(0, 0)).toBe(0);
  });
});

describe("labelHari", () => {
  it("memberi nama hari yang benar", () => {
    expect(labelHari("2026-07-24")).toBe("Jum");
    expect(labelHari("2026-07-25")).toBe("Sab");
    expect(labelHari("2026-07-26")).toBe("Min");
    expect(labelHari("2026-07-23")).toBe("Kam");
  });
  it("tidak mundur satu hari karena offset zona waktu", () => {
    // regresi: memakai `${t}T00:00:00+07:00` membuat 24 Juli 2026 (Jumat)
    // terbaca sebagai Kamis
    expect(labelHari("2026-07-24")).not.toBe("Kam");
  });
});
